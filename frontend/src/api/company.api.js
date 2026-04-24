import api from './axios'

export const getCompany = () => api.get('/company').then(r => r.data)
export const updateCompany = (data) => api.put('/company', data).then(r => r.data)
