import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { translate } from '../i18n'

export const CURRENCIES = [
  { code: 'HTG', symbol: 'G', label: 'Gourde haïtienne', locale: 'fr-HT', decimals: 0 },
  { code: 'USD', symbol: '$', label: 'US Dollar', locale: 'en-US', decimals: 2 },
  { code: 'EUR', symbol: '€', label: 'Euro', locale: 'fr-FR', decimals: 2 },
]

export function applyTheme(theme) {
  const normalized = theme === 'dark' ? 'dark' : 'light'
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = normalized
  document.documentElement.style.colorScheme = normalized
}

export const usePrefsStore = create(
  persist(
    (set, get) => ({
      lang: 'fr',
      currency: 'HTG',
      theme: 'light',
      setLang: (lang) => set({ lang }),
      setCurrency: (currency) => set({ currency }),
      setTheme: (theme) => {
        const normalized = theme === 'dark' ? 'dark' : 'light'
        applyTheme(normalized)
        set({ theme: normalized })
      },
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark'
        applyTheme(next)
        set({ theme: next })
      },
      t: (key, vars) => translate(get().lang, key, vars),
    }),
    {
      name: 'valmere-prefs',
      onRehydrateStorage: () => (state) => applyTheme(state?.theme || 'light'),
    }
  )
)

applyTheme(usePrefsStore.getState().theme)

// Hook-like helper for cleaner usage
export function useT() {
  const lang = usePrefsStore((s) => s.lang)
  return (key, vars) => translate(lang, key, vars)
}
