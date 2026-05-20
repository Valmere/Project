import { useBrandStore } from '../../store/brand.store'

/**
 * Bandeau de marque pour les pages comptables — reprend le rendu du relevé
 * de compte investisseur (StatementViewer) afin que les documents imprimés
 * (Plan comptable, Journal, États financiers) portent la même identité que
 * les relevés : logo, nom de société, titre doré.
 *
 * Props :
 *   - title      : titre principal (ex: "États financiers")
 *   - subtitle   : ligne secondaire optionnelle (date, devise, période)
 *   - right      : slot à droite du bandeau (hors impression) pour actions
 */
export default function AccountingHeader({ title, subtitle, right }) {
  const company = useBrandStore(s => s.company)
  return (
    <div className="rounded-2xl overflow-hidden shadow-sm print:shadow-none print:rounded-none">
      <div
        className="relative p-4 sm:p-5 md:p-7 text-white"
        style={{
          background:
            'linear-gradient(135deg, var(--color-primary) 0%, #17304D 58%, #0F766E 140%)',
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--color-secondary-rgb) / 0.70), transparent)' }}
        />
        {/* En-tête : titre + (sur desktop) actions sur la même ligne. Sur mobile,
            les actions passent en-dessous, en flex-wrap pour ne jamais déborder. */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            {company?.logo_url && (
              <img
                src={company.logo_url}
                alt={company.company_name || 'Logo'}
                className="h-10 sm:h-12 md:h-14 object-contain flex-shrink-0"
                style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' }}
              />
            )}
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] md:text-xs font-semibold tracking-[0.14em] uppercase opacity-80 truncate">
                {company?.company_name || 'Valmere & Co'}
              </div>
              <div className="text-base sm:text-lg md:text-xl font-bold tracking-tight mt-0.5 truncate">
                {title}
              </div>
              {subtitle && (
                <div className="text-[11px] sm:text-[12px] md:text-sm mt-1 break-words" style={{ color: 'var(--color-secondary, #C9A84C)' }}>
                  {subtitle}
                </div>
              )}
            </div>
          </div>
          {right && (
            <div className="print:hidden flex flex-wrap items-center gap-2 sm:flex-shrink-0 sm:justify-end accounting-header-actions">
              {right}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
