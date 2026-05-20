import { useEffect, useMemo, useState } from 'react'
import {
  listAccounts, createAccount, updateAccount, deleteAccount, seedAccounts,
} from '../../../api/accounting.api'
import { useT } from '../../../store/prefs.store'
import AccountingHeader from '../../../components/accounting/AccountingHeader'
import { accountName, accountOptionLabel } from '../../../utils/accountingLabels'
import ExpandableRow, { DetailRow, ActionGroup } from '../../../components/ui/ExpandableRow'

const TYPE_COLORS = {
  asset:     { bg: '#EFF6FF', fg: '#1E40AF' },
  liability: { bg: '#FEF3C7', fg: '#92400E' },
  equity:    { bg: '#F5F3FF', fg: '#6D28D9' },
  revenue:   { bg: '#ECFDF5', fg: '#047857' },
  expense:   { bg: '#FEF2F2', fg: '#B91C1C' },
}
const TYPE_KEYS = ['asset', 'liability', 'equity', 'revenue', 'expense']

const Ic = {
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  seed: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M12 2v20M2 12h20" />
    </svg>
  ),
}

function TypeBadge({ type, t }) {
  const c = TYPE_COLORS[type] || { bg: '#F1F5F9', fg: '#475569' }
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {t(`coa.type.${type}`)}
    </span>
  )
}

