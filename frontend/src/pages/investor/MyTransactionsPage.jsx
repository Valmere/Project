import { useEffect, useMemo, useState } from 'react'
import { getMyTransactions } from '../../api/transactions.api'
import { usePrefsStore, useT } from '../../store/prefs.store'
import { useRatesStore } from '../../store/rates.store'
import { formatMoney, formatDate } from '../../utils/format'

export default function MyTransactionsPage() {
  const t = useT()
  const { currency, lang } = usePrefsStore()
  const convert = useRatesStore(s => s.convert)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMyTransactions()
      .then(setTransactions)
      .finally(() => setLoading(false))
  }, [])

  const sorted = useMemo(() => (
    transactions.slice().sort((a, b) => {
      const d = new Date(b.transaction_date) - new Date(a.transaction_date)
      if (d !== 0) return d
      return new Date(b.created_at || 0) - new Date(a.created_at || 0)
    })
  ), [transactions])

  const timeLocale = lang === 'fr' ? 'fr-FR' : lang === 'es' ? 'es-ES' : 'en-US'

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table w-full text-[13px] min-w-[900px]">
            <thead>
              <tr>
                <th className="text-left">{t('tx.col.datetime')}</th>
                <th className="text-left">{t('tx.col.type')}</th>
                <th className="text-right">{t('tx.col.amount')}</th>
                <th className="text-right">{t('tx.col.original')}</th>
                <th className="text-left">{t('tx.col.description')}</th>
                <th className="text-left">{t('tx.col.reference')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center" style={{ color: 'var(--text-3)' }}>{t('common.loading')}</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center" style={{ color: 'var(--text-3)' }}>{t('tx.empty')}</td></tr>
              ) : sorted.map(tx => {
                const txCcy = (tx.currency || 'HTG').toUpperCase()
                const displayAmt = convert(Number(tx.amount || 0), txCcy, currency)
                const typeColor = {
                  deposit: 'var(--c-success-text)',
                  gain: 'var(--c-success-text)',
                  withdrawal: 'var(--c-danger-text)',
                  loss: 'var(--c-danger-text)',
                  fee: 'var(--text-2)',
                }[tx.type] || 'var(--text-1)'
                return (
                  <tr key={tx.id}>
                    <td className="whitespace-nowrap">
                      <div>{formatDate(tx.transaction_date, lang)}</div>
                      {tx.created_at && (
                        <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                          {new Date(tx.created_at).toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="font-semibold uppercase text-[11px]" style={{ color: typeColor }}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="text-right font-mono">{formatMoney(displayAmt, { currency, lang })}</td>
                    <td className="text-right font-mono" style={{ color: 'var(--text-3)' }}>
                      {formatMoney(Number(tx.amount || 0), { currency: txCcy, lang })}
                    </td>
                    <td style={{ color: 'var(--text-2)' }}>{tx.description || '—'}</td>
                    <td className="text-[12px] font-mono" style={{ color: 'var(--text-3)' }}>{tx.reference || '—'}</td>
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
