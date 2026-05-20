import api from './axios'

export const login = (email, password) =>
  api.post('/auth/login', { email, password }).then(r => r.data)

export const getMe = () => api.get('/users/me').then(r => r.data)

export const updateMe = (profile) => api.put('/users/me', profile).then(r => r.data)

export const recoverAccount = (username) =>
  api.post('/auth/recover-account', { username }).then(r => r.data)

export const webauthnLoginBegin = (email) =>
  api.post('/auth/webauthn/login/begin', { email }).then(r => r.data)

export const webauthnLoginComplete = (email, credential) =>
  api.post('/auth/webauthn/login/complete', { email, credential }).then(r => r.data)

export const webauthnRegisterBegin = (deviceName) =>
  api.post('/auth/webauthn/register/begin', { device_name: deviceName }).then(r => r.data)

export const webauthnRegisterComplete = (credential, deviceName) =>
  api.post('/auth/webauthn/register/complete', { credential, device_name: deviceName }).then(r => r.data)

export const listWebauthnCredentials = () =>
  api.get('/auth/webauthn/credentials').then(r => r.data)

export const deleteWebauthnCredential = (id) =>
  api.delete(`/auth/webauthn/credentials/${id}`).then(r => r.data)

export const changePassword = (current_password, new_password) =>
  api.post('/auth/change-password', { current_password, new_password }).then(r => r.data)
