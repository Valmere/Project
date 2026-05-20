import { TriangleAlert } from 'lucide-react'

const TITLE = {
  fr: 'ROI non applicable : gain/perte et valeur actuelle sont negatifs.',
  en: 'ROI not applicable: gain/loss and current value are both negative.',
  es: 'ROI no aplicable: ganancia/perdida y valor actual son negativos.',
}

export default function RoiValue({ value, unavailable = false, lang = 'fr', className = '' }) {
  const n = Number(value)
  const isUnavailable = unavailable || value === null || value === undefined || Number.isNaN(n)

  if (isUnavailable) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-red-600 ${className}`.trim()}
        title={TITLE[lang] || TITLE.fr}
      >
        <TriangleAlert size={18} strokeWidth={2.3} aria-hidden="true" />
        <span>N/A</span>
      </span>
    )
  }

  return <>{`${n >= 0 ? '+' : ''}${n.toFixed(2)}%`}</>
}
