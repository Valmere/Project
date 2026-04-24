import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const auth = JSON.parse(localStorage.getItem('valmere-auth') || '{}')
  const token = auth?.state?.token
  if (token) config.headers.Authorization = `Bearer ${token}`

  // Propagate user language + currency preferences to backend (reports, exports, etc.)
  const prefs = JSON.parse(localStorage.getItem('valmere-prefs') || '{}')
  const lang = prefs?.state?.lang || 'fr'
  const currency = prefs?.state?.currency || 'HTG'
  config.headers['Accept-Language'] = lang
  config.headers['X-Currency'] = currency
  config.params = { lang, currency, ...(config.params || {}) }

  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('valmere-auth')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
