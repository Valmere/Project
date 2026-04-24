import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth.store'
import { useBrandStore } from './store/brand.store'
import { useRatesStore } from './store/rates.store'
import { getCompany } from './api/company.api'

import AppShell from './components/layout/AppShell'
import LoginPage from './pages/auth/LoginPage'
import ChangePasswordPage from './pages/auth/ChangePasswordPage'
import AdminDashboard from './pages/admin/AdminDashboard'
import InvestorListPage from './pages/admin/InvestorListPage'
import InvestorDetailPage from './pages/admin/InvestorDetailPage'
import TransactionsPage from './pages/admin/TransactionsPage'
import ReportsPage from './pages/admin/ReportsPage'
import MessagesPage from './pages/admin/MessagesPage'
import UserManagementPage from './pages/admin/UserManagementPage'
import CompanySettingsPage from './pages/admin/CompanySettingsPage'
import CurrencyRatesPage from './pages/admin/CurrencyRatesPage'
import AdminAboutPage from './pages/admin/AboutPage'
import AdminFaqPage from './pages/admin/FaqPage'
import ChartOfAccountsPage from './pages/admin/accounting/ChartOfAccountsPage'
import JournalPage from './pages/admin/accounting/JournalPage'
import StatementsPage from './pages/admin/accounting/StatementsPage'
import InvestorDashboard from './pages/investor/InvestorDashboard'
import MyTransactionsPage from './pages/investor/MyTransactionsPage'
import MyReportsPage from './pages/investor/MyReportsPage'
import SendMessagePage from './pages/investor/SendMessagePage'
import InvestorAboutPage from './pages/investor/AboutPage'
import InvestorFaqPage from './pages/investor/FaqPage'
import ReportViewerPage from './pages/ReportViewerPage'

function ProtectedRoute({ children, allowedRoles }) {
  const { token, user } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (allowedRoles && !allowedRoles.includes(user?.role)) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const { setCompany } = useBrandStore()
  const loadRates = useRatesStore(s => s.load)
  const { token } = useAuthStore()

  useEffect(() => {
    getCompany().then(setCompany).catch(() => {})
  }, [])

  useEffect(() => {
    if (token) loadRates()
  }, [token, loadRates])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/change-password" element={
          <ProtectedRoute>
            <ChangePasswordPage />
          </ProtectedRoute>
        } />

        <Route path="/admin" element={
          <ProtectedRoute allowedRoles={['admin', 'analyst']}>
            <AppShell />
          </ProtectedRoute>
        }>
          <Route index element={<AdminDashboard />} />
          <Route path="investors" element={<InvestorListPage />} />
          <Route path="investors/:id" element={<InvestorDetailPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="users" element={<UserManagementPage />} />
          <Route path="settings" element={<CompanySettingsPage />} />
          <Route path="currency-rates" element={<CurrencyRatesPage />} />
          <Route path="about" element={<AdminAboutPage />} />
          <Route path="faq" element={<AdminFaqPage />} />
          <Route path="reports/:id" element={<ReportViewerPage />} />
          <Route path="accounting/chart" element={<ChartOfAccountsPage />} />
          <Route path="accounting/journal" element={<JournalPage />} />
          <Route path="accounting/statements" element={<StatementsPage />} />
        </Route>

        <Route path="/investor" element={
          <ProtectedRoute allowedRoles={['investor', 'admin']}>
            <AppShell />
          </ProtectedRoute>
        }>
          <Route index element={<InvestorDashboard />} />
          <Route path="transactions" element={<MyTransactionsPage />} />
          <Route path="reports" element={<MyReportsPage />} />
          <Route path="messages" element={<SendMessagePage />} />
          <Route path="about" element={<InvestorAboutPage />} />
          <Route path="faq" element={<InvestorFaqPage />} />
          <Route path="reports/:id" element={<ReportViewerPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
