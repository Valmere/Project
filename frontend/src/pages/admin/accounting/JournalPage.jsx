import { Fragment, useEffect, useMemo, useState } from 'react'
import { listAccounts, listJournal, createEntry, postEntry, voidEntry, backfillTransactions } from '../../../api/accounting.api'
import { useT } from '../../../store/prefs.store'
import AccountingHeader from '../../../components/accounting/AccountingHeader'

const STATUS_COLORS = {
  draft:  { bg: '#FEF3C7', fg: '#92400E' },
  posted: { bg: '#ECFDF5', fg: '#047857' },
  void:   { bg: '#F1F5F9', fg: '#64748B' },
}

function StatusBadge({ status, t }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.draft
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {t(`journal.status.${status}`)}
    </span>
  )
}

const today = () => new Date().toISOString().slice(0, 10)

export default function JournalPage() {
  const t = useT()
  const [entries, setEntries] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [expanded, setExpanded] = useState({})
  const [showNew, setShowNew] = useState(false)

  const [form, setForm] = useState({
    entry_date: today(),
    reference: '',
    description: '',
    lines: [
      { account_id: '', debit: '', credit: '', description: '' },
      { account_id: '', debit: '', credit: '', description: '' },
    ],
  })

  const load = async () => {
    setLoading(true)
    try {
      const [j, a] = await Promise.all([
        listJournal(filterStatus ? { status: filterStatus } : {}),
        listAccounts(false),
      ])
      setEntries(j)
      setAccounts(a)
    } catch (e) {
      setErr(e?.response?.data?.detail || t('statements.error_load'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [filterStatus])

  const accountMap = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a])), [accounts])
  const postable = accounts.filter(a => a.is_postable && a.is_active)

  const totals = useMemo(() => {
    let d = 0, c = 0
    for (const l of form.lines) {
      d += Number(l.debit || 0)
      c += Number(l.credit || 0)
    }
    return { d, c, diff: +(d - c).toFixed(4) }
  }, [form.lines])

  const addLine = () => setForm(p => ({ ...p, lines: [...p.lines, { account_id: '', debit: '', credit: '', description: '' }] }))
  const removeLine = (i) => setForm(p => ({ ...p, lines: p.lines.filter((_, idx) => idx !== i) }))
  const updateLine = (i, patch) => setForm(p => ({
    ...p,
    lines: p.lines.map((l, idx) => idx === i ? { ...l, ...patch } : l),
  }))

  const resetForm = () => {
    setForm({
      entry_date: today(), reference: '', description: '',
      lines: [
        { account_id: '', debit: '', credit: '', description: '' },
        { account_id: '', debit: '', credit: '', description: '' },
      ],
    })
    setShowNew(false)
  }

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    if (totals.diff !== 0) {
      setErr(t('journal.unbalanced'))
      return
    }
    const payload = {
      entry_date: form.entry_date,
      reference: form.reference || null,
      description: form.description || null,
      lines: form.lines
        .filter(l => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0))
        .map(l => ({
          account_id: l.account_id,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
          description: l.description || null,
        })),
    }
    try {
      await createEntry(payload)
      resetForm()
      load()
    } catch (e) {
      setErr(e?.response?.data?.detail || t('journal.create_error'))
    }
  }

  const doPost = async (id) => {
    if (!confirm(t('journal.confirm_post'))) return
    try { await postEntry(id); load() } catch (e) { setErr(e?.response?.data?.detail || 'Erreur') }
  }
  const doVoid = async (id) => {
    if (!confirm(t('journal.confirm_void'))) return
    try { await voidEntry(id); load() } catch (e) { setErr(e?.response?.data?.detail || 'Erreur') }
  }

  const [backfilling, setBackfilling] = useState(false)
  const doBackfill = async () => {
    if (!confirm(t('journal.confirm_import'))) return
    setBackfilling(true)
    setErr('')
    try {
      const r = await backfillTransactions()
      const msg = t('journal.import_result', { posted: r.posted, skipped: r.skipped })
      if (r.errors?.length) {
        setErr(t('journal.import_errors', { msg, count: r.errors.length }))
      } else {
        alert(msg)
      }
      load()
    } catch (e) {
      setErr(e?.response?.data?.detail || t('journal.import_failed'))
    } finally {
      setBackfilling(false)
    }
  }

  return (
    <div className="p-8 space-y-6">
      <AccountingHeader
        title={t('journal.title')}
        subtitle={t('journal.subtitle')}
        right={
          <div className="flex gap-2 items-center flex-wrap justify-end">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm text-slate-800 bg-white/90 border border-white/20"
            >
              <option value="">{t('journal.filter.all')}</option>
              <option value="draft">{t('journal.status.draft_plural')}</option>
              <option value="posted">{t('journal.status.posted_plural')}</option>
              <option value="void">{t('journal.status.void_plural')}</option>
            </select>
            <button
              onClick={doBackfill}
              disabled={backfilling}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 hover:bg-white/20 border border-white/20 disabled:opacity-60"
              title={t('journal.import_tooltip')}
            >
              {backfilling ? t('journal.importing') : t('journal.import_tx')}
            </button>
            <button
              onClick={() => setShowNew(v => !v)}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-white/15 hover:bg-white/25 border border-white/20"
            >
              {t('journal.new')}
            </button>
          </div>
        }
      />

      {err && <div className="px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 border border-red-100">{err}</div>}

      {showNew && (
        <form onSubmit={submit} className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('journal.date')} *</label>
              <input required type="date" className="input" value={form.entry_date} onChange={e => setForm(p => ({ ...p, entry_date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('journal.reference')}</label>
              <input className="input" value={form.reference} onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1">{t('journal.description')}</label>
              <input className="input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
          </div>

          <table className="w-full text-sm border border-slate-200 rounded-lg">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left p-2 w-1/3">{t('journal.col.account')}</th>
                <th className="text-right p-2">{t('journal.col.debit')}</th>
                <th className="text-right p-2">{t('journal.col.credit')}</th>
                <th className="text-left p-2">{t('journal.col.description')}</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {form.lines.map((line, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="p-2">
                    <select
                      required
                      value={line.account_id}
                      onChange={e => updateLine(i, { account_id: e.target.value })}
                      className="input input-sm w-full"
                    >
                      <option value="">{t('journal.choose_account')}</option>
                      {postable.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </select>
                  </td>
                  <td className="p-2">
                    <input
                      type="number" step="0.01" min="0"
                      className="input input-sm text-right"
                      value={line.debit}
                      onChange={e => updateLine(i, { debit: e.target.value, credit: e.target.value ? '' : line.credit })}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number" step="0.01" min="0"
                      className="input input-sm text-right"
                      value={line.credit}
                      onChange={e => updateLine(i, { credit: e.target.value, debit: e.target.value ? '' : line.debit })}
                    />
                  </td>
                  <td className="p-2">
                    <input className="input input-sm" value={line.description} onChange={e => updateLine(i, { description: e.target.value })} />
                  </td>
                  <td className="p-2 text-center">
                    {form.lines.length > 2 && (
                      <button type="button" onClick={() => removeLine(i)} className="text-red-500 hover:text-red-700 text-lg leading-none">×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-semibold">
              <tr>
                <td className="p-2 text-right text-slate-500 text-xs">{t('journal.totals')}</td>
                <td className="p-2 text-right">{totals.d.toFixed(2)}</td>
                <td className="p-2 text-right">{totals.c.toFixed(2)}</td>
                <td className="p-2 text-xs" colSpan={2}>
                  <span className={totals.diff === 0 ? 'text-green-600' : 'text-red-600'}>
                    {totals.diff === 0 ? t('journal.balanced') : t('journal.gap', { amount: totals.diff.toFixed(2) })}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>

          <div className="flex items-center justify-between">
            <button type="button" onClick={addLine} className="text-sm text-slate-500 hover:text-slate-700">{t('journal.add_line')}</button>
            <div className="flex gap-2">
              <button type="button" onClick={resetForm} className="btn btn-secondary">{t('common.cancel')}</button>
              <button type="submit" disabled={totals.diff !== 0} className="btn btn-primary">{t('journal.create_draft')}</button>
            </div>
          </div>
        </form>
      )}

      {/* Liste */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">{t('common.loading')}</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">{t('journal.empty')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left p-3 w-28">{t('journal.col.date')}</th>
                <th className="text-left p-3 w-28">{t('journal.col.ref')}</th>
                <th className="text-left p-3">{t('journal.col.label')}</th>
                <th className="text-right p-3 w-28">{t('journal.col.total')}</th>
                <th className="text-center p-3 w-24">{t('journal.col.status')}</th>
                <th className="text-right p-3 w-48">{t('journal.col.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {entries.map(e => {
                const total = e.lines.reduce((s, l) => s + Number(l.debit || 0), 0)
                const isOpen = !!expanded[e.id]
                return (
                  <Fragment key={e.id}>
                    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setExpanded(v => ({ ...v, [e.id]: !v[e.id] }))}>
                      <td className="p-3 text-slate-600">{e.entry_date}</td>
                      <td className="p-3 text-xs font-mono text-slate-500">{e.reference || '—'}</td>
                      <td className="p-3 text-slate-700">{e.description || '—'}</td>
                      <td className="p-3 text-right font-semibold text-slate-700">{total.toFixed(2)}</td>
                      <td className="p-3 text-center"><StatusBadge status={e.status} t={t} /></td>
                      <td className="p-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                        {e.status === 'draft' && (
                          <>
                            <button onClick={() => doPost(e.id)} className="text-xs px-2 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100 mr-1">{t('journal.post')}</button>
                            <button onClick={() => doVoid(e.id)} className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100">{t('journal.void')}</button>
                          </>
                        )}
                        {e.status === 'posted' && (
                          <button onClick={() => doVoid(e.id)} className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100">{t('journal.void')}</button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50">
                        <td colSpan={6} className="p-3">
                          <table className="w-full text-xs">
                            <thead className="text-slate-500">
                              <tr>
                                <th className="text-left p-2">{t('journal.col.account')}</th>
                                <th className="text-right p-2">{t('journal.col.debit')}</th>
                                <th className="text-right p-2">{t('journal.col.credit')}</th>
                                <th className="text-left p-2">{t('journal.col.description')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {e.lines.map(l => {
                                const acc = accountMap[l.account_id]
                                return (
                                  <tr key={l.id} className="border-t border-slate-100">
                                    <td className="p-2">{acc ? `${acc.code} — ${acc.name}` : l.account_id.slice(0, 8)}</td>
                                    <td className="p-2 text-right font-mono">{l.debit > 0 ? Number(l.debit).toFixed(2) : ''}</td>
                                    <td className="p-2 text-right font-mono">{l.credit > 0 ? Number(l.credit).toFixed(2) : ''}</td>
                                    <td className="p-2 text-slate-500">{l.description || '—'}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
