import api from './axios'

export const login = (email, password) =>
  api.post('/auth/login', { email, password }).then(r => r.data)

export const getMe = () => api.get('/users/me').then(r => r.data)

export const webauthnLoginBegin = (email) =>
  api.post('/auth/webauthn/login/begin', { email }).then(r => r.data)

export const webauthnLoginComplete = (email, credential) =>
  api.post('/auth/webauthn/login/complete', { email, credential }).then(r => r.data)

export const webauthnRegisterBegin = (deviceName) =>
  api.post('/auth/webauthn/register/begin', { device_name: deviceName }).then(r => r.data)

export const webauthnRegisterComplete = (credential, deviceName) =>
  api.post('/auth/webauthn/register/complete', { credential, device_name: deviceName }).then(r => r.data)
