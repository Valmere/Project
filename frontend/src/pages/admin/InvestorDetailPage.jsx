import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../../api/axios'
import { getTransactions, createTransaction } from '../../api/transactions.api'
import { generateReport } from '../../api/reports.api'
import Badge from '../../components/ui/Badge'
import RoiValue from '../../components/ui/RoiValue'
import { getTransactionDisplayAmounts } from '../../utils/transactions'
import { usePrefsStore, useT } from '../../store/prefs.store'
import { formatDate, formatMoney, formatNumber, formatPercent } from '../../utils/format'

const statusVariant = { active: 'green', inactive: 'gray', suspended: 'red' }
const typeColor = { deposit: 'text-green-600', withdrawal: 'text-red-600', gain: 'text-emerald-600', loss: 'text-red-500', fee: 'text-slate-500' }

export default function InvestorDetailPage() {
  const t = useT()
  const { lang, currency } = usePrefsStore()
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
  const dash = '—'
  const tabs = [
    t('investor_detail.tab.summary'),
    t('investor_detail.tab.investments'),
    t('investor_detail.tab.transactions'),
    t('investor_detail.tab.performances'),
    t('investor_detail.tab.reports'),
  ]
  const translatedOr = (key, fallback) => {
    const label = t(key)
    return label === key ? fallback : label
  }
  const statusLabel = (status) => translatedOr(`status.${status}`, status || dash)
  const typeLabel = (type) => translatedOr(`tx.type.${type}`, type || dash)
  const reportTypeLabel = (type) => translatedOr(`report.type.${String(type || '').toLowerCase()}`, type || dash)

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
      const r = await generateReport({ investor_id: id, format: genFormat, lang })
      setReports(prev => [r, ...prev])
    } catch (err) {
      alert(err.response?.data?.detail || t('investor_detail.generation_error'))
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async (report) => {
    // Régénération à la volée dans la langue + devise courantes de l'admin.
    const res = await api.get(`/reports/${report.id}/download`, {
      responseType: 'blob',
      params: { lang, display_currency: currency },
    })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `rapport_${report.id}.${report.format === 'excel' ? 'xlsx' : report.format}`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!summary) return <div className="p-4 md:p-8 text-slate-400">{t('common.loading')}</div>

  const { investor, total_initial_capital, total_invested, total_current_value, total_gain, roi_pct, roi_unavailable } = summary

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center gap-3 flex-wrap mb-6">
        <Link to="/admin/investors" className="text-slate-400 hover:text-slate-600 text-sm">← {t('common.back')}</Link>
        <h2 className="text-xl font-bold text-slate-800">{investor.full_name}</h2>
        <Badge label={statusLabel(investor.status)} variant={statusVariant[investor.status]} />
        <span className="text-xs font-mono text-slate-400">{investor.code}</span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {[
          [t('kpi.invested_capital'), formatMoney(total_invested ?? total_initial_capital, { currency: 'HTG', lang })],
          [t('kpi.current_value'), formatMoney(total_current_value, { currency: 'HTG', lang })],
          [t('kpi.total_gain'), formatMoney(total_gain, { currency: 'HTG', lang, sign: true })],
          [t('kpi.roi'), <RoiValue key="roi" value={roi_pct} unavailable={roi_unavailable} lang={lang} />],
        ].map(([label, value]) => (
          <div key={label} className="bg-white rounded-xl shadow-sm p-4">
            <div className="text-xs text-slate-400 mb-1">{label}</div>
            <div className="text-lg font-bold text-slate-800 break-words">{value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 rounded-lg p-1 w-full overflow-x-auto sm:w-fit">
        {tabs.map((label, i) => (
          <button key={label} onClick={() => setTab(i)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${tab === i ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm">
        {/* Résumé */}
        {tab === 0 && (
          <div className="p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {[
              [t('investor_detail.full_name'), investor.full_name],
              ['Code', investor.code],
              ['Email', investor.email || dash],
              [t('investor_detail.phone'), investor.phone || dash],
              [t('investor_detail.entry_date'), investor.entry_date ? formatDate(investor.entry_date, lang) : dash],
              [t('investor_detail.duration_months'), investor.investment_duration_months || dash],
              [t('investor_detail.notes'), investor.notes || dash],
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
          <div className="md:overflow-x-auto">
          <table className="is-responsive w-full md:min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500">
                <th className="text-left p-4">{t('investor_detail.name')}</th>
                <th className="text-left p-4">{t('investor_detail.initial_capital')}</th>
                <th className="text-left p-4">{t('kpi.current_value')}</th>
                <th className="text-left p-4">{t('common.currency')}</th>
                <th className="text-left p-4">{t('investor_detail.start')}</th>
                <th className="text-left p-4">{t('investors.col_status')}</th>
              </tr>
            </thead>
            <tbody>
              {investments.map(inv => (
                <tr key={inv.id} className="border-b border-slate-50">
                  <td className="p-4 font-medium">{inv.name}</td>
                  <td className="p-4">{formatMoney(inv.initial_capital, { currency: inv.currency || 'HTG', lang })}</td>
                  <td className="p-4">{formatMoney(inv.current_value, { currency: inv.currency || 'HTG', lang })}</td>
                  <td className="p-4 font-mono text-xs">{inv.currency}</td>
                  <td className="p-4 text-slate-500">{formatDate(inv.start_date, lang)}</td>
                  <td className="p-4"><Badge label={statusLabel(inv.status)} variant={statusVariant[inv.status] || 'gray'} /></td>
                </tr>
              ))}
              {investments.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">{t('investor_detail.no_investment')}</td></tr>}
            </tbody>
          </table>
          </div>
        )}

        {/* Transactions */}
        {tab === 2 && (
          <div>
            <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
              <span className="text-sm font-medium text-slate-700">{t('investor_detail.transactions_count', { count: transactions.length })}</span>
              <button onClick={() => setShowTxForm(!showTxForm)}
                className="w-full sm:w-auto px-3 py-1.5 text-xs rounded-lg text-white font-medium"
                style={{ backgroundColor: 'var(--color-primary)' }}>
                {t('tx.new_transaction')}
              </button>
            </div>

            {showTxForm && (
              <form onSubmit={handleCreateTx} className="p-4 border-b border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{t('investor_detail.investment_required')}</label>
                  <select value={txForm.investment_id} onChange={e => setTxForm(p => ({ ...p, investment_id: e.target.value }))} required
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                    <option value="">{t('common.select')}</option>
                    {investments.map(inv => <option key={inv.id} value={inv.id}>{inv.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{t('investor_detail.type_required')}</label>
                  <select value={txForm.type} onChange={e => setTxForm(p => ({ ...p, type: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                    {['deposit', 'withdrawal', 'gain', 'loss', 'fee'].map(type => <option key={type} value={type}>{typeLabel(type)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{t('investor_detail.amount_required')}</label>
                  <input type="number" step="0.01" value={txForm.amount} onChange={e => setTxForm(p => ({ ...p, amount: e.target.value }))} required
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{t('investor_detail.date_required')}</label>
                  <input type="date" value={txForm.transaction_date} onChange={e => setTxForm(p => ({ ...p, transaction_date: e.target.value }))} required
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">{t('tx.col.description')}</label>
                  <input value={txForm.description} onChange={e => setTxForm(p => ({ ...p, description: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none" />
                </div>
                <div className="md:col-span-3 flex flex-col sm:flex-row gap-2 justify-end">
                  <button type="button" onClick={() => setShowTxForm(false)} className="px-3 py-1.5 text-sm text-slate-500">{t('common.cancel')}</button>
                  <button type="submit" className="px-3 py-1.5 rounded-lg text-white text-sm" style={{ backgroundColor: 'var(--color-primary)' }}>{t('common.save')}</button>
                </div>
              </form>
            )}

            <div className="md:overflow-x-auto">
            <table className="is-responsive w-full md:min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="text-left p-4">{t('tx.col.date')}</th>
                  <th className="text-left p-4">{t('tx.col.type')}</th>
                  <th className="text-right p-4">{t('tx.col.amount')}</th>
                  <th className="text-left p-4">{t('tx.col.description')}</th>
                  <th className="text-left p-4">Ref.</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => {
                  const amountInfo = getTransactionDisplayAmounts(tx)
                  return (
                  <tr key={tx.id} className="border-b border-slate-50">
                    <td className="p-4 font-mono text-xs">{formatDate(tx.transaction_date, lang)}</td>
                    <td className={`p-4 font-medium text-xs uppercase ${typeColor[tx.type] || ''}`}>{typeLabel(tx.type)}</td>
                    <td className="p-4 text-right font-mono">
                      <div>{formatMoney(amountInfo.primaryAmount, { currency: amountInfo.primaryCurrency, lang })}</div>
                      {amountInfo.isBailoutTarget && (
                        <div className="text-[11px] text-slate-400 mt-1">
                          {t('investor_detail.ledger_amount', {
                            amount: formatMoney(amountInfo.ledgerAmount, { currency: amountInfo.ledgerCurrency, lang }),
                          })}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-slate-500">{tx.description || dash}</td>
                    <td className="p-4 font-mono text-xs text-slate-400">{tx.reference || dash}</td>
                  </tr>
                  )
                })}
                {transactions.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">{t('tx.empty')}</td></tr>}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {/* Performances */}
        {tab === 3 && (
          <div className="md:overflow-x-auto">
          <table className="is-responsive w-full md:min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500">
                <th className="text-left p-4">{t('investor_detail.period')}</th>
                <th className="text-left p-4">{t('investor_detail.start')}</th>
                <th className="text-left p-4">{t('investor_detail.end')}</th>
                <th className="text-right p-4">ROI (%)</th>
                <th className="text-right p-4">{t('investor_detail.gross_gain')}</th>
                <th className="text-right p-4">{t('investor_detail.max_drawdown')}</th>
              </tr>
            </thead>
            <tbody>
              {performances.map(p => (
                <tr key={p.id} className="border-b border-slate-50">
                  <td className="p-4 font-mono text-xs">{p.period_type}</td>
                  <td className="p-4 text-slate-500">{formatDate(p.period_start, lang)}</td>
                  <td className="p-4 text-slate-500">{formatDate(p.period_end, lang)}</td>
                  <td className={`p-4 text-right font-mono ${p.roi_pct == null || p.roi_pct < 0 ? 'text-red-500' : 'text-green-600'}`}>
                    <RoiValue value={p.roi_pct} unavailable={p.roi_pct == null} lang={lang} className="justify-end" />
                  </td>
                  <td className={`p-4 text-right font-mono ${p.gross_gain >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {p.gross_gain != null ? formatNumber(p.gross_gain, lang) : dash}
                  </td>
                  <td className="p-4 text-right font-mono text-slate-500">
                    {p.max_drawdown_pct != null ? formatPercent(p.max_drawdown_pct, lang, 2) : dash}
                  </td>
                </tr>
              ))}
              {performances.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">{t('investor_detail.no_performance')}</td></tr>}
            </tbody>
          </table>
          </div>
        )}

        {/* Rapports */}
        {tab === 4 && (
          <div>
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
              <select value={genFormat} onChange={e => setGenFormat(e.target.value)}
                className="w-full sm:w-auto border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                <option value="pdf">PDF</option>
                <option value="excel">Excel</option>
              </select>
              <button onClick={handleGenerateReport} disabled={generating}
                className="w-full sm:w-auto px-3 py-1.5 text-xs rounded-lg text-white font-medium disabled:opacity-60"
                style={{ backgroundColor: 'var(--color-primary)' }}>
                {generating ? t('reports.generating') : `⚙ ${t('investor_detail.generate_report')}`}
              </button>
            </div>
            <div className="md:overflow-x-auto">
            <table className="is-responsive w-full md:min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="text-left p-4">{t('admin_reports.col.type')}</th>
                  <th className="text-left p-4">{t('admin_reports.col.format')}</th>
                  <th className="text-left p-4">{t('admin_reports.col.generated')}</th>
                  <th className="text-left p-4">{t('common.downloads')}</th>
                  <th className="p-4">{t('common.action')}</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id} className="border-b border-slate-50">
                    <td className="p-4 capitalize">{reportTypeLabel(r.report_type)}</td>
                    <td className="p-4 uppercase font-mono text-xs">{r.format}</td>
                    <td className="p-4 text-slate-500">{r.generated_at ? formatDate(r.generated_at, lang) : dash}</td>
                    <td className="p-4 text-center text-slate-500">{r.download_count || 0}</td>
                    <td className="p-4 text-center">
                      <button onClick={() => handleDownload(r)}
                        className="px-2 py-1 text-xs rounded text-white"
                        style={{ backgroundColor: 'var(--color-primary)' }}>
                        ⬇ {t('common.download')}
                      </button>
                    </td>
                  </tr>
                ))}
                {reports.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">{t('investor_detail.no_report')}</td></tr>}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
