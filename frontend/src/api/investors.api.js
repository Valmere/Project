import api from './axios'

export const getInvestors = () => api.get('/investors').then(r => r.data)
export const createInvestor = (data) => api.post('/investors', data).then(r => r.data)
export const getInvestor = (id) => api.get(`/investors/${id}`).then(r => r.data)
export const updateInvestor = (id, data) => api.put(`/investors/${id}`, data).then(r => r.data)
export const getInvestorSummary = (id) => api.get(`/investors/${id}/summary`).then(r => r.data)
