import api from './axios'

export const getAbout = () => api.get('/about').then(r => r.data)
export const updateAbout = (payload) => api.put('/about', payload).then(r => r.data)
