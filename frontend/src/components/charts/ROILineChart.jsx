import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'

const tooltipStyle = {
  background: '#fff',
  border: '1px solid var(--border)',
  borderRadius: 8,
  boxShadow: 'var(--shadow-dropdown)',
  fontSize: 12,
  padding: '8px 12px',
}

export default function ROILineChart({ data = [] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="roiGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.18} />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
        <XAxis
          dataKey="period"
          tick={{ fontSize: 11, fill: 'var(--text-3)' }}
          axisLine={false}
          tickLine={false}
          dy={8}
        />
        <YAxis
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 11, fill: 'var(--text-3)' }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: 'var(--text-3)', fontSize: 11, marginBottom: 4 }}
          formatter={(v) => [`${v}%`, 'ROI']}
          cursor={{ stroke: 'var(--border)', strokeDasharray: '3 3' }}
        />
        <Area
          type="monotone"
          dataKey="roi_pct"
          stroke="var(--color-primary)"
          strokeWidth={2}
          fill="url(#roiGrad)"
          dot={false}
          activeDot={{ r: 4, fill: 'var(--color-primary)', stroke: '#fff', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
