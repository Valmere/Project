import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/axios'
import { getInvestors, createInvestor } from '../../api/investors.api'
import Badge from '../../components/ui/Badge'

const statusVariant = { active: 'green', inactive: 'gray', suspended: 'red' }

/**
 * Bannière affichée UNE SEULE FOIS après la création d'un investisseur avec email,
 * ou après génération manuelle d'un compte. Affiche le mot de passe temporaire à
 * transmettre à l'investisseur — ensuite il le changera à la 1ʳᵉ connexion.
 */
function TempPasswordBanner({ info, onClose }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(info.temp_password)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-amber-900">
            Compte de connexion créé pour {info.full_name}
          </div>
          <p className="text-xs text-amber-800 mt-1">
            Transmettez ces identifiants à l'investisseur. Le mot de passe ne sera
            <strong> affiché qu'une seule fois</strong> — il devra le changer à sa première connexion.
          </p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="bg-white rounded-lg border border-amber-200 px-3 py-2">
              <div className="text-[10px] uppercase text-slate-400">Email</div>
              <div className="font-mono text-slate-800">{info.email}</div>
            </div>
            <div className="bg-white rounded-lg border border-amber-200 px-3 py-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase text-slate-400">Mot de passe temporaire</div>
                <div className="font-mono text-slate-800">{info.temp_password}</div>
              </div>
              <button
                type="button"
                onClick={copy}
                className="text-[11px] px-2 py-1 rounded-md bg-amber-600 text-white hover:bg-amber-700"
              >
                {copied ? 'Copié ✓' : 'Copier'}
              </button>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-amber-600 hover:text-amber-800 text-lg leading-none"
          aria-label="Fermer"
        >
          ×
        </button>
      </div>
    </div>
  )
}

