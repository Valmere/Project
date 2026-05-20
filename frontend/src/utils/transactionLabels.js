export const TRANSACTION_TYPE_KEYS = [
  'initial',
  'deposit',
  'withdrawal',
  'gain',
  'loss',
  'fee',
  'bailout',
  'company_bailout',
  'company_withdrawal',
]

export function transactionTypeLabel(type, t) {
  const key = `tx.type.${type}`
  const label = t(key)
  return label === key ? String(type || '') : label
}

export function transactionTypeOptions(t, types = TRANSACTION_TYPE_KEYS) {
  return [
    { value: '', label: t('tx.filter.all_types') },
    ...types.map(type => ({ value: type, label: transactionTypeLabel(type, t) })),
  ]
}
