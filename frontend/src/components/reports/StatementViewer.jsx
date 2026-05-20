import { useMemo } from 'react'
import { translate } from '../../i18n'
import { formatDate, formatMoney, getLocale } from '../../utils/format'
import RoiValue from '../ui/RoiValue'

/* ── Transaction type styling (mirrors Excel output) ─────────── */
export const TX_TYPE_META = {
  initial:    { bg: '#EFF6FF', fg: '#1E40AF', label: { fr: 'Apport initial', en: 'Initial capital', es: 'Capital inicial' } },
  deposit:    { bg: '#EFF6FF', fg: '#1D4ED8', label: { fr: 'Dépôt',          en: 'Deposit',         es: 'Depósito' } },
  withdrawal: { bg: '#FFF7ED', fg: '#C2410C', label: { fr: 'Retrait',        en: 'Withdrawal',      es: 'Retiro' } },
  gain:       { bg: '#ECFDF5', fg: '#047857', label: { fr: 'Gain',           en: 'Gain',            es: 'Ganancia' } },
  loss:       { bg: '#FEF2F2', fg: '#B91C1C', label: { fr: 'Perte',          en: 'Loss',            es: 'Pérdida' } },
  fee:        { bg: '#F5F3FF', fg: '#6D28D9', label: { fr: 'Frais',          en: 'Fee',             es: 'Comisión' } },
  bailout:    { bg: '#FFFBEB', fg: '#92400E', label: { fr: 'Renflouement',   en: 'Bailout',         es: 'Saneamiento' } },
  company_bailout: { bg: '#FFFBEB', fg: '#92400E', label: { fr: 'Renflouement société', en: 'Company bailout', es: 'Saneamiento empresa' } },
  company_withdrawal: { bg: '#FFF7ED', fg: '#C2410C', label: { fr: 'Prélèvement société', en: 'Company withdrawal', es: 'Retiro empresa' } },
}

export function typeBadge(type, lang = 'fr') {
  const meta = TX_TYPE_META[type] || { bg: '#F1F5F9', fg: '#475569', label: { fr: type } }
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold"
      style={{ backgroundColor: meta.bg, color: meta.fg }}
    >
      {meta.label[lang] || meta.label.fr || type}
    </span>
  )
}

function StatTile({ label, value, hint, accent }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-3 sm:p-4 print:shadow-none print:border print:border-slate-200 min-w-0">
      <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate">{label}</div>
      <div
        className="text-[15px] sm:text-lg md:text-xl font-bold mt-1 sm:mt-1.5 break-words tabular-nums leading-tight"
        style={{ color: accent || 'var(--color-primary)' }}
      >
        {value}
      </div>
      {hint && <div className="text-[10px] sm:text-[11px] text-slate-400 mt-1 truncate">{hint}</div>}
    </div>
  )
}

/**
 * Affiche un relevé de compte (bandeau, KPIs, historique) — même rendu que
 * l'Excel généré, en version web. Reçoit les données déjà chargées depuis
 * /reports/{id}/view ou /reports/my/preview.
 */
