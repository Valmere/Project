import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { usePrefsStore, useT, CURRENCIES } from '../../store/prefs.store'
import { LANGUAGES } from '../../i18n'
import { formatLongDate } from '../../utils/format'
import Select from '../ui/Select'
import api from '../../api/axios'

const PAGE_TITLE_KEYS = {
  '/admin': 'nav.dashboard',
  '/admin/investors': 'nav.investors',
  '/admin/transactions': 'nav.transactions',
  '/admin/reports': 'nav.reports',
  '/admin/messages': 'nav.messages',
  '/admin/users': 'nav.users',
  '/admin/currency-rates': 'nav.currency_rates',
  '/admin/settings': 'nav.settings',
  '/admin/security': 'common.my_account',
  '/investor': 'nav.my_dashboard',
  '/investor/transactions': 'nav.my_transactions',
  '/investor/reports': 'nav.my_reports',
  '/investor/messages': 'nav.contact',
  '/investor/security': 'common.my_account',
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

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 flex-shrink-0">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[18px] h-[18px]">
      <path d="M21 12.79A8.5 8.5 0 1 1 11.21 3 6.8 6.8 0 0 0 21 12.79z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[18px] h-[18px]">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
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

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
      <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[18px] h-[18px]">
      <polyline points="15 18 9 12 15 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Routes "racines" : on n'affiche pas le bouton retour dessus.
const ROOT_PATHS = new Set([
  '/admin', '/admin/', '/investor', '/investor/',
])

export default function Topbar({ onMenuClick, sidebarOpen = false }) {
  const { user, logout } = useAuthStore()
  const { lang, currency, theme, setLang, setCurrency, toggleTheme } = usePrefsStore()
  const t = useT()
  const location = useLocation()
  const navigate = useNavigate()
  const securityPath = user?.role === 'investor' ? '/investor/security' : '/admin/security'
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [, setReadNotificationIds] = useState(new Set())
  const dropdownRef = useRef(null)
  const notificationsRef = useRef(null)
  const readNotificationsRef = useRef(new Set())
  const notificationStorageKey = `valmere-notifications-read:${user?.id || user?.email || user?.role || 'anonymous'}`

  useEffect(() => {
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
      if (notificationsRef.current && !notificationsRef.current.contains(e.target)) {
        setNotificationsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!user) return
    try {
      const saved = JSON.parse(localStorage.getItem(notificationStorageKey) || '[]')
      const next = new Set(Array.isArray(saved) ? saved : [])
      readNotificationsRef.current = next
      setReadNotificationIds(next)
      setNotifications((prev) => prev.filter((item) => !next.has(item.id)))
    } catch {
      readNotificationsRef.current = new Set()
      setReadNotificationIds(new Set())
    }
  }, [notificationStorageKey, user])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const fetchNotifications = () => {
      api.get('/notifications')
        .then(r => {
          if (!cancelled) {
            const unread = (r.data?.items || []).filter(item => !readNotificationsRef.current.has(item.id))
            setNotifications(unread)
          }
        })
        .catch(() => {})
    }
    fetchNotifications()
    const id = setInterval(fetchNotifications, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [user?.id, user?.role])

  const titleKey = PAGE_TITLE_KEYS[location.pathname]
  const title = titleKey ? t(titleKey) : 'Valmere'
  // canGoBack : faux sur les routes racines, vrai sinon. On évite navigate(-1)
  // sur le dashboard pour ne pas sortir de l'app.
  const canGoBack = !ROOT_PATHS.has(location.pathname)
  const isDark = theme === 'dark'
  const themeLabel = isDark ? t('common.light_mode') : t('common.dark_mode')
  const initials = user?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'
  const notificationCount = notifications.length
  const locale = lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'fr-FR'

  const markNotificationRead = (item) => {
    if (!item?.id) return
    const next = new Set(readNotificationsRef.current)
    next.add(item.id)
    readNotificationsRef.current = next
    setReadNotificationIds(next)
    setNotifications((prev) => prev.filter((n) => n.id !== item.id))
    try {
      localStorage.setItem(notificationStorageKey, JSON.stringify(Array.from(next).slice(-250)))
    } catch {}
  }

  const notificationDate = (value) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString(locale, { day: '2-digit', month: 'short' })
  }

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
      className="relative z-40 flex-shrink-0 flex items-center px-3 sm:px-6 gap-1.5 sm:gap-3"
      style={{
        height: 'var(--topbar-h)',
        background: 'var(--topbar-bg)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-subtle)',
        boxShadow: 'var(--topbar-shadow)',
      }}
    >
      <button
        onClick={onMenuClick}
        className="md:hidden p-1.5 rounded-lg text-[var(--text-3)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-2)] transition-colors"
        aria-label={sidebarOpen ? t('common.close') : t('common.menu')}
        aria-expanded={sidebarOpen}
      >
        {sidebarOpen ? <CloseIcon /> : <MenuIcon />}
      </button>

      {/* Bouton retour : visible quand on n'est pas sur une racine. */}
      {canGoBack && (
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[12px] font-medium text-[var(--text-2)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)] transition-colors"
          aria-label={t('common.back')}
          title={t('common.back')}
        >
          <BackIcon />
          <span className="hidden sm:inline">{t('common.back')}</span>
        </button>
      )}

      <div className="flex-1 min-w-0">
        <h1 className="text-[14px] sm:text-[15px] font-semibold text-[var(--text-1)] leading-none truncate">
          {title}
        </h1>
        <p className="text-[11px] text-[var(--text-3)] mt-[3px] hidden md:block capitalize truncate">
          {formatLongDate(lang)}
        </p>
      </div>

      {/* Language switcher (desktop only — mobile/tablet use dropdown) */}
      <div className="hidden md:block">
        <Select
          value={lang}
          onChange={setLang}
          options={langOptions}
          size="sm"
          align="right"
          minWidth={120}
        />
      </div>

      {/* Currency switcher (desktop only — mobile/tablet use dropdown) */}
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

      <div className="hidden md:block w-px h-5 bg-[var(--border)]" />

      <button
        type="button"
        onClick={toggleTheme}
        className="btn btn-ghost btn-icon hidden md:inline-flex"
        aria-label={themeLabel}
        title={themeLabel}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
      </button>

      <div className="relative" ref={notificationsRef}>
        <button
          type="button"
          onClick={() => setNotificationsOpen((v) => !v)}
          className="relative btn btn-ghost btn-icon premium-notification"
          aria-label={t('topbar.notifications')}
          title={t('topbar.notifications')}
        >
          <BellIcon />
          {notificationCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#C9A249] text-[#1A2740] text-[10px] font-semibold leading-4 text-center">
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          )}
        </button>

        {notificationsOpen && (
          <div
            className="absolute right-0 top-full mt-2 w-[min(340px,calc(100vw-24px))] rounded-xl z-50 overflow-hidden animate-fade"
            style={{
              background: 'var(--bg-surface)',
              boxShadow: 'var(--shadow-dropdown)',
              border: '1px solid rgba(148,163,184,0.20)',
            }}
          >
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="text-[13px] font-semibold text-[var(--text-1)]">{t('topbar.notifications')}</div>
              <div className="text-[11px] text-[var(--text-3)]">{notificationCount}</div>
            </div>
            <div className="max-h-[360px] overflow-y-auto p-1.5">
              {notificationCount === 0 ? (
                <div className="px-3 py-5 text-center text-[13px] text-[var(--text-3)]">
                  {t('topbar.no_notifications')}
                </div>
              ) : notifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    markNotificationRead(item)
                    if (item.action_url) navigate(item.action_url)
                    setNotificationsOpen(false)
                  }}
                  className="w-full text-left rounded-lg px-3 py-2.5 hover:bg-[var(--bg-subtle)] transition-colors"
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className="mt-1 h-2 w-2 rounded-full flex-shrink-0"
                      style={{ background: item.severity === 'warning' ? '#C9A249' : 'var(--color-primary)' }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="block text-[13px] font-medium text-[var(--text-1)] truncate">{item.title}</span>
                        <span className="text-[10px] text-[var(--text-3)] whitespace-nowrap">{notificationDate(item.created_at)}</span>
                      </span>
                      <span className="block mt-0.5 text-[12px] leading-4 text-[var(--text-3)]">{item.body}</span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen((v) => !v)}
          className="flex items-center gap-2.5 pl-1 pr-1 sm:pr-2 py-1 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors"
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
            style={{ background: 'var(--color-primary)', border: '1px solid var(--color-secondary)' }}
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
            className="absolute right-0 top-full mt-2 w-60 rounded-xl z-50 overflow-visible animate-fade"
            style={{
              background: 'var(--bg-surface)',
              boxShadow: 'var(--shadow-dropdown)',
              border: '1px solid rgba(148,163,184,0.20)',
            }}
          >
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="text-[13px] font-semibold text-[var(--text-1)] truncate">
                {user?.full_name}
              </div>
              <div className="text-[11px] text-[var(--text-3)] capitalize mt-0.5">{user?.role}</div>
            </div>

            {/* Compact screens: keep hidden topbar controls reachable from the menu. */}
            <div className="md:hidden p-3 space-y-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
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
                onClick={toggleTheme}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[var(--text-2)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)] transition-colors text-left"
              >
                <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                  {isDark ? <SunIcon /> : <MoonIcon />}
                </span>
                {themeLabel}
              </button>
              <button
                onClick={() => { navigate(securityPath); setDropdownOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[var(--text-2)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)] transition-colors text-left"
              >
                <ShieldIcon />
                {t('common.my_account')}
              </button>
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
