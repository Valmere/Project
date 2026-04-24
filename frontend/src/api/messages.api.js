import api from './axios'

export const sendMessage = (data) => api.post('/messages', data).then(r => r.data)
export const getMessages = () => api.get('/messages').then(r => r.data)
export const getMyMessages = () => api.get('/messages/mine').then(r => r.data)
export const replyMessage = (id, reply_body) => api.put(`/messages/${id}/reply`, { reply_body }).then(r => r.data)
export const markRead = (id) => api.put(`/messages/${id}/read`).then(r => r.data)
export const broadcastMessage = (payload) => api.post('/messages/broadcast', payload).then(r => r.data)
