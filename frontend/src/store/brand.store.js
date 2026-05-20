import { create } from 'zustand'

export const useBrandStore = create((set) => ({
  company: null,
  setCompany: (company) => {
    set({ company })
  },
}))
