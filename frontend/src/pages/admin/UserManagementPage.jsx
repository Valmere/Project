import { useEffect, useState } from 'react'
import api from '../../api/axios'
import Badge from '../../components/ui/Badge'

const roleVariant = { admin: 'red', analyst: 'blue', investor: 'green' }

export default function UserManagementPage() {
  const [users, setUsers] = useState([])
  const [investors, setInvestors] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'investor', investor_id: '' })
  const [error, setError] = useState('')

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
      setForm({ full_name: '', email: '', password: '', role: 'investor', investor_id: '' })
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la création')
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

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-800">Utilisateurs</h2>
        <button onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: 'var(--color-primary)' }}>
          + Nouvel utilisateur
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl shadow-sm p-6 mb-6 grid grid-cols-2 gap-4">
          <h3 className="col-span-2 font-semibold text-slate-700">Nouvel utilisateur</h3>
          {error && <div className="col-span-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Nom complet *</label>
            <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Email *</label>
            <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Mot de passe *</label>
            <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required minLength={8}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Rôle *</label>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value, investor_id: '' }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
              <option value="admin">Admin</option>
              <option value="analyst">Analyste</option>
              <option value="investor">Investisseur</option>
            </select>
          </div>
          {form.role === 'investor' && (
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Lier à un investisseur</label>
              <select value={form.investor_id} onChange={e => setForm(p => ({ ...p, investor_id: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="">— Aucun —</option>
                {investors.map(inv => <option key={inv.id} value={inv.id}>{inv.full_name} ({inv.code})</option>)}
              </select>
              <p className="text-xs text-slate-400 mt-1">L'investisseur verra uniquement ses propres données</p>
            </div>
          )}
          <div className="col-span-2 flex gap-3 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-500">Annuler</button>
            <button type="submit" className="px-4 py-2 rounded-lg text-white text-sm" style={{ backgroundColor: 'var(--color-primary)' }}>Créer</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-slate-500">
              <th className="text-left p-4">Nom</th>
              <th className="text-left p-4">Email</th>
              <th className="text-left p-4">Rôle</th>
              <th className="text-left p-4">Investisseur lié</th>
              <th className="text-left p-4">Statut</th>
              <th className="text-left p-4">Créé le</th>
              <th className="p-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="p-4 font-medium">{user.full_name}</td>
                <td className="p-4 text-slate-500">{user.email}</td>
                <td className="p-4"><Badge label={user.role} variant={roleVariant[user.role] || 'gray'} /></td>
                <td className="p-4">
                  {user.role === 'investor' ? (
                    <select
                      value={user.investor_id || ''}
                      onChange={e => handleLinkInvestor(user, e.target.value)}
                      className="text-xs border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    >
                      <option value="">— Non lié —</option>
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
                    {user.is_active ? 'Actif' : 'Inactif'}
                  </span>
                </td>
                <td className="p-4 text-slate-400 text-xs">
                  {user.created_at ? new Date(user.created_at).toLocaleDateString('fr') : '—'}
                </td>
                <td className="p-4 text-center">
                  <button onClick={() => handleToggleActive(user)}
                    className="text-xs text-slate-400 hover:text-slate-700 transition-colors">
                    {user.is_active ? 'Désactiver' : 'Activer'}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-slate-400">Aucun utilisateur</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
