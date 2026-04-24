import { create } from 'zustand'

export const useBrandStore = create((set) => ({
  company: null,
  setCompany: (company) => {
    document.documentElement.style.setProperty('--color-primary', company.primary_color || '#1A3A5C')
    document.documentElement.style.setProperty('--color-secondary', company.secondary_color || '#C9A84C')
    set({ company })
  },
}))
