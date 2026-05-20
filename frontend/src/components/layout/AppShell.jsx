import { useMemo, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { useT } from '../../store/prefs.store'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

function TabIcon({ type }) {
  const icons = {
    dashboard: <path d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z" />,
    investors: <path d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a5.5 5.5 0 0 1 11 0M16.5 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM15 16a4.5 4.5 0 0 1 6 4" />,
    transactions: <path d="M3 7.5h18v10H3zM3 10.5h18M7 15h4" />,
    reports: <path d="M7 3h7l4 4v14H7zM14 3v5h4M10 13h5M10 17h5" />,
    messages: <path d="M4 5h16v11H8l-4 4z" />,
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      {icons[type]}
    </svg>
  )
}

function BottomNav({ user, t }) {
  const isInvestor = user?.role === 'investor'
  const tabs = useMemo(() => (
    isInvestor
      ? [
          { to: '/investor', label: t('nav.mobile.dashboard'), icon: 'dashboard', end: true },
          { to: '/investor/transactions', label: t('nav.mobile.transactions'), icon: 'transactions' },
          { to: '/investor/reports', label: t('nav.mobile.reports'), icon: 'reports' },
          { to: '/investor/messages', label: t('nav.mobile.messages'), icon: 'messages' },
        ]
      : [
          { to: '/admin', label: t('nav.mobile.dashboard'), icon: 'dashboard', end: true },
          { to: '/admin/investors', label: t('nav.mobile.investors'), icon: 'investors' },
          { to: '/admin/transactions', label: t('nav.mobile.transactions'), icon: 'transactions' },
          { to: '/admin/reports', label: t('nav.mobile.reports'), icon: 'reports' },
        ]
  ), [isInvestor, t])

  return (
    <nav className="mobile-bottom-nav md:hidden" aria-label={t('nav.mobile.aria')}>
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => `mobile-tab ${isActive ? 'is-active' : ''}`}
        >
          <TabIcon type={tab.icon} />
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const user = useAuthStore(s => s.user)
  const t = useT()

  return (
    <div className="app-shell flex h-[100dvh] overflow-hidden app-main">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 md:hidden"
          style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`sidebar-frame fixed inset-y-0 left-0 z-30 w-60 shrink-0 transition-transform duration-200
          md:relative md:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar
          onMenuClick={() => setSidebarOpen(v => !v)}
          sidebarOpen={sidebarOpen}
        />
        <main className="flex-1 overflow-y-auto app-main mobile-safe-area">
          <div className="animate-in">
            <Outlet />
          </div>
        </main>
        <BottomNav user={user} t={t} />
      </div>
    </div>
  )
}
