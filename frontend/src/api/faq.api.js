import api from './axios'

export const listFaq = () => api.get('/faq').then(r => r.data)
export const createFaq = (payload) => api.post('/faq', payload).then(r => r.data)
export const updateFaq = (id, payload) => api.put(`/faq/${id}`, payload).then(r => r.data)
export const deleteFaq = (id) => api.delete(`/faq/${id}`).then(r => r.data)
