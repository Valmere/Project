import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { usePrefsStore, useT } from '../../store/prefs.store'
import { formatNumber } from '../../utils/format'

const tooltipStyle = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  boxShadow: 'var(--shadow-dropdown)',
  fontSize: 12,
  padding: '8px 12px',
}

function PremiumBar(props) {
  const { x, y, width, height, index, dataLength } = props
  const isLast = index === dataLength - 1
  if (x == null || y == null || width == null || height == null) return null

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={5}
        ry={5}
        fill="url(#capitalGold)"
        opacity={isLast ? 1 : 0.6}
        stroke={isLast ? '#1A2740' : 'transparent'}
        strokeWidth={isLast ? 1.4 : 0}
      />
      {isLast && (
        <circle
          cx={x + width / 2}
          cy={Math.max(5, y - 7)}
          r={3.4}
          fill="#1A2740"
        />
      )}
    </g>
  )
}

export default function CapitalBarChart({ data = [] }) {
  const t = useT()
  const { lang } = usePrefsStore()
  const fmt = (v) => formatNumber(v, lang)

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 14, right: 12, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="capitalGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E5C57A" />
            <stop offset="100%" stopColor="#C9A249" />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
        <XAxis
          dataKey="period"
          tick={{ fontSize: 11, fill: 'var(--text-3)' }}
          axisLine={{ stroke: 'rgba(26,39,64,0.35)' }}
          tickLine={false}
          dy={8}
        />
        <YAxis
          tickFormatter={fmt}
          tick={{ fontSize: 11, fill: 'var(--text-3)' }}
          axisLine={false}
          tickLine={false}
          width={55}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: 'var(--text-3)', fontSize: 11, marginBottom: 4 }}
          formatter={(v) => [fmt(v), t('kpi.current_value')]}
          cursor={{ fill: 'var(--bg-subtle)' }}
        />
        <Bar
          dataKey="closing_value"
          fill="url(#capitalGold)"
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
          shape={(props) => <PremiumBar {...props} dataLength={data.length} />}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
