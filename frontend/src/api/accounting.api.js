import api from './axios'

// ── Plan comptable ───────────────────────────────────────────
export const listAccounts = (includeInactive = false) =>
  api.get('/accounting/accounts', { params: { include_inactive: includeInactive } }).then(r => r.data)

export const createAccount = (payload) =>
  api.post('/accounting/accounts', payload).then(r => r.data)

export const updateAccount = (id, payload) =>
  api.put(`/accounting/accounts/${id}`, payload).then(r => r.data)

export const deleteAccount = (id) =>
  api.delete(`/accounting/accounts/${id}`).then(r => r.data)

export const seedAccounts = (overwrite = false) =>
  api.post('/accounting/accounts/seed', null, { params: { overwrite } }).then(r => r.data)

export const backfillTransactions = () =>
  api.post('/accounting/backfill/transactions').then(r => r.data)

// ── Journal ──────────────────────────────────────────────────
export const listJournal = (params = {}) =>
  api.get('/accounting/journal', { params }).then(r => r.data)

export const createEntry = (payload) =>
  api.post('/accounting/journal', payload).then(r => r.data)

export const postEntry = (id) =>
  api.post(`/accounting/journal/${id}/post`).then(r => r.data)

export const voidEntry = (id) =>
  api.post(`/accounting/journal/${id}/void`).then(r => r.data)

// ── États financiers ────────────────────────────────────────
export const getTrialBalance = (asOf, currency) =>
  api.get('/accounting/statements/trial-balance', { params: { as_of: asOf, currency } }).then(r => r.data)

export const getIncomeStatement = (start, end, currency) =>
  api.get('/accounting/statements/income-statement', { params: { start, end, currency } }).then(r => r.data)

export const getBalanceSheet = (asOf, currency) =>
  api.get('/accounting/statements/balance-sheet', { params: { as_of: asOf, currency } }).then(r => r.data)
