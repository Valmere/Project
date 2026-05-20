function DownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4">
      <path d="M12 5v14" />
      <path d="M6 13l6 6 6-6" />
    </svg>
  )
}

function resolveVariant(color, variant) {
  if (variant) return variant
  if (color === 'secondary') return 'featured'
  if (color === 'red') return 'risk'
  return 'neutral'
}

export default function StatCard({ title, value, sub, color = 'primary', variant, trend, trendLabel }) {
  const cardVariant = resolveVariant(color, variant)
  const trendPos = trend >= 0
  const showTrend = trend !== undefined && trend !== null

  return (
    <div
      className={`premium-stat-card premium-stat-${cardVariant} card-hover relative overflow-hidden p-4 sm:p-5 flex flex-col gap-3`}
    >
      <div className="relative flex items-start justify-between gap-3">
        <span className="premium-label premium-stat-title">
          {title}
        </span>
        {cardVariant === 'featured' && <span className="premium-stat-badge">PHARE</span>}
        {cardVariant === 'risk' && (
          <span className="premium-stat-risk-icon" aria-hidden="true">
            <DownIcon />
          </span>
        )}
      </div>

      <div className="premium-number premium-stat-value">
        {value}
      </div>

      {showTrend && (
        <span className={`relative ${trendPos ? 'trend-up' : 'trend-down'}`}>
          {trendPos ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
          {trendLabel && <span className="font-normal ml-0.5 opacity-75">{trendLabel}</span>}
        </span>
      )}

      {sub && !showTrend && (
        <span className="relative text-[12px]" style={{ color: 'var(--text-3)' }}>{sub}</span>
      )}
    </div>
  )
}
