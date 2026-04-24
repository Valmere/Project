import api from './axios'

export const getAdminDashboard = (params = {}) =>
  api.get('/dashboard/admin', { params }).then(r => r.data)

export const getInvestorDashboard = (params = {}) =>
  api.get('/dashboard/investor', { params }).then(r => r.data)
