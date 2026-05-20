import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { useAuthStore } from '../../store/auth.store'
import { useT } from '../../store/prefs.store'
import PasswordInput from '../../components/ui/PasswordInput'

/**
 * Écran obligatoire à la première connexion (quand must_change_password=true).
 * Pas de sidebar, pas de navigation — l'utilisateur ne peut rien faire d'autre
 * tant qu'il n'a pas changé son mot de passe temporaire.
 */
export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const t = useT()
  const { user, setAuth, token, logout } = useAuthStore()
  const forced = !!user?.must_change_password

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (newPassword.length < 8) {
      setError(t('change_password.min_error'))
      return
    }
    if (newPassword !== confirm) {
      setError(t('change_password.match_error'))
      return
    }
    setSaving(true)
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      // Mise à jour de l'état local: le flag must_change_password est purgé
      setAuth(token, { ...(user || {}), must_change_password: false })
      navigate(user?.role === 'investor' ? '/investor' : '/admin')
    } catch (err) {
      setError(err.response?.data?.detail || t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 app-main">
      <div className="w-full max-w-md bg-white/90 rounded-2xl shadow-[var(--shadow-card)] border border-white/70 p-6 sm:p-8 backdrop-blur">
        <h1 className="text-xl font-semibold text-slate-800 mb-1">
          {forced ? t('change_password.title_forced') : t('change_password.title')}
        </h1>
        <p className="text-[13px] text-slate-500 mb-6">
          {forced
            ? t('change_password.desc_forced')
            : t('change_password.desc')}
        </p>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('security.password.current')}</label>
            <PasswordInput
              required autoFocus
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('security.password.new')}</label>
            <PasswordInput
              required minLength={8}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
            <p className="text-[11px] text-slate-400 mt-1">{t('change_password.min_hint')}</p>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('security.password.confirm')}</label>
            <PasswordInput
              required minLength={8}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {saving ? t('common.saving') : t('change_password.submit')}
          </button>

          {forced && (
            <button
              type="button"
              onClick={() => { logout(); navigate('/login') }}
              className="w-full text-xs text-slate-400 hover:text-slate-600 mt-2"
            >
              {t('common.logout')}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
