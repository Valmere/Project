import api from './axios'

export const listApprovals = (status) =>
  api.get('/approvals', { params: status ? { status } : {} }).then(r => r.data)

export const pendingCount = () =>
  api.get('/approvals/pending-count').then(r => r.data)

export const approveAction = (id, notes) =>
  api.post(`/approvals/${id}/approve`, { notes: notes || null }).then(r => r.data)

export const rejectAction = (id, notes) =>
  api.post(`/approvals/${id}/reject`, { notes: notes || null }).then(r => r.data)
