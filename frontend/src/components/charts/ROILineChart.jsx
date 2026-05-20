import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine } from 'recharts'

const tooltipStyle = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  boxShadow: 'var(--shadow-dropdown)',
  fontSize: 12,
  padding: '8px 12px',
}

function formatRoiTick(value) {
  if (value === null || value === undefined) return 'N/A'
  const n = Number(value)
  return Number.isFinite(n) ? `${n}%` : 'N/A'
}

function TodayDot(props) {
  const { cx, cy, index, dataLength } = props
  if (index !== dataLength - 1 || cx == null || cy == null) return null
  return (
    <g>
      <circle cx={cx} cy={cy} r={8} fill="#FFFFFF" opacity={0.92} />
      <circle cx={cx} cy={cy} r={4.5} fill="#C9A249" stroke="#FFFFFF" strokeWidth={2} />
    </g>
  )
}

export default function ROILineChart({ data = [] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="roiGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1A2740" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#1A2740" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
        <ReferenceLine y={0} stroke="#C9A249" strokeDasharray="3 3" strokeOpacity={0.55} />
        <XAxis
          dataKey="period"
          tick={{ fontSize: 11, fill: 'var(--text-3)' }}
          axisLine={false}
          tickLine={false}
          dy={8}
        />
        <YAxis
          tickFormatter={formatRoiTick}
          tick={{ fontSize: 11, fill: 'var(--text-3)' }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: 'var(--text-3)', fontSize: 11, marginBottom: 4 }}
          formatter={(v) => [formatRoiTick(v), 'ROI']}
          cursor={{ stroke: 'var(--border)', strokeDasharray: '3 3' }}
        />
        <Area
          type="monotone"
          dataKey="roi_pct"
          stroke="#1A2740"
          strokeWidth={2}
          fill="url(#roiGrad)"
          dot={(props) => <TodayDot {...props} dataLength={data.length} />}
          activeDot={{ r: 5, fill: '#C9A249', stroke: '#fff', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
