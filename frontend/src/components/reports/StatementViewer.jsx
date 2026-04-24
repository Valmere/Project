import { useMemo } from 'react'
import { formatMoney } from '../../utils/format'

/* ── Transaction type styling (mirrors Excel output) ─────────── */
export const TX_TYPE_META = {
  initial:    { bg: '#EFF6FF', fg: '#1E40AF', label: { fr: 'Apport initial', en: 'Initial capital', es: 'Capital inicial' } },
  deposit:    { bg: '#EFF6FF', fg: '#1D4ED8', label: { fr: 'Dépôt',          en: 'Deposit',         es: 'Depósito' } },
  withdrawal: { bg: '#FFF7ED', fg: '#C2410C', label: { fr: 'Retrait',        en: 'Withdrawal',      es: 'Retiro' } },
  gain:       { bg: '#ECFDF5', fg: '#047857', label: { fr: 'Gain',           en: 'Gain',            es: 'Ganancia' } },
  loss:       { bg: '#FEF2F2', fg: '#B91C1C', label: { fr: 'Perte',          en: 'Loss',            es: 'Pérdida' } },
  fee:        { bg: '#F5F3FF', fg: '#6D28D9', label: { fr: 'Frais',          en: 'Fee',             es: 'Comisión' } },
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
    <div className="bg-white rounded-xl shadow-sm p-4 print:shadow-none print:border print:border-slate-200">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-lg md:text-xl font-bold mt-1.5 break-all" style={{ color: accent || 'var(--color-primary)' }}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-slate-400 mt-1">{hint}</div>}
    </div>
  )
}

/**
 * Affiche un relevé de compte (bandeau, KPIs, historique) — même rendu que
 * l'Excel généré, en version web. Reçoit les données déjà chargées depuis
 * /reports/{id}/view ou /reports/my/preview.
 */
