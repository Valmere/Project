import { useEffect, useState } from 'react'
import { Check, Edit3, KeyRound, Power, Trash2, X } from 'lucide-react'
import api from '../../api/axios'
import { useAuthStore } from '../../store/auth.store'
import Badge from '../../components/ui/Badge'
import PasswordInput from '../../components/ui/PasswordInput'
import { usePrefsStore, useT } from '../../store/prefs.store'
import { formatDate } from '../../utils/format'
import ExpandableRow, { DetailRow, ActionGroup } from '../../components/ui/ExpandableRow'

const roleVariant = { admin: 'red', cashier: 'blue', investor: 'green' }

function ActionIconButton({ label, tone = 'slate', children, className = '', ...props }) {
  const tones = {
    slate: 'text-slate-500 hover:text-[var(--color-primary)] hover:bg-[var(--bg-subtle)]',
    green: 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50',
    amber: 'text-amber-600 hover:text-amber-700 hover:bg-amber-50',
    red: 'text-rose-500 hover:text-rose-700 hover:bg-rose-50',
  }
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-40 ${tones[tone] || tones.slate} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export default function UserManagementPage() {
  const t = useT()
  const { lang } = usePrefsStore()
  const { token, user: currentUser, setAuth } = useAuthStore()
  const currentUserId = currentUser?.id
  const [users, setUsers] = useState([])
  const [investors, setInvestors] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', username: '', password: '', role: 'investor', investor_id: '' })
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ full_name: '', email: '', username: '' })

  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data))
    api.get('/investors').then(r => setInvestors(r.data))
  }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const payload = {
        ...form,
        investor_id: form.investor_id || null,
      }
      const res = await api.post('/users', payload)
      setUsers(prev => [res.data, ...prev])
      setShowForm(false)
      setForm({ full_name: '', email: '', username: '', password: '', role: 'investor', investor_id: '' })
    } catch (err) {
      setError(err.response?.data?.detail || t('users.error_create'))
    }
  }

  const handleToggleActive = async (user) => {
    const res = await api.put(`/users/${user.id}`, { is_active: !user.is_active })
    setUsers(prev => prev.map(u => u.id === user.id ? res.data : u))
  }

  const handleLinkInvestor = async (user, investorId) => {
    const res = await api.put(`/users/${user.id}`, { investor_id: investorId || null })
    setUsers(prev => prev.map(u => u.id === user.id ? res.data : u))
  }

  const startEditUser = (user) => {
    setEditingId(user.id)
    setEditForm({
      full_name: user.full_name || '',
      email: user.email || '',
      username: user.username || '',
    })
  }

  const handleSaveUser = async (user) => {
    try {
      const res = await api.put(`/users/${user.id}`, {
        full_name: editForm.full_name.trim(),
        email: editForm.email.trim(),
        username: editForm.username.trim(),
      })
      setUsers(prev => prev.map(u => u.id === user.id ? res.data : u))
      if (user.id === currentUserId) {
        setAuth(token, { ...(currentUser || {}), ...res.data })
      }
      setEditingId(null)
    } catch (err) {
      window.alert(err.response?.data?.detail || t('users.error_update'))
    }
  }

  // Suppression définitive d'un utilisateur. Le backend bloque :
  //   - la suppression de soi-même
  //   - la suppression du dernier admin actif
  // Pour conserver l'historique, préférer Désactiver — c'est rappelé dans la
  // confirmation pour orienter l'admin vers la bonne action.
  const handleDeleteUser = async (user) => {
    if (user.id === currentUserId) {
      window.alert("Vous ne pouvez pas supprimer votre propre compte.")
      return
    }
    const confirmMsg =
      `Supprimer DÉFINITIVEMENT le compte de ${user.full_name} (${user.email}) ?\n\n`
      + `⚠ Action irréversible : le compte sera entièrement effacé.\n`
      + `Pour conserver l'historique, fermez plutôt l'accès via "Désactiver".\n\n`
      + `Confirmer la suppression ?`
    if (!window.confirm(confirmMsg)) return

    setDeletingId(user.id)
    try {
      await api.delete(`/users/${user.id}`)
      setUsers(prev => prev.filter(u => u.id !== user.id))
    } catch (err) {
      const detail = err.response?.data?.detail
      window.alert(typeof detail === 'string' ? detail : t('users.delete_failed'))
    } finally {
      setDeletingId(null)
    }
  }

  const handleResetPassword = async (user) => {
    const custom = window.prompt(
      `Réinitialiser le mot de passe de ${user.full_name} (${user.email}).\n\n` +
      `Laissez VIDE pour générer un mot de passe temporaire,\n` +
      `ou saisissez un mot de passe (min. 8 caractères).`,
      ''
    )
    if (custom === null) return
    try {
      const res = await api.put(`/users/${user.id}/password`, {
        new_password: custom.trim() || null,
        force_change_on_next_login: true,
      })
      if (res.data.temp_password) {
        window.alert(
          `Mot de passe temporaire pour ${res.data.email} :\n\n` +
          `  ${res.data.temp_password}\n\n` +
          `Communiquez-le à l'utilisateur. Il sera invité à le changer à la prochaine connexion.`
        )
      } else {
        window.alert(`Mot de passe réinitialisé pour ${res.data.email}.`)
      }
    } catch (err) {
      window.alert(err.response?.data?.detail || 'Erreur lors de la réinitialisation')
    }
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
        <h2 className="text-xl font-bold text-slate-800">{t('users.title')}</h2>
        <button onClick={() => setShowForm(!showForm)}
          className="w-full sm:w-auto px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: 'var(--color-primary)' }}>
          {t('users.new')}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl shadow-sm p-4 md:p-6 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <h3 className="md:col-span-2 font-semibold text-slate-700">{t('users.form_title')}</h3>
          {error && <div className="md:col-span-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>}
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('users.full_name_required')}</label>
            <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Email *</label>
            <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('users.username_required')}</label>
            <input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
            <p className="text-xs text-slate-400 mt-1">{t('users.username_hint')}</p>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('users.password_required')}</label>
            <PasswordInput value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required minLength={8}
              autoComplete="new-password"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('users.role_required')}</label>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value, investor_id: '' }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
              <option value="admin">{t('role.admin')}</option>
              <option value="cashier">{t('role.cashier')}</option>
              <option value="investor">{t('role.investor')}</option>
            </select>
          </div>
          {form.role === 'investor' && (
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-500 mb-1">{t('users.link_investor')}</label>
              <select value={form.investor_id} onChange={e => setForm(p => ({ ...p, investor_id: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="">— {t('users.none')} —</option>
                {investors.map(inv => <option key={inv.id} value={inv.id}>{inv.full_name} ({inv.code})</option>)}
              </select>
              <p className="text-xs text-slate-400 mt-1">{t('users.link_hint')}</p>
            </div>
          )}
          <div className="md:col-span-2 flex flex-col sm:flex-row gap-3 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-500">{t('common.cancel')}</button>
            <button type="submit" className="px-4 py-2 rounded-lg text-white text-sm" style={{ backgroundColor: 'var(--color-primary)' }}>{t('investors.create')}</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {/* ─── Liste mobile : utilisateurs compacts expandables ─── */}
        <div className="md:hidden divide-y divide-[var(--border-subtle)]">
          {users.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">{t('users.empty')}</div>
          ) : users.map(user => (
            <div key={`m-${user.id}`} className="p-2">
              <ExpandableRow
                density="compact"
                className="!rounded-lg"
                summary={
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-[14px] text-[var(--text-1)] truncate">{user.full_name}</span>
                      <Badge label={t(`role.${user.role}`)} variant={roleVariant[user.role] || 'gray'} />
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] min-w-0" style={{ color: 'var(--text-3)' }}>
                      <span className="truncate">{user.email}</span>
                      <span>•</span>
                      <span className={`font-semibold ${user.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {user.is_active ? t('status.active') : t('status.inactive')}
                      </span>
                    </div>
                  </div>
                }
              >
                <DetailRow label={t('users.username')} value={<span className="font-mono text-[12px]">{user.username || '—'}</span>} />
                <DetailRow label={t('users.created_at')} value={user.created_at ? formatDate(user.created_at, lang) : '—'} />
                {user.role === 'investor' && (
                  <DetailRow
                    label={t('users.linked_investor')}
                    value={(
                      <select
                        value={user.investor_id || ''}
                        onChange={e => handleLinkInvestor(user, e.target.value)}
                        className="text-xs border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] max-w-full"
                      >
                        <option value="">— {t('users.not_linked')} —</option>
                        {investors.map(inv => (
                          <option key={inv.id} value={inv.id}>{inv.full_name} ({inv.code})</option>
                        ))}
                      </select>
                    )}
                  />
                )}

                <ActionGroup className="!gap-1.5">
                  <ActionIconButton label={t('users.edit')} onClick={() => startEditUser(user)}>
                    <Edit3 size={15} />
                  </ActionIconButton>
                  <ActionIconButton label={t('users.reset_password')} onClick={() => handleResetPassword(user)}>
                    <KeyRound size={15} />
                  </ActionIconButton>
                  <ActionIconButton
                    label={user.is_active ? t('users.deactivate') : t('users.activate')}
                    tone={user.is_active ? 'amber' : 'green'}
                    onClick={() => handleToggleActive(user)}
                  >
                    <Power size={15} />
                  </ActionIconButton>
                  {user.id !== currentUserId && (
                    <ActionIconButton
                      label={t('users.delete_forever')}
                      tone="red"
                      onClick={() => handleDeleteUser(user)}
                      disabled={deletingId === user.id}
                    >
                      {deletingId === user.id
                        ? <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                        : <Trash2 size={15} />}
                    </ActionIconButton>
                  )}
                </ActionGroup>
              </ExpandableRow>
            </div>
          ))}
        </div>

        {/* ─── Tableau desktop ────────────────────────────────── */}
        <div className="hidden md:block md:overflow-x-auto">
        <table className="w-full md:min-w-[1050px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-slate-500">
              <th className="text-left p-4">{t('investor_detail.name')}</th>
              <th className="text-left p-4">Email</th>
              <th className="text-left p-4">{t('users.username')}</th>
              <th className="text-left p-4">{t('users.role_required').replace(' *', '')}</th>
              <th className="text-left p-4">{t('users.linked_investor')}</th>
              <th className="text-left p-4">{t('investors.col_status')}</th>
              <th className="text-left p-4">{t('users.created_at')}</th>
              <th className="p-4">{t('common.action')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="p-4 font-medium">
                  {editingId === user.id ? (
                    <input
                      value={editForm.full_name}
                      onChange={e => setEditForm(p => ({ ...p, full_name: e.target.value }))}
                      className="w-44 border border-slate-200 rounded-md px-2 py-1 text-xs"
                    />
                  ) : user.full_name}
                </td>
                <td className="p-4 text-slate-500">
                  {editingId === user.id ? (
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))}
                      className="w-48 border border-slate-200 rounded-md px-2 py-1 text-xs"
                    />
                  ) : user.email}
                </td>
                <td className="p-4 text-slate-500 font-mono text-xs">
                  {editingId === user.id ? (
                    <input
                      value={editForm.username}
                      onChange={e => setEditForm(p => ({ ...p, username: e.target.value }))}
                      className="w-36 border border-slate-200 rounded-md px-2 py-1 text-xs"
                    />
                  ) : (user.username || '—')}
                </td>
                <td className="p-4"><Badge label={t(`role.${user.role}`)} variant={roleVariant[user.role] || 'gray'} /></td>
                <td className="p-4">
                  {user.role === 'investor' ? (
                    <select
                      value={user.investor_id || ''}
                      onChange={e => handleLinkInvestor(user, e.target.value)}
                      className="text-xs border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    >
                      <option value="">— {t('users.not_linked')} —</option>
                      {investors.map(inv => (
                        <option key={inv.id} value={inv.id}>{inv.full_name} ({inv.code})</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="p-4">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {user.is_active ? t('status.active') : t('status.inactive')}
                  </span>
                </td>
                <td className="p-4 text-slate-400 text-xs">
                  {user.created_at ? formatDate(user.created_at, lang) : '—'}
                </td>
                <td className="p-4 text-center">
                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                    {editingId === user.id ? (
                      <>
                        <ActionIconButton
                          label={t('common.save')}
                          tone="green"
                          onClick={() => handleSaveUser(user)}
                        >
                          <Check size={15} />
                        </ActionIconButton>
                        <ActionIconButton
                          label={t('common.cancel')}
                          onClick={() => setEditingId(null)}
                        >
                          <X size={15} />
                        </ActionIconButton>
                      </>
                    ) : (
                      <ActionIconButton
                        label={t('users.edit')}
                        onClick={() => startEditUser(user)}
                      >
                        <Edit3 size={15} />
                      </ActionIconButton>
                    )}
                    <ActionIconButton
                      label={t('users.reset_password')}
                      onClick={() => handleResetPassword(user)}
                    >
                      <KeyRound size={15} />
                    </ActionIconButton>
                    <ActionIconButton
                      label={user.is_active ? t('users.deactivate') : t('users.activate')}
                      tone={user.is_active ? 'amber' : 'green'}
                      onClick={() => handleToggleActive(user)}
                    >
                      <Power size={15} />
                    </ActionIconButton>
                    {/* Suppression réservée à l'admin via DELETE /api/users/{id}.
                        Garde-fous côté backend : pas de suicide, pas de suppression
                        du dernier admin actif. On masque le bouton sur soi-même. */}
                    {user.id !== currentUserId && (
                      <>
                        <ActionIconButton
                          label={t('users.delete_forever')}
                          tone="red"
                          onClick={() => handleDeleteUser(user)}
                          disabled={deletingId === user.id}
                        >
                          {deletingId === user.id
                            ? <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                            : <Trash2 size={15} />}
                        </ActionIconButton>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={8} className="p-8 text-center text-slate-400">{t('users.empty')}</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
