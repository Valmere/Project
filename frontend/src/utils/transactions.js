const BAILOUT_TARGET_RE =
  /(?:Nouvelle valeur|New current value|New value|Nuevo valor(?: actual)?)\s*:\s*([-+]?\d[\d\s.,]*)\s*([A-Z]{3})?/i

function parseLooseNumber(raw) {
  if (!raw) return null
  let compact = String(raw).replace(/[\s\u00a0]/g, '')
  if (!compact) return null

  const comma = compact.lastIndexOf(',')
  const dot = compact.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    const decimalSep = comma > dot ? ',' : '.'
    const thousandsSep = decimalSep === ',' ? '.' : ','
    compact = compact.replaceAll(thousandsSep, '').replace(decimalSep, '.')
  } else if (comma >= 0) {
    const decimals = compact.length - comma - 1
    compact = compact.replace(',', decimals >= 1 && decimals <= 4 ? '.' : '')
  } else if (dot >= 0) {
    const decimals = compact.length - dot - 1
    if (decimals < 1 || decimals > 4) compact = compact.replaceAll('.', '')
  }

  const parsed = Number(compact)
  return Number.isFinite(parsed) ? parsed : null
}

export function getBailoutTarget(tx) {
  if ((tx?.type || '').toLowerCase() !== 'bailout') return null

  if (tx.display_amount !== null && tx.display_amount !== undefined) {
    const amount = Number(tx.display_amount)
    if (Number.isFinite(amount)) {
      return {
        amount,
        currency: (tx.display_currency || tx.currency || 'HTG').toUpperCase(),
      }
    }
  }

  const match = BAILOUT_TARGET_RE.exec(tx.description || '')
  if (!match) return null
  const amount = parseLooseNumber(match[1])
  if (amount === null) return null
  return {
    amount,
    currency: (match[2] || tx.currency || 'HTG').toUpperCase(),
  }
}

export function getTransactionDisplayAmounts(tx, displayCurrency, convert, convertInfo) {
  const ledgerCurrency = (tx?.currency || 'HTG').toUpperCase()
  const ledgerAmount = Number(tx?.amount || 0)
  const target = getBailoutTarget(tx)
  const primaryAmount = target ? target.amount : ledgerAmount
  const primaryCurrency = target ? target.currency : ledgerCurrency
  const convertForDisplay = (amount, fromCurrency) => {
    const from = (fromCurrency || 'HTG').toUpperCase()
    const to = (displayCurrency || from).toUpperCase()
    if (typeof convertInfo === 'function') {
      return convertInfo(amount, from, to)
    }
    if (typeof convert === 'function') {
      return {
        amount: convert(amount, from, to),
        effectiveCurrency: to,
        converted: true,
        missingPair: null,
      }
    }
    return {
      amount: Number(amount || 0),
      effectiveCurrency: from,
      converted: from === to,
      missingPair: from === to ? null : `${from}->${to}`,
    }
  }
  const display = convertForDisplay(primaryAmount, primaryCurrency)
  const ledgerDisplay = convertForDisplay(ledgerAmount, ledgerCurrency)

  return {
    // `display_amount` is kept for legacy bailouts where `amount` was a
    // technical delta. It is now the business amount, not a target value.
    isBailoutTarget: false,
    primaryAmount,
    primaryCurrency,
    displayAmount: display.amount,
    displayCurrency: display.effectiveCurrency,
    displayConverted: display.converted,
    displayMissingPair: display.missingPair,
    ledgerAmount,
    ledgerCurrency,
    ledgerDisplayAmount: ledgerDisplay.amount,
    ledgerDisplayCurrency: ledgerDisplay.effectiveCurrency,
    ledgerDisplayConverted: ledgerDisplay.converted,
    ledgerDisplayMissingPair: ledgerDisplay.missingPair,
  }
}
