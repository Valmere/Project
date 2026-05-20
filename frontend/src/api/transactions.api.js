import api from './axios'

export const getTransactions = (investorId) =>
  api.get('/transactions', { params: investorId ? { investor_id: investorId } : {} }).then(r => r.data)
export const getMyTransactions = () => api.get('/transactions/my').then(r => r.data)
export const getTransactionTrash = (investorId) =>
  api.get('/transactions/trash', { params: investorId ? { investor_id: investorId } : {} }).then(r => r.data)
export const createTransaction = (data) => api.post('/transactions', data).then(r => r.data)
export const confirmTransaction = (id) => api.put(`/transactions/${id}/confirm`).then(r => r.data)

// Modification : admin = exécution immédiate ; caissier = file d'attente.
// Le backend recalcule investment.current_value a partir du montant metier.
export const updateTransaction = (id, data) =>
  api.put(`/transactions/${id}`, data).then(r => r.data)

// Annulation/suppression : admin = exécution immédiate ; caissier = file d'attente.
// Reverse l'impact sur la valeur actuelle + void l'écriture comptable liée.
export const voidTransaction = (id, reason) =>
  api.post(`/transactions/${id}/void`, { reason: reason || null }).then(r => r.data)
export const restoreTransaction = (id, reason) =>
  api.post(`/transactions/${id}/restore`, { reason: reason || null }).then(r => r.data)
export const replayTransaction = (id, reason) =>
  api.post(`/transactions/${id}/replay`, { reason: reason || null }).then(r => r.data)

// Distribution P&L : 80% société + 20% pro-rata aux investisseurs
export const previewDistribution = (data) =>
  api.post('/transactions/distribute/preview', data).then(r => r.data)
export const executeDistribution = (data) =>
  api.post('/transactions/distribute', data).then(r => r.data)
