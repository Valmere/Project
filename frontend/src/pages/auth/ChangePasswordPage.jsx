import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { useAuthStore } from '../../store/auth.store'
import { useT } from '../../store/prefs.store'

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
      setError('Le nouveau mot de passe doit contenir au moins 8 caractères')
      return
    }
    if (newPassword !== confirm) {
      setError('Les deux nouveaux mots de passe ne correspondent pas')
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
      setError(err.response?.data?.detail || 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-subtle)' }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6 sm:p-8">
        <h1 className="text-xl font-semibold text-slate-800 mb-1">
          {forced ? 'Changement de mot de passe obligatoire' : 'Changer de mot de passe'}
        </h1>
        <p className="text-[13px] text-slate-500 mb-6">
          {forced
            ? "Votre mot de passe actuel est temporaire. Choisissez-en un nouveau pour accéder à votre espace."
            : "Saisissez votre mot de passe actuel puis le nouveau."}
        </p>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Mot de passe actuel</label>
            <input
              type="password" required autoFocus
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Nouveau mot de passe</label>
            <input
              type="password" required minLength={8}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
            <p className="text-[11px] text-slate-400 mt-1">Au moins 8 caractères.</p>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Confirmation</label>
            <input
              type="password" required minLength={8}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {saving ? 'Enregistrement…' : 'Changer le mot de passe'}
          </button>

          {forced && (
            <button
              type="button"
              onClick={() => { logout(); navigate('/login') }}
              className="w-full text-xs text-slate-400 hover:text-slate-600 mt-2"
            >
              Me déconnecter
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
