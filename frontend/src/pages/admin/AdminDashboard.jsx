import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAdminDashboard } from '../../api/dashboard.api'
import { getInvestors, getGlobalStats } from '../../api/investors.api'
import CompanyHero from '../../components/dashboard/CompanyHero'
import StatCard from '../../components/ui/StatCard'
import FilterBar from '../../components/ui/FilterBar'
import RoiValue from '../../components/ui/RoiValue'
import ROILineChart from '../../components/charts/ROILineChart'
import CapitalBarChart from '../../components/charts/CapitalBarChart'
import { usePrefsStore, useT } from '../../store/prefs.store'
import { useRatesStore } from '../../store/rates.store'
import { formatMoney, formatNumber, getCurrencyMeta } from '../../utils/format'

function SkeletonCard() {
  return (
    <div className="card p-4 sm:p-5 flex flex-col gap-3">
      <div className="skeleton h-2.5 w-20 rounded" />
      <div className="skeleton h-6 w-32 rounded" />
      <div className="skeleton h-4 w-16 rounded" />
    </div>
  )
}

function PnlCard({ label, value, periodLabel, currency, lang }) {
  const isPos = value >= 0
  return (
    <div className="premium-stat-card premium-stat-neutral card-hover p-4 sm:p-5">
      <div className="premium-label premium-stat-title mb-3">
        {label}
      </div>
      <div className="premium-number premium-stat-value premium-stat-danger-value mb-2 break-all">
        {formatMoney(value, { currency, lang, sign: true })}
      </div>
      <span className={isPos ? 'trend-up' : 'trend-down'}>
        {isPos ? '↑' : '↓'} {periodLabel}
      </span>
    </div>
  )
}

function EmptyChart({ t }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 sm:py-14 gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--bg-subtle)' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5" style={{ color: 'var(--text-3)' }}>
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      </div>
      <div className="text-[13px] font-medium text-center px-4" style={{ color: 'var(--text-2)' }}>
        {t('dashboard.empty_chart_title')}
      </div>
      <div className="text-[12px] text-center px-4" style={{ color: 'var(--text-3)' }}>
        {t('dashboard.empty_chart_desc')}
      </div>
    </div>
  )
}

function pickPnl(data, period) {
  if (!data) return 0
  // `pnl_period` reflète la fenêtre exacte renvoyée par le backend (y compris
  // les dates personnalisées). Les clés `pnl_Nd` restent en fallback pour les
  // périodes glissantes standard si le backend est plus ancien.
  if (typeof data.pnl_period === 'number') return data.pnl_period
  const map = {
    '3d': data.pnl_3d, '7d': data.pnl_7d, '15d': data.pnl_15d,
    '30d': data.pnl_30d, '60d': data.pnl_60d, '90d': data.pnl_90d,
    '180d': data.pnl_180d, '365d': data.pnl_365d, '730d': data.pnl_730d,
  }
  return map[period] ?? data.pnl_30d ?? 0
}

function formatRange(startIso, endIso, lang) {
  if (!startIso || !endIso) return ''
  try {
    const fmt = new Intl.DateTimeFormat(lang || 'fr', { day: '2-digit', month: 'short', year: 'numeric' })
    return `${fmt.format(new Date(startIso))} → ${fmt.format(new Date(endIso))}`
  } catch {
    return `${startIso} → ${endIso}`
  }
}

