import { useEffect, useState } from 'react'
import { getAbout } from '../../api/about.api'
import { useBrandStore } from '../../store/brand.store'

/* ── Professional line icons ─────────────────────────────────── */
const Icons = {
  mission: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  vision: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M3 8a9 9 0 1 1 .8 9" />
      <polyline points="3 4 3 9 8 9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  services: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  team: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  contact: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.58 3.38 2 2 0 0 1 3.55 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.5a16 16 0 0 0 6 6l.92-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
}

const SECTIONS = [
  { key: 'mission', label: 'Notre mission' },
  { key: 'vision', label: 'Notre vision' },
  { key: 'history', label: 'Notre histoire' },
  { key: 'services', label: 'Nos services' },
  { key: 'team', label: "L'équipe" },
  { key: 'contact_info', label: 'Contact', iconKey: 'contact' },
]

export default function InvestorAboutPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const { company } = useBrandStore()

  useEffect(() => {
    getAbout()
      .then(setData)
      .catch(e => setErr(e?.response?.data?.detail || 'Impossible de charger la page À propos'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">Chargement…</div>
  }

  if (err) {
    return (
      <div className="p-4 md:p-8 max-w-4xl">
        <div className="px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 border border-red-100">{err}</div>
      </div>
    )
  }

  const hasContent = data && SECTIONS.some(s => (data[s.key] || '').trim())

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      {/* Hero */}
      <div
        className="rounded-2xl p-6 md:p-10 mb-6 text-white relative overflow-hidden"
        style={{ background: 'var(--color-primary)' }}
      >
        <div className="relative">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-70 mb-2">À propos</div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">
            {company?.company_name || 'Notre entreprise'}
          </h1>
          {company?.company_type && (
            <p className="text-sm md:text-base opacity-80">{company.company_type}</p>
          )}
        </div>
      </div>

      {!hasContent && (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center text-sm text-slate-400">
          Aucune information n'a encore été renseignée. Revenez bientôt !
        </div>
      )}

      <div className="grid gap-4">
        {SECTIONS.map(section => {
          const value = (data?.[section.key] || '').trim()
          if (!value) return null
          const icon = Icons[section.iconKey || section.key]
          return (
            <div key={section.key} className="bg-white rounded-xl shadow-sm p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(26,58,92,0.08)', color: 'var(--color-primary)' }}
                >
                  {icon}
                </div>
                <h3 className="font-semibold text-slate-800 text-base">{section.label}</h3>
              </div>
              <p className="text-sm md:text-[15px] text-slate-700 whitespace-pre-wrap leading-relaxed pl-12">
                {value}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