export default function InvestorListPage() {
  const [investors, setInvestors] = useState([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', entry_date: '', investment_duration_months: '' })
  const [accounts, setAccounts] = useState({}) // investor_id -> { linked, email, is_active }
  const [tempPassword, setTempPassword] = useState(null) // { full_name, email, temp_password }
  const [linkingBusy, setLinkingBusy] = useState(false)
  const [linkMessage, setLinkMessage] = useState('')
  const [generateBusy, setGenerateBusy] = useState(null) // investor id currently generating

  const reloadAccounts = (list) => {
    Promise.all(
      list.map(inv =>
        api.get(`/investors/${inv.id}/login-account`)
          .then(r => [inv.id, r.data])
          .catch(() => [inv.id, { linked: false }])
      )
    ).then(pairs => setAccounts(Object.fromEntries(pairs)))
  }

  useEffect(() => {
    getInvestors().then(list => {
      setInvestors(list)
      reloadAccounts(list)
    })
  }, [])

  const filtered = investors.filter(i =>
    i.full_name.toLowerCase().includes(search.toLowerCase()) ||
    i.code?.toLowerCase().includes(search.toLowerCase())
  )

  const handleCreate = async (e) => {
    e.preventDefault()
    const inv = await createInvestor({ ...form, investment_duration_months: form.investment_duration_months || null })
    const next = [inv, ...investors]
    setInvestors(next)
    reloadAccounts(next)
    setShowForm(false)
    setForm({ full_name: '', email: '', phone: '', entry_date: '', investment_duration_months: '' })

    // Si le backend a créé (pas seulement lié) un compte avec un mot de passe temporaire,
    // on le montre à l'admin pour qu'il le transmette.
    const a = inv.account
    if (a?.created && a?.temp_password) {
      setTempPassword({
        full_name: inv.full_name,
        email: a.email,
        temp_password: a.temp_password,
      })
    }
  }

  const generateLogin = async (inv) => {
    if (!inv.email) {
      alert("Cet investisseur n'a pas d'email. Ajoutez-en un d'abord.")
      return
    }
    setGenerateBusy(inv.id)
    try {
      const { data } = await api.post(`/investors/${inv.id}/create-login`, {
        email: inv.email,
        full_name: inv.full_name,
        // password omis → le backend en génère un temporaire et le renvoie.
      })
      setAccounts(prev => ({
        ...prev,
        [inv.id]: { linked: true, email: data.email, is_active: true },
      }))
      if (data.temp_password) {
        setTempPassword({
          full_name: inv.full_name,
          email: data.email,
          temp_password: data.temp_password,
        })
      }
    } catch (err) {
      const d = err.response?.data?.detail
      alert(typeof d === 'string' ? d : `Erreur ${err.response?.status || ''}`)
    } finally {
      setGenerateBusy(null)
    }
  }

  const autoLink = async () => {
    setLinkingBusy(true)
    setLinkMessage('')
    try {
      const { data } = await api.post('/investors/auto-link-users')
      if (data.linked_count === 0) {
        setLinkMessage('Aucun compte orphelin à lier — tout est déjà en ordre.')
      } else {
        const names = data.linked.map(l => l.investor_name).join(', ')
        setLinkMessage(`${data.linked_count} compte(s) liés : ${names}`)
      }
      reloadAccounts(investors)
    } catch (err) {
      setLinkMessage(`Erreur : ${err.response?.data?.detail || err.message}`)
    } finally {
      setLinkingBusy(false)
      setTimeout(() => setLinkMessage(''), 6000)
    }
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-4 md:mb-6 gap-3 flex-wrap">
        <h2 className="text-lg md:text-xl font-bold text-slate-800">Investisseurs</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={autoLink}
            disabled={linkingBusy}
            className="px-3 py-2 rounded-lg text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            title="Lier les comptes utilisateurs existants aux investisseurs par correspondance d'email"
          >
            {linkingBusy ? 'Liaison…' : '🔗 Auto-lier les comptes'}
          </button>
          <button onClick={() => setShowForm(!showForm)}
            className="px-3 md:px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: 'var(--color-primary)' }}>
            + Nouveau
          </button>
        </div>
      </div>

      {linkMessage && (
        <div className="mb-4 px-3 py-2 rounded-lg text-sm bg-slate-50 border border-slate-200 text-slate-700">
          {linkMessage}
        </div>
      )}

      {tempPassword && (
        <TempPasswordBanner info={tempPassword} onClose={() => setTempPassword(null)} />
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl shadow-sm p-4 md:p-6 mb-4 md:mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <h3 className="col-span-full font-semibold text-slate-700">Nouvel investisseur</h3>
          {[['full_name', 'Nom complet *'], ['email', 'Email'], ['phone', 'Téléphone'], ['entry_date', "Date d'entrée *"], ['investment_duration_months', 'Durée (mois)']].map(([k, label]) => (
            <div key={k}>
              <label className="block text-xs text-slate-500 mb-1">{label}</label>
              <input type={k === 'entry_date' ? 'date' : 'text'} value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
                required={label.includes('*')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
            </div>
          ))}
          <p className="col-span-full text-[11px] text-slate-500 -mt-1">
            Si un email est fourni, un compte de connexion est créé automatiquement avec
            un mot de passe temporaire — il vous sera affiché une fois après la création.
          </p>
          <div className="col-span-full flex gap-3 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-500">Annuler</button>
            <button type="submit" className="px-4 py-2 rounded-lg text-white text-sm" style={{ backgroundColor: 'var(--color-primary)' }}>Créer</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-3 md:p-4 border-b border-slate-100">
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="w-full max-w-xs border border-slate-200 rounded-lg px-3 py-2 text-sm"
            placeholder="Rechercher..." />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500">
                <th className="text-left p-3 md:p-4">Code</th>
                <th className="text-left p-3 md:p-4">Nom</th>
                <th className="text-left p-3 md:p-4 hidden sm:table-cell">Email</th>
                <th className="text-left p-3 md:p-4 hidden md:table-cell">Date d'entrée</th>
                <th className="text-left p-3 md:p-4">Statut</th>
                <th className="text-left p-3 md:p-4">Compte</th>
                <th className="p-3 md:p-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const acct = accounts[inv.id]
                return (
                  <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="p-3 md:p-4 font-mono text-xs text-slate-500">{inv.code}</td>
                    <td className="p-3 md:p-4 font-medium">{inv.full_name}</td>
                    <td className="p-3 md:p-4 text-slate-500 hidden sm:table-cell">{inv.email || '—'}</td>
                    <td className="p-3 md:p-4 text-slate-500 hidden md:table-cell">{inv.entry_date}</td>
                    <td className="p-3 md:p-4"><Badge label={inv.status} variant={statusVariant[inv.status]} /></td>
                    <td className="p-3 md:p-4">
                      {acct?.linked ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-green-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          {acct.email}
                        </span>
                      ) : inv.email ? (
                        <button
                          onClick={() => generateLogin(inv)}
                          disabled={generateBusy === inv.id}
                          className="text-xs px-2.5 py-1 rounded-md text-white whitespace-nowrap disabled:opacity-60"
                          style={{ backgroundColor: 'var(--color-primary)' }}
                        >
                          {generateBusy === inv.id ? 'Génération…' : 'Générer un compte'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 italic">email requis</span>
                      )}
                    </td>
                    <td className="p-3 md:p-4">
                      <Link to={`/admin/investors/${inv.id}`} className="text-[var(--color-primary)] hover:underline text-xs whitespace-nowrap">Voir →</Link>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-slate-400">Aucun investisseur</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
