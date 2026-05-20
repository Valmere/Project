import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getInvestorDashboard } from '../../api/dashboard.api'
import StatCard from '../../components/ui/StatCard'
import FilterBar from '../../components/ui/FilterBar'
import RoiValue from '../../components/ui/RoiValue'
import ROILineChart from '../../components/charts/ROILineChart'
import CapitalBarChart from '../../components/charts/CapitalBarChart'
import { usePrefsStore, useT } from '../../store/prefs.store'
import { useRatesStore } from '../../store/rates.store'
import { formatMoney, getCurrencyMeta } from '../../utils/format'

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
    <div className="flex flex-col items-center justify-center py-10 gap-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--bg-subtle)' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5" style={{ color: 'var(--text-3)' }}>
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      </div>
      <p className="text-[12px] text-center px-4" style={{ color: 'var(--text-3)' }}>
        {t('dashboard.empty_chart_desc')}
      </p>
    </div>
  )
}

function pickPnl(data, period) {
  if (!data) return 0
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

export default function InvestorDashboard() {
  const t = useT()
  const { lang, currency } = usePrefsStore()
  const convert = useRatesStore(s => s.convert)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const [period, setPeriod] = useState('30d')
  const [granularity, setGranularity] = useState('day')
  const [dateMode, setDateMode] = useState('interval')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    const params = { period, granularity, lang, currency }
    if (period === 'custom') {
      if (startDate) params.start_date = startDate
      if (endDate) params.end_date = endDate
    }
    setLoading(true)
    getInvestorDashboard(params)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [period, granularity, startDate, endDate, lang, currency])

  const rawPnl = useMemo(() => pickPnl(data, period), [data, period])
  const baseCcy = data?.base_currency || 'HTG'
  const currentPnl = convert(rawPnl, baseCcy, currency)
  // Capital investi : utilise total_invested (∑ dépôts − ∑ retraits) si dispo,
  // retombe sur total_initial_capital pour les déploiements anciens.
  const investedRaw = data ? (data.total_invested ?? data.total_initial_capital ?? 0) : 0
  const displayInvested = convert(investedRaw, baseCcy, currency)
  const displayCurrent = data ? convert(data.total_current_value || 0, baseCcy, currency) : 0
  const displayGain = data ? convert(data.total_gain || 0, baseCcy, currency) : 0
  // ROI = bénéfice / valeur actuelle (cohérent avec le relevé).
  const roiPct = data?.roi_pct
  const periodLabel =
    period === 'custom' && data?.window
      ? formatRange(data.window.start, data.window.end, lang)
      : t(`period.${period}`)
  const currencyCode = getCurrencyMeta(currency).code

  // chart_data est renvoyé en HTG par le backend ; on convertit chaque
  // point dans la devise d'affichage pour rester cohérent avec les tuiles.
  const chartData = useMemo(() => {
    if (!data?.chart_data) return []
    return data.chart_data.map(p => ({
      ...p,
      closing_value: convert(p.closing_value, baseCcy, currency),
    }))
  }, [data?.chart_data, baseCcy, currency, convert])
  const ratesMissing = data?.rates_missing || []

  return (
    <div className="premium-dashboard p-3 sm:p-5 lg:p-6 max-w-[1440px] mx-auto">

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
      />

      <h2 className="premium-section-title mb-3">
        {t('dashboard.portfolio_summary')}
      </h2>
      <div className="premium-kpi-grid grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            {/* Mêmes 4 tuiles que le relevé : Capital investi / Valeur
                actuelle / Gain ou Perte / Rendement (ROI). Cohérent à
                travers toutes les vues investisseur. */}
            <StatCard title={t('kpi.invested_capital')} value={formatMoney(displayInvested, { currency, lang })} color="primary" variant="neutral" />
            <StatCard title={t('kpi.current_value')} value={formatMoney(displayCurrent, { currency, lang })} color="secondary" variant="featured" />
            <StatCard
              title={t('kpi.total_gain')}
              value={formatMoney(displayGain, { currency, lang, sign: true })}
              color={displayGain >= 0 ? 'primary' : 'red'}
              variant={displayGain >= 0 ? 'neutral' : 'risk'}
            />
            <StatCard
              title={t('kpi.roi')}
              value={<RoiValue value={roiPct} unavailable={data.roi_unavailable} lang={lang} />}
              color={data.roi_unavailable ? 'red' : (roiPct >= 0 ? 'green' : 'red')}
              variant={data.roi_unavailable || roiPct < 0 ? 'risk' : 'neutral'}
            />
          </>
        )}
      </div>

      {/* Note : on n'affiche plus de tuile « Résultat période » distincte.
          C'était redondant avec Gain/Perte (les deux mesurent le P&L) et
          ça surchargeait la vue. La fenêtre du filtre période impacte
          déjà directement la tuile Gain/Perte et le graphique ROI. */}

      <div className="premium-chart-grid grid grid-cols-1 min-[901px]:grid-cols-2 gap-4 sm:gap-6">
        <div className="card wealth-chart-card p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4 sm:mb-5">
            <div>
              <h3 className="premium-chart-title">{t('dashboard.roi_evolution')}</h3>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-3)' }}>{periodLabel}</p>
            </div>
            <span className="premium-chart-pill">%</span>
          </div>
          {loading
            ? <div className="skeleton h-44 w-full rounded-lg" />
            : (data.chart_data?.length > 0 ? <ROILineChart data={data.chart_data} /> : <EmptyChart t={t} />)
          }
        </div>

        <div className="card wealth-chart-card p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4 sm:mb-5">
            <div>
              <h3 className="premium-chart-title">{t('dashboard.capital_evolution')}</h3>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-3)' }}>{t('dashboard.capital_subtitle')}</p>
            </div>
            <span className="premium-chart-pill">{currencyCode}</span>
          </div>
          {loading
            ? <div className="skeleton h-44 w-full rounded-lg" />
            : (chartData.length > 0 ? <CapitalBarChart data={chartData} /> : <EmptyChart t={t} />)
          }
        </div>
      </div>
    </div>
  )
}
