import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { previewMyStatement, generateMyStatement, getMyReports } from '../../api/reports.api'
import { usePrefsStore } from '../../store/prefs.store'
import { formatMoney } from '../../utils/format'
import ShareModal from '../../components/reports/ShareModal'

/* ── SVG icons ───────────────────────────────────────────────── */
const Icons = {
  download: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  share: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  ),
  print: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  excel: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 13l6 6M15 13l-6 6" />
    </svg>
  ),
  view: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
}

/* ── Transaction type styling (mirrors Excel output) ─────────── */
const TX_TYPE_META = {
  initial:    { bg: '#EFF6FF', fg: '#1E40AF', label: { fr: 'Apport initial', en: 'Initial capital', es: 'Capital inicial' } },
  deposit:    { bg: '#EFF6FF', fg: '#1D4ED8', label: { fr: 'Dépôt',          en: 'Deposit',         es: 'Depósito' } },
  withdrawal: { bg: '#FFF7ED', fg: '#C2410C', label: { fr: 'Retrait',        en: 'Withdrawal',      es: 'Retiro' } },
  gain:       { bg: '#ECFDF5', fg: '#047857', label: { fr: 'Gain',           en: 'Gain',            es: 'Ganancia' } },
  loss:       { bg: '#FEF2F2', fg: '#B91C1C', label: { fr: 'Perte',          en: 'Loss',            es: 'Pérdida' } },
  fee:        { bg: '#F5F3FF', fg: '#6D28D9', label: { fr: 'Frais',          en: 'Fee',             es: 'Comisión' } },
}

function typeBadge(type, lang = 'fr') {
  const meta = TX_TYPE_META[type] || { bg: '#F1F5F9', fg: '#475569', label: { fr: type } }
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold"
      style={{ backgroundColor: meta.bg, color: meta.fg }}
    >
      {meta.label[lang] || meta.label.fr || type}
    </span>
  )
}

/* ── Period presets ───────────────────────────────────────────── */
const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

const PERIOD_PRESETS = [
  { key: '30', label: '30 jours', from: () => daysAgo(30), to: today },
  { key: '90', label: '3 mois',   from: () => daysAgo(90), to: today },
  { key: '180',label: '6 mois',   from: () => daysAgo(180), to: today },
  { key: '365',label: '1 an',     from: () => daysAgo(365), to: today },
  { key: 'ytd', label: 'YTD', from: () => `${new Date().getFullYear()}-01-01`, to: today },
  { key: 'all', label: 'Tout', from: () => null, to: () => null },
  { key: 'custom', label: 'Personnalisé', from: () => null, to: () => null },
]

/* ── Summary card ─────────────────────────────────────────────── */
function StatTile({ label, value, hint, accent }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-lg md:text-xl font-bold mt-1.5 break-all" style={{ color: accent || 'var(--color-primary)' }}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-slate-400 mt-1">{hint}</div>}
    </div>
  )
}