export default function AdminDashboard() {
  const t = useT()
  const { lang, currency } = usePrefsStore()
  const convert = useRatesStore(s => s.convert)
  const [data, setData] = useState(null)
  const [investors, setInvestors] = useState([])
  const [globalStats, setGlobalStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const [period, setPeriod] = useState('30d')
  const [granularity, setGranularity] = useState('day')
  const [dateMode, setDateMode] = useState('interval')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [investorId, setInvestorId] = useState(null)

  useEffect(() => {
    getInvestors().then(setInvestors).catch(() => setInvestors([]))
    getGlobalStats(currency).then(setGlobalStats).catch(() => setGlobalStats(null))
  }, [currency])

  useEffect(() => {
    const params = { period, granularity, lang, currency }
    if (period === 'custom') {
      if (startDate) params.start_date = startDate
      if (endDate) params.end_date = endDate
    }
    if (investorId) params.investor_id = investorId

    setLoading(true)
    getAdminDashboard(params)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [period, granularity, startDate, endDate, investorId, lang, currency])

  const rawPnl = useMemo(() => pickPnl(data, period), [data, period])
  const baseCcy = data?.base_currency || 'HTG'
  const currentPnl = convert(rawPnl, baseCcy, currency)
  const displayAum = data ? convert(data.aum || 0, baseCcy, currency) : 0
  const periodLabel =
    period === 'custom' && data?.window
      ? formatRange(data.window.start, data.window.end, lang)
      : t(`period.${period}`)

  const ratesMissing = data?.rates_missing || []
  const heroBalance = globalStats
    ? formatMoney(convert(globalStats.company_va, globalStats.base_currency, currency), { currency, lang })
    : '—'
  const heroGlobalVa = globalStats
    ? formatMoney(convert(globalStats.global_va, globalStats.base_currency, currency), { currency, lang })
    : '—'
  const heroCompanyShare = globalStats
    ? `${(globalStats.company_share_of_global || 0).toFixed(2)} %`
    : '—'

  // Le backend renvoie chart_data en HTG (devise de base). On convertit
  // chaque point dans la devise d'affichage pour que l'axe Y matche le
  // chiffre affiché dans la tuile AUM (sinon 200 USD côté tuile vs
  // 26 110 HTG sur l'axe Y → confusion garantie).
  const chartData = useMemo(() => {
    if (!data?.chart_data) return []
    return data.chart_data.map(p => ({
      ...p,
      closing_value: convert(p.closing_value, baseCcy, currency),
    }))
  }, [data?.chart_data, baseCcy, currency, convert])

  return (
    <div className="premium-dashboard p-3 sm:p-5 lg:p-6 max-w-[1440px] mx-auto">

      <CompanyHero
        balance={heroBalance}
        globalValue={heroGlobalVa}
        share={heroCompanyShare}
      />

      {ratesMissing.length > 0 && (
        <div
          className="mb-4 p-3 sm:p-4 rounded-xl border flex items-start gap-3"
          style={{ background: 'var(--warn-bg, #fef3c7)', borderColor: 'var(--warn-border, #fcd34d)', color: 'var(--warn-text, #78350f)' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 shrink-0 mt-0.5">
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold mb-1">{t('dashboard.rates_missing_title')}</div>
            <div className="text-[12px] leading-relaxed">
              {t('dashboard.rates_missing_desc')} <span className="font-mono">{ratesMissing.join(', ')}</span>
            </div>
            <Link to="/admin/currency-rates" className="text-[12px] font-semibold underline mt-1 inline-block">
              {t('dashboard.rates_missing_cta')}
            </Link>
          </div>
        </div>
      )}

      <FilterBar
        period={period}
        onPeriodChange={setPeriod}
        granularity={granularity}
        onGranularityChange={setGranularity}
        dateMode={dateMode}
        onDateModeChange={setDateMode}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        investors={investors}
        investorId={investorId}
        onInvestorChange={setInvestorId}
      />

      <h2 className="premium-section-title mb-3">
        {t('dashboard.overview')}
      </h2>
      <div className="premium-kpi-grid grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              title={investorId ? t('kpi.investor') : t('kpi.active_investors')}
              value={investorId ? (investors.find(i => i.id === investorId)?.full_name || '—') : formatNumber(data.total_investors, lang)}
              color="primary"
              variant="neutral"
            />
            <StatCard title={t('kpi.aum')} value={formatMoney(displayAum, { currency, lang })} color="secondary" variant="featured" />
            <StatCard
              title={t('kpi.global_roi')}
              value={<RoiValue value={data.global_roi_pct} unavailable={data.roi_unavailable} lang={lang} />}
              color="red"
              variant="risk"
            />
            <PnlCard
              label={t('kpi.pnl_period', { period: periodLabel })}
              value={currentPnl}
              periodLabel={periodLabel}
              currency={currency}
              lang={lang}
            />
          </>
        )}
      </div>

      <div className="premium-chart-grid grid grid-cols-1 min-[901px]:grid-cols-2 gap-4 sm:gap-6">
        <div className="card wealth-chart-card p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 sm:mb-5">
            <div>
              <h3 className="premium-chart-title">
                {t('dashboard.roi_evolution')}
              </h3>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                {investorId
                  ? t('dashboard.roi_subtitle_investor')
                  : t('dashboard.roi_subtitle_global')}
                {' · '}{periodLabel}
              </p>
            </div>
            <span className="premium-chart-pill self-start">%</span>
          </div>
          {loading ? (
            <div className="skeleton h-48 sm:h-56 w-full rounded-lg" />
          ) : (
            data.chart_data?.length > 0
              ? <ROILineChart data={data.chart_data} />
              : <EmptyChart t={t} />
          )}
        </div>

        <div className="card wealth-chart-card p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 sm:mb-5">
            <div>
              <h3 className="premium-chart-title">
                {t('dashboard.capital_evolution')}
              </h3>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                {t('dashboard.capital_subtitle')}
              </p>
            </div>
            <span className="premium-chart-pill self-start">{getCurrencyMeta(currency).code}</span>
          </div>
          {loading ? (
            <div className="skeleton h-48 sm:h-56 w-full rounded-lg" />
          ) : (
            chartData.length > 0
              ? <CapitalBarChart data={chartData} />
              : <EmptyChart t={t} />
          )}
        </div>
      </div>
    </div>
  )
}