export default function StatementViewer({ data, lang = 'fr' }) {
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
      description: "Apport initial à l'ouverture du compte",
    }
    return [initial, ...txs]
  }, [data, txs])

  if (!data) return null

  const periodLabel = data.period?.start || data.period?.end
    ? `Période : ${data.period.start || '—'} → ${data.period.end || '—'}`
    : 'Toutes les transactions'

  const generatedLabel = data.report?.generated_at
    ? `Généré le ${new Date(data.report.generated_at).toLocaleDateString('fr-FR', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })}`
    : null

  return (
    <div className="statement-viewer space-y-5">
      {/* Banner */}
      <div
        className="rounded-2xl overflow-hidden shadow-sm print:shadow-none print:rounded-none"
        style={{ background: 'var(--color-primary)' }}
      >
        <div className="p-6 md:p-8 text-center text-white">
          {company?.logo_url && (
            <img
              src={company.logo_url}
              alt={company.company_name || 'Logo'}
              className="h-14 mx-auto mb-3 object-contain"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' }}
            />
          )}
          <div className="text-xl md:text-2xl font-bold tracking-tight">
            {company?.company_name || 'Valmere & Co'}
          </div>
          <div className="text-[12px] md:text-sm font-semibold tracking-[0.14em] uppercase mt-2" style={{ color: 'var(--color-secondary, #C9A84C)' }}>
            Relevé de compte
          </div>
          {generatedLabel && (
            <div className="text-[11px] opacity-70 mt-1">{generatedLabel}</div>
          )}
        </div>
      </div>

      {/* Investor card */}
      <div className="bg-white rounded-xl shadow-sm p-4 md:p-5 print:shadow-none print:border print:border-slate-200">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Investisseur</div>
            <div className="text-lg font-bold text-slate-800">{data.investor.full_name}</div>
            <div className="text-[12px] text-slate-500 mt-0.5">
              Code : <span className="font-mono">{data.investor.code}</span>
              {data.investor.entry_date && <> · Entrée : {data.investor.entry_date}</>}
              {data.investor.status && <> · <span className="uppercase">{data.investor.status}</span></>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Période</div>
            <div className="text-sm font-medium text-slate-700">{periodLabel}</div>
          </div>
        </div>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          label="Capital initial"
          value={formatMoney(summary.initial, { currency: displayCcy, lang })}
          hint={data.investor.entry_date}
        />
        <StatTile
          label="Valeur actuelle"
          value={formatMoney(summary.current, { currency: displayCcy, lang })}
        />
        <StatTile
          label="Gain / Perte"
          value={formatMoney(summary.pnl, { currency: displayCcy, lang, sign: true })}
          accent={summary.pnl >= 0 ? '#047857' : '#B91C1C'}
        />
        <StatTile
          label="Rendement (ROI)"
          value={`${summary.roi_pct >= 0 ? '+' : ''}${summary.roi_pct.toFixed(2)}%`}
          accent={summary.roi_pct >= 0 ? '#047857' : '#B91C1C'}
        />
      </div>

      {/* Transactions */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden print:shadow-none print:border print:border-slate-200">
        <div className="px-4 md:px-6 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 text-sm">Historique des transactions</h3>
          <span className="text-[11px] text-slate-400">{tableRows.length} ligne{tableRows.length > 1 ? 's' : ''}</span>
        </div>
        {tableRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Aucune transaction sur cette période.</div>
        ) : (
          <>
            {/* Desktop + print table */}
            <div className="hidden md:block overflow-x-auto print:block">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold">Date</th>
                    <th className="text-left px-4 py-3 font-semibold">Type</th>
                    <th className="text-right px-4 py-3 font-semibold">Montant ({displayCcy})</th>
                    <th className="text-right px-4 py-3 font-semibold">Montant d'origine</th>
                    <th className="text-center px-4 py-3 font-semibold">Devise</th>
                    <th className="text-left px-4 py-3 font-semibold">Description</th>
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
                        <td className="px-5 py-3 text-slate-700 whitespace-nowrap">{row.date}</td>
                        <td className="px-4 py-3">{typeBadge(row.type, lang)}</td>
                        <td
                          className="px-4 py-3 text-right font-semibold whitespace-nowrap"
                          style={{ color: meta?.fg || '#1E293B' }}
                        >
                          {formatMoney(signed, { currency: displayCcy, lang, sign: true })}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                          {Number(row.original_amount || 0).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {
                            minimumFractionDigits: 2, maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-500">{row.original_currency}</td>
                        <td className="px-4 py-3 text-slate-600">{row.description || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile cards — hidden on print */}
            <div className="md:hidden divide-y divide-slate-50 print:hidden">
              {tableRows.map(row => {
                const meta = TX_TYPE_META[row.type]
                const signed =
                  ['loss', 'fee', 'withdrawal'].includes(row.type)
                    ? -Math.abs(row.converted_amount)
                    : row.converted_amount
                return (
                  <div key={row.id} className="p-4" style={meta ? { backgroundColor: meta.bg + '40' } : undefined}>
                    <div className="flex items-center justify-between mb-1.5">
                      {typeBadge(row.type, lang)}
                      <span className="text-[11px] text-slate-400">{row.date}</span>
                    </div>
                    <div className="text-base font-semibold" style={{ color: meta?.fg || '#1E293B' }}>
                      {formatMoney(signed, { currency: displayCcy, lang, sign: true })}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {Number(row.original_amount || 0).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {
                        minimumFractionDigits: 2, maximumFractionDigits: 2,
                      })} {row.original_currency}
                    </div>
                    {row.description && (
                      <div className="text-xs text-slate-600 mt-1.5">{row.description}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Print footer */}
      <div className="hidden print:block text-center text-[10px] text-slate-400 pt-6">
        © {new Date().getFullYear()} {company?.company_name || 'Valmere & Co'} — Document généré automatiquement
      </div>
    </div>
  )
}
