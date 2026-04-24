import api from './axios'

export const getTransactions = (investorId) =>
  api.get('/transactions', { params: investorId ? { investor_id: investorId } : {} }).then(r => r.data)
export const getMyTransactions = () => api.get('/transactions/my').then(r => r.data)
export const createTransaction = (data) => api.post('/transactions', data).then(r => r.data)
export const confirmTransaction = (id) => api.put(`/transactions/${id}/confirm`).then(r => r.data)
