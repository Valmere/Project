import api from './axios'

export const getInvestors = () => api.get('/investors').then(r => r.data)
export const createInvestor = (data) => api.post('/investors', data).then(r => r.data)
export const getInvestor = (id) => api.get(`/investors/${id}`).then(r => r.data)
export const updateInvestor = (id, data) => api.put(`/investors/${id}`, data).then(r => r.data)
export const getInvestorSummary = (id) => api.get(`/investors/${id}/summary`).then(r => r.data)

// Métriques globales : VA pool / société / globale + ratios pour les tuiles dashboard
export const getGlobalStats = (currency) =>
  api.get('/investors/_meta/global-stats', { params: currency ? { currency } : {} }).then(r => r.data)

// Récupère TOUS les investisseurs y compris la personne morale Valmere & Co.
// Utilisé par le formulaire de transaction pour cibler la société (Prélèvement).
export const getAllInvestorsWithCompany = () =>
  api.get('/investors', { params: { include_company: true } }).then(r => r.data)

// Suppression : admin = exécution immédiate ; caissier = file d'attente.
// Le compte société Valmere & Co est protégé côté backend.
export const deleteInvestor = (id, reason) =>
  api.delete(`/investors/${id}`, { data: { reason: reason || null } }).then(r => r.data)
