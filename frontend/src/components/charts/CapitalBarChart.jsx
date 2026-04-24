import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const fmt = (v) => new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(v)

const tooltipStyle = {
  background: '#fff',
  border: '1px solid var(--border)',
  borderRadius: 8,
  boxShadow: 'var(--shadow-dropdown)',
  fontSize: 12,
  padding: '8px 12px',
}

export default function CapitalBarChart({ data = [] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
        <XAxis
          dataKey="period"
          tick={{ fontSize: 11, fill: 'var(--text-3)' }}
          axisLine={false}
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
          formatter={(v) => [fmt(v), 'Valeur']}
          cursor={{ fill: 'var(--bg-subtle)' }}
        />
        <Bar
          dataKey="closing_value"
          fill="var(--color-secondary)"
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
