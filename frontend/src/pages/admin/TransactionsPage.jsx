import { useCallback, useEffect, useMemo, useState } from 'react'
import { Sparkles, Pencil, Trash2, Undo2, RotateCcw } from 'lucide-react'
import api from '../../api/axios'
import { createTransaction, updateTransaction, voidTransaction, restoreTransaction, replayTransaction } from '../../api/transactions.api'
import Select from '../../components/ui/Select'
import DateRangeFilter from '../../components/ui/DateRangeFilter'
import { usePrefsStore, useT, CURRENCIES } from '../../store/prefs.store'
import { useRatesStore } from '../../store/rates.store'
import { useAuthStore } from '../../store/auth.store'
import { formatMoney, formatDate, todayLocalISO } from '../../utils/format'
import { getTransactionDisplayAmounts } from '../../utils/transactions'
import { transactionTypeLabel, transactionTypeOptions } from '../../utils/transactionLabels'
import DistributionModal from '../../components/transactions/DistributionModal'
import ExpandableRow, { DetailRow, ActionGroup } from '../../components/ui/ExpandableRow'

export default function TransactionsPage() {
  const t = useT()
  const { currency, lang } = usePrefsStore()
  const convert = useRatesStore(s => s.convert)
  const convertInfo = useRatesStore(s => s.convertInfo)
  const ratesLoaded = useRatesStore(s => s.loaded)
  const userRole = useAuthStore(s => s.user?.role)
  const [distributeOpen, setDistributeOpen] = useState(false)

  const [investments, setInvestments] = useState([])
  const [transactions, setTransactions] = useState([])
  const [trash, setTrash] = useState([])
  const [investors, setInvestors] = useState([])
  const [filterInvestor, setFilterInvestor] = useState(null)
  const [filterType, setFilterType] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  // ID de la transaction en cours d'édition (null = mode création)
  const [editingId, setEditingId] = useState(null)
  // ID de la transaction en cours de suppression (pour le spinner sur la ligne)
  const [deletingId, setDeletingId] = useState(null)
  const [trashActionId, setTrashActionId] = useState(null)
  const [showInvForm, setShowInvForm] = useState(false)
  const [invForm, setInvForm] = useState({ investor_id: '', name: 'Portefeuille Principal', initial_capital: '', start_date: todayLocalISO() })
  const [invError, setInvError] = useState('')
  const [invSaving, setInvSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    investment_id: '', type: 'deposit', amount: '', currency: currency || 'HTG',
    transaction_date: todayLocalISO(),
    description: '', reference: '',
  })

  useEffect(() => {
    // include_company=true pour récupérer Valmere & Co dans la liste
    // (utile pour le type Prélèvement qui cible obligatoirement la société).
    Promise.all([
      api.get('/investments').then(r => r.data),
      api.get('/transactions').then(r => r.data),
      api.get('/transactions/trash').then(r => r.data),
      api.get('/investors', { params: { include_company: true } }).then(r => r.data),
    ])
      .then(([inv, tx, trashRows, invs]) => {
        setInvestments(inv)
        setTransactions(tx)
        setTrash(trashRows)
        setInvestors(invs)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Référence rapide vers la personne morale Valmere & Co et son portefeuille
  // pour auto-cibler le formulaire quand on sélectionne « Prélèvement ».
  const companyInvestor = useMemo(
    () => investors.find(i => i.is_company),
    [investors]
  )
  const companyInvestment = useMemo(
    () => companyInvestor && investments.find(it => it.investor_id === companyInvestor.id),
    [companyInvestor, investments]
  )

  const investorById = useMemo(
    () => Object.fromEntries(investors.map(i => [i.id, i])),
    [investors]
  )

  const matchesDateRange = useCallback((tx) => {
    const txDate = tx.transaction_date || ''
    if (filterStartDate && txDate < filterStartDate) return false
    if (filterEndDate && txDate > filterEndDate) return false
    return true
  }, [filterStartDate, filterEndDate])

  const filteredTxs = useMemo(() => {
    return transactions
      .filter(tx => !filterInvestor || tx.investor_id === filterInvestor)
      .filter(tx => !filterType || tx.type === filterType)
      .filter(matchesDateRange)
      .slice()
      .sort((a, b) => {
        const d = new Date(b.transaction_date) - new Date(a.transaction_date)
        if (d !== 0) return d
        return new Date(b.created_at || 0) - new Date(a.created_at || 0)
      })
  }, [transactions, filterInvestor, filterType, matchesDateRange])

  const filteredTrash = useMemo(() => {
    return trash
      .filter(tx => !filterInvestor || tx.investor_id === filterInvestor)
      .filter(tx => !filterType || tx.type === filterType)
      .filter(matchesDateRange)
      .slice()
      .sort((a, b) => new Date(b.voided_at || b.created_at || 0) - new Date(a.voided_at || a.created_at || 0))
  }, [trash, filterInvestor, filterType, matchesDateRange])

  const reloadTransactionData = async () => {
    const [txs, trashRows, invs] = await Promise.all([
      api.get('/transactions').then(r => r.data).catch(() => null),
      api.get('/transactions/trash').then(r => r.data).catch(() => null),
      api.get('/investments').then(r => r.data).catch(() => null),
    ])
    if (txs) setTransactions(txs)
    if (trashRows) setTrash(trashRows)
    if (invs) setInvestments(invs)
  }

  // Le compte société Valmere & Co est exclu du dropdown investisseur :
  // il ne se gère pas comme un client classique, on l'atteint via le type
  // « Prélèvement société » qui auto-cible.
  const investorOptions = [
    { value: null, label: t('filter.all_investors') },
    ...investors.filter(i => !i.is_company).map(i => ({ value: i.id, label: i.full_name, description: i.email })),
  ]
  const filterTypeOptions = transactionTypeOptions(t)

  const resetForm = () => {
    setForm({
      investment_id: '', type: 'deposit', amount: '', currency: currency || 'HTG',
      transaction_date: todayLocalISO(),
      description: '', reference: '',
    })
    setEditingId(null)
    setFormError('')
  }

  // Pré-remplit le formulaire avec une transaction existante pour la modifier.
  // Les transactions liées à une distribution P&L (`distribution_id`) sont
  // bloquées en édition : modifier une seule ligne déséquilibrerait la
  // somme du groupe (80% société / 20% pool ne tient plus). Pour corriger
  // une distribution, l'admin doit l'annuler en bloc puis la recréer.
  const handleEdit = (tx) => {
    if (tx.distribution_id) {
      window.alert(t('tx.dist_edit_warning'))
      return
    }
    const amountInfo = getTransactionDisplayAmounts(tx, currency, convert, convertInfo)
    setEditingId(tx.id)
    setForm({
      investment_id: tx.investment_id,
      type: tx.type,
      amount: String(amountInfo.primaryAmount ?? ''),
      currency: amountInfo.primaryCurrency || tx.currency || 'HTG',
      transaction_date: tx.transaction_date || todayLocalISO(),
      description: tx.description || '',
      reference: tx.reference || '',
    })
    setShowForm(true)
    setFormError('')
    // Scroll vers le formulaire (utile sur mobile)
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50)
  }

  // Suppression : appelle /void qui reverse l'impact + void l'écriture comptable.
  const handleDelete = async (tx) => {
    const warning = tx.distribution_id ? t('tx.delete_dist_warning') : t('tx.delete_confirm')
    if (!window.confirm(warning)) return
    setDeletingId(tx.id)
    try {
      await voidTransaction(tx.id, null)
      await reloadTransactionData()
    } catch (err) {
      const detail = err.response?.data?.detail
      window.alert(typeof detail === 'string' ? detail : t('tx.error_delete_failed'))
    } finally {
      setDeletingId(null)
    }
  }

  const handleRestore = async (tx) => {
    if (!window.confirm(t('tx.restore_confirm'))) return
    setTrashActionId(tx.id)
    try {
      const res = await restoreTransaction(tx.id, null)
      if (res?.queued && res?.message) window.alert(res.message)
      await reloadTransactionData()
    } catch (err) {
      const detail = err.response?.data?.detail
      window.alert(typeof detail === 'string' ? detail : t('tx.error_restore_failed'))
    } finally {
      setTrashActionId(null)
    }
  }

  const handleReplay = async (tx) => {
    if (!window.confirm(t('tx.replay_confirm'))) return
    setTrashActionId(tx.id)
    try {
      const res = await replayTransaction(tx.id, null)
      if (res?.queued && res?.message) window.alert(res.message)
      await reloadTransactionData()
    } catch (err) {
      const detail = err.response?.data?.detail
      window.alert(typeof detail === 'string' ? detail : t('tx.error_replay_failed'))
    } finally {
      setTrashActionId(null)
    }
  }
  const handleCreate = async (e) => {
    e.preventDefault()
    setFormError('')

    if (!form.investment_id) { setFormError(t('tx.error_select_portfolio')); return }
    const amt = parseFloat(form.amount)
    if (!Number.isFinite(amt) || amt <= 0) { setFormError(t('tx.error_invalid_amount')); return }
    if (!form.transaction_date) { setFormError(t('tx.error_date_required')); return }

    setSaving(true)
    try {
      if (editingId) {
        // Modification : on n'envoie que les champs effectivement modifiables
        // (le backend ré-applique le delta sur la VA en fonction de l'ancienne
        // et de la nouvelle valeur, donc l'ordre n'importe pas).
        await updateTransaction(editingId, {
          type: form.type,
          amount: amt,
          currency: form.currency || 'HTG',
          transaction_date: form.transaction_date,
          description: form.description || null,
          reference: form.reference || null,
        })
        await reloadTransactionData()

      } else {
        await createTransaction({
          investment_id: form.investment_id,
          type: form.type,
          amount: amt,
          currency: form.currency || 'HTG',
          transaction_date: form.transaction_date,
          description: form.description || null,
          reference: form.reference || null,
        })
        await reloadTransactionData()
      }
      // Donnees deja rechargees par reloadTransactionData().
      setShowForm(false)
      resetForm()
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
    if (!invForm.investor_id) { setInvError(t('tx.error_select_investor')); return }
    const cap = parseFloat(invForm.initial_capital)
    if (!Number.isFinite(cap) || cap <= 0) { setInvError(t('tx.error_invalid_initial')); return }

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
      setInvForm({ investor_id: '', name: 'Portefeuille Principal', initial_capital: '', start_date: todayLocalISO() })
    } catch (err) {
      const detail = err.response?.data?.detail
      setInvError(typeof detail === 'string' ? detail : `Erreur ${err.response?.status || ''}`)
    } finally {
      setInvSaving(false)
    }
  }

  // Types proposés à la création MANUELLE.
  //   - deposit / withdrawal : flux investisseur classiques
  //   - fee : frais
  //   - bailout : renflouement INVESTISSEUR (input = nouvelle VA souhaitée).
  //               Obligatoire quand la VA d'un investisseur est négative.
  //   - company_withdrawal : prélèvement société Valmere & Co (cible auto)
  //   - company_bailout : renflouement SOCIÉTÉ (input = montant à ajouter).
  // gain / loss SONT EXCLUS volontairement : ils ne se créent que via la
  // mécanique « Distribuer un P&L » qui garantit la répartition 80/20.
  const typeOptions = [
    { value: 'deposit', label: t('tx.col.contribution') },
    { value: 'withdrawal', label: t('tx.col.withdrawal') },
    { value: 'fee', label: t('tx.fee') || 'Frais' },
    { value: 'bailout', label: t('tx.bailout') || 'Renflouement' },
    { value: 'company_withdrawal', label: t('tx.company_withdrawal') || 'Prélèvement société' },
    { value: 'company_bailout', label: t('tx.company_bailout') || 'Renflouement société' },
  ]

  // Si l'investissement choisi a une VA négative ET appartient à un
  // investisseur (pas la société), on FORCE le type à « bailout » et on
  // affiche un bandeau explicatif. Aucune autre transaction n'est possible.
  const selectedInvestment = useMemo(
    () => investments.find(it => it.id === form.investment_id),
    [investments, form.investment_id]
  )
  const selectedInvestor = useMemo(
    () => selectedInvestment ? investorById[selectedInvestment.investor_id] : null,
    [selectedInvestment, investorById]
  )
  const requiresBailout = !!(
    selectedInvestment
    && Number(selectedInvestment.current_value) < 0
    && selectedInvestor
    && !selectedInvestor.is_company
  )

  // Auto-bascule en mode bailout dès que le portefeuille a une VA négative.
  useEffect(() => {
    if (requiresBailout && form.type !== 'bailout') {
      setForm(p => ({ ...p, type: 'bailout' }))
    }
  }, [requiresBailout, form.type])

  // Quand l'utilisateur choisit un type société (« Prélèvement société » ou
  // « Renflouement société »), on bascule automatiquement le filtre
  // investisseur ET le portefeuille sur le compte société.
  useEffect(() => {
    const isCompanyType = form.type === 'company_withdrawal' || form.type === 'company_bailout'
    if (isCompanyType && companyInvestor && companyInvestment) {
      if (filterInvestor !== companyInvestor.id) {
        setFilterInvestor(companyInvestor.id)
      }
      if (form.investment_id !== companyInvestment.id) {
        setForm(p => ({ ...p, investment_id: companyInvestment.id }))
      }
    }
  }, [form.type, companyInvestor, companyInvestment, filterInvestor, form.investment_id])

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* En-tête : actions sur la même ligne, wrap en cas de petits écrans. */}
      <div className="flex flex-wrap items-center justify-end gap-2 mb-3 sm:mb-5 actions-wrap">
        <button
          onClick={() => setDistributeOpen(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3 sm:px-3.5 rounded-lg text-[12px] sm:text-[13px] font-semibold bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 hover:shadow-md transition flex-shrink-0"
          title={userRole === 'admin' ? t('tx.distribute_admin_tooltip') : t('tx.distribute_cashier_tooltip')}
        >
          <Sparkles size={14} />
          <span className="hidden sm:inline">{t('tx.distribute_pnl')}</span>
          <span className="sm:hidden">P&L</span>
        </button>
        <button
          onClick={() => setShowInvForm(v => !v)}
          className="btn btn-secondary h-9 text-[12px] sm:text-[13px] flex-shrink-0"
        >
          {t('tx.new_portfolio')}
        </button>
        <button
          onClick={() => {
            if (showForm) { setShowForm(false); resetForm() }
            else { resetForm(); setShowForm(true) }
          }}
          className="btn btn-primary h-9 text-[12px] sm:text-[13px] flex-shrink-0"
        >
          {t('tx.new_transaction')}
        </button>
      </div>

      {/* Bande de filtres compacte : sur mobile, chips horizontaux ; sur
          desktop, layout étalé avec libellés. */}
      <div className="card p-3 sm:p-4 mb-3 sm:mb-5">
        <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-3">
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 sm:hidden filter-chip-row">
            <Select
              value={filterInvestor}
              onChange={setFilterInvestor}
              options={investorOptions}
              size="sm"
              chip
              ariaLabel={t('filter.investor')}
              displayValue={investorOptions.find(o => o.value === filterInvestor)?.label || t('filter.all_investors')}
            />
            <Select
              value={filterType}
              onChange={setFilterType}
              options={filterTypeOptions}
              size="sm"
              chip
              ariaLabel={t('tx.filter.type')}
              displayValue={filterTypeOptions.find(o => o.value === filterType)?.label || t('tx.filter.type_all')}
            />
          </div>

          {/* Selects « étalés » uniquement à partir de sm */}
          <div className="hidden sm:flex flex-col sm:flex-row items-stretch sm:items-end gap-3 flex-1 min-w-0">
            <Select
              label={t('filter.investor')}
              value={filterInvestor}
              onChange={setFilterInvestor}
              options={investorOptions}
              size="sm"
              minWidth={220}
            />
            <Select
              label={t('tx.filter.type')}
              value={filterType}
              onChange={setFilterType}
              options={filterTypeOptions}
              size="sm"
              minWidth={190}
            />
          </div>

          <DateRangeFilter
            startDate={filterStartDate}
            endDate={filterEndDate}
            onStartDateChange={setFilterStartDate}
            onEndDateChange={setFilterEndDate}
            onClear={() => {
              setFilterStartDate('')
              setFilterEndDate('')
            }}
          />
        </div>
      </div>

      <DistributionModal
        open={distributeOpen}
        onClose={() => setDistributeOpen(false)}
        onSuccess={() => {
          // Recharge les transactions et investments après une distribution
          api.get('/transactions').then(r => setTransactions(r.data)).catch(() => {})
          api.get('/investments').then(r => setInvestments(r.data)).catch(() => {})
        }}
        isAdmin={userRole === 'admin'}
      />

      {showInvForm && (
        <form onSubmit={handleCreateInvestment} className="card p-4 sm:p-5 mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="col-span-full">
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
              {t('tx.create_portfolio_title')}
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-3)' }}>
              {t('tx.create_portfolio_subtitle')}
            </div>
          </div>
          <Select
            label={t('tx.investor_label')}
            value={invForm.investor_id}
            onChange={(v) => setInvForm(p => ({ ...p, investor_id: v }))}
            options={investors.filter(i => !i.is_company).map(i => ({ value: i.id, label: i.full_name, description: i.email }))}
            size="sm"
            fullWidth
          />
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>{t('tx.portfolio_name')}</label>
            <input
              value={invForm.name}
              onChange={e => setInvForm(p => ({ ...p, name: e.target.value }))}
              className="input input-sm"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
              {t('tx.portfolio_initial_capital', { currency })}
            </label>
            <input
              type="number" step="0.01" required
              value={invForm.initial_capital}
              onChange={e => setInvForm(p => ({ ...p, initial_capital: e.target.value }))}
              className="input input-sm"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>{t('tx.portfolio_start_date')}</label>
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
          <div className="col-span-full flex items-center justify-between">
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
              {editingId ? t('tx.edit_title') : t('tx.new_transaction')}
            </div>
            {editingId && (
              <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--c-warning-bg)', color: 'var(--c-warning-text)' }}>
                {t('tx.edit_mode_hint')}
              </span>
            )}
          </div>

          {/* Bandeau d'alerte : VA négative → renflouement obligatoire.
              Le type est verrouillé sur "bailout" et l'utilisateur ne peut
              pas en changer tant que la VA n'est pas remontée au-dessus de 0. */}
          {requiresBailout && (
            <div className="col-span-full flex items-start gap-2 px-3 py-2.5 rounded-lg text-[12.5px] bg-rose-50 border border-rose-100 text-rose-800">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 flex-shrink-0 mt-0.5">
                <path d="M12 9v4" /><path d="M12 17h.01" />
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
              <div>
                <strong>{t('tx.bailout_required_title')}</strong>
                <div className="mt-0.5">
                  {t('tx.bailout_required_desc', {
                    name: selectedInvestor?.full_name || '—',
                    value: Number(selectedInvestment?.current_value || 0).toFixed(2),
                    currency: currency,
                  })}
                </div>
              </div>
            </div>
          )}
          <Select
            label={t('tx.investor_label')}
            value={filterInvestor}
            onChange={(v) => { setFilterInvestor(v); setForm(p => ({ ...p, investment_id: '' })) }}
            options={investorOptions}
            size="sm"
            fullWidth
          />
          <div>
            <Select
              label={t('tx.portfolio_label')}
              value={form.investment_id}
              onChange={(v) => setForm(p => ({ ...p, investment_id: v }))}
              options={investmentOptions}
              size="sm"
              fullWidth
              placeholder={noInvestments ? t('tx.no_portfolio') : '—'}
            />
            {noInvestments && (
              <button
                type="button"
                onClick={() => { setShowForm(false); setShowInvForm(true) }}
                className="text-[11px] mt-1.5 underline"
                style={{ color: 'var(--color-primary)' }}
              >
                {t('tx.create_portfolio_hint')}
              </button>
            )}
          </div>
          <Select
            label={t('tx.type_label')}
            value={form.type}
            onChange={(v) => setForm(p => ({ ...p, type: v }))}
            // Quand un renflouement est obligatoire, on désactive tous les
            // autres types pour empêcher l'utilisateur de contourner la règle.
            options={typeOptions.map(o => ({
              ...o,
              disabled: requiresBailout && o.value !== 'bailout',
            }))}
            size="sm"
            fullWidth
          />
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
              {form.type === 'bailout'
                ? t('tx.bailout_target_label', { currency: form.currency })
                : t('tx.amount_label', { currency: form.currency })}
            </label>
            {/* Si on a sélectionné « Renflouement société » sur un investisseur
                ou inversement, on aide à corriger via le hint. La validation
                serveur bloquera de toute façon. */}
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
              {t('tx.description_label')}
            </label>
            <input
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="input input-sm"
            />
            {/* Aide contextuelle quand on choisit Prélèvement société : on
                rappelle la règle (cible société, refus si solde insuffisant). */}
            {form.type === 'company_withdrawal' && (
              <p className="text-[11px] text-amber-600 mt-1.5">{t('tx.company_withdrawal_hint')}</p>
            )}
            {form.type === 'bailout' && (
              <p className="text-[11px] text-emerald-700 mt-1.5">{t('tx.bailout_hint')}</p>
            )}
            {form.type === 'company_bailout' && (
              <p className="text-[11px] text-amber-600 mt-1.5">{t('tx.company_bailout_hint')}</p>
            )}
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
            <button type="button" onClick={() => { setShowForm(false); resetForm() }} className="btn btn-ghost h-9 text-[13px]">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary h-9 text-[13px]">
              {saving ? t('common.loading') : (editingId ? t('tx.update_btn') : t('common.save'))}
            </button>
          </div>
        </form>
      )}

      {/* ─── Liste mobile : transactions compactes expandables ───── */}
      <div className="md:hidden card divide-y divide-[var(--border-subtle)] overflow-hidden">
        {loading || !ratesLoaded ? (
          <div className="p-6 text-center text-sm" style={{ color: 'var(--text-3)' }}>{t('common.loading')}</div>
        ) : filteredTxs.length === 0 ? (
          <div className="p-6 text-center text-sm" style={{ color: 'var(--text-3)' }}>{t('tx.empty')}</div>
        ) : filteredTxs.map(tx => {
          const inv = investorById[tx.investor_id]
          const amountInfo = getTransactionDisplayAmounts(tx, currency, convert, convertInfo)
          const txCcy = amountInfo.ledgerCurrency
          const typeColor = {
            deposit: 'var(--c-success-text)',
            gain: 'var(--c-success-text)',
            withdrawal: 'var(--c-danger-text)',
            loss: 'var(--c-danger-text)',
            fee: 'var(--text-2)',
          }[tx.type] || 'var(--text-1)'
          const isPositive = ['deposit', 'gain', 'bailout', 'company_bailout'].includes(tx.type)
          return (
            <div key={`m-${tx.id}`} className="p-2">
              <ExpandableRow
                density="compact"
                className="!rounded-lg"
                summary={
                  <div className="min-w-0 grid grid-cols-[1fr_auto] gap-2 items-center">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-semibold text-[13px] text-[var(--text-1)] truncate">{inv?.full_name || '—'}</span>
                        {tx.distribution_id && (
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0"
                            style={{ background: 'var(--c-info-bg)', color: 'var(--c-info-text)' }}
                          >
                            DIST
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
                        <span>{formatDate(tx.transaction_date, lang)}</span>
                        <span>•</span>
                        <span className="uppercase font-semibold" style={{ color: typeColor }}>
                          {transactionTypeLabel(tx.type, t)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right tabular-nums font-mono text-[13px] font-semibold" style={{ color: isPositive ? 'var(--c-success-text)' : 'var(--text-1)' }}>
                      {formatMoney(amountInfo.displayAmount, { currency: amountInfo.displayCurrency, lang })}
                    </div>
                  </div>
                }
              >
                {tx.created_at && (
                  <DetailRow
                    label={t('tx.col.datetime')}
                    value={`${formatDate(tx.transaction_date, lang)} · ${new Date(tx.created_at).toLocaleTimeString(lang === 'fr' ? 'fr-FR' : lang === 'es' ? 'es-ES' : 'en-US', { hour: '2-digit', minute: '2-digit' })}`}
                  />
                )}
                {inv?.code && <DetailRow label={t('investors.col_code')} value={<span className="font-mono">{inv.code}</span>} />}
                <DetailRow
                  label={t('tx.col.original') || "Origine"}
                  value={(
                    <span className="font-mono">
                      {formatMoney(amountInfo.primaryAmount, { currency: amountInfo.primaryCurrency, lang })}
                      {amountInfo.isBailoutTarget && (
                        <span className="block text-[11px] font-sans mt-0.5" style={{ color: 'var(--text-3)' }}>
                          {t('tx.bailout_delta', { amount: formatMoney(amountInfo.ledgerAmount, { currency: txCcy, lang }) })}
                        </span>
                      )}
                    </span>
                  )}
                />
                {tx.description && <DetailRow label={t('tx.col.description')} value={tx.description} />}
                {tx.reference && <DetailRow label={t('tx.col.reference')} value={<span className="font-mono text-[12px]">{tx.reference}</span>} />}

                <ActionGroup>
                  <button
                    type="button"
                    onClick={() => handleEdit(tx)}
                    disabled={deletingId === tx.id || tx.distribution_id}
                    title={tx.distribution_id ? t('tx.edit_locked_dist') : t('tx.edit_btn_tooltip')}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <Pencil size={13} /> {t('common.edit') || 'Edit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(tx)}
                    disabled={deletingId === tx.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                  >
                    <Trash2 size={13} /> {t('common.delete') || 'Delete'}
                  </button>
                </ActionGroup>
              </ExpandableRow>
            </div>
          )
        })}
      </div>

      {/* ─── Table desktop (≥ md) ───────────────────────────────── */}
      <div className="hidden md:block card overflow-hidden">
        <div className="md:overflow-x-auto">
          <table className="data-table w-full text-[13px] md:min-w-[1100px]">
            <thead>
              <tr>
                <th className="text-left">{t('tx.col.datetime') || 'Date / Heure'}</th>
                <th className="text-left">{t('tx.col.investor')}</th>
                <th className="text-left">{t('tx.col.type') || 'Type'}</th>
                <th className="text-right">{t('tx.col.amount') || 'Montant'}</th>
                <th className="text-right">{t('tx.col.original') || "Montant d'origine"}</th>
                <th className="text-left">{t('tx.col.description') || 'Description'}</th>
                <th className="text-left">{t('tx.col.reference') || 'Référence'}</th>
                <th className="text-right" style={{ width: '110px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading || !ratesLoaded ? (
                <tr><td colSpan={8} className="p-8 text-center" style={{ color: 'var(--text-3)' }}>{t('common.loading')}</td></tr>
              ) : filteredTxs.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center" style={{ color: 'var(--text-3)' }}>{t('tx.empty')}</td></tr>
              ) : filteredTxs.map(tx => {
                const inv = investorById[tx.investor_id]
                const amountInfo = getTransactionDisplayAmounts(tx, currency, convert, convertInfo)
                const txCcy = amountInfo.ledgerCurrency
                const typeColor = {
                  deposit: 'var(--c-success-text)',
                  gain: 'var(--c-success-text)',
                  withdrawal: 'var(--c-danger-text)',
                  loss: 'var(--c-danger-text)',
                  fee: 'var(--text-2)',
                }[tx.type] || 'var(--text-1)'
                return (
                  <tr key={tx.id}>
                    <td className="whitespace-nowrap" data-label={t('tx.col.datetime') || 'Date'}>
                      <div>{formatDate(tx.transaction_date, lang)}</div>
                      {tx.created_at && (
                        <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                          {new Date(tx.created_at).toLocaleTimeString(lang === 'fr' ? 'fr-FR' : lang === 'es' ? 'es-ES' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </td>
                    <td data-label={t('tx.col.investor')}>
                      <div className="font-medium" style={{ color: 'var(--text-1)' }}>{inv?.full_name || '—'}</div>
                      {inv?.code && (
                        <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{inv.code}</div>
                      )}
                    </td>
                    <td data-label={t('tx.col.type') || 'Type'}>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold uppercase text-[11px]" style={{ color: typeColor }}>
                          {transactionTypeLabel(tx.type, t)}
                        </span>
                        {/* Marqueur visuel quand la transaction fait partie
                            d'une distribution P&L : aide l'admin à comprendre
                            pourquoi elle ne peut pas être éditée à l'unité. */}
                        {Number(tx.edit_count || 0) > 0 && (
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                            style={{ background: 'var(--c-warning-bg)', color: 'var(--c-warning-text)' }}
                            title={t('tx.status_modified')}
                          >
                            {t('tx.status_modified_short')}
                          </span>
                        )}
                        {tx.distribution_id && (
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                            style={{ background: 'var(--c-info-bg)', color: 'var(--c-info-text)' }}
                            title={t('tx.dist_badge_tooltip')}
                          >
                            DIST
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-right font-mono" data-label={t('tx.col.amount') || 'Montant'}>
                      <div>{formatMoney(amountInfo.displayAmount, { currency: amountInfo.displayCurrency, lang })}</div>
                      {amountInfo.isBailoutTarget && (
                        <div className="text-[11px] font-sans mt-1" style={{ color: 'var(--text-3)' }}>
                          {t('tx.bailout_delta', { amount: formatMoney(amountInfo.ledgerDisplayAmount, { currency: amountInfo.ledgerDisplayCurrency, lang }) })}
                        </div>
                      )}
                    </td>
                    <td className="text-right font-mono" style={{ color: 'var(--text-3)' }} data-label={t('tx.col.original') || "Origine"}>
                      <div>{formatMoney(amountInfo.primaryAmount, { currency: amountInfo.primaryCurrency, lang })}</div>
                      {amountInfo.isBailoutTarget && (
                        <div className="text-[11px] font-sans mt-1">
                          {t('tx.bailout_delta', { amount: formatMoney(amountInfo.ledgerAmount, { currency: txCcy, lang }) })}
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-2)' }} data-label={t('tx.col.description') || 'Description'}>{tx.description || '—'}</td>
                    <td className="text-[12px] font-mono" style={{ color: 'var(--text-3)' }} data-label={t('tx.col.reference') || 'Référence'}>{tx.reference || '—'}</td>
                    <td className="text-right" data-label="">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(tx)}
                          disabled={deletingId === tx.id}
                          title={tx.distribution_id ? t('tx.edit_locked_dist') : t('tx.edit_btn_tooltip')}
                          className="w-8 h-8 rounded-lg inline-flex items-center justify-center transition disabled:opacity-40"
                          style={{ color: 'var(--text-3)' }}
                          onMouseEnter={e => { if (!tx.distribution_id) { e.currentTarget.style.background = 'var(--bg-subtle)'; e.currentTarget.style.color = 'var(--color-primary)' }}}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)' }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(tx)}
                          disabled={deletingId === tx.id}
                          title={t('tx.delete_btn_tooltip')}
                          className="w-8 h-8 rounded-lg inline-flex items-center justify-center transition disabled:opacity-40"
                          style={{ color: 'var(--text-3)' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-danger-bg)'; e.currentTarget.style.color = 'var(--c-danger-text)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)' }}
                        >
                          {deletingId === tx.id ? (
                            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card overflow-hidden mt-5">
        <div className="px-4 sm:px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>{t('tx.trash_title')}</div>
          <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-3)' }}>{t('tx.trash_subtitle')}</div>
        </div>
        <div className="md:overflow-x-auto">
          <table className="data-table is-responsive w-full text-[13px] md:min-w-[1100px]">
            <thead>
              <tr>
                <th className="text-left">{t('tx.col.datetime')}</th>
                <th className="text-left">{t('tx.col.investor')}</th>
                <th className="text-left">{t('tx.col.type')}</th>
                <th className="text-right">{t('tx.col.amount')}</th>
                <th className="text-left">{t('tx.col.description')}</th>
                <th className="text-left">{t('tx.status_col')}</th>
                <th className="text-right" style={{ width: '170px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading || !ratesLoaded ? (
                <tr><td colSpan={7} className="p-8 text-center" style={{ color: 'var(--text-3)' }}>{t('common.loading')}</td></tr>
              ) : filteredTrash.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center" style={{ color: 'var(--text-3)' }}>{t('tx.trash_empty')}</td></tr>
              ) : filteredTrash.map(tx => {
                const inv = investorById[tx.investor_id]
                const amountInfo = getTransactionDisplayAmounts(tx, currency, convert, convertInfo)
                const busy = trashActionId === tx.id
                return (
                  <tr key={`trash-${tx.id}`}>
                    <td className="whitespace-nowrap" data-label={t('tx.col.datetime')}>
                      <div>{formatDate(tx.transaction_date, lang)}</div>
                      {tx.voided_at && <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{t('tx.deleted_at', { date: new Date(tx.voided_at).toLocaleString(lang === 'fr' ? 'fr-FR' : lang === 'es' ? 'es-ES' : 'en-US') })}</div>}
                    </td>
                    <td data-label={t('tx.col.investor')}>
                      <div className="font-medium" style={{ color: 'var(--text-1)' }}>{inv?.full_name || '—'}</div>
                      {inv?.code && <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{inv.code}</div>}
                    </td>
                    <td data-label={t('tx.col.type')}><span className="font-semibold uppercase text-[11px]" style={{ color: 'var(--text-2)' }}>{transactionTypeLabel(tx.type, t)}</span></td>
                    <td className="text-right font-mono" data-label={t('tx.col.amount')}>
                      <div>{formatMoney(amountInfo.displayAmount, { currency: amountInfo.displayCurrency, lang })}</div>
                      {amountInfo.isBailoutTarget && (
                        <div className="text-[11px] font-sans mt-1" style={{ color: 'var(--text-3)' }}>
                          {t('tx.bailout_delta', { amount: formatMoney(amountInfo.ledgerDisplayAmount, { currency: amountInfo.ledgerDisplayCurrency, lang }) })}
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-2)' }} data-label={t('tx.col.description')}>
                      <div>{tx.description || '—'}</div>
                      {tx.void_reason && <div className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>{t('tx.deleted_reason', { reason: tx.void_reason })}</div>}
                    </td>
                    <td data-label={t('tx.status_col')}>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase" style={{ background: 'var(--c-danger-bg)', color: 'var(--c-danger-text)' }}>{t('tx.status_deleted')}</span>
                      {tx.replayed_transaction_id && <span className="ml-1.5 text-[10px] font-bold px-2 py-0.5 rounded uppercase" style={{ background: 'var(--c-info-bg)', color: 'var(--c-info-text)' }}>{t('tx.replayed')}</span>}
                    </td>
                    <td className="text-right" data-label="">
                      <div className="inline-flex items-center gap-1">
                        <button type="button" onClick={() => handleRestore(tx)} disabled={busy} className="btn btn-secondary h-8 text-[12px] inline-flex items-center gap-1.5">
                          <Undo2 size={13} /> {t('tx.restore_btn')}
                        </button>
                        <button type="button" onClick={() => handleReplay(tx)} disabled={busy || !!tx.replayed_transaction_id} className="btn btn-ghost h-8 text-[12px] inline-flex items-center gap-1.5 disabled:opacity-40">
                          <RotateCcw size={13} /> {t('tx.replay_btn')}
                        </button>
                      </div>
                    </td>
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