export default function StatementViewer({ data, lang = 'fr' }) {
  const t = (key, vars) => translate(lang, key, vars)
  const dash = '—'
  const displayCcy = data?.display_currency || 'HTG'
  const summary = data?.summary
  const txs = data?.transactions || []
  const company = data?.company

  const tableRows = useMemo(() => {
    if (!data) return []
    const initial = {
      id: '__initial__',
      date: data.investment?.start_date || data.investor?.entry_date,
      type: 'initial',
      converted_amount: data.summary.initial,
      original_amount: data.investment?.initial_capital_native,
      original_currency: data.investment?.currency,
      description: t('reports.initial_deposit_label'),
    }
    return [initial, ...txs]
  }, [data, txs, lang])

  if (!data) return null

  const periodLabel = data.period?.start || data.period?.end
    ? t('reports.period_label', { start: data.period.start || dash, end: data.period.end || dash })
    : t('reports.all_transactions')

  const generatedLabel = data.report?.generated_at
    ? t('reports.generated_on', { date: formatDate(data.report.generated_at, lang, {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }) })
    : null
  const formatOriginal = (value) => new Intl.NumberFormat(getLocale(lang), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
  const statusLabel = data.investor.status
    ? (() => {
        const label = t(`status.${data.investor.status}`)
        return label === `status.${data.investor.status}` ? data.investor.status : label
      })()
    : null

  return (
    <div className="statement-viewer space-y-5">
      {/* Banner — version mobile plus compacte, version desktop inchangée */}
      <div
        className="rounded-2xl overflow-hidden shadow-sm print:shadow-none print:rounded-none"
        style={{ background: 'var(--color-primary)' }}
      >
        <div className="p-4 sm:p-6 md:p-8 text-center text-white">
          {company?.logo_url && (
            <img
              src={company.logo_url}
              alt={company.company_name || 'Logo'}
              className="h-10 sm:h-12 md:h-14 mx-auto mb-2 sm:mb-3 object-contain"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' }}
            />
          )}
          <div className="text-base sm:text-xl md:text-2xl font-bold tracking-tight">
            {company?.company_name || 'Valmere & Co'}
          </div>
          <div className="text-[10px] sm:text-[12px] md:text-sm font-semibold tracking-[0.14em] uppercase mt-1.5 sm:mt-2" style={{ color: 'var(--color-secondary, #C9A84C)' }}>
            {t('reports.statement_header')}
          </div>
          <div className="text-[10px] sm:text-[11px] opacity-70 mt-1">{periodLabel}</div>
        </div>
      </div>

      {/* Investor card — sur mobile : pile compacte sans badges colonnés */}
      <div className="bg-white rounded-xl shadow-sm p-3.5 sm:p-4 md:p-5 print:shadow-none print:border print:border-slate-200">
        {/* Mobile : une seule colonne, infos enchaînées */}
        <div className="sm:hidden min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('reports.investor')}</span>
            {statusLabel && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                {statusLabel}
              </span>
            )}
          </div>
          <div className="text-[16px] font-bold text-slate-800 mt-0.5 truncate">{data.investor.full_name}</div>
          <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-2">
            <span><span className="text-slate-400">{t('reports.code')} :</span> <span className="font-mono">{data.investor.code}</span></span>
            {data.investor.entry_date && (
              <span><span className="text-slate-400">{t('reports.entry_date')} :</span> {formatDate(data.investor.entry_date, lang)}</span>
            )}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('reports.period')} </span>
            <span className="text-[12px] font-medium text-slate-700">{periodLabel}</span>
          </div>
        </div>

        {/* Desktop : layout horizontal inchangé */}
        <div className="hidden sm:flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t('reports.investor')}</div>
            <div className="text-lg font-bold text-slate-800">{data.investor.full_name}</div>
            <div className="text-[12px] text-slate-500 mt-0.5">
              {t('reports.code')} : <span className="font-mono">{data.investor.code}</span>
              {data.investor.entry_date && <> · {t('reports.entry_date')} : {formatDate(data.investor.entry_date, lang)}</>}
              {statusLabel && <> · <span className="uppercase">{statusLabel}</span></>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t('reports.period')}</div>
            <div className="text-sm font-medium text-slate-700">{periodLabel}</div>
          </div>
        </div>
      </div>

      {/* KPI summary — 2×2 sur mobile (plus dense, moins de scroll),
          4 colonnes en ligne sur desktop. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
        <StatTile
          label={t('kpi.invested_capital')}
          value={formatMoney(summary.invested ?? summary.initial, { currency: displayCcy, lang })}
          hint={data.investor.entry_date}
        />
        <StatTile
          label={t('kpi.current_value')}
          value={formatMoney(summary.current, { currency: displayCcy, lang })}
        />
        <StatTile
          label={t('kpi.total_gain')}
          value={formatMoney(summary.pnl, { currency: displayCcy, lang, sign: true })}
          accent={summary.pnl >= 0 ? '#047857' : '#B91C1C'}
        />
        <StatTile
          label={t('kpi.roi')}
          value={<RoiValue value={summary.roi_pct} unavailable={summary.roi_unavailable} lang={lang} />}
          accent={summary.roi_unavailable ? '#B91C1C' : (summary.roi_pct >= 0 ? '#047857' : '#B91C1C')}
        />
      </div>

      {/* Transactions */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden print:shadow-none print:border print:border-slate-200">
        <div className="px-4 md:px-6 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 text-sm">{t('reports.history')}</h3>
          <span className="text-[11px] text-slate-400">{t('reports.lines', { count: tableRows.length })}</span>
        </div>
        {tableRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">{t('reports.no_tx')}</div>
        ) : (
          <>
            {/* Desktop + print table */}
            <div className="hidden md:block overflow-x-auto print:block">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold">{t('tx.col.date')}</th>
                    <th className="text-left px-4 py-3 font-semibold">{t('tx.col.type')}</th>
                    <th className="text-right px-4 py-3 font-semibold">{t('tx.col.amount')} ({displayCcy})</th>
                    <th className="text-right px-4 py-3 font-semibold">{t('tx.col.original')}</th>
                    <th className="text-center px-4 py-3 font-semibold">{t('tx.col.currency')}</th>
                    <th className="text-left px-4 py-3 font-semibold">{t('tx.col.description')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {tableRows.map(row => {
                    const meta = TX_TYPE_META[row.type]
                    const signed =
                      ['loss', 'fee', 'withdrawal'].includes(row.type)
                        ? -Math.abs(row.converted_amount)
                        : row.converted_amount
                    return (
                      <tr key={row.id} style={meta ? { backgroundColor: meta.bg + '60' } : undefined}>
                        <td className="px-5 py-3 text-slate-700 whitespace-nowrap">{formatDate(row.date, lang)}</td>
                        <td className="px-4 py-3">{typeBadge(row.type, lang)}</td>
                        <td
                          className="px-4 py-3 text-right font-semibold whitespace-nowrap"
                          style={{ color: meta?.fg || '#1E293B' }}
                        >
                          {formatMoney(signed, { currency: displayCcy, lang, sign: true })}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                          {formatOriginal(row.original_amount)}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-500">{row.original_currency}</td>
                        <td className="px-4 py-3 text-slate-600">{row.description || dash}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile cards — vue compacte avec montant à droite */}
            <div className="md:hidden divide-y divide-slate-50 print:hidden">
              {tableRows.map(row => {
                const meta = TX_TYPE_META[row.type]
                const signed =
                  ['loss', 'fee', 'withdrawal'].includes(row.type)
                    ? -Math.abs(row.converted_amount)
                    : row.converted_amount
                return (
                  <div key={row.id} className="px-3.5 py-3" style={meta ? { backgroundColor: meta.bg + '38' } : undefined}>
                    <div className="flex items-start justify-between gap-3 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          {typeBadge(row.type, lang)}
                          <span className="text-[11px] text-slate-500">{formatDate(row.date, lang)}</span>
                        </div>
                        {row.description && (
                          <div className="text-[12px] text-slate-600 mt-1 leading-snug break-words">
                            {row.description}
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div
                          className="text-[14px] font-semibold tabular-nums whitespace-nowrap"
                          style={{ color: meta?.fg || '#1E293B' }}
                        >
                          {formatMoney(signed, { currency: displayCcy, lang, sign: true })}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                          {formatOriginal(row.original_amount)} {row.original_currency}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {(data.report?.signature_url || data.report?.signature_name) && (
        <div className="bg-white rounded-xl shadow-sm p-5 print:shadow-none print:border print:border-slate-200">
          <div className="ml-auto w-full max-w-xs text-center">
            <div
              className="h-20 flex items-end justify-center border-b"
              style={{ borderColor: 'var(--color-secondary, #C9A249)' }}
            >
              {data.report?.signature_url && (
                <img
                  src={data.report.signature_url}
                  alt={t('reports.signature')}
                  className="max-h-14 max-w-[14rem] object-contain"
                />
              )}
            </div>
            <div className="mt-2 text-[11px] font-semibold text-slate-800">{t('reports.signature')}</div>
            {data.report?.signature_name && (
              <div className="text-[11px] text-slate-400 mt-0.5">{data.report.signature_name}</div>
            )}
          </div>
        </div>
      )}

      <div className="text-center text-[10px] text-slate-400 pt-6 print:pt-4">
        {generatedLabel ? `${generatedLabel} - ` : ''}{new Date().getFullYear()} {company?.company_name || 'Valmere & Co'} - {t('reports.footer_auto')}
      </div>
    </div>
  )
}