export default function ChartOfAccountsPage() {
  const t = useT()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    code: '', name: '', type: 'asset', parent_id: '', currency: 'HTG', is_postable: true, description: '',
  })

  const load = () => {
    setLoading(true)
    listAccounts(true)
      .then(setAccounts)
      .catch(e => setErr(e?.response?.data?.detail || t('statements.error_load')))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  // Arbre hiérarchique : on groupe par parent_id
  const tree = useMemo(() => {
    const byParent = {}
    for (const a of accounts) {
      const key = a.parent_id || '__root__'
      if (!byParent[key]) byParent[key] = []
      byParent[key].push(a)
    }
    for (const k of Object.keys(byParent)) {
      byParent[k].sort((a, b) => a.code.localeCompare(b.code))
    }
    return byParent
  }, [accounts])

  const parentOptions = accounts.filter(a => !a.is_postable)

  // Linéarisation de l'arbre pour le rendu mobile : on garde l'ordre DFS,
  // l'indentation est mémorisée dans `depth`.
  const flatTree = useMemo(() => {
    const result = []
    const walk = (nodes, depth) => {
      for (const node of nodes) {
        result.push({ node, depth })
        const children = tree[node.id] || []
        if (children.length > 0) walk(children, depth + 1)
      }
    }
    walk(tree['__root__'] || [], 0)
    return result
  }, [tree])

  const resetForm = () => {
    setForm({ code: '', name: '', type: 'asset', parent_id: '', currency: 'HTG', is_postable: true, description: '' })
    setEditingId(null)
    setShowNew(false)
  }

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    const payload = { ...form, parent_id: form.parent_id || null }
    try {
      if (editingId) {
        await updateAccount(editingId, payload)
      } else {
        await createAccount(payload)
      }
      resetForm()
      load()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Erreur')
    }
  }

  const startEdit = (a) => {
    setEditingId(a.id)
    setForm({
      code: a.code, name: a.name, type: a.type,
      parent_id: a.parent_id || '',
      currency: a.currency || 'HTG',
      is_postable: a.is_postable,
      description: a.description || '',
    })
    setShowNew(true)
  }

  const handleDelete = async (a) => {
    if (!confirm(t('coa.confirm_delete', { code: a.code, name: accountName(a, t) }))) return
    try {
      await deleteAccount(a.id)
      load()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Erreur')
    }
  }

  const handleSeed = async () => {
    if (!confirm(t('coa.confirm_seed'))) return
    try {
      const r = await seedAccounts(false)
      alert(t('coa.seed_result', { created: r.created, skipped: r.skipped }))
      load()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Erreur')
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <AccountingHeader
        title={t('coa.title')}
        subtitle={t('coa.subtitle')}
        right={
          <div className="flex gap-2 flex-wrap justify-end">
            {accounts.length === 0 && (
              <button
                onClick={handleSeed}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-white/10 hover:bg-white/20 border border-white/20"
              >
                {Ic.seed} {t('coa.seed')}
              </button>
            )}
            <button
              onClick={() => { setShowNew(v => !v); setEditingId(null) }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-white/15 hover:bg-white/25 border border-white/20"
            >
              {Ic.plus} {t('coa.new')}
            </button>
          </div>
        }
      />

      {err && <div className="px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 border border-red-100">{err}</div>}

      {/* Formulaire création / édition */}
      {showNew && (
        <form onSubmit={submit} className="bg-white rounded-xl shadow-sm p-4 md:p-5 grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-1">
            <label className="block text-xs text-slate-500 mb-1">{t('coa.col.code')} *</label>
            <input required className="input" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-500 mb-1">{t('coa.col.name')} *</label>
            <input required className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs text-slate-500 mb-1">{t('coa.col.type')} *</label>
            <select className="input" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              {TYPE_KEYS.map(k => <option key={k} value={k}>{t(`coa.type.${k}`)}</option>)}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs text-slate-500 mb-1">{t('coa.col.currency')}</label>
            <select className="input" value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}>
              {['HTG', 'USD', 'EUR'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="md:col-span-1 flex items-center gap-2 pt-5">
            <input id="postable" type="checkbox" checked={form.is_postable} onChange={e => setForm(p => ({ ...p, is_postable: e.target.checked }))} />
            <label htmlFor="postable" className="text-xs text-slate-600">{t('coa.col.postable')}</label>
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs text-slate-500 mb-1">{t('coa.field.parent')}</label>
            <select className="input" value={form.parent_id} onChange={e => setForm(p => ({ ...p, parent_id: e.target.value }))}>
              <option value="">{t('coa.no_parent')}</option>
              {parentOptions.map(a => <option key={a.id} value={a.id}>{accountOptionLabel(a, t)}</option>)}
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs text-slate-500 mb-1">{t('coa.field.description')}</label>
            <input className="input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="md:col-span-6 flex flex-col sm:flex-row justify-end gap-2">
            <button type="button" onClick={resetForm} className="btn btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn btn-primary">{editingId ? t('common.save') : t('coa.create')}</button>
          </div>
        </form>
      )}

      {/* Arbre */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">{t('common.loading')}</div>
        ) : accounts.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">{t('coa.empty')}</div>
        ) : (
          <>
          {/* ─── Liste mobile : comptes compacts expandables ─── */}
          <div className="md:hidden divide-y divide-[var(--border-subtle)]">
            {flatTree.map(({ node, depth }) => (
              <div key={`m-${node.id}`} className="p-2" style={{ paddingLeft: 8 + depth * 14 }}>
                <ExpandableRow
                  density="compact"
                  className={`!rounded-lg ${!node.is_active ? 'opacity-60' : ''}`}
                  summary={
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[12px] text-[var(--text-3)] flex-shrink-0">{node.code}</span>
                        <span className={`text-[13px] truncate ${node.is_postable ? 'text-[var(--text-1)]' : 'font-semibold text-[var(--text-2)]'}`}>
                          {accountName(node, t)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                        <TypeBadge type={node.type} t={t} />
                        <span className="text-[var(--text-3)]">{node.currency}</span>
                        {node.is_postable && <span className="text-emerald-600">✓ {t('coa.col.postable')}</span>}
                      </div>
                    </div>
                  }
                >
                  {node.description && <DetailRow label="Description" value={node.description} />}
                  <ActionGroup>
                    <button
                      onClick={() => startEdit(node)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      {t('coa.edit')}
                    </button>
                    <button
                      onClick={() => handleDelete(node)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] border border-rose-200 text-rose-600 hover:bg-rose-50"
                    >
                      {t('common.delete')}
                    </button>
                  </ActionGroup>
                </ExpandableRow>
              </div>
            ))}
          </div>

          {/* ─── Tableau desktop ─────────────────────────────── */}
          <div className="hidden md:block md:overflow-x-auto">
          <table className="w-full md:min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">{t('coa.col.code')}</th>
                <th className="text-left px-4 py-3">{t('coa.col.name')}</th>
                <th className="text-left px-4 py-3">{t('coa.col.type')}</th>
                <th className="text-center px-4 py-3">{t('coa.col.currency')}</th>
                <th className="text-center px-4 py-3">{t('coa.col.postable')}</th>
                <th className="text-right px-4 py-3">{t('coa.col.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              <TreeRows nodes={tree['__root__'] || []} tree={tree} depth={0} onEdit={startEdit} onDelete={handleDelete} t={t} />
            </tbody>
          </table>
          </div>
          </>
        )}
      </div>
    </div>
  )
}

function TreeRows({ nodes, tree, depth, onEdit, onDelete, t }) {
  return nodes.flatMap(node => {
    const children = tree[node.id] || []
    const indent = depth * 20
    return [
      <tr key={node.id} className={!node.is_active ? 'opacity-50' : ''}>
        <td className="px-4 py-2 font-mono text-xs" style={{ paddingLeft: 16 + indent }}>
          {children.length > 0 && <span className="text-slate-400 mr-1">▸</span>}
          {node.code}
        </td>
        <td className={`px-4 py-2 ${node.is_postable ? 'text-slate-800' : 'font-semibold text-slate-600'}`}>
          {accountName(node, t)}
        </td>
        <td className="px-4 py-2"><TypeBadge type={node.type} t={t} /></td>
        <td className="px-4 py-2 text-center text-xs text-slate-500">{node.currency}</td>
        <td className="px-4 py-2 text-center">
          {node.is_postable ? (
            <span className="text-green-600 text-xs">✓</span>
          ) : (
            <span className="text-slate-300 text-xs">—</span>
          )}
        </td>
        <td className="px-4 py-2">
          <div className="flex items-center justify-end gap-1">
            <button onClick={() => onEdit(node)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title={t('coa.edit')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button onClick={() => onDelete(node)} className="p-1.5 rounded hover:bg-red-50 text-red-500" title={t('common.delete')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </td>
      </tr>,
      ...(children.length > 0
        ? [<TreeRows key={`c-${node.id}`} nodes={children} tree={tree} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} t={t} />]
        : []),
    ]
  })
}
