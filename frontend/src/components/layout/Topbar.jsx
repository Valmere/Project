import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { usePrefsStore, useT, CURRENCIES } from '../../store/prefs.store'
import { LANGUAGES } from '../../i18n'
import { formatLongDate } from '../../utils/format'
import Select from '../ui/Select'

const PAGE_TITLE_KEYS = {
  '/admin': 'nav.dashboard',
  '/admin/investors': 'nav.investors',
  '/admin/transactions': 'nav.transactions',
  '/admin/reports': 'nav.reports',
  '/admin/messages': 'nav.messages',
  '/admin/users': 'nav.users',
  '/admin/currency-rates': 'nav.currency_rates',
  '/admin/settings': 'nav.settings',
  '/investor': 'nav.my_dashboard',
  '/investor/transactions': 'nav.my_transactions',
  '/investor/reports': 'nav.my_reports',
  '/investor/messages': 'nav.contact',
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[18px] h-[18px]">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 flex-shrink-0">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  )
}

export default function Topbar({ onMenuClick }) {
  const { user, logout } = useAuthStore()
  const { lang, currency, setLang, setCurrency } = usePrefsStore()
  const t = useT()
  const location = useLocation()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const titleKey = PAGE_TITLE_KEYS[location.pathname]
  const title = titleKey ? t(titleKey) : 'Valmere'
  const initials = user?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'

  const langOptions = LANGUAGES.map((l) => ({
    value: l.code,
    label: l.label,
    icon: <span className="text-base leading-none">{l.flag}</span>,
  }))

  const currencyOptions = CURRENCIES.map((c) => ({
    value: c.code,
    label: `${c.code} — ${c.label}`,
    icon: (
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold"
        style={{ background: 'var(--bg-subtle)', color: 'var(--text-2)' }}
      >
        {c.symbol}
      </span>
    ),
  }))

  return (
    <header
      className="flex-shrink-0 flex items-center px-3 sm:px-6 gap-1.5 sm:gap-3"
      style={{
        height: 'var(--topbar-h)',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <button
        onClick={onMenuClick}
        className="lg:hidden p-1.5 rounded-lg text-[var(--text-3)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-2)] transition-colors"
        aria-label="Menu"
      >
        <MenuIcon />
      </button>

      <div className="flex-1 min-w-0">
        <h1 className="text-[14px] sm:text-[15px] font-semibold text-[var(--text-1)] leading-none truncate">
          {title}
        </h1>
        <p className="text-[11px] text-[var(--text-3)] mt-[3px] hidden md:block capitalize truncate">
          {formatLongDate(lang)}
        </p>
      </div>

      {/* Language switcher */}
      <div className="hidden sm:block">
        <Select
          value={lang}
          onChange={setLang}
          options={langOptions}
          size="sm"
          align="right"
          minWidth={120}
        />
      </div>

      {/* Currency switcher */}
      <div className="hidden md:block">
        <Select
          value={currency}
          onChange={setCurrency}
          options={currencyOptions}
          size="sm"
          align="right"
          minWidth={130}
        />
      </div>

      <div className="hidden sm:block w-px h-5 bg-[var(--border)]" />

      <button
        className="relative btn btn-ghost btn-icon"
        aria-label={t('topbar.notifications')}
      >
        <BellIcon />
      </button>

      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen((v) => !v)}
          className="flex items-center gap-2.5 pl-1 pr-1 sm:pr-2 py-1 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors"
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
            style={{ background: 'var(--color-primary)' }}
          >
            {initials}
          </div>
          <div className="hidden sm:block text-left min-w-0">
            <div className="text-[13px] font-medium text-[var(--text-1)] leading-none max-w-[120px] truncate">
              {user?.full_name}
            </div>
            <div className="text-[11px] text-[var(--text-3)] capitalize mt-[2px]">
              {user?.role}
            </div>
          </div>
          <span className="hidden sm:flex text-[var(--text-3)]">
            <ChevronIcon />
          </span>
        </button>

        {dropdownOpen && (
          <div
            className="absolute right-0 top-full mt-2 w-60 rounded-xl z-50 overflow-hidden animate-fade"
            style={{
              background: 'var(--bg-surface)',
              boxShadow: 'var(--shadow-dropdown)',
              border: '1px solid var(--border)',
            }}
          >
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="text-[13px] font-semibold text-[var(--text-1)] truncate">
                {user?.full_name}
              </div>
              <div className="text-[11px] text-[var(--text-3)] capitalize mt-0.5">{user?.role}</div>
            </div>

            {/* Mobile-only lang + currency inside dropdown */}
            <div className="sm:hidden p-3 space-y-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <Select
                label={t('common.language')}
                value={lang}
                onChange={setLang}
                options={langOptions}
                size="sm"
                fullWidth
              />
              <Select
                label={t('common.currency')}
                value={currency}
                onChange={setCurrency}
                options={currencyOptions}
                size="sm"
                fullWidth
              />
            </div>

            <div className="p-1.5">
              <button
                onClick={() => { logout(); setDropdownOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[var(--text-2)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)] transition-colors text-left"
              >
                <LogoutIcon />
                {t('common.logout')}
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
