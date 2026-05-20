const ACCOUNT_NAME_KEYS = {
  '1': 'account.name.1',
  '101': 'account.name.101',
  '106': 'account.name.106',
  '110': 'account.name.110',
  '120': 'account.name.120',
  '2': 'account.name.2',
  '215': 'account.name.215',
  '218': 'account.name.218',
  '4': 'account.name.4',
  '401': 'account.name.401',
  '411': 'account.name.411',
  '421': 'account.name.421',
  '445': 'account.name.445',
  '467': 'account.name.467',
  '5': 'account.name.5',
  '512': 'account.name.512',
  '5121': 'account.name.5121',
  '5122': 'account.name.5122',
  '5123': 'account.name.5123',
  '5124': 'account.name.5124',
  '530': 'account.name.530',
  '6': 'account.name.6',
  '601': 'account.name.601',
  '621': 'account.name.621',
  '627': 'account.name.627',
  '666': 'account.name.666',
  '667': 'account.name.667',
  '668': 'account.name.668',
  '7': 'account.name.7',
  '706': 'account.name.706',
  '766': 'account.name.766',
  '767': 'account.name.767',
  '768': 'account.name.768',
}

const ACCOUNT_NAME_ALIASES = {
  'capitaux propres': 'account.name.1',
  'capital social': 'account.name.101',
  'reserves': 'account.name.106',
  "resultat de l'exercice": 'account.name.120',
  'resultats reportes': 'account.name.110',
  'immobilisations': 'account.name.2',
  'installations & materiel': 'account.name.215',
  'materiel informatique': 'account.name.218',
  'tiers': 'account.name.4',
  'fournisseurs': 'account.name.401',
  'clients': 'account.name.411',
  'comptes investisseurs': 'account.name.421',
  'taxes a reverser': 'account.name.445',
  'autres creanciers': 'account.name.467',
  'tresorerie': 'account.name.5',
  'banque': 'account.name.512',
  'banque htg': 'account.name.5121',
  'banque usd': 'account.name.5122',
  'banque eur': 'account.name.5123',
  'banque cad': 'account.name.5124',
  'caisse': 'account.name.530',
  'charges': 'account.name.6',
  'achats & prestations': 'account.name.601',
  'personnel': 'account.name.621',
  'services bancaires': 'account.name.627',
  'pertes financieres': 'account.name.666',
  'pertes financieres investisseurs': 'account.name.667',
  'pertes de change': 'account.name.668',
  'produits': 'account.name.7',
  'commissions de gestion': 'account.name.706',
  'gains financiers': 'account.name.766',
  'gains financiers investisseurs': 'account.name.767',
  'gains de change': 'account.name.768',
}

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’]/g, "'")
    .toLowerCase()
    .trim()
}

function labelFromKey(key, fallback, t) {
  if (!key) return fallback || ''
  const translated = t(key)
  return translated === key ? fallback || '' : translated
}

export function accountName(accountOrName, t) {
  const code = typeof accountOrName === 'object' ? accountOrName?.code : null
  const raw = typeof accountOrName === 'object' ? accountOrName?.name : accountOrName
  const key = (code && ACCOUNT_NAME_KEYS[String(code)]) || ACCOUNT_NAME_ALIASES[norm(raw)]
  return labelFromKey(key, raw || code || '', t)
}

export function accountOptionLabel(account, t) {
  return `${account.code} - ${accountName(account, t)}`
}

export function translateAccountingText(value, t) {
  if (!value) return value
  let text = String(value)

  const sideMatch = text.match(/^(Débit|Debit|DÃ©bit|Crédit|Credit|CrÃ©dit)\s+[—-]\s+(.+)$/i)
  if (sideMatch) {
    const side = /cr/i.test(sideMatch[1]) ? t('account.side.credit') : t('account.side.debit')
    return `${side} - ${accountName(sideMatch[2], t)}`
  }

  text = text.replace(/^Nouvelle valeur\s*:/i, t('accounting.description.new_value') + ' :')
  text = text.replace(/^Distribution gain\s+[—-]\s+part investisseur/i, t('accounting.description.investor_gain'))
  text = text.replace(/^Distribution loss\s+[—-]\s+part investisseur/i, t('accounting.description.investor_loss'))
  text = text.replace(/^Transaction company_bailout/i, t('accounting.description.company_bailout'))
  text = text.replace(/^Transaction company_withdrawal/i, t('accounting.description.company_withdrawal'))
  return text
}
