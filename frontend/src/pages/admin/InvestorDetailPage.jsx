import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../../api/axios'
import { getTransactions, createTransaction } from '../../api/transactions.api'
import { generateReport } from '../../api/reports.api'
import Badge from '../../components/ui/Badge'

const statusVariant = { active: 'green', inactive: 'gray', suspended: 'red' }
const typeColor = { deposit: 'text-green-600', withdrawal: 'text-red-600', gain: 'text-emerald-600', loss: 'text-red-500', fee: 'text-slate-500' }

const TABS = ['Résumé', 'Investissements', 'Transactions', 'Performances', 'Rapports']

export default function InvestorDetailPage() {
  const { id } = useParams()
  const [tab, setTab] = useState(0)
  const [summary, setSummary] = useState(null)
  const [investments, setInvestments] = useState([])
  const [transactions, setTransactions] = useState([])
  const [performances, setPerformances] = useState([])
  const [reports, setReports] = useState([])
  const [showTxForm, setShowTxForm] = useState(false)
  const [txForm, setTxForm] = useState({ investment_id: '', type: 'deposit', amount: '', transaction_date: '', description: '' })
  const [generating, setGenerating] = useState(false)
  const [genFormat, setGenFormat] = useState('pdf')

  useEffect(() => {
    api.get(`/investors/${id}/summary`).then(r => setSummary(r.data))
    api.get('/investments', { params: { investor_id: id } }).then(r => setInvestments(r.data))
    getTransactions(id).then(setTransactions)
    api.get('/performances', { params: { investor_id: id } }).then(r => setPerformances(r.data))
    api.get(`/investors/${id}/reports`).then(r => setReports(r.data))
  }, [id])

  const handleCreateTx = async (e) => {
    e.preventDefault()
    await createTransaction({ ...txForm, amount: parseFloat(txForm.amount) })
    const updated = await getTransactions(id)
    setTransactions(updated)
    setShowTxForm(false)
    setTxForm({ investment_id: '', type: 'deposit', amount: '', transaction_date: '', description: '' })
    api.get(`/investors/${id}/summary`).then(r => setSummary(r.data))
  }

  const handleGenerateReport = async () => {
    setGenerating(true)
    try {
      const r = await generateReport({ investor_id: id, format: genFormat })
      setReports(prev => [r, ...prev])
    } catch (err) {
      alert(err.response?.data?.detail || 'Erreur lors de la génération')
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async (report) => {
    const res = await api.get(`/reports/${report.id}/download`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `rapport_${report.id}.${report.format === 'excel' ? 'xlsx' : report.format}`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!summary) return <div className="p-8 text-slate-400">Chargement...</div>

  const { investor, total_initial_capital, total_current_value, total_gain, roi_pct } = summary

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin/investors" className="text-slate-400 hover:text-slate-600 text-sm">← Retour</Link>
        <h2 className="text-xl font-bold text-slate-800">{investor.full_name}</h2>
        <Badge label={investor.status} variant={statusVariant[investor.status]} />
        <span className="text-xs font-mono text-slate-400">{investor.code}</span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          ['Capital initial', `${Number(total_initial_capital).toLocaleString('fr')} HTG`],
          ['Valeur actuelle', `${Number(total_current_value).toLocaleString('fr')} HTG`],
          ['Gain / Perte', `${total_gain >= 0 ? '+' : ''}${Number(total_gain).toLocaleString('fr')} HTG`],
          ['ROI', `${Number(roi_pct).toFixed(2)}%`],
        ].map(([label, value]) => (
          <div key={label} className="bg-white rounded-xl shadow-sm p-4">
            <div className="text-xs text-slate-400 mb-1">{label}</div>
            <div className="text-lg font-bold text-slate-800">{value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 rounded-lg p-1 w-fit">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === i ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm">
        {/* Résumé */}
        {tab === 0 && (
          <div className="p-6 grid grid-cols-2 gap-4 text-sm">
            {[
              ['Nom complet', investor.full_name],
              ['Code', investor.code],
              ['Email', investor.email || '—'],
              ['Téléphone', investor.phone || '—'],
              ["Date d'entrée", investor.entry_date],
              ['Durée (mois)', investor.investment_duration_months || '—'],
              ['Notes', investor.notes || '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-xs text-slate-400 mb-0.5">{k}</div>
                <div className="font-medium text-slate-700">{v}</div>
              </div>
            ))}
          </div>
        )}

        {/* Investissements */}
        {tab === 1 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500">
                <th className="text-left p-4">Nom</th>
                <th className="text-left p-4">Capital initial</th>
                <th className="text-left p-4">Valeur actuelle</th>
                <th className="text-left p-4">Devise</th>
                <th className="text-left p-4">Début</th>
                <th className="text-left p-4">Statut</th>
              </tr>
            </thead>
            <tbody>
              {investments.map(inv => (
                <tr key={inv.id} className="border-b border-slate-50">
                  <td className="p-4 font-medium">{inv.name}</td>
                  <td className="p-4">{Number(inv.initial_capital).toLocaleString('fr')}</td>
                  <td className="p-4">{Number(inv.current_value).toLocaleString('fr')}</td>
                  <td className="p-4 font-mono text-xs">{inv.currency}</td>
                  <td className="p-4 text-slate-500">{inv.start_date}</td>
                  <td className="p-4"><Badge label={inv.status} variant={statusVariant[inv.status] || 'gray'} /></td>
                </tr>
              ))}
              {investments.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">Aucun investissement</td></tr>}
            </tbody>
          </table>
        )}

        {/* Transactions */}
        {tab === 2 && (
          <div>
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">{transactions.length} transaction(s)</span>
              <button onClick={() => setShowTxForm(!showTxForm)}
                className="px-3 py-1.5 text-xs rounded-lg text-white font-medium"
                style={{ backgroundColor: 'var(--color-primary)' }}>
                + Nouvelle transaction
              </button>
            </div>

            {showTxForm && (
              <form onSubmit={handleCreateTx} className="p-4 border-b border-slate-100 grid grid-cols-3 gap-3 bg-slate-50">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Investissement *</label>
                  <select value={txForm.investment_id} onChange={e => setTxForm(p => ({ ...p, investment_id: e.target.value }))} required
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                    <option value="">Sélectionner...</option>
                    {investments.map(inv => <option key={inv.id} value={inv.id}>{inv.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Type *</label>
                  <select value={txForm.type} onChange={e => setTxForm(p => ({ ...p, type: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                    {['deposit', 'withdrawal', 'gain', 'loss', 'fee'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Montant (HTG) *</label>
                  <input type="number" step="0.01" value={txForm.amount} onChange={e => setTxForm(p => ({ ...p, amount: e.target.value }))} required
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Date *</label>
                  <input type="date" value={txForm.transaction_date} onChange={e => setTxForm(p => ({ ...p, transaction_date: e.target.value }))} required
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">Description</label>
                  <input value={txForm.description} onChange={e => setTxForm(p => ({ ...p, description: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none" />
                </div>
                <div className="col-span-3 flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowTxForm(false)} className="px-3 py-1.5 text-sm text-slate-500">Annuler</button>
                  <button type="submit" className="px-3 py-1.5 rounded-lg text-white text-sm" style={{ backgroundColor: 'var(--color-primary)' }}>Enregistrer</button>
                </div>
              </form>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="text-left p-4">Date</th>
                  <th className="text-left p-4">Type</th>
                  <th className="text-right p-4">Montant</th>
                  <th className="text-left p-4">Description</th>
                  <th className="text-left p-4">Ref.</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => (
                  <tr key={tx.id} className="border-b border-slate-50">
                    <td className="p-4 font-mono text-xs">{tx.transaction_date}</td>
                    <td className={`p-4 font-medium text-xs uppercase ${typeColor[tx.type] || ''}`}>{tx.type}</td>
                    <td className="p-4 text-right font-mono">{Number(tx.amount).toLocaleString('fr')}</td>
                    <td className="p-4 text-slate-500">{tx.description || '—'}</td>
                    <td className="p-4 font-mono text-xs text-slate-400">{tx.reference || '—'}</td>
                  </tr>
                ))}
                {transactions.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">Aucune transaction</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* Performances */}
        {tab === 3 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500">
                <th className="text-left p-4">Période</th>
                <th className="text-left p-4">Début</th>
                <th className="text-left p-4">Fin</th>
                <th className="text-right p-4">ROI (%)</th>
                <th className="text-right p-4">Gain brut</th>
                <th className="text-right p-4">Drawdown max (%)</th>
              </tr>
            </thead>
            <tbody>
              {performances.map(p => (
                <tr key={p.id} className="border-b border-slate-50">
                  <td className="p-4 font-mono text-xs">{p.period_type}</td>
                  <td className="p-4 text-slate-500">{p.period_start}</td>
                  <td className="p-4 text-slate-500">{p.period_end}</td>
                  <td className={`p-4 text-right font-mono ${p.roi_pct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {p.roi_pct != null ? `${Number(p.roi_pct).toFixed(2)}%` : '—'}
                  </td>
                  <td className={`p-4 text-right font-mono ${p.gross_gain >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {p.gross_gain != null ? Number(p.gross_gain).toLocaleString('fr') : '—'}
                  </td>
                  <td className="p-4 text-right font-mono text-slate-500">
                    {p.max_drawdown_pct != null ? `${Number(p.max_drawdown_pct).toFixed(2)}%` : '—'}
                  </td>
                </tr>
              ))}
              {performances.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">Aucune performance calculée</td></tr>}
            </tbody>
          </table>
        )}

        {/* Rapports */}
        {tab === 4 && (
          <div>
            <div className="p-4 border-b border-slate-100 flex items-center gap-3">
              <select value={genFormat} onChange={e => setGenFormat(e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                <option value="pdf">PDF</option>
                <option value="excel">Excel</option>
              </select>
              <button onClick={handleGenerateReport} disabled={generating}
                className="px-3 py-1.5 text-xs rounded-lg text-white font-medium disabled:opacity-60"
                style={{ backgroundColor: 'var(--color-primary)' }}>
                {generating ? 'Génération...' : '⚙ Générer un rapport'}
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="text-left p-4">Type</th>
                  <th className="text-left p-4">Format</th>
                  <th className="text-left p-4">Généré le</th>
                  <th className="text-left p-4">Téléchargements</th>
                  <th className="p-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id} className="border-b border-slate-50">
                    <td className="p-4 capitalize">{r.report_type}</td>
                    <td className="p-4 uppercase font-mono text-xs">{r.format}</td>
                    <td className="p-4 text-slate-500">{r.generated_at ? new Date(r.generated_at).toLocaleDateString('fr') : '—'}</td>
                    <td className="p-4 text-center text-slate-500">{r.download_count || 0}</td>
                    <td className="p-4 text-center">
                      <button onClick={() => handleDownload(r)}
                        className="px-2 py-1 text-xs rounded text-white"
                        style={{ backgroundColor: 'var(--color-primary)' }}>
                        ⬇ Télécharger
                      </button>
                    </td>
                  </tr>
                ))}
                {reports.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">Aucun rapport</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
