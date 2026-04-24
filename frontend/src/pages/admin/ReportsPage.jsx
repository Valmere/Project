import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { generateReport } from '../../api/reports.api'
import { usePrefsStore } from '../../store/prefs.store'
import ShareModal from '../../components/reports/ShareModal'

/* ── SVG icons ───────────────────────────────────────────────── */
const Icons = {
  view: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
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
  cog: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  ),
}

export default function ReportsPage() {
  const navigate = useNavigate()
  const { lang, currency } = usePrefsStore()
  const [investors, setInvestors] = useState([])
  const [reports, setReports] = useState([])
  const [form, setForm] = useState({ investor_id: '', format: 'excel', period_start: '', period_end: '' })
  const [generating, setGenerating] = useState(false)
  const [filterInvestor, setFilterInvestor] = useState('')
  const [shareTarget, setShareTarget] = useState(null) // { reportId, displayName } | null

  useEffect(() => {
    api.get('/investors').then(r => setInvestors(r.data))
    api.get('/reports').then(r => setReports(r.data))
  }, [])

  const handleGenerate = async (e) => {
    e.preventDefault()
    if (!form.investor_id) return
    setGenerating(true)
    try {
      const payload = {
        investor_id: form.investor_id,
        format: 'excel',
        period_start: form.period_start || null,
        period_end: form.period_end || null,
        lang,
        display_currency: currency,
      }
      const r = await generateReport(payload)
      setReports(prev => [r, ...prev])
      setForm(p => ({ ...p, investor_id: '', period_start: '', period_end: '' }))
    } catch (err) {
      alert(err.response?.data?.detail || 'Erreur lors de la génération')
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async (report) => {
    const res = await api.get(`/reports/${report.id}/download`, { responseType: 'blob' })
    const cd = res.headers?.['content-disposition'] || ''
    const match = /filename="?([^"]+)"?/.exec(cd)
    const fallback = `rapport_${report.id}.xlsx`
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = match ? match[1] : fallback
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleView = (report) => {
    navigate(`/admin/reports/${report.id}`)
  }

  const handleShare = (report) => {
    setShareTarget({
      reportId: report.id,
      displayName: investorMap[report.investor_id]?.full_name || 'investisseur',
    })
  }

  const filtered = filterInvestor ? reports.filter(r => r.investor_id === filterInvestor) : reports
  const investorMap = Object.fromEntries(investors.map(i => [i.id, i]))

  return (
    <div className="p-8">
      <h2 className="text-xl font-bold text-slate-800 mb-6">Rapports</h2>

      {/* Generate form */}
      <form onSubmit={handleGenerate} className="bg-white rounded-xl shadow-sm p-6 mb-6 grid grid-cols-4 gap-4 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Investisseur *</label>
          <select value={form.investor_id} onChange={e => setForm(p => ({ ...p, investor_id: e.target.value }))} required
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]">
            <option value="">Sélectionner...</option>
            {investors.map(inv => <option key={inv.id} value={inv.id}>{inv.full_name} ({inv.code})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Format</label>
          <div className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-700">
            Excel (.xlsx)
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Période début</label>
          <input type="date" value={form.period_start} onChange={e => setForm(p => ({ ...p, period_start: e.target.value }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Période fin</label>
          <input type="date" value={form.period_end} onChange={e => setForm(p => ({ ...p, period_end: e.target.value }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
        </div>
        <div className="col-span-4 flex justify-end">
          <button type="submit" disabled={generating}
            className="flex items-center gap-2 px-6 py-2 rounded-lg text-white font-medium text-sm disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-primary)' }}>
            {Icons.cog}
            {generating ? 'Génération en cours...' : 'Générer le rapport'}
          </button>
        </div>
      </form>

      {/* Reports list */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-4 border-b border-slate-100">
          <select value={filterInvestor} onChange={e => setFilterInvestor(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">Tous les investisseurs</option>
            {investors.map(inv => <option key={inv.id} value={inv.id}>{inv.full_name}</option>)}
          </select>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-slate-500">
              <th className="text-left p-4">Investisseur</th>
              <th className="text-left p-4">Type</th>
              <th className="text-left p-4">Format</th>
              <th className="text-left p-4">Période</th>
              <th className="text-left p-4">Généré le</th>
              <th className="text-center p-4">DL</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="p-4 font-medium">{investorMap[r.investor_id]?.full_name || '—'}</td>
                <td className="p-4 capitalize">{r.report_type}</td>
                <td className="p-4 uppercase font-mono text-xs">{r.format}</td>
                <td className="p-4 text-slate-500 text-xs">
                  {r.period_start ? `${r.period_start} → ${r.period_end}` : '—'}
                </td>
                <td className="p-4 text-slate-500">
                  {r.generated_at ? new Date(r.generated_at).toLocaleDateString('fr') : '—'}
                </td>
                <td className="p-4 text-center text-slate-400">{r.download_count || 0}</td>
                <td className="p-4">
                  <div className="flex items-center justify-end gap-2 flex-wrap">
                    <button
                      onClick={() => handleView(r)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      {Icons.view} Voir
                    </button>
                    <button
                      onClick={() => handleDownload(r)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-white font-medium"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      {Icons.download} Télécharger
                    </button>
                    <button
                      onClick={() => handleShare(r)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border"
                      style={{ borderColor: 'var(--color-secondary)', color: 'var(--color-secondary)' }}
                    >
                      {Icons.share} Partager
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-slate-400">Aucun rapport généré</td></tr>
            )}
          </tbody>
        </table>
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
