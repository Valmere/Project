import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { translate } from '../i18n'

export const CURRENCIES = [
  { code: 'HTG', symbol: 'G', label: 'Gourde haïtienne', locale: 'fr-HT', decimals: 0 },
  { code: 'USD', symbol: '$', label: 'US Dollar', locale: 'en-US', decimals: 2 },
  { code: 'EUR', symbol: '€', label: 'Euro', locale: 'fr-FR', decimals: 2 },
]

export const usePrefsStore = create(
  persist(
    (set, get) => ({
      lang: 'fr',
      currency: 'HTG',
      setLang: (lang) => set({ lang }),
      setCurrency: (currency) => set({ currency }),
      t: (key, vars) => translate(get().lang, key, vars),
    }),
    { name: 'valmere-prefs' }
  )
)

// Hook-like helper for cleaner usage
export function useT() {
  const lang = usePrefsStore((s) => s.lang)
  return (key, vars) => translate(lang, key, vars)
}
