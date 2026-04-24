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
        className="p-5 md:p-7 text-white"
        style={{ background: 'var(--color-primary)' }}
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            {company?.logo_url && (
              <img
                src={company.logo_url}
                alt={company.company_name || 'Logo'}
                className="h-12 md:h-14 object-contain"
                style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' }}
              />
            )}
            <div>
              <div className="text-[11px] md:text-xs font-semibold tracking-[0.14em] uppercase opacity-80">
                {company?.company_name || 'Valmere & Co'}
              </div>
              <div className="text-lg md:text-xl font-bold tracking-tight mt-0.5">
                {title}
              </div>
              {subtitle && (
                <div className="text-[12px] md:text-sm mt-1" style={{ color: 'var(--color-secondary, #C9A84C)' }}>
                  {subtitle}
                </div>
              )}
            </div>
          </div>
          {right && <div className="print:hidden flex-shrink-0">{right}</div>}
        </div>
      </div>
    </div>
  )
}
