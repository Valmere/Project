import { useEffect, useState } from 'react'
import { listApprovals, approveAction, rejectAction } from '../../api/approvals.api'
import { useAuthStore } from '../../store/auth.store'
import { usePrefsStore, useT } from '../../store/prefs.store'
import { formatDate } from '../../utils/format'

const STATUS_STYLES = {
  pending:  { bg: '#FEF3C7', fg: '#92400E' },
  approved: { bg: '#DBEAFE', fg: '#1E40AF' },
  executed: { bg: '#D1FAE5', fg: '#065F46' },
  rejected: { bg: '#FEE2E2', fg: '#991B1B' },
  failed:   { bg: '#FECACA', fg: '#7F1D1D' },
}

const ACTION_LABELS = {
  delete_investor:    'Suppression d\'investisseur',
  void_transaction:   'Annulation de transaction',
  update_transaction: 'Modification de transaction',
  restore_transaction: 'Restauration de transaction',
  replay_transaction:  'Rejeu de transaction',
  create_user:        'Création d\'utilisateur',
  distribute_pnl:     'Distribution de bénéfice / perte',
}

function actionLabel(actionType, t) {
  const key = `approvals.action.${actionType}`
  const label = t(key)
  return label === key ? (ACTION_LABELS[actionType] || actionType) : label
}

function StatusPill({ status, t }) {
  const s = STATUS_STYLES[status] || { bg: '#F1F5F9', fg: '#475569' }
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {t(`approvals.status.${status}`)}
    </span>
  )
}

export default function ApprovalsPage() {
  const t = useT()
  const { lang } = usePrefsStore()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = () => {
    setLoading(true)
    listApprovals(filter || null)
      .then(setRows)
      .catch(e => setErr(e?.response?.data?.detail || t('approvals.error_load')))
      .finally(() => setLoading(false))
  }
  useEffect(load, [filter])

  const handleApprove = async (row) => {
    const notes = window.prompt(t('approvals.approve_prompt'), '') ?? null
    try {
      await approveAction(row.id, notes || null)
      load()
    } catch (e) {
      alert(e?.response?.data?.detail || t('common.error'))
    }
  }

  const handleReject = async (row) => {
    const notes = window.prompt(t('approvals.reject_prompt'), '') ?? null
    if (notes == null) return
    try {
      await rejectAction(row.id, notes || null)
      load()
    } catch (e) {
      alert(e?.response?.data?.detail || t('common.error'))
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            {isAdmin ? t('approvals.title_admin') : t('approvals.title_mine')}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {isAdmin
              ? t('approvals.subtitle_admin')
              : t('approvals.subtitle_mine')}
          </p>
        </div>
        <div className="flex gap-1.5 bg-white rounded-lg shadow-sm p-1 text-sm overflow-x-auto">
          {['', 'pending', 'executed', 'rejected'].map(s => (
            <button
              key={s || 'all'}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${filter === s
                ? 'bg-slate-900 text-white'
                : 'text-slate-500 hover:text-slate-800'}`}
            >
              {s === '' ? t('common.all') : t(`approvals.status_filter.${s}`)}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div className="px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 border border-red-100">
          {err}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">{t('common.loading')}</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            {filter === 'pending' ? t('approvals.empty_pending') : t('approvals.empty')}
          </div>
        ) : (
          <div className="md:overflow-x-auto">
          <table className="is-responsive w-full md:min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">{t('approvals.col.action')}</th>
                <th className="text-left px-4 py-3">{t('approvals.col.target')}</th>
                <th className="text-left px-4 py-3">{t('approvals.col.requester')}</th>
                <th className="text-left px-4 py-3">{t('approvals.col.reason')}</th>
                <th className="text-center px-4 py-3">{t('approvals.col.status')}</th>
                <th className="text-right px-4 py-3">{t('approvals.col.date')}</th>
                {isAdmin && <th className="text-right px-4 py-3">{t('common.action')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium text-slate-700" data-label={t('approvals.col.action')}>
                    {actionLabel(r.action_type, t)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500" data-label={t('approvals.col.target')}>
                    {r.target_type && (
                      <div>
                        <div className="text-slate-600">{r.target_type}</div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {r.target_id ? r.target_id.slice(0, 8) : '—'}
                        </div>
                      </div>
                    )}
                    {!r.target_type && r.payload?.email && (
                      <div className="text-slate-600">{r.payload.email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600" data-label={t('approvals.col.requester')}>
                    <div>{r.requested_by?.full_name || '—'}</div>
                    <div className="text-[11px] text-slate-400">{r.requested_by?.email}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-xs" data-label={t('approvals.col.reason')}>
                    {r.reason || <span className="text-slate-300">—</span>}
                    {r.reviewer_notes && (
                      <div className="mt-1 text-[11px] text-slate-400 italic">
                        {r.reviewer_notes}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center" data-label={t('approvals.col.status')}>
                    <StatusPill status={r.status} t={t} />
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-slate-400" data-label={t('approvals.col.date')}>
                    {r.created_at ? formatDate(r.created_at, lang, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right" data-label="">
                      {r.status === 'pending' ? (
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={() => handleApprove(r)}
                            className="px-2.5 py-1 rounded text-xs font-medium text-white"
                            style={{ background: '#16A34A' }}
                          >
                            {t('approvals.approve')}
                          </button>
                          <button
                            onClick={() => handleReject(r)}
                            className="px-2.5 py-1 rounded text-xs font-medium text-white"
                            style={{ background: '#DC2626' }}
                          >
                            {t('approvals.reject')}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
