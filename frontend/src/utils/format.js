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
  // Bug à éviter : `new Date("2026-04-28")` est parsé comme MINUIT UTC.
  // Pour un client à UTC-4 (Haïti), ça devient « 27 avril 20:00 local » et
  // l'affichage tronque à « 27 Apr » alors que la transaction a été enregistrée
  // pour le 28. Quand on reçoit une chaîne ISO date-seule (YYYY-MM-DD) on la
  // parse explicitement comme MINUIT LOCAL pour préserver le jour saisi.
  let d
  if (value instanceof Date) {
    d = value
  } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, day] = value.split('-').map(Number)
    d = new Date(y, m - 1, day)  // local midnight, no timezone shift
  } else {
    d = new Date(value)
  }
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

/**
 * Date du jour au format YYYY-MM-DD selon le fuseau LOCAL de l'utilisateur.
 * Évite le piège de `new Date().toISOString().slice(0,10)` qui renvoie la
 * date UTC — pour un utilisateur à UTC+12 par exemple, ça peut décaler d'un
 * jour quand il est tôt le matin local (UTC est encore la veille).
 */
export function todayLocalISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
