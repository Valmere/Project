import { CURRENCIES } from '../store/prefs.store'

const LOCALES = { fr: 'fr-FR', en: 'en-US', es: 'es-ES' }

export function getLocale(lang) {
  return LOCALES[lang] || 'fr-FR'
}

export function getCurrencyMeta(code) {
  return CURRENCIES.find((c) => c.code === code) || CURRENCIES[0]
}

/** Format a monetary value using the user's currency + language locale. */
export function formatMoney(value, { currency = 'HTG', lang = 'fr', sign = false, compact = false } = {}) {
  const meta = getCurrencyMeta(currency)
  const locale = LOCALES[lang] || meta.locale

  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
    notation: compact ? 'compact' : 'standard',
  })

  const n = Number(value || 0)
  const formatted = formatter.format(Math.abs(n))
  const prefix = sign ? (n >= 0 ? '+' : '-') : (n < 0 ? '-' : '')
  return `${prefix}${formatted} ${meta.symbol}`
}

/** Short number formatting (for KPI values without currency, like counts). */
export function formatNumber(value, lang = 'fr') {
  return new Intl.NumberFormat(getLocale(lang), { maximumFractionDigits: 0 }).format(
    Number(value || 0)
  )
}

export function formatPercent(value, lang = 'fr', decimals = 1) {
  return new Intl.NumberFormat(getLocale(lang), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(value || 0)) + ' %'
}

export function formatDate(value, lang = 'fr', opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat(getLocale(lang), opts).format(d)
}

export function formatLongDate(lang = 'fr') {
  return new Intl.DateTimeFormat(getLocale(lang), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
}
