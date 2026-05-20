import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { useBrandStore } from '../../store/brand.store'
import { useT } from '../../store/prefs.store'
import api from '../../api/axios'

/* ── Icons ───────────────────────────────────────────────────── */
const Ic = {
  dashboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-[18px] h-[18px]"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  investors: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-[18px] h-[18px]"><circle cx="9" cy="7" r="3"/><path d="M3 21v-2a5 5 0 0 1 5-5h2"/><circle cx="17" cy="10" r="2.5"/><path d="M13 21v-1.5A3.5 3.5 0 0 1 16.5 16H17a3.5 3.5 0 0 1 3.5 3.5V21"/></svg>,
  transactions: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-[18px] h-[18px]"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4M14 15h2"/></svg>,
  messages: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-[18px] h-[18px]"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  reports: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-[18px] h-[18px]"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-[18px] h-[18px]"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-[18px] h-[18px]"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  rates: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-[18px] h-[18px]"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  contact: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-[18px] h-[18px]"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.58 3.38 2 2 0 0 1 3.55 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.5a16 16 0 0 0 6 6l.92-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  info: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-[18px] h-[18px]"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="0.6" fill="currentColor"/></svg>,
  faq: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-[18px] h-[18px]"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></svg>,
  ledger: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-[18px] h-[18px]"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/></svg>,
  tree: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-[18px] h-[18px]"><rect x="3" y="3" width="7" height="5" rx="1"/><rect x="14" y="10" width="7" height="5" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/><path d="M10 5.5H14M10 18.5H14V12.5"/></svg>,
  balance: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-[18px] h-[18px]"><path d="M12 3v18"/><path d="M6 7h12"/><path d="M6 7l-3 7a3 3 0 0 0 6 0z"/><path d="M18 7l-3 7a3 3 0 0 0 6 0z"/></svg>,
  approvals: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-[18px] h-[18px]"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 4.97-4.03 9-9 9a9 9 0 0 1-9-9 9 9 0 0 1 9-9c2.12 0 4.07.73 5.6 1.96"/></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
}

const adminLinks = [
  { section: 'nav.section.main' },
  { to: '/admin', labelKey: 'nav.dashboard', icon: 'dashboard', end: true },
  { to: '/admin/investors', labelKey: 'nav.investors', icon: 'investors' },
  { to: '/admin/transactions', labelKey: 'nav.transactions', icon: 'transactions' },
  { section: 'nav.section.management' },
  { to: '/admin/messages', labelKey: 'nav.messages', icon: 'messages' },
  { to: '/admin/reports', labelKey: 'nav.reports', icon: 'reports' },
  { to: '/admin/users', labelKey: 'nav.users', icon: 'users' },
  { to: '/admin/approvals', labelKey: 'nav.approvals', icon: 'approvals', fallback: 'Approbations', showBadge: true },
  { to: '/admin/currency-rates', labelKey: 'nav.currency_rates', icon: 'rates' },
  { section: 'nav.section.accounting', fallback: 'Comptabilité' },
  { to: '/admin/accounting/chart', labelKey: 'nav.accounting.chart', icon: 'tree', fallback: 'Plan comptable' },
  { to: '/admin/accounting/journal', labelKey: 'nav.accounting.journal', icon: 'ledger', fallback: 'Journal' },
  { to: '/admin/accounting/statements', labelKey: 'nav.accounting.statements', icon: 'balance', fallback: 'États financiers' },
  { section: 'nav.section.content', fallback: 'Contenu' },
  { to: '/admin/about', labelKey: 'nav.about', icon: 'info', fallback: 'À propos' },
  { to: '/admin/faq', labelKey: 'nav.faq', icon: 'faq', fallback: 'FAQ' },
  { to: '/admin/settings', labelKey: 'nav.settings', icon: 'settings' },
]

const investorLinks = [
  { section: 'nav.section.portfolio' },
  { to: '/investor', labelKey: 'nav.my_dashboard', icon: 'dashboard', end: true },
  { to: '/investor/transactions', labelKey: 'nav.my_transactions', icon: 'transactions' },
  { to: '/investor/reports', labelKey: 'nav.my_reports', icon: 'reports' },
  { section: 'nav.section.support' },
  { to: '/investor/messages', labelKey: 'nav.contact', icon: 'contact' },
  { to: '/investor/about', labelKey: 'nav.about', icon: 'info', fallback: 'À propos' },
  { to: '/investor/faq', labelKey: 'nav.faq', icon: 'faq', fallback: 'FAQ' },
]

