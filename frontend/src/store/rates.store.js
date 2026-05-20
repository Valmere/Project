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
    const directOrInverse = (source, target) => {
      if (source === target) return 1
      const direct = rates.find(r => r.from_currency === source && r.to_currency === target)
      if (direct) return Number(direct.rate)
      const inverse = rates.find(r => r.from_currency === target && r.to_currency === source)
      if (inverse && Number(inverse.rate) !== 0) return 1 / Number(inverse.rate)
      return null
    }
    const direct = directOrInverse(fc, tc)
    if (direct !== null) return direct
    if (fc !== 'HTG' && tc !== 'HTG') {
      const toBase = directOrInverse(fc, 'HTG')
      const fromBase = directOrInverse('HTG', tc)
      if (toBase !== null && fromBase !== null) return toBase * fromBase
    }
    return null
  },
  convertInfo: (amount, from, to) => {
    const fc = (from || '').toUpperCase()
    const tc = (to || '').toUpperCase()
    const value = Number(amount || 0)
    const rate = get().getRate(fc, tc)
    if (rate === null) {
      return {
        amount: value,
        from: fc,
        to: tc,
        effectiveCurrency: fc || tc,
        rate: null,
        converted: false,
        missingPair: fc && tc ? `${fc}->${tc}` : null,
      }
    }
    return {
      amount: value * rate,
      from: fc,
      to: tc,
      effectiveCurrency: tc,
      rate,
      converted: true,
      missingPair: null,
    }
  },
  convert: (amount, from, to) => {
    const rate = get().getRate(from, to)
    if (rate === null) return Number(amount || 0)
    return Number(amount || 0) * rate
  },
}))
