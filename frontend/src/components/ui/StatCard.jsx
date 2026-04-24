const ACCENT = {
  primary: { dot: 'var(--color-primary)', iconBg: 'rgba(26,58,92,0.07)', iconColor: 'var(--color-primary)' },
  secondary: { dot: 'var(--color-secondary)', iconBg: 'rgba(201,168,76,0.10)', iconColor: 'var(--color-secondary)' },
  green: { dot: 'var(--c-success)', iconBg: 'var(--c-success-bg)', iconColor: 'var(--c-success)' },
  red: { dot: 'var(--c-danger)', iconBg: 'var(--c-danger-bg)', iconColor: 'var(--c-danger)' },
  warning: { dot: 'var(--c-warning)', iconBg: 'var(--c-warning-bg)', iconColor: 'var(--c-warning)' },
}

export default function StatCard({ title, value, sub, color = 'primary', trend, trendLabel }) {
  const a = ACCENT[color] || ACCENT.primary
  const trendPos = trend >= 0
  const showTrend = trend !== undefined && trend !== null

  return (
    <div
      className="card card-hover p-5 flex flex-col gap-3"
      style={{ borderTop: `2px solid ${a.dot}` }}
    >
      <span
        className="text-[11px] font-semibold tracking-[0.07em] uppercase leading-none"
        style={{ color: 'var(--text-3)' }}
      >
        {title}
      </span>

      <div
        className="text-[22px] font-bold leading-none tracking-tight"
        style={{ color: 'var(--text-1)' }}
      >
        {value}
      </div>

      {showTrend && (
        <span className={trendPos ? 'trend-up' : 'trend-down'}>
          {trendPos ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
          {trendLabel && <span className="font-normal ml-0.5 opacity-75">{trendLabel}</span>}
        </span>
      )}

      {sub && !showTrend && (
        <span className="text-[12px]" style={{ color: 'var(--text-3)' }}>{sub}</span>
      )}
    </div>
  )
}