export default function Sidebar({ onClose }) {
  const { user } = useAuthStore()
  const { company } = useBrandStore()
  const t = useT()
  const links = user?.role === 'investor' ? investorLinks : adminLinks
  const initials = user?.full_name?.charAt(0).toUpperCase() || '?'

  // Badge « approbations en attente » — visible à l'admin seulement.
  const [pendingCount, setPendingCount] = useState(0)
  useEffect(() => {
    if (user?.role !== 'admin') return
    let cancelled = false
    const fetchCount = () => {
      api.get('/approvals/pending-count')
        .then(r => { if (!cancelled) setPendingCount(r.data?.pending || 0) })
        .catch(() => {})
    }
    fetchCount()
    const id = setInterval(fetchCount, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [user?.role])

  return (
    <aside
      className="premium-sidebar w-60 h-full flex flex-col"
      style={{
        background: '#1A2740',
        boxShadow: 'inset -1px 0 0 rgba(201,162,73,0.16), 8px 0 28px rgba(26,39,64,0.14)',
      }}
    >
      {/* Brand */}
      <div className="flex-shrink-0 px-5 pt-5 pb-4 flex items-center gap-3">
        {company?.logo_url ? (
          <div className="min-w-0 flex-1 flex items-center gap-3">
            <img
              src={company.logo_url}
              alt={company.company_name || 'Logo'}
              className="h-9 w-auto object-contain flex-shrink-0"
              style={{ maxWidth: 120 }}
            />
            {company?.company_type && (
              <div className="text-white/35 text-[11px] truncate leading-tight">
                {company.company_type}
              </div>
            )}
          </div>
        ) : (
          <>
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-white font-bold text-[15px]"
              style={{ background: 'var(--color-secondary)' }}
            >
              {company?.company_name?.charAt(0) || 'V'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-white font-semibold text-[14px] leading-tight truncate">
                {company?.company_name || 'Valmere & Co'}
              </div>
              <div className="text-white/35 text-[11px] mt-0.5 truncate">
                {company?.company_type || t('app.tagline')}
              </div>
            </div>
          </>
        )}
        <button
          onClick={onClose}
          className="md:hidden p-1 text-white/40 hover:text-white transition-colors flex-shrink-0 ml-auto"
          aria-label="Fermer"
        >
          {Ic.close}
        </button>
      </div>

      <div className="mx-4 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)' }} />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        {links.map((item, i) =>
          item.section ? (
            <div
              key={`section-${i}`}
              className="px-3 pt-4 pb-1.5 text-[10px] font-semibold tracking-[0.09em] uppercase"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            >
              {t(item.section)}
            </div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-[9px] rounded-lg text-[13px] font-medium mb-0.5 transition-all duration-150 group
                ${isActive
                  ? 'text-white'
                  : 'hover:text-white/90'
                }`
              }
              style={({ isActive }) => isActive
                ? {
                    background: 'rgba(201,162,73,0.08)',
                    color: '#fff',
                    boxShadow: 'inset 0 0 0 1px rgba(201,162,73,0.08)',
                  }
                : { color: '#B8C0D0' }
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      className="absolute left-0 inset-y-[7px] w-[3px] rounded-r"
                      style={{ background: 'linear-gradient(180deg, #E5C57A, #C9A249)' }}
                    />
                  )}
                  <span className="flex-shrink-0 w-[18px]" style={{ color: isActive ? '#C9A249' : 'inherit' }}>{Ic[item.icon]}</span>
                  <span className="truncate flex-1">{t(item.labelKey)}</span>
                  {item.showBadge && user?.role === 'admin' && pendingCount > 0 && (
                    <span
                      className="flex-shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center"
                      style={{ background: 'var(--color-secondary)', color: '#1a1a1a' }}
                    >
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          )
        )}
      </nav>

      {/* User footer */}
      <div
        className="flex-shrink-0 px-3 py-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div
          className="flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-default"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.035))',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[11px] font-bold"
            style={{ background: '#C9A249', color: '#1A2740' }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-white/85 text-[13px] font-medium truncate leading-none">
              {user?.full_name}
            </div>
            <div className="text-white/35 text-[11px] capitalize mt-[3px]">{user?.role}</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
