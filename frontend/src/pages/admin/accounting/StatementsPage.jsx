import { useEffect, useRef, useState } from 'react'
import { getTrialBalance, getIncomeStatement, getBalanceSheet } from '../../../api/accounting.api'
import { useT, usePrefsStore } from '../../../store/prefs.store'
import AccountingHeader from '../../../components/accounting/AccountingHeader'
import { getLocale } from '../../../utils/format'
import { accountName } from '../../../utils/accountingLabels'

const today = () => new Date().toISOString().slice(0, 10)
const yearStart = () => `${new Date().getFullYear()}-01-01`

const fmt = (n) => Number(n || 0).toLocaleString(getLocale(usePrefsStore.getState().lang), { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function StatementsPage() {
  const t = useT()
  const currency = usePrefsStore(s => s.currency)
  const [tab, setTab] = useState('trial')
  const [asOf, setAsOf] = useState(today())
  const [start, setStart] = useState(yearStart())
  const [end, setEnd] = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const requestSeq = useRef(0)

  const TABS = [
    { key: 'trial',   label: t('statements.tab.trial') },
    { key: 'income',  label: t('statements.tab.income') },
    { key: 'balance', label: t('statements.tab.balance') },
  ]

  const load = async () => {
    const requestId = ++requestSeq.current
    const activeTab = tab
    // Reset data first — each tab has a completely different shape, so
    // rendering the previous tab's data through a new view crashes
    // (e.g. TrialBalance shape passed to IncomeStatement expects data.period).
    setData(null)
    setLoading(true)
    setErr('')
    try {
      let r
      if (activeTab === 'trial') r = await getTrialBalance(asOf, currency)
      else if (activeTab === 'income') r = await getIncomeStatement(start, end, currency)
      else r = await getBalanceSheet(asOf, currency)
      if (requestId !== requestSeq.current) return
      setData(r)
    } catch (e) {
      if (requestId !== requestSeq.current) return
      setErr(e?.response?.data?.detail || t('statements.error_load'))
      setData(null)
    } finally {
      if (requestId === requestSeq.current) {
        setLoading(false)
      }
    }
  }
  useEffect(() => { load() }, [tab, asOf, start, end, currency])

  return (
    <div className="p-4 md:p-8 space-y-6">
      <AccountingHeader
        title={t('statements.title')}
        subtitle={t('statements.subtitle')}
      />

      {/* Tabs : scroll horizontal silencieux pour ne jamais déborder. */}
      <div className="flex gap-1 border-b border-slate-200 tabs-scroll">
        {TABS.map(tb => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`px-3 sm:px-4 py-2 text-[13px] sm:text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === tb.key
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 flex gap-3 items-end flex-wrap">
        {(tab === 'trial' || tab === 'balance') && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('statements.as_of')}</label>
            <input type="date" className="input" value={asOf} onChange={e => setAsOf(e.target.value)} />
          </div>
        )}
        {tab === 'income' && (
          <>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('filter.from')}</label>
              <input type="date" className="input" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('filter.to')}</label>
              <input type="date" className="input" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
          </>
        )}
        <button onClick={() => window.print()} className="btn btn-secondary w-full sm:w-auto sm:ml-auto">{t('statements.print')}</button>
      </div>

      {err && <div className="px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 border border-red-100">{err}</div>}
      {loading && <div className="text-sm text-slate-400">{t('common.loading')}</div>}

      {/* Bandeau taux manquant : ledger_service renvoie `rates_missing` quand
          une conversion HTG→devise-cible n'est pas configurée. Dans ce cas
          les montants restent en HTG — on prévient l'admin pour ne pas
          induire en erreur. */}
      {data?.rates_missing?.length > 0 && (
        <div className="px-3 py-2 rounded-lg text-sm bg-amber-50 text-amber-800 border border-amber-100">
          {t('dashboard.rates_missing_title')} · {data.rates_missing.join(', ')} — {t('dashboard.rates_missing_desc')}
        </div>
      )}

      {/* Contenu — type-safety guard : on ne rend pas tant que la shape
          n'est pas compatible avec l'onglet courant, pour éviter les
          crashes type "data.period.start of undefined" lors des transitions. */}
      {data && tab === 'trial' && Array.isArray(data.lines) && data.total_debit !== undefined &&
        <TrialBalanceView data={data} t={t} />}
      {data && tab === 'income' && data.period &&
        <IncomeStatementView data={data} t={t} />}
      {data && tab === 'balance' && data.assets && data.liabilities && data.equity &&
        <BalanceSheetView data={data} t={t} />}
    </div>
  )
}

/* ───────────────────── Trial Balance ───────────────────── */
function TrialBalanceView({ data, t }) {
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden statement-viewer">
      <div className="px-4 md:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold text-slate-800">{t('statements.tb.title', { date: data.as_of || '—' })}</h3>
        <span className={`text-xs px-2 py-1 rounded ${data.is_balanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {data.is_balanced ? t('statements.tb.balanced') : t('statements.tb.unbalanced')}
        </span>
      </div>
      <div className="md:overflow-x-auto">
      <table className="is-responsive w-full md:min-w-[760px] text-sm">
        <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
          <tr>
            <th className="text-left p-3">{t('statements.col.code')}</th>
            <th className="text-left p-3">{t('statements.col.account')}</th>
            <th className="text-left p-3">{t('statements.col.type')}</th>
            <th className="text-right p-3">{t('statements.col.debit')}</th>
            <th className="text-right p-3">{t('statements.col.credit')}</th>
            <th className="text-right p-3">{t('statements.col.balance')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {data.lines.map(l => (
            <tr key={l.account_id}>
              <td className="p-3 font-mono text-xs" data-label={t('statements.col.code')}>{l.code}</td>
              <td className="p-3" data-label={t('statements.col.account')}>{accountName(l, t)}</td>
              <td className="p-3 text-xs text-slate-500" data-label={t('statements.col.type')}>{t(`coa.type.${l.type}`)}</td>
              <td className="p-3 text-right font-mono" data-label={t('statements.col.debit')}>{l.debit > 0 ? fmt(l.debit) : '—'}</td>
              <td className="p-3 text-right font-mono" data-label={t('statements.col.credit')}>{l.credit > 0 ? fmt(l.credit) : '—'}</td>
              <td className="p-3 text-right font-semibold" data-label={t('statements.col.balance')}>{fmt(l.signed_balance)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-50 font-semibold">
          <tr>
            <td colSpan={3} className="p-3 text-right text-slate-500 text-xs" data-label="">{t('statements.totals')}</td>
            <td className="p-3 text-right font-mono" data-label={t('statements.col.debit')}>{fmt(data.total_debit)}</td>
            <td className="p-3 text-right font-mono" data-label={t('statements.col.credit')}>{fmt(data.total_credit)}</td>
            <td data-label=""></td>
          </tr>
        </tfoot>
      </table>
      </div>
    </div>
  )
}

/* ───────────────────── Income Statement ───────────────────── */
function IncomeStatementView({ data, t }) {
  const revenues = data.lines.filter(l => l.type === 'revenue')
  const expenses = data.lines.filter(l => l.type === 'expense')

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden statement-viewer">
      <div className="px-4 md:px-6 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-800">
          {t('statements.is.title', { start: data.period.start, end: data.period.end })}
        </h3>
      </div>
      <div className="p-4 md:p-6 space-y-6">
        <Section title={t('statements.is.revenues')} lines={revenues} total={data.revenue_total} color="#047857" t={t} />
        <Section title={t('statements.is.expenses')} lines={expenses} total={data.expense_total} color="#B91C1C" t={t} />
        <div className="border-t-2 border-slate-200 pt-4 flex justify-between items-center gap-4">
          <span className="font-bold text-slate-800">{t('statements.is.net_income')}</span>
          <span className={`text-lg font-bold ${data.net_income >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {fmt(data.net_income)} {data.currency || 'HTG'}
          </span>
        </div>
      </div>
    </div>
  )
}

function Section({ title, lines, total, color, t }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color }}>{title}</div>
      <div className="space-y-1">
        {lines.length === 0 && <div className="text-xs text-slate-400 italic">{t('statements.is.no_movement')}</div>}
        {lines.map(l => (
          <div key={l.code} className="flex justify-between gap-4 py-1 border-b border-slate-50 text-sm">
            <span className="text-slate-600 min-w-0"><span className="font-mono text-xs text-slate-400 mr-2">{l.code}</span>{accountName(l, t)}</span>
            <span className="font-mono shrink-0">{fmt(l.amount)}</span>
          </div>
        ))}
        {lines.length > 0 && (
          <div className="flex justify-between gap-4 py-2 font-semibold text-sm mt-1">
            <span className="min-w-0">{t('statements.is.total_of', { section: title.toLowerCase() })}</span>
            <span className="font-mono shrink-0">{fmt(total)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ───────────────────── Balance Sheet ───────────────────── */
function BalanceSheetView({ data, t }) {
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden statement-viewer">
      <div className="px-4 md:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold text-slate-800">{t('statements.bs.title', { date: data.as_of })}</h3>
        <span className={`text-xs px-2 py-1 rounded ${data.is_balanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {data.is_balanced ? t('statements.bs.balanced') : t('statements.bs.unbalanced')}
        </span>
      </div>
      <div className="grid md:grid-cols-2 gap-6 p-4 md:p-6">
        {/* Actif */}
        <div>
          <h4 className="text-sm font-bold uppercase tracking-wider text-blue-700 mb-3">{t('statements.bs.assets')}</h4>
          <div className="space-y-1">
            {data.assets.lines.map(l => (
              <div key={l.code} className="flex justify-between gap-4 py-1 border-b border-slate-50 text-sm">
                <span className="text-slate-600 min-w-0"><span className="font-mono text-xs text-slate-400 mr-2">{l.code}</span>{accountName(l, t)}</span>
                <span className="font-mono shrink-0">{fmt(l.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-4 py-3 font-bold border-t-2 border-slate-300 mt-2">
              <span className="min-w-0">{t('statements.bs.total_assets')}</span>
              <span className="font-mono shrink-0">{fmt(data.assets.total)}</span>
            </div>
          </div>
        </div>

        {/* Passif + Capitaux */}
        <div>
          <h4 className="text-sm font-bold uppercase tracking-wider text-amber-700 mb-3">{t('statements.bs.liabilities_equity')}</h4>
          <div className="space-y-1">
            <div className="text-xs text-slate-400 uppercase tracking-wider mt-1">{t('statements.bs.liabilities')}</div>
            {data.liabilities.lines.map(l => (
              <div key={l.code} className="flex justify-between gap-4 py-1 border-b border-slate-50 text-sm">
                <span className="text-slate-600 min-w-0"><span className="font-mono text-xs text-slate-400 mr-2">{l.code}</span>{accountName(l, t)}</span>
                <span className="font-mono shrink-0">{fmt(l.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-4 py-1 text-sm font-semibold">
              <span className="min-w-0">{t('statements.bs.total_liabilities')}</span>
              <span className="font-mono shrink-0">{fmt(data.liabilities.total)}</span>
            </div>

            <div className="text-xs text-slate-400 uppercase tracking-wider mt-4">{t('statements.bs.equity')}</div>
            {data.equity.lines.map(l => (
              <div key={l.code} className="flex justify-between gap-4 py-1 border-b border-slate-50 text-sm">
                <span className="text-slate-600 min-w-0"><span className="font-mono text-xs text-slate-400 mr-2">{l.code}</span>{accountName(l, t)}</span>
                <span className="font-mono shrink-0">{fmt(l.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-4 py-1 border-b border-slate-50 text-sm">
              <span className="text-slate-600 italic min-w-0">{t('statements.bs.net_income_ytd')}</span>
              <span className={`font-mono shrink-0 ${data.net_income_ytd >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(data.net_income_ytd)}</span>
            </div>
            <div className="flex justify-between gap-4 py-1 text-sm font-semibold">
              <span className="min-w-0">{t('statements.bs.total_equity')}</span>
              <span className="font-mono shrink-0">{fmt(data.equity.total + data.net_income_ytd)}</span>
            </div>

            <div className="flex justify-between gap-4 py-3 font-bold border-t-2 border-slate-300 mt-2">
              <span className="min-w-0">{t('statements.bs.total_le')}</span>
              <span className="font-mono shrink-0">{fmt(data.total_liabilities_and_equity)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
