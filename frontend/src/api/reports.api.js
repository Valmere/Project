import api from './axios'

export const generateReport = (data) => api.post('/reports/generate', data).then(r => r.data)
export const getReportDownloadUrl = (id) => api.get(`/reports/${id}/download`).then(r => r.data)
export const getInvestorReports = (investorId) =>
  api.get(`/investors/${investorId}/reports`).then(r => r.data)

/* ── Investisseur connecté ──────────────────────────────────── */
export const getMyReports = () => api.get('/reports/my').then(r => r.data)

export const previewMyStatement = (params = {}) =>
  api.get('/reports/my/preview', { params }).then(r => r.data)

export const generateMyStatement = (payload) =>
  api.post('/reports/my/generate', payload).then(r => r.data)

/* ── Viewer + share ───────────────────────────────────────────── */
export const viewReport = (id, params = {}) =>
  api.get(`/reports/${id}/view`, { params }).then(r => r.data)

export const shareReport = (id) =>
  api.post(`/reports/${id}/share`).then(r => r.data)
