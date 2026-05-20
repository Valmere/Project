import { useEffect, useMemo, useState } from 'react'
import {
  X,
  TrendingUp,
  TrendingDown,
  Building2,
  Users,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Info,
} from 'lucide-react'
import { previewDistribution, executeDistribution } from '../../api/transactions.api'
import { usePrefsStore, useT } from '../../store/prefs.store'
import { formatMoney } from '../../utils/format'

const CURRENCIES = ['HTG', 'USD', 'EUR']

const fmt = (v, ccy, lang) => {
  if (v == null) return '—'
  return formatMoney(v, { currency: ccy, lang })
}

/**
 * Distribution d'un bénéfice ou d'une perte.
 *
 * UX :
 *  1. L'admin saisit montant + devise + type (gain/loss) + date
 *  2. Au blur ou après debounce, on appelle /preview pour montrer la
 *     répartition prévue avant validation. Les chiffres sont indicatifs
 *     (re-calculés au moment de l'exécution si les VA bougent).
 *  3. Validation → POST /distribute → succès, on ferme et notifie le parent
 *     pour qu'il rafraîchisse la liste des transactions.
 *
 * Pour un caissier, le backend met la demande en file d'attente d'approbation
 * — on l'indique clairement dans le message de succès.
 */
export default function DistributionModal({ open, onClose, onSuccess, isAdmin = true }) {
  const t = useT()
  const { lang } = usePrefsStore()
  const [kind, setKind] = useState('gain')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('HTG')
  const [date, setDate] = useState(() => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  })
  const [notes, setNotes] = useState('')

  const [preview, setPreview] = useState(null)
  const [previewErr, setPreviewErr] = useState('')
  const [previewBusy, setPreviewBusy] = useState(false)

  const [submitErr, setSubmitErr] = useState('')
  const [submitBusy, setSubmitBusy] = useState(false)
  const [submitDone, setSubmitDone] = useState(null)

  // Reset à chaque ouverture
  useEffect(() => {
    if (open) {
      setAmount('')
      setNotes('')
      setPreview(null)
      setPreviewErr('')
      setSubmitErr('')
      setSubmitDone(null)
    }
  }, [open])

  // Aperçu live (debounce 400ms) dès qu'un montant valide est saisi
  useEffect(() => {
    if (!open) return
    const amt = parseFloat(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setPreview(null); setPreviewErr('')
      return
    }
    const handle = setTimeout(async () => {
      setPreviewBusy(true)
      setPreviewErr('')
      try {
        const data = await previewDistribution({ amount: amt, currency, kind })
        setPreview(data)
      } catch (e) {
        setPreview(null)
        const detail = e?.response?.data?.detail
        setPreviewErr(typeof detail === 'string' ? detail : t('dist.preview_unavailable'))
      } finally {
        setPreviewBusy(false)
      }
    }, 400)
    return () => clearTimeout(handle)
  }, [amount, currency, kind, open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitErr('')
    const amt = parseFloat(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setSubmitErr(t('dist.positive_amount'))
      return
    }
    setSubmitBusy(true)
    try {
      const res = await executeDistribution({
        amount: amt,
        currency,
        kind,
        transaction_date: date,
        notes: notes || null,
      })
      setSubmitDone(res)
      // Notifie le parent (refresh transactions). On laisse le modal ouvert
      // 2 s pour que l'admin voie la confirmation, puis ferme.
      setTimeout(() => {
        onSuccess?.(res)
        onClose?.()
      }, 1800)
    } catch (e) {
      const detail = e?.response?.data?.detail
      setSubmitErr(typeof detail === 'string' ? detail : t('dist.submit_failed'))
    } finally {
      setSubmitBusy(false)
    }
  }

  // ⚠ Tous les hooks doivent être appelés AVANT tout return conditionnel,
  // sinon React lève « Rendered more hooks than during the previous render »
  // et le composant crashe (page blanche). useMemo placé ici, pas après le `if`.
  const totalLines = useMemo(() => {
    if (!preview) return 0
    return preview.investors.length + 1 // +1 pour la ligne société
  }, [preview])

  if (!open) return null

  const money = (value) => fmt(value, currency, lang)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-slate-900/40 backdrop-blur-sm animate-fade modal-mobile-sheet-overlay"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto modal-mobile-sheet-panel"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-4 sm:px-6 py-4 flex items-center justify-between gap-3 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              kind === 'gain' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
            }`}>
              {kind === 'gain' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
            </div>
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold text-slate-900">
                {kind === 'gain' ? t('dist.title_gain') : t('dist.title_loss')}
              </h2>
              <p className="text-[12px] text-slate-500">
                {isAdmin
                  ? t('dist.desc_admin')
                  : t('dist.desc_cashier')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition"
            aria-label={t('dist.close')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-5 space-y-5">
          {/* Type toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
            {[
              { v: 'gain', label: t('dist.kind_gain'), icon: TrendingUp, bg: 'bg-emerald-500' },
              { v: 'loss', label: t('dist.kind_loss'), icon: TrendingDown, bg: 'bg-rose-500' },
            ].map(opt => {
              const Icon = opt.icon
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setKind(opt.v)}
                  className={`flex items-center justify-center gap-2 h-10 rounded-lg text-[13px] font-semibold transition ${
                    kind === opt.v
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon size={16} className={kind === opt.v ? (opt.v === 'gain' ? 'text-emerald-600' : 'text-rose-600') : ''} />
                  {opt.label}
                </button>
              )
            })}
          </div>

          {/* Amount + currency */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[12px] font-medium text-slate-600 mb-1.5">{t('dist.amount_total')}</label>
              <input
                type="number" min="0" step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder={t('dist.amount_placeholder')}
                className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] text-slate-900 placeholder-slate-400 outline-none transition focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[rgba(26,58,92,0.08)]"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-slate-600 mb-1.5">{t('common.currency')}</label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-[14px] text-slate-900 outline-none focus:border-[var(--color-primary)]"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Date + notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-slate-600 mb-1.5">{t('tx.col.date')}</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-[14px] text-slate-900 outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-slate-600 mb-1.5">{t('dist.note_optional')}</label>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={t('dist.note_placeholder')}
                className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-[14px] text-slate-900 placeholder-slate-400 outline-none focus:border-[var(--color-primary)]"
              />
            </div>
          </div>

          {/* Preview */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-[12px] uppercase tracking-wider text-slate-400 font-semibold">
                {t('dist.preview_title')}
              </h3>
              {preview && (
                <span className="text-[11.5px] text-slate-500">
                  {t('dist.transactions_created', { count: totalLines })}
                </span>
              )}
            </div>

            {previewBusy && (
              <div className="flex items-center justify-center gap-2 py-8 text-slate-400 text-[13px]">
                <Loader2 size={16} className="animate-spin" />
                {t('dist.calculating')}
              </div>
            )}

            {!previewBusy && previewErr && (
              <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl text-[13px] bg-rose-50 text-rose-700 border border-rose-100">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{previewErr}</span>
              </div>
            )}

            {!previewBusy && !previewErr && !preview && (
              <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl text-[13px] bg-slate-50 text-slate-500">
                <Info size={16} className="flex-shrink-0 mt-0.5 text-slate-400" />
                <span>{t('dist.preview_hint')}</span>
              </div>
            )}

            {!previewBusy && !previewErr && preview && (
              <div className="space-y-2.5 animate-in">
                {/* Société */}
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                  <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center flex-shrink-0">
                    <Building2 size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold text-slate-900">Valmere & Co</div>
                    <div className="text-[11.5px] text-slate-500">
                      {t('dist.legal_entity')} · {t('dist.of_total', { percent: (preview.company_share_ratio * 100).toFixed(0) })}
                    </div>
                  </div>
                  <div className={`text-[14px] font-semibold tabular-nums ${
                    kind === 'gain' ? 'text-emerald-600' : 'text-rose-600'
                  }`}>
                    {kind === 'gain' ? '+' : '−'} {money(preview.company_amount)}
                  </div>
                </div>

                {/* Investisseurs */}
                {preview.investors.length === 0 ? (
                  <div className="text-[12.5px] text-slate-500 text-center py-4 rounded-xl bg-slate-50 border border-dashed border-slate-200">
                    {t('dist.no_eligible')}
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-100 overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                      <Users size={13} className="text-slate-500" />
                      <span className="text-[11.5px] font-semibold text-slate-600 uppercase tracking-wider">
                        {t('dist.investors_pool', { percent: (preview.investors_share_ratio * 100).toFixed(0) })}
                      </span>
                      <span className="ml-auto text-[12px] text-slate-500 tabular-nums">
                        {money(preview.investors_pool_amount)}
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {preview.investors.map(line => (
                        <div key={line.investor_id} className="px-4 py-2.5 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium text-slate-800 truncate">
                              {line.investor_name}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              <span className="font-mono">{line.investor_code}</span> · {t('dist.of_pool', { percent: line.share_pct_pool.toFixed(2) })}
                            </div>
                          </div>
                          <div className={`text-[13.5px] font-semibold tabular-nums ${
                            kind === 'gain' ? 'text-emerald-600' : 'text-rose-600'
                          }`}>
                            {kind === 'gain' ? '+' : '−'} {money(line.amount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Total check */}
                <div className="flex items-center justify-between px-1 pt-1 text-[12px]">
                  <span className="text-slate-500">{t('dist.total_to_distribute')}</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {money(preview.total_amount)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {submitErr && (
            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl text-[13px] bg-rose-50 text-rose-700 border border-rose-100">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{submitErr}</span>
            </div>
          )}

          {submitDone && (
            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl text-[13px] bg-emerald-50 text-emerald-700 border border-emerald-100 animate-in">
              <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
              <span>
                {submitDone.queued
                  ? t('dist.request_sent')
                  : t('dist.done', { count: (submitDone.lines?.length ?? 0) + 1 })}
              </span>
            </div>
          )}

          {/* Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl text-[13px] font-medium text-slate-600 hover:bg-slate-100 transition"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitBusy || !preview || !!submitDone}
              className="h-10 px-5 rounded-xl text-[13px] font-semibold text-white bg-[var(--color-primary)] hover:bg-[#163151] hover:shadow-md transition disabled:opacity-50 disabled:pointer-events-none inline-flex items-center justify-center gap-2"
            >
              {submitBusy && <Loader2 size={15} className="animate-spin" />}
              {!submitBusy && <ArrowRight size={15} />}
              {isAdmin
                ? (kind === 'gain' ? t('dist.submit_gain') : t('dist.submit_loss'))
                : t('dist.submit_approval')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
