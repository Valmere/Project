import { useEffect, useMemo, useState } from 'react'
import { getMyTransactions } from '../../api/transactions.api'
import DateRangeFilter from '../../components/ui/DateRangeFilter'
import { usePrefsStore, useT } from '../../store/prefs.store'
import { useRatesStore } from '../../store/rates.store'
import { formatMoney, formatDate } from '../../utils/format'
import { getTransactionDisplayAmounts } from '../../utils/transactions'
import { transactionTypeLabel, transactionTypeOptions } from '../../utils/transactionLabels'
import Select from '../../components/ui/Select'

export default function MyTransactionsPage() {
  const t = useT()
  const { currency, lang } = usePrefsStore()
  const convert = useRatesStore(s => s.convert)
  const convertInfo = useRatesStore(s => s.convertInfo)
  const ratesLoaded = useRatesStore(s => s.loaded)
  const [transactions, setTransactions] = useState([])
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [filterType, setFilterType] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMyTransactions()
      .then(setTransactions)
      .finally(() => setLoading(false))
  }, [])

  const sorted = useMemo(() => (
    transactions
      .filter(tx => {
        const txDate = tx.transaction_date || ''
        if (filterStartDate && txDate < filterStartDate) return false
        if (filterEndDate && txDate > filterEndDate) return false
        if (filterType && tx.type !== filterType) return false
        return true
      })
      .slice()
      .sort((a, b) => {
      const d = new Date(b.transaction_date) - new Date(a.transaction_date)
      if (d !== 0) return d
      return new Date(b.created_at || 0) - new Date(a.created_at || 0)
    })
  ), [transactions, filterStartDate, filterEndDate, filterType])

  const timeLocale = lang === 'fr' ? 'fr-FR' : lang === 'es' ? 'es-ES' : 'en-US'

  const formatBefore = (tx) => {
    const before = tx.last_edit_before
    if (!before) return null
    const beforeInfo = getTransactionDisplayAmounts({ ...tx, ...before }, currency, convert, convertInfo)
    const date = before.transaction_date || tx.transaction_date
    return `${before.type || tx.type} · ${formatMoney(beforeInfo.primaryAmount, { currency: beforeInfo.primaryCurrency, lang })} · ${date}`
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="flex justify-start mb-5 gap-3 flex-wrap">
        <Select
          label={t('tx.filter.type')}
          value={filterType}
          onChange={setFilterType}
          options={transactionTypeOptions(t)}
          size="sm"
          minWidth={190}
        />
        <DateRangeFilter
          startDate={filterStartDate}
          endDate={filterEndDate}
          onStartDateChange={setFilterStartDate}
          onEndDateChange={setFilterEndDate}
          onClear={() => {
            setFilterStartDate('')
            setFilterEndDate('')
          }}
        />
      </div>
      <div className="card overflow-hidden">
        <div className="md:overflow-x-auto">
          <table className="data-table is-responsive w-full text-[13px] md:min-w-[1000px]">
            <thead>
              <tr>
                <th className="text-left">{t('tx.col.datetime')}</th>
                <th className="text-left">{t('tx.col.type')}</th>
                <th className="text-right">{t('tx.col.amount')}</th>
                <th className="text-right">{t('tx.col.original')}</th>
                <th className="text-left">{t('tx.col.description')}</th>
                <th className="text-left">{t('tx.col.reference')}</th>
                <th className="text-left">{t('tx.status_col')}</th>
              </tr>
            </thead>
            <tbody>
              {loading || !ratesLoaded ? (
                <tr><td colSpan={7} className="p-8 text-center" style={{ color: 'var(--text-3)' }}>{t('common.loading')}</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center" style={{ color: 'var(--text-3)' }}>{t('tx.empty')}</td></tr>
              ) : sorted.map(tx => {
                const amountInfo = getTransactionDisplayAmounts(tx, currency, convert, convertInfo)
                const txCcy = amountInfo.ledgerCurrency
                const isDeleted = (tx.status || 'active') === 'voided'
                const isModified = Number(tx.edit_count || 0) > 0
                const before = formatBefore(tx)
                const typeColor = {
                  deposit: 'var(--c-success-text)',
                  gain: 'var(--c-success-text)',
                  withdrawal: 'var(--c-danger-text)',
                  loss: 'var(--c-danger-text)',
                  fee: 'var(--text-2)',
                }[tx.type] || 'var(--text-1)'
                return (
                  <tr key={tx.id} style={{ opacity: isDeleted ? 0.72 : 1 }}>
                    <td className="whitespace-nowrap" data-label={t('tx.col.datetime')}>
                      <div>{formatDate(tx.transaction_date, lang)}</div>
                      {tx.created_at && (
                        <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                          {new Date(tx.created_at).toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </td>
                    <td data-label={t('tx.col.type')}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold uppercase text-[11px]" style={{ color: isDeleted ? 'var(--text-3)' : typeColor }}>
                          {transactionTypeLabel(tx.type, t)}
                        </span>
                        {isModified && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider" style={{ background: 'var(--c-warning-bg)', color: 'var(--c-warning-text)' }}>
                            {t('tx.status_modified_short')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-right font-mono" style={{ textDecoration: isDeleted ? 'line-through' : 'none' }} data-label={t('tx.col.amount')}>
                      <div>{formatMoney(amountInfo.displayAmount, { currency: amountInfo.displayCurrency, lang })}</div>
                      {amountInfo.isBailoutTarget && (
                        <div className="text-[11px] font-sans mt-1" style={{ color: 'var(--text-3)' }}>
                          {t('tx.bailout_delta', { amount: formatMoney(amountInfo.ledgerDisplayAmount, { currency: amountInfo.ledgerDisplayCurrency, lang }) })}
                        </div>
                      )}
                    </td>
                    <td className="text-right font-mono" style={{ color: 'var(--text-3)', textDecoration: isDeleted ? 'line-through' : 'none' }} data-label={t('tx.col.original')}>
                      <div>{formatMoney(amountInfo.primaryAmount, { currency: amountInfo.primaryCurrency, lang })}</div>
                      {amountInfo.isBailoutTarget && (
                        <div className="text-[11px] font-sans mt-1">
                          {t('tx.bailout_delta', { amount: formatMoney(amountInfo.ledgerAmount, { currency: txCcy, lang }) })}
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-2)' }} data-label={t('tx.col.description')}>
                      <div>{tx.description || '—'}</div>
                      {before && <div className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>{t('tx.before_value', { value: before })}</div>}
                      {tx.last_edit_reason && <div className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>{t('tx.modified_reason', { reason: tx.last_edit_reason })}</div>}
                      {tx.void_reason && <div className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>{t('tx.deleted_reason', { reason: tx.void_reason })}</div>}
                    </td>
                    <td className="text-[12px] font-mono" style={{ color: 'var(--text-3)' }} data-label={t('tx.col.reference')}>{tx.reference || '—'}</td>
                    <td data-label={t('tx.status_col')}>
                      {isDeleted ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase" style={{ background: 'var(--c-danger-bg)', color: 'var(--c-danger-text)' }}>{t('tx.status_deleted')}</span>
                      ) : isModified ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase" style={{ background: 'var(--c-warning-bg)', color: 'var(--c-warning-text)' }}>{t('tx.status_modified')}</span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase" style={{ background: 'var(--c-success-bg)', color: 'var(--c-success-text)' }}>{t('tx.status_active')}</span>
                      )}
                      {tx.voided_at && <div className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>{new Date(tx.voided_at).toLocaleString(timeLocale)}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
