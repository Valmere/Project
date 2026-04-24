import Select from './Select'
import { useT } from '../../store/prefs.store'

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[15px] h-[15px] flex-shrink-0">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[15px] h-[15px] flex-shrink-0">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[15px] h-[15px] flex-shrink-0">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[15px] h-[15px] flex-shrink-0">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

const PERIOD_KEYS = ['3d', '7d', '15d', '30d', '60d', '90d', '180d', '365d', '730d', 'custom']
const GRANULARITY_KEYS = ['day', 'week', 'month', 'year']

export default function FilterBar({
  period,
  onPeriodChange,
  granularity,
  onGranularityChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  dateMode = 'interval',
  onDateModeChange,
  investors = null,
  investorId,
  onInvestorChange,
}) {
  const t = useT()
  const showCustomDates = period === 'custom'
  const showInvestor = investors !== null
  const showGranularity = typeof onGranularityChange === 'function'

  const periodOptions = PERIOD_KEYS.map((k) => ({ value: k, label: t(`period.${k}`) }))
  const granularityOptions = GRANULARITY_KEYS.map((k) => ({ value: k, label: t(`granularity.${k}`) }))
  const dateModeOptions = [
    { value: 'interval', label: t('filter.interval') },
    { value: 'single', label: t('filter.single_date') },
  ]
  const isSingle = dateMode === 'single'

  const investorOptions = [
    { value: null, label: t('filter.all_investors') },
    ...(investors || []).map((inv) => ({
      value: inv.id,
      label: inv.full_name,
      description: inv.email || undefined,
    })),
  ]

  return (
    <div className="card p-3 sm:p-4 mb-6">
      <div className="flex flex-col lg:flex-row lg:items-end gap-3 flex-wrap">
        <div className="w-full sm:w-auto">
          <Select
            label={t('filter.period')}
            value={period}
            onChange={onPeriodChange}
            options={periodOptions}
            icon={<ClockIcon />}
            size="sm"
            minWidth={160}
            fullWidth
          />
        </div>

        {showGranularity && (
          <div className="w-full sm:w-auto">
            <Select
              label={t('filter.granularity')}
              value={granularity}
              onChange={onGranularityChange}
              options={granularityOptions}
              icon={<LayersIcon />}
              size="sm"
              minWidth={140}
              fullWidth
            />
          </div>
        )}

        {showCustomDates && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 flex-1 min-w-0">
            {typeof onDateModeChange === 'function' && (
              <Select
                label={t('filter.date_mode')}
                value={dateMode}
                onChange={(m) => {
                  onDateModeChange(m)
                  if (m === 'single' && startDate) onEndDateChange(startDate)
                }}
                options={dateModeOptions}
                size="sm"
                minWidth={140}
              />
            )}

            {isSingle ? (
              <div className="flex flex-col">
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
                  {t('filter.on_date')}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)] pointer-events-none">
                    <CalendarIcon />
                  </span>
                  <input
                    type="date"
                    value={startDate || ''}
                    onChange={(e) => {
                      onStartDateChange(e.target.value)
                      onEndDateChange(e.target.value)
                    }}
                    className="input input-sm pl-9 h-9 w-full sm:w-[180px]"
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col">
                  <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
                    {t('filter.from')}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)] pointer-events-none">
                      <CalendarIcon />
                    </span>
                    <input
                      type="date"
                      value={startDate || ''}
                      onChange={(e) => onStartDateChange(e.target.value)}
                      className="input input-sm pl-9 h-9 w-full sm:w-[170px]"
                    />
                  </div>
                </div>
                <div className="flex flex-col">
                  <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
                    {t('filter.to')}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)] pointer-events-none">
                      <CalendarIcon />
                    </span>
                    <input
                      type="date"
                      value={endDate || ''}
                      onChange={(e) => onEndDateChange(e.target.value)}
                      className="input input-sm pl-9 h-9 w-full sm:w-[170px]"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {!showCustomDates && <div className="flex-1" />}

        {showInvestor && (
          <div className="w-full sm:w-auto lg:ml-auto">
            <Select
              label={t('filter.investor')}
              value={investorId ?? null}
              onChange={onInvestorChange}
              options={investorOptions}
              icon={<UserIcon />}
              size="sm"
              align="right"
              minWidth={220}
              fullWidth
            />
          </div>
        )}
      </div>
    </div>
  )
}
