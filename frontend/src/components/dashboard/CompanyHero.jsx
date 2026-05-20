import { useT } from '../../store/prefs.store'

function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-5 h-5">
      <path d="M3 21h18" />
      <path d="M5 21V7l8-4v18" />
      <path d="M19 21V11l-6-4" />
      <path d="M8 9h2M8 13h2M8 17h2" />
    </svg>
  )
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className="w-8 h-8">
      <path d="M16 2l2.5 10.7L29 16l-10.5 3.3L16 30l-2.5-10.7L3 16l10.5-3.3L16 2z" />
    </svg>
  )
}

export default function CompanyHero({ balance, globalValue, share }) {
  const t = useT()

  return (
    <section className="company-hero" aria-label={t('kpi.company_account')}>
      <div className="company-hero-watermark" aria-hidden="true">V</div>
      <div className="company-hero-rail" aria-hidden="true" />
      <div className="company-hero-spark" aria-hidden="true">
        <SparkIcon />
      </div>

      <div className="company-hero-main">
        <div className="company-hero-heading">
          <div className="company-hero-icon">
            <BuildingIcon />
          </div>
          <div>
            <div className="company-hero-kicker">{t('kpi.company_account')}</div>
            <div className="company-hero-subtitle">{t('kpi.company_subtitle')}</div>
          </div>
        </div>

        <div className="company-hero-balance">
          <div className="premium-label company-hero-label">{t('kpi.company_balance')}</div>
          <div className="premium-number company-hero-number">{balance}</div>
        </div>
      </div>

      <div className="company-hero-side">
        <div className="company-hero-metric">
          <div className="premium-label">{t('kpi.global_va')}</div>
          <div className="premium-number">{globalValue}</div>
        </div>
        <div className="company-hero-divider" aria-hidden="true" />
        <div className="company-hero-metric company-hero-share">
          <div className="premium-label">{t('kpi.company_share')}</div>
          <div className="premium-number">{share}</div>
        </div>
      </div>
    </section>
  )
}
