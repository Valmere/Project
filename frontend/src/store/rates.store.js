import { create } from 'zustand'
import api from '../api/axios'

export const useRatesStore = create((set, get) => ({
  rates: [],
  loaded: false,
  load: async () => {
    try {
      const r = await api.get('/currency-rates')
      set({ rates: r.data, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },
  getRate: (from, to) => {
    const fc = (from || '').toUpperCase()
    const tc = (to || '').toUpperCase()
    if (!fc || !tc) return null
    if (fc === tc) return 1
    const { rates } = get()
    const direct = rates.find(r => r.from_currency === fc && r.to_currency === tc)
    if (direct) return Number(direct.rate)
    const inverse = rates.find(r => r.from_currency === tc && r.to_currency === fc)
    if (inverse && Number(inverse.rate) !== 0) return 1 / Number(inverse.rate)
    return null
  },
  convert: (amount, from, to) => {
    const rate = get().getRate(from, to)
    if (rate === null) return Number(amount || 0)
    return Number(amount || 0) * rate
  },
}))
