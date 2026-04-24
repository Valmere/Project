import { fr } from './fr'
import { en } from './en'
import { es } from './es'

export const LANGUAGES = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
]

const DICTS = { fr, en, es }

export function translate(lang, key, vars) {
  const dict = DICTS[lang] || DICTS.fr
  const raw = dict[key] ?? DICTS.fr[key] ?? key
  if (!vars) return raw
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    raw
  )
}
