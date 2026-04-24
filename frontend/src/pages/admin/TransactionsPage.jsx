import { useEffect, useMemo, useState } from 'react'
import api from '../../api/axios'
import { createTransaction } from '../../api/transactions.api'
import Select from '../../components/ui/Select'
import { usePrefsStore, useT, CURRENCIES } from '../../store/prefs.store'
import { useRatesStore } from '../../store/rates.store'
import { formatMoney, formatDate } from '../../utils/format'

export default function TransactionsPage() {
  const t = useT()
  const { currency, lang } = usePrefsStore()
  const convert = useRatesStore(s => s.convert)

  const [investments, setInvestments] = useState([])
  const [transactions, setTransactions] = useState([])
  const [investors, setInvestors] = useState([])
  const [filterInvestor, setFilterInvestor] = useState(null)
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [showInvForm, setShowInvForm] = useState(false)
  const [invForm, setInvForm] = useState({ investor_id: '', name: 'Portefeuille Principal', initial_capital: '', start_date: new Date().toISOString().slice(0, 10) })
  const [invError, setInvError] = useState('')
  const [invSaving, setInvSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    investment_id: '', type: 'deposit', amount: '', currency: currency || 'HTG',
    transaction_date: new Date().toISOString().slice(0, 10),
    description: '', reference: '',
  })

  useEffect(() => {
    Promise.all([
      api.get('/investments').then(r => r.data),
      api.get('/transactions').then(r => r.data),
      api.get('/investors').then(r => r.data),
    ])
      .then(([inv, tx, invs]) => {
        setInvestments(inv)
        setTransactions(tx)
        setInvestors(invs)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const investorById = useMemo(
    () => Object.fromEntries(investors.map(i => [i.id, i])),
    [investors]
  )

  const filteredTxs = useMemo(() => {
    return transactions
      .filter(tx => !filterInvestor || tx.investor_id === filterInvestor)
      .slice()
      .sort((a, b) => {
        const d = new Date(b.transaction_date) - new Date(a.transaction_date)
        if (d !== 0) return d
        return new Date(b.created_at || 0) - new Date(a.created_at || 0)
      })
  }, [transactions, filterInvestor])

  const investorOptions = [
    { value: null, label: t('filter.all_investors') },
    ...investors.map(i => ({ value: i.id, label: i.full_name, description: i.email })),
  ]

  const handleCreate = async (e) => {
    e.preventDefault()
    setFormError('')

    if (!form.investment_id) { setFormError('Sélectionnez un portefeuille'); return }
    const amt = parseFloat(form.amount)
    if (!Number.isFinite(amt) || amt <= 0) { setFormError('Montant invalide'); return }
    if (!form.transaction_date) { setFormError('Date requise'); return }

    setSaving(true)
    try {
      const tx = await createTransaction({
        investment_id: form.investment_id,
        type: form.type,
        amount: amt,
        currency: form.currency || 'HTG',
        transaction_date: form.transaction_date,
        description: form.description || null,
        reference: form.reference || null,
      })
      setTransactions(prev => [tx, ...prev])
      // Refresh investments so current_value + derived KPIs update
      api.get('/investments').then(r => setInvestments(r.data)).catch(() => {})
      setShowForm(false)
      setForm({
        investment_id: '', type: 'deposit', amount: '', currency: currency || 'HTG',
        transaction_date: new Date().toISOString().slice(0, 10),
        description: '', reference: '',
      })
    } catch (err) {
      const detail = err.response?.data?.detail
      setFormError(
        typeof detail === 'string' ? detail :
        Array.isArray(detail) ? detail.map(d => d.msg).join(', ') :
        `Erreur ${err.response?.status || ''}: ${err.message}`
      )
    } finally {
      setSaving(false)
    }
  }

  const filteredInvestments = investments.filter(inv => !filterInvestor || inv.investor_id === filterInvestor)
  const investmentOptions = filteredInvestments.map(inv => ({ value: inv.id, label: inv.name }))
  const noInvestments = filteredInvestments.length === 0

  const handleCreateInvestment = async (e) => {
    e.preventDefault()
    setInvError('')
    if (!invForm.investor_id) { setInvError('Sélectionnez un investisseur'); return }
    const cap = parseFloat(invForm.initial_capital)
    if (!Number.isFinite(cap) || cap <= 0) { setInvError('Capital initial invalide'); return }

    setInvSaving(true)
    try {
      const inv = await api.post('/investments', {
        investor_id: invForm.investor_id,
        name: invForm.name || 'Portefeuille Principal',
        initial_capital: cap,
        start_date: invForm.start_date,
        currency,
      }).then(r => r.data)
      setInvestments(prev => [inv, ...prev])
      setShowInvForm(false)
      setForm(p => ({ ...p, investment_id: inv.id }))
      setFilterInvestor(inv.investor_id)
      setInvForm({ investor_id: '', name: 'Portefeuille Principal', initial_capital: '', start_date: new Date().toISOString().slice(0, 10) })
    } catch (err) {
      const detail = err.response?.data?.detail
      setInvError(typeof detail === 'string' ? detail : `Erreur ${err.response?.status || ''}`)
    } finally {
      setInvSaving(false)
    }
  }

  const typeOptions = [
    { value: 'deposit', label: t('tx.col.contribution') },
    { value: 'withdrawal', label: t('tx.col.withdrawal') },
    { value: 'gain', label: t('tx.col.pnl') + ' (+)' },
    { value: 'loss', label: t('tx.col.pnl') + ' (−)' },
    { value: 'fee', label: 'Frais' },
  ]

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="flex items-end gap-3">
          <Select
            label={t('filter.investor')}
            value={filterInvestor}
            onChange={setFilterInvestor}
            options={investorOptions}
            size="sm"
            minWidth={220}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowInvForm(v => !v)}
            className="btn btn-secondary h-9 text-[13px]"
          >
            + Nouveau portefeuille
          </button>
          <button
            onClick={() => setShowForm(v => !v)}
            className="btn btn-primary h-9 text-[13px]"
          >
            + {t('tx.new')}
          </button>
        </div>
      </div>

      {showInvForm && (
        <form onSubmit={handleCreateInvestment} className="card p-4 sm:p-5 mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="col-span-full">
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
              Créer un portefeuille
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-3)' }}>
              Un portefeuille est requis avant d'enregistrer des transactions.
            </div>
          </div>
          <Select
            label="Investisseur"
            value={invForm.investor_id}
            onChange={(v) => setInvForm(p => ({ ...p, investor_id: v }))}
            options={investors.map(i => ({ value: i.id, label: i.full_name, description: i.email }))}
            size="sm"
            fullWidth
          />
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Nom</label>
            <input
              value={invForm.name}
              onChange={e => setInvForm(p => ({ ...p, name: e.target.value }))}
              className="input input-sm"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
              Capital initial ({currency})
            </label>
            <input
              type="number" step="0.01" required
              value={invForm.initial_capital}
              onChange={e => setInvForm(p => ({ ...p, initial_capital: e.target.value }))}
              className="input input-sm"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Date de début</label>
            <input
              type="date" required
              value={invForm.start_date}
              onChange={e => setInvForm(p => ({ ...p, start_date: e.target.value }))}
              className="input input-sm"
            />
          </div>
          {invError && (
            <div className="col-span-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ background: 'var(--c-danger-bg)', color: 'var(--c-danger-text)' }}>
              {invError}
            </div>
          )}
          <div className="col-span-full flex gap-2 justify-end">
            <button type="button" onClick={() => { setShowInvForm(false); setInvError('') }} className="btn btn-ghost h-9 text-[13px]">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={invSaving} className="btn btn-primary h-9 text-[13px]">
              {invSaving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="card p-4 sm:p-5 mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Select
            label={t('nav.investors')}
            value={filterInvestor}
            onChange={(v) => { setFilterInvestor(v); setForm(p => ({ ...p, investment_id: '' })) }}
            options={investorOptions}
            size="sm"
            fullWidth
          />
          <div>
            <Select
              label="Portefeuille"
              value={form.investment_id}
              onChange={(v) => setForm(p => ({ ...p, investment_id: v }))}
              options={investmentOptions}
              size="sm"
              fullWidth
              placeholder={noInvestments ? 'Aucun portefeuille' : '—'}
            />
            {noInvestments && (
              <button
                type="button"
                onClick={() => { setShowForm(false); setShowInvForm(true) }}
                className="text-[11px] mt-1.5 underline"
                style={{ color: 'var(--color-primary)' }}
              >
                + Créer un portefeuille
              </button>
            )}
          </div>
          <Select
            label="Type"
            value={form.type}
            onChange={(v) => setForm(p => ({ ...p, type: v }))}
            options={typeOptions}
            size="sm"
            fullWidth
          />
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
              Montant ({form.currency})
            </label>
            <input
              type="number" step="0.01" required
              value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              className="input input-sm"
            />
          </div>
          <Select
            label={t('common.currency')}
            value={form.currency}
            onChange={(v) => setForm(p => ({ ...p, currency: v }))}
            options={CURRENCIES.map(c => ({ value: c.code, label: `${c.code} — ${c.label}` }))}
            size="sm"
            fullWidth
          />
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
              {t('tx.col.date')}
            </label>
            <input
              type="date" required
              value={form.transaction_date}
              onChange={e => setForm(p => ({ ...p, transaction_date: e.target.value }))}
              className="input input-sm"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
              Description
            </label>
            <input
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="input input-sm"
            />
          </div>
          {formError && (
            <div
              className="col-span-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ background: 'var(--c-danger-bg)', color: 'var(--c-danger-text)' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 flex-shrink-0">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {formError}
            </div>
          )}
          <div className="col-span-full flex gap-2 justify-end">
            <button type="button" onClick={() => { setShowForm(false); setFormError('') }} className="btn btn-ghost h-9 text-[13px]">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary h-9 text-[13px]">
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table w-full text-[13px] min-w-[1000px]">
            <thead>
              <tr>
                <th className="text-left">{t('tx.col.datetime') || 'Date / Heure'}</th>
                <th className="text-left">{t('tx.col.investor')}</th>
                <th className="text-left">{t('tx.col.type') || 'Type'}</th>
                <th className="text-right">{t('tx.col.amount') || 'Montant'}</th>
                <th className="text-right">{t('tx.col.original') || "Montant d'origine"}</th>
                <th className="text-left">{t('tx.col.description') || 'Description'}</th>
                <th className="text-left">{t('tx.col.reference') || 'Référence'}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center" style={{ color: 'var(--text-3)' }}>{t('common.loading')}</td></tr>
              ) : filteredTxs.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center" style={{ color: 'var(--text-3)' }}>{t('tx.empty')}</td></tr>
              ) : filteredTxs.map(tx => {
                const inv = investorById[tx.investor_id]
                const txCcy = (tx.currency || 'HTG').toUpperCase()
                const displayAmt = convert(Number(tx.amount || 0), txCcy, currency)
                const typeColor = {
                  deposit: 'var(--c-success-text)',
                  gain: 'var(--c-success-text)',
                  withdrawal: 'var(--c-danger-text)',
                  loss: 'var(--c-danger-text)',
                  fee: 'var(--text-2)',
                }[tx.type] || 'var(--text-1)'
                return (
                  <tr key={tx.id}>
                    <td className="whitespace-nowrap">
                      <div>{formatDate(tx.transaction_date, lang)}</div>
                      {tx.created_at && (
                        <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                          {new Date(tx.created_at).toLocaleTimeString(lang === 'fr' ? 'fr-FR' : lang === 'es' ? 'es-ES' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="font-medium" style={{ color: 'var(--text-1)' }}>{inv?.full_name || '—'}</div>
                      {inv?.code && (
                        <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{inv.code}</div>
                      )}
                    </td>
                    <td>
                      <span className="font-semibold uppercase text-[11px]" style={{ color: typeColor }}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="text-right font-mono">{formatMoney(displayAmt, { currency, lang })}</td>
                    <td className="text-right font-mono" style={{ color: 'var(--text-3)' }}>
                      {formatMoney(Number(tx.amount || 0), { currency: txCcy, lang })}
                    </td>
                    <td style={{ color: 'var(--text-2)' }}>{tx.description || '—'}</td>
                    <td className="text-[12px] font-mono" style={{ color: 'var(--text-3)' }}>{tx.reference || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