/* ── Main page ────────────────────────────────────────────────── */
export default function MyReportsPage() {
  const navigate = useNavigate()
  const { lang, currency } = usePrefsStore()
  const [presetKey, setPresetKey] = useState('all')
  const [from, setFrom] = useState(null)
  const [to, setTo] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [previewErr, setPreviewErr] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genErr, setGenErr] = useState('')
  const [pastReports, setPastReports] = useState([])
  const [shareTarget, setShareTarget] = useState(null)  // { reportId, displayName } | null

  const reloadPreview = async () => {
    setLoadingPreview(true)
    setPreviewErr('')
    try {
      const params = {}
      if (from) params.period_start = from
      if (to) params.period_end = to
      const data = await previewMyStatement(params)
      setPreview(data)
    } catch (e) {
      setPreviewErr(e?.response?.data?.detail || 'Impossible de charger le relevé')
      setPreview(null)
    } finally {
      setLoadingPreview(false)
    }
  }

  const reloadPastReports = () =>
    getMyReports()
      .then(setPastReports)
      .catch(() => setPastReports([]))

  useEffect(() => { reloadPreview(); reloadPastReports() }, [])
  // Recharger quand la période change
  useEffect(() => { reloadPreview() }, [from, to])

  const choosePreset = (key) => {
    const p = PERIOD_PRESETS.find(x => x.key === key)
    if (!p) return
    setPresetKey(key)
    if (key === 'custom') return
    setFrom(p.from())
    setTo(p.to())
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setGenErr('')
    try {
      const payload = { lang, display_currency: currency }
      if (from) payload.period_start = from
      if (to) payload.period_end = to
      const created = await generateMyStatement(payload)
      await reloadPastReports()
      // Télécharger immédiatement le fichier créé
      await downloadReport(created)
    } catch (e) {
      setGenErr(e?.response?.data?.detail || 'Erreur lors de la génération du fichier Excel')
    } finally {
      setGenerating(false)
    }
  }

  const downloadReport = async (report) => {
    const res = await api.get(`/reports/${report.id}/download`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `releve_${report.id}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const openShare = (report) => {
    setShareTarget({
      reportId: report.id,
      displayName: preview?.investor?.full_name || 'investisseur',
    })
  }

  const viewReport = (report) => {
    navigate(`/investor/reports/${report.id}`)
  }

  const summary = preview?.summary
  const txs = preview?.transactions || []
  const displayCcy = preview?.display_currency || currency

  // Ligne synthétique "Apport initial" en tête (comme dans l'Excel)
  const tableRows = useMemo(() => {
    if (!preview) return []
    const initial = {
      id: '__initial__',
      date: preview.investment.start_date || preview.investor.entry_date,
      type: 'initial',
      converted_amount: preview.summary.initial,
      original_amount: preview.investment.initial_capital_native,
      original_currency: preview.investment.currency,
      description: "Apport initial à l'ouverture du compte",
      reference: null,
    }
    return [initial, ...txs]
  }, [preview, txs])

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-slate-800">Mes rapports</h2>
          <p className="text-sm text-slate-500 mt-1">
            Consultez votre relevé à l'écran pour la période choisie, puis téléchargez-le en Excel.
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating || loadingPreview || !preview}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {Icons.excel}
          {generating ? 'Génération…' : 'Télécharger en Excel'}
        </button>
      </div>

      {/* Period filter */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-2">
          {PERIOD_PRESETS.map(p => {
            const isActive = presetKey === p.key
            return (
              <button
                key={p.key}
                onClick={() => choosePreset(p.key)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${isActive
                  ? 'text-white border-transparent'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                style={isActive ? { backgroundColor: 'var(--color-primary)' } : undefined}
              >
                {p.label}
              </button>
            )
          })}
          {presetKey === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <label className="text-xs text-slate-500">Du</label>
              <input
                type="date"
                value={from || ''}
                onChange={e => setFrom(e.target.value || null)}
                className="border border-slate-200 rounded-lg px-2 py-1 text-sm"
              />
              <label className="text-xs text-slate-500">Au</label>
              <input
                type="date"
                value={to || ''}
                onChange={e => setTo(e.target.value || null)}
                className="border border-slate-200 rounded-lg px-2 py-1 text-sm"
              />
            </div>
          )}
          <button
            onClick={reloadPreview}
            className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
            title="Rafraîchir"
          >
            {Icons.refresh} Rafraîchir
          </button>
        </div>
      </div>

      {previewErr && (
        <div className="px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 border border-red-100">{previewErr}</div>
      )}
      {genErr && (
        <div className="px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 border border-red-100">{genErr}</div>
      )}

      {/* Preview */}
      {loadingPreview ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center text-sm text-slate-400">Chargement du relevé…</div>
      ) : preview ? (
        <>
          {/* Statement header (mirrors Excel banner) */}
          <div
            className="rounded-2xl overflow-hidden shadow-sm"
            style={{ background: 'var(--color-primary)' }}
          >
            <div className="p-6 md:p-8 text-center text-white">
              <div className="text-[11px] uppercase tracking-[0.14em] opacity-60 mb-1">Relevé de compte</div>
              <div className="text-xl md:text-2xl font-bold">{preview.investor.full_name}</div>
              <div className="text-[12px] opacity-70 mt-1">
                Code : {preview.investor.code} · Entrée : {preview.investor.entry_date || '—'}
              </div>
              <div className="text-[11px] opacity-60 mt-2">
                {preview.period.start || preview.period.end
                  ? `Période : ${preview.period.start || '—'} → ${preview.period.end || '—'}`
                  : 'Toutes les transactions'}
              </div>
            </div>
          </div>

          {/* KPI summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile
              label="Capital initial"
              value={formatMoney(summary.initial, { currency: displayCcy, lang })}
              hint={preview.investor.entry_date}
            />
            <StatTile
              label="Valeur actuelle"
              value={formatMoney(summary.current, { currency: displayCcy, lang })}
            />
            <StatTile
              label="Gain / Perte"
              value={formatMoney(summary.pnl, { currency: displayCcy, lang, sign: true })}
              accent={summary.pnl >= 0 ? '#047857' : '#B91C1C'}
            />
            <StatTile
              label="Rendement (ROI)"
              value={`${summary.roi_pct >= 0 ? '+' : ''}${summary.roi_pct.toFixed(2)}%`}
              accent={summary.roi_pct >= 0 ? '#047857' : '#B91C1C'}
            />
          </div>

          {/* Transactions table */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 md:px-6 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 text-sm">Historique des transactions</h3>
              <span className="text-[11px] text-slate-400">{tableRows.length} ligne{tableRows.length > 1 ? 's' : ''}</span>
            </div>
            {tableRows.length <= 1 && !preview.investment.initial_capital_native ? (
              <div className="p-8 text-center text-sm text-slate-400">Aucune transaction sur cette période.</div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                      <tr>
                        <th className="text-left px-5 py-3 font-semibold">Date</th>
                        <th className="text-left px-4 py-3 font-semibold">Type</th>
                        <th className="text-right px-4 py-3 font-semibold">Montant ({displayCcy})</th>
                        <th className="text-right px-4 py-3 font-semibold">Montant d'origine</th>
                        <th className="text-center px-4 py-3 font-semibold">Devise</th>
                        <th className="text-left px-4 py-3 font-semibold">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {tableRows.map(row => {
                        const meta = TX_TYPE_META[row.type]
                        const signed =
                          ['loss', 'fee', 'withdrawal'].includes(row.type)
                            ? -Math.abs(row.converted_amount)
                            : row.converted_amount
                        return (
                          <tr key={row.id} style={meta ? { backgroundColor: meta.bg + '60' } : undefined}>
                            <td className="px-5 py-3 text-slate-700 whitespace-nowrap">{row.date}</td>
                            <td className="px-4 py-3">{typeBadge(row.type, lang)}</td>
                            <td
                              className="px-4 py-3 text-right font-semibold whitespace-nowrap"
                              style={{ color: meta?.fg || '#1E293B' }}
                            >
                              {formatMoney(signed, { currency: displayCcy, lang, sign: true })}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                              {Number(row.original_amount || 0).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {
                                minimumFractionDigits: 2, maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="px-4 py-3 text-center text-slate-500">{row.original_currency}</td>
                            <td className="px-4 py-3 text-slate-600">{row.description || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-slate-50">
                  {tableRows.map(row => {
                    const meta = TX_TYPE_META[row.type]
                    const signed =
                      ['loss', 'fee', 'withdrawal'].includes(row.type)
                        ? -Math.abs(row.converted_amount)
                        : row.converted_amount
                    return (
                      <div key={row.id} className="p-4" style={meta ? { backgroundColor: meta.bg + '40' } : undefined}>
                        <div className="flex items-center justify-between mb-1.5">
                          {typeBadge(row.type, lang)}
                          <span className="text-[11px] text-slate-400">{row.date}</span>
                        </div>
                        <div className="text-base font-semibold" style={{ color: meta?.fg || '#1E293B' }}>
                          {formatMoney(signed, { currency: displayCcy, lang, sign: true })}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {Number(row.original_amount || 0).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {
                            minimumFractionDigits: 2, maximumFractionDigits: 2,
                          })} {row.original_currency}
                        </div>
                        {row.description && (
                          <div className="text-xs text-slate-600 mt-1.5">{row.description}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </>
      ) : null}

      {/* Past generated reports */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="px-4 md:px-6 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800 text-sm">Rapports précédemment générés</h3>
        </div>
        {pastReports.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            Aucun rapport encore généré. Utilisez « Télécharger en Excel » ci-dessus.
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {pastReports.map(r => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-700 capitalize">{r.report_type}</div>
                  <div className="text-[11px] text-slate-400">
                    {r.period_start ? `${r.period_start} → ${r.period_end}` : 'Toutes les transactions'}
                    {' · '}
                    {r.generated_at ? new Date(r.generated_at).toLocaleDateString('fr') : '—'}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => viewReport(r)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                  >
                    {Icons.view} Voir
                  </button>
                  <button
                    onClick={() => downloadReport(r)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-white font-medium"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    {Icons.download} Télécharger
                  </button>
                  <button
                    onClick={() => openShare(r)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border"
                    style={{ borderColor: 'var(--color-secondary)', color: 'var(--color-secondary)' }}
                  >
                    {Icons.share} Partager
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {shareTarget && (
        <ShareModal
          reportId={shareTarget.reportId}
          displayName={shareTarget.displayName}
          onClose={() => setShareTarget(null)}
        />
      )}
    </div>
  )
}
