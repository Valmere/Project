import { useEffect, useState } from 'react'
import api from '../../api/axios'
import Select from '../../components/ui/Select'
import { useRatesStore } from '../../store/rates.store'
import { CURRENCIES, useT } from '../../store/prefs.store'

export default function CurrencyRatesPage() {
  const t = useT()
  const reloadGlobalRates = useRatesStore(s => s.load)
  const [rates, setRates] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ from_currency: 'USD', to_currency: 'HTG', rate: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncInfo, setSyncInfo] = useState(null)

  const load = () => {
    setLoading(true)
    api.get('/currency-rates')
      .then(r => setRates(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const options = CURRENCIES.map(c => ({ value: c.code, label: `${c.code} — ${c.label}` }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const r = parseFloat(form.rate)
    if (!Number.isFinite(r) || r <= 0) { setError(t('rates.error_rate') || 'Taux invalide'); return }
    if (form.from_currency === form.to_currency) { setError(t('rates.error_same') || 'Devises identiques'); return }
    setSaving(true)
    try {
      await api.post('/currency-rates', {
        from_currency: form.from_currency,
        to_currency: form.to_currency,
        rate: r,
      })
      setForm(p => ({ ...p, rate: '' }))
      load()
    } catch (err) {
      const d = err.response?.data?.detail
      setError(typeof d === 'string' ? d : `Erreur ${err.response?.status || ''}`)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    await api.delete(`/currency-rates/${id}`)
    load()
    reloadGlobalRates?.()
  }

  // ── Normalisation d'une devise obsolète ───────────────────────
  // Utilité : quand une devise est retirée du menu (ex: CAD) mais que
  // des données historiques restent libellées dans cette devise et
  // bloquent les rapports (MissingRateError), l'admin la convertit à
  // taux fixe en une devise active.
  const [normOpen, setNormOpen] = useState(false)
  const [normForm, setNormForm] = useState({ from_currency: 'CAD', to_currency: 'USD', rate: '0.73' })
  const [normPreview, setNormPreview] = useState(null)
  const [normBusy, setNormBusy] = useState(false)

  const doNormalize = async (dry_run) => {
    setError('')
    const r = parseFloat(normForm.rate)
    if (!Number.isFinite(r) || r <= 0) { setError(t('rates.error_rate')); return }
    const fc = normForm.from_currency.toUpperCase().trim()
    const tc = normForm.to_currency.toUpperCase().trim()
    if (fc === tc) { setError(t('rates.error_same')); return }
    setNormBusy(true)
    try {
      const res = await api.post('/currency-rates/normalize', {
        from_currency: fc, to_currency: tc, rate: r, dry_run,
      })
      if (dry_run) {
        setNormPreview(res.data)
      } else {
        const { tx, inv, lines } = res.data
        const total = (tx || 0) + (inv || 0) + (lines || 0)
        alert(total === 0
          ? t('rates.normalize_nothing', { from: fc })
          : t('rates.normalize_done', { tx, inv, lines })
        )
        setNormPreview(null)
        load()
        reloadGlobalRates?.()
      }
    } catch (err) {
      const d = err.response?.data?.detail
      setError(typeof d === 'string' ? d : `Erreur ${err.response?.status || ''}`)
    } finally {
      setNormBusy(false)
    }
  }

  const confirmAndNormalize = async () => {
    if (!normPreview || (normPreview.tx + normPreview.inv + normPreview.lines) === 0) {
      await doNormalize(true) // refresh preview
      return
    }
    const ok = confirm(t('rates.normalize_confirm', normPreview))
    if (ok) await doNormalize(false)
  }

  const syncBRH = async () => {
    setError('')
    setSyncing(true)
    try {
      const res = await api.post('/currency-rates/sync-brh')
      setSyncInfo(res.data)
      load()
      reloadGlobalRates?.()
    } catch (err) {
      const d = err.response?.data?.detail
      setError(typeof d === 'string' ? d : (t('rates.sync_failed') || 'Échec de la synchronisation BRH'))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1000px] mx-auto">
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[18px] font-semibold" style={{ color: 'var(--text-1)' }}>
            {t('rates.title') || 'Taux de conversion'}
          </h2>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-3)' }}>
            {t('rates.subtitle') || 'Définissez des taux personnalisés pour uniformiser l\'affichage des montants.'}
          </p>
        </div>
        <button
          type="button"
          onClick={syncBRH}
          disabled={syncing}
          className="btn btn-primary h-9 text-[13px] whitespace-nowrap"
          title={t('rates.sync_brh_hint') || 'Synchroniser depuis la Banque de la République d\'Haïti'}
        >
          {syncing ? (t('common.loading') || 'Chargement…') : (t('rates.sync_brh') || 'Synchroniser BRH')}
        </button>
      </div>

      {syncInfo && (
        <div
          className="mb-4 px-3 py-2.5 rounded-lg text-[13px]"
          style={{ background: 'var(--c-success-bg)', color: 'var(--c-success-text)' }}
        >
          {t('rates.sync_ok') || 'Taux synchronisés'}
          {syncInfo.date ? ` — ${syncInfo.date}` : ''}
          {syncInfo.source ? ` (${syncInfo.source})` : ''}
          {syncInfo.USD_HTG ? ` · USD→HTG = ${syncInfo.USD_HTG}` : ''}
          {syncInfo.EUR_HTG ? ` · EUR→HTG = ${syncInfo.EUR_HTG}` : ''}
        </div>
      )}

      <form onSubmit={submit} className="card p-4 sm:p-5 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
        <Select
          label={t('rates.from') || 'De'}
          value={form.from_currency}
          onChange={(v) => setForm(p => ({ ...p, from_currency: v }))}
          options={options}
          size="sm"
          fullWidth
        />
        <Select
          label={t('rates.to') || 'Vers'}
          value={form.to_currency}
          onChange={(v) => setForm(p => ({ ...p, to_currency: v }))}
          options={options}
          size="sm"
          fullWidth
        />
        <div>
          <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
            {t('rates.rate') || 'Taux'}
          </label>
          <input
            type="number" step="0.00000001" required
            value={form.rate}
            onChange={e => setForm(p => ({ ...p, rate: e.target.value }))}
            className="input input-sm"
            placeholder={`1 ${form.from_currency} = ? ${form.to_currency}`}
          />
        </div>
        <button type="submit" disabled={saving} className="btn btn-primary h-9 text-[13px]">
          {saving ? t('common.loading') : (t('rates.save') || 'Enregistrer')}
        </button>
        {error && (
          <div
            className="col-span-full px-3 py-2.5 rounded-lg text-[13px]"
            style={{ background: 'var(--c-danger-bg)', color: 'var(--c-danger-text)' }}
          >
            {error}
          </div>
        )}
      </form>

      {/* Normalisation d'une devise obsolète */}
      <div className="card p-4 sm:p-5 mb-6">
        <button
          type="button"
          onClick={() => setNormOpen(v => !v)}
          className="flex items-center gap-2 text-[13px] font-medium"
          style={{ color: 'var(--text-2)' }}
        >
          <span className="transform transition-transform" style={{ display: 'inline-block', transform: normOpen ? 'rotate(90deg)' : 'none' }}>▸</span>
          {t('rates.normalize_cta')}
        </button>
        {normOpen && (
          <div className="mt-3 space-y-3">
            <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>{t('rates.normalize_desc')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
                  {t('rates.normalize_from')}
                </label>
                <input
                  type="text" maxLength={10}
                  value={normForm.from_currency}
                  onChange={e => { setNormForm(p => ({ ...p, from_currency: e.target.value.toUpperCase() })); setNormPreview(null) }}
                  className="input input-sm uppercase"
                  placeholder="CAD"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
                  {t('rates.normalize_to')}
                </label>
                <Select
                  value={normForm.to_currency}
                  onChange={v => { setNormForm(p => ({ ...p, to_currency: v })); setNormPreview(null) }}
                  options={options}
                  size="sm"
                  fullWidth
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
                  {t('rates.normalize_rate', { from: normForm.from_currency || '?', to: normForm.to_currency || '?' })}
                </label>
                <input
                  type="number" step="0.00000001" min="0"
                  value={normForm.rate}
                  onChange={e => { setNormForm(p => ({ ...p, rate: e.target.value })); setNormPreview(null) }}
                  className="input input-sm"
                />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => doNormalize(true)} disabled={normBusy} className="btn btn-secondary h-9 text-[13px] flex-1">
                  {t('rates.normalize_preview')}
                </button>
                <button type="button" onClick={confirmAndNormalize} disabled={normBusy || !normPreview || (normPreview.tx + normPreview.inv + normPreview.lines === 0)} className="btn btn-primary h-9 text-[13px] flex-1">
                  {t('rates.normalize_apply')}
                </button>
              </div>
            </div>
            {normPreview && (
              <div
                className="px-3 py-2 rounded-lg text-[12px]"
                style={{ background: 'var(--c-warn-bg, #FEF3C7)', color: 'var(--c-warn-text, #92400E)' }}
              >
                <strong>{t('rates.normalize_preview_title')} :</strong>
                {' '}
                {(normPreview.tx + normPreview.inv + normPreview.lines) === 0
                  ? t('rates.normalize_nothing', { from: normForm.from_currency })
                  : `${normPreview.tx} tx · ${normPreview.inv} inv · ${normPreview.lines} lines`}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table w-full text-[13px]">
            <thead>
              <tr>
                <th className="text-left">{t('rates.pair') || 'Paire'}</th>
                <th className="text-right">{t('rates.rate') || 'Taux'}</th>
                <th className="text-left">{t('rates.updated') || 'Mis à jour'}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="p-8 text-center" style={{ color: 'var(--text-3)' }}>{t('common.loading')}</td></tr>
              ) : rates.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center" style={{ color: 'var(--text-3)' }}>{t('rates.empty') || 'Aucun taux enregistré'}</td></tr>
              ) : rates.map(r => (
                <tr key={r.id}>
                  <td className="font-medium" style={{ color: 'var(--text-1)' }}>
                    {r.from_currency} → {r.to_currency}
                  </td>
                  <td className="text-right font-mono">{Number(r.rate).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                  <td style={{ color: 'var(--text-3)' }}>{new Date(r.updated_at).toLocaleString()}</td>
                  <td className="text-right">
                    <button onClick={() => remove(r.id)} className="btn btn-ghost btn-sm text-[12px]" style={{ color: 'var(--c-danger-text)' }}>
                      {t('common.delete') || 'Supprimer'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
