import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Power, Trash2, Mail, Phone, Users } from 'lucide-react'
import api from '../../api/axios'
import { getInvestors, createInvestor, updateInvestor, deleteInvestor } from '../../api/investors.api'
import { useAuthStore } from '../../store/auth.store'
import { usePrefsStore, useT } from '../../store/prefs.store'
import { useRatesStore } from '../../store/rates.store'
import { formatMoney } from '../../utils/format'
import Badge from '../../components/ui/Badge'
import ExpandableRow, { DetailRow, ActionGroup } from '../../components/ui/ExpandableRow'

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

const CURRENCIES = ['HTG', 'USD', 'EUR']

// fmtPct est local (pas dans utils/format) : c'est un format simple "12,34 %"
// piloté par la langue choisie, sans symbole monétaire.
const fmtPct = (v, lang = 'fr') => {
  if (v == null) return '—'
  return `${(Number(v) || 0).toFixed(2)} %`.replace('.', lang === 'en' ? '.' : ',')
}

const fmtSharePct = (value, isNegative, lang = 'fr') => {
  const formatted = fmtPct(value, lang)
  return isNegative ? `- ${formatted}` : formatted
}

export default function InvestorListPage() {
  const t = useT()
  const { lang, currency } = usePrefsStore()
  const convert = useRatesStore(s => s.convert)
  const [investors, setInvestors] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // all | active | inactive
  const [showForm, setShowForm] = useState(false)
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', entry_date: '',
    investment_duration_months: '',
    initial_capital: '0',
    initial_capital_currency: 'HTG',
  })
  const [accounts, setAccounts] = useState({}) // investor_id -> { linked, email, is_active }
  const [tempPassword, setTempPassword] = useState(null) // { full_name, email, temp_password }
  const [linkingBusy, setLinkingBusy] = useState(false)
  const [linkMessage, setLinkMessage] = useState('')
  const [generateBusy, setGenerateBusy] = useState(null) // investor id currently generating
  const [busyId, setBusyId] = useState(null)             // investor id whose action (toggle/delete) is in flight
  const userRole = useAuthStore(s => s.user?.role)

  const refreshInvestors = async () => {
    const list = await getInvestors()
    setInvestors(list)
    reloadAccounts(list)
    return list
  }

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
    refreshInvestors()
  }, [])

  const filtered = investors.filter(i => {
    // Filtre statut (la liste backend exclut déjà la société par défaut)
    if (statusFilter === 'active' && i.status !== 'active') return false
    if (statusFilter === 'inactive' && i.status === 'active') return false
    const q = search.toLowerCase()
    return (
      i.full_name.toLowerCase().includes(q) ||
      i.code?.toLowerCase().includes(q) ||
      i.email?.toLowerCase().includes(q)
    )
  })

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreateError('')
    setCreating(true)
    const payload = {
      ...form,
      investment_duration_months: form.investment_duration_months || null,
      initial_capital: parseFloat(form.initial_capital || '0') || 0,
      initial_capital_currency: form.initial_capital_currency || 'HTG',
    }
    try {
      const inv = await createInvestor(payload)
      const next = [inv, ...investors]
      setInvestors(next)
      reloadAccounts(next)
      setShowForm(false)
      setForm({
        full_name: '', email: '', phone: '', entry_date: '',
        investment_duration_months: '',
        initial_capital: '0',
        initial_capital_currency: 'HTG',
      })

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
    } catch (err) {
      const detail = err.response?.data?.detail
      setCreateError(typeof detail === 'string' ? detail : "L'ajout de l'investisseur a echoue.")
    } finally {
      setCreating(false)
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

  // Bascule active/inactive. Inactif = biens liquides et exclus des calculs.
  // Reactivation : restauration de l'historique ou nouveau depart a zero.
  const toggleStatus = async (inv) => {
    const isActive = inv.status === 'active'
    const nextStatus = isActive ? 'inactive' : 'active'
    let activationMode = null
    if (isActive) {
      if (!window.confirm(
        `Voulez-vous desactiver ${inv.full_name} ?\n\nSes biens seront consideres comme liquides : la valeur, les parts, les rapports et les etats financiers repartiront a 0 pour cet investisseur.`
      )) return
    } else {
      const choice = window.prompt(
        `Reactiver ${inv.full_name}\n\n1 = Restaurer tous ses biens et son historique\n2 = Repartir a 0 pour cet investisseur\n\nTapez 1 ou 2 :`,
        '1'
      )
      if (choice === null) return
      activationMode = choice.trim() === '2' ? 'restart' : 'restore'
    }
    setBusyId(inv.id)
    try {
      await updateInvestor(inv.id, { status: nextStatus, activation_mode: activationMode })
      await refreshInvestors()
    } catch (err) {
      const detail = err.response?.data?.detail
      alert(typeof detail === 'string' ? detail : 'La mise à jour du statut a échoué.')
    } finally {
      setBusyId(null)
    }
  }

  // Suppression définitive. Côté admin : exécution immédiate avec cascade
  // sur transactions/investments/reports. Côté caissier : file d'attente
  // (le backend retourne `{queued:true, pending_action_id}`).
  const removeInvestor = async (inv) => {
    if (inv.is_company) {
      alert("Le compte société Valmere & Co ne peut pas être supprimé.")
      return
    }
    const msg = userRole === 'admin'
      ? `Supprimer définitivement ${inv.full_name} ?\n\n`
        + `⚠ Toutes ses transactions, son portefeuille et ses rapports seront effacés.\n`
        + `Cette action est irréversible.\n\n`
        + `Pour conserver l'historique, désactivez plutôt le compte.`
      : `Demander la suppression de ${inv.full_name} ?\n\n`
        + `Un administrateur devra valider la demande avant que la suppression\n`
        + `soit effective. Vous pouvez suivre la demande dans Approbations.`
    if (!window.confirm(msg)) return

    setBusyId(inv.id)
    try {
      const res = await deleteInvestor(inv.id, null)
      if (res?.queued) {
        alert("Demande envoyée à l'administrateur pour approbation.")
      } else {
        // Suppression effective côté admin → on retire la ligne de la liste
        setInvestors(prev => prev.filter(i => i.id !== inv.id))
      }
    } catch (err) {
      const detail = err.response?.data?.detail
      alert(typeof detail === 'string' ? detail : 'La suppression a échoué.')
    } finally {
      setBusyId(null)
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
        <h2 className="text-lg md:text-xl font-bold text-slate-800">{t('investors.title')}</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Broadcast email — ouvre le client mail avec tous les investisseurs
              actifs ayant un email en BCC pour préserver leur vie privée. */}
          <button
            onClick={() => {
              const recipients = investors
                .filter(i => i.status === 'active' && i.email)
                .map(i => i.email)
              if (recipients.length === 0) {
                alert(t('investors.email_group_empty'))
                return
              }
              const bcc = recipients.join(',')
              window.location.href = `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent('Information')}`
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-slate-200 text-slate-600 hover:bg-slate-50"
            title={t('investors.email_group_tooltip')}
          >
            <Users size={14} /> {t('investors.email_group')}
          </button>
          <button
            onClick={autoLink}
            disabled={linkingBusy}
            className="px-3 py-2 rounded-lg text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            title={t('investors.auto_link_tooltip')}
          >
            {linkingBusy ? t('investors.auto_link_busy') : t('investors.auto_link')}
          </button>
          <button onClick={() => setShowForm(!showForm)}
            className="px-3 md:px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: 'var(--color-primary)' }}>
            {t('investors.new')}
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
          <h3 className="col-span-full font-semibold text-slate-700">{t('investors.form_title')}</h3>
          {createError && (
            <div className="col-span-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {createError}
            </div>
          )}
          {[
            ['full_name', `${t('investor_detail.full_name')} *`],
            ['email', 'Email'],
            ['phone', t('investor_detail.phone')],
            ['entry_date', `${t('investor_detail.entry_date')} *`],
            ['investment_duration_months', t('investor_detail.duration_months')],
          ].map(([k, label]) => (
            <div key={k}>
              <label className="block text-xs text-slate-500 mb-1">{label}</label>
              <input type={k === 'entry_date' ? 'date' : 'text'} value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
                required={label.includes('*')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
            </div>
          ))}

          {/* Capital initial : peut être 0. Si > 0, le backend crée
              automatiquement une transaction « Capital initial » à la date d'entrée. */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('investor_detail.initial_capital')}</label>
            <input
              type="number" min="0" step="0.01"
              value={form.initial_capital}
              onChange={e => setForm(p => ({ ...p, initial_capital: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('investors.initial_capital_currency')}</label>
            <select
              value={form.initial_capital_currency}
              onChange={e => setForm(p => ({ ...p, initial_capital_currency: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <p className="col-span-full text-[11px] text-slate-500 -mt-1">
            {t('investors.initial_capital_hint')}
          </p>
          <div className="col-span-full flex gap-3 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-500">{t('common.cancel')}</button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 rounded-lg text-white text-sm disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {creating ? t('common.loading') : t('investors.create')}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-3 md:p-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[180px] max-w-xs border border-slate-200 rounded-lg px-3 py-2 text-sm"
            placeholder={t('investors.search_placeholder')} />

          {/* Filtre statut — chips fintech style */}
          <div className="inline-flex bg-slate-100 rounded-lg p-1 text-xs">
            {[
              { v: 'all', label: t('investors.tab_all'), count: investors.length },
              { v: 'active', label: t('investors.tab_active'), count: investors.filter(i => i.status === 'active').length },
              { v: 'inactive', label: t('investors.tab_inactive'), count: investors.filter(i => i.status !== 'active').length },
            ].map(opt => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setStatusFilter(opt.v)}
                className={`px-3 py-1.5 rounded-md font-medium transition ${
                  statusFilter === opt.v
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {opt.label}
                <span className="ml-1.5 text-[10px] text-slate-400">{opt.count}</span>
              </button>
            ))}
          </div>
        </div>
        {/* ─── Liste mobile (cartes compactes expandables) ───────── */}
        <div className="md:hidden divide-y divide-[var(--border-subtle)]">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">{t('investors.empty')}</div>
          ) : filtered.map(inv => {
            const acct = accounts[inv.id]
            const baseCcy = inv.base_currency || 'HTG'
            const investedDisplay = convert(Number(inv.total_invested ?? inv.initial_capital ?? 0), baseCcy, currency)
            const currentDisplay = convert(Number(inv.current_value ?? 0), baseCcy, currency)
            const poolShareIsNegative = Boolean(inv.share_pct_pool_negative)
            const globalShareIsNegative = Boolean(inv.share_pct_global_negative)
            return (
              <div key={inv.id} className="p-2">
                <ExpandableRow
                  density="compact"
                  className="!rounded-lg"
                  summary={
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-[14px] text-[var(--text-1)] truncate">{inv.full_name}</span>
                        <Badge label={inv.status} variant={statusVariant[inv.status]} />
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--text-3)] font-mono min-w-0">
                        <span className="truncate">{inv.code}</span>
                        <span>•</span>
                        <span className="text-[var(--text-1)] font-sans font-semibold tabular-nums">
                          {formatMoney(currentDisplay, { currency, lang })}
                        </span>
                      </div>
                    </div>
                  }
                >
                  <DetailRow label={t('investors.col_invested')} value={formatMoney(investedDisplay, { currency, lang })} />
                  <DetailRow
                    label={t('kpi.share_pool')}
                    value={inv.status === 'active' ? (
                      <span className={poolShareIsNegative ? 'text-red-600 font-medium' : 'text-emerald-600 font-medium'}>
                        {fmtSharePct(inv.share_pct_pool, poolShareIsNegative, lang)}
                      </span>
                    ) : '—'}
                  />
                  <DetailRow
                    label={t('kpi.share_global')}
                    value={(
                      <span className={globalShareIsNegative ? 'text-red-600 font-medium' : ''}>
                        {fmtSharePct(inv.share_pct_global, globalShareIsNegative, lang)}
                      </span>
                    )}
                  />
                  {inv.email && <DetailRow label="Email" value={<span className="font-mono">{inv.email}</span>} />}
                  {inv.phone && <DetailRow label={t('investor_detail.phone')} value={<span className="font-mono">{inv.phone}</span>} />}
                  <DetailRow
                    label={t('investors.col_account')}
                    value={acct?.linked ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="font-mono text-[11px]">{acct.email}</span>
                      </span>
                    ) : inv.email ? (
                      <button
                        onClick={() => generateLogin(inv)}
                        disabled={generateBusy === inv.id}
                        className="text-[11px] px-2 py-0.5 rounded-md text-white whitespace-nowrap disabled:opacity-60"
                        style={{ backgroundColor: 'var(--color-primary)' }}
                      >
                        {generateBusy === inv.id ? t('investors.gen_login_busy') : t('investors.gen_login')}
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">{t('investors.account_email_required')}</span>
                    )}
                  />

                  <ActionGroup>
                    <Link
                      to={`/admin/investors/${inv.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      {t('investors.col_view')}
                    </Link>
                    {inv.email && (
                      <a
                        href={`mailto:${inv.email}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] border border-slate-200 text-slate-600 hover:bg-slate-50"
                      >
                        <Mail size={13} /> Email
                      </a>
                    )}
                    {inv.phone && (
                      <a
                        href={`tel:${(inv.phone || '').replace(/\s/g, '')}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] border border-slate-200 text-slate-600 hover:bg-slate-50"
                      >
                        <Phone size={13} /> {t('investor_detail.phone')}
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleStatus(inv)}
                      disabled={busyId === inv.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <Power size={13} /> {inv.status === 'active' ? t('investors.tooltip_disable') : t('investors.tooltip_enable')}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeInvestor(inv)}
                      disabled={busyId === inv.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                    >
                      <Trash2 size={13} /> {userRole === 'admin' ? t('investors.tooltip_delete') : t('investors.tooltip_delete_request')}
                    </button>
                  </ActionGroup>
                </ExpandableRow>
              </div>
            )
          })}
        </div>

        {/* ─── Tableau desktop (≥ md) ─────────────────────────── */}
        <div className="hidden md:block md:overflow-x-auto">
          <table className="w-full text-sm md:min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500">
                <th className="text-left p-3 md:p-4">{t('investors.col_code')}</th>
                <th className="text-left p-3 md:p-4">{t('investors.col_name')}</th>
                <th className="text-right p-3 md:p-4">{t('investors.col_invested')}</th>
                <th className="text-right p-3 md:p-4">{t('investors.col_current_value')}</th>
                <th className="text-right p-3 md:p-4 hidden md:table-cell">{t('kpi.share_pool')}</th>
                <th className="text-right p-3 md:p-4 hidden lg:table-cell">{t('kpi.share_global')}</th>
                <th className="text-left p-3 md:p-4">{t('investors.col_status')}</th>
                <th className="text-left p-3 md:p-4 hidden sm:table-cell">{t('investors.col_account')}</th>
                <th className="p-3 md:p-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const acct = accounts[inv.id]
                // base_currency renvoyée par l'API = HTG (devise comptable).
                // On convertit dans la devise d'affichage choisie en haut
                // (USD/EUR/HTG) — sinon les chiffres restaient en gourdes
                // même quand l'admin sélectionnait $.
                const baseCcy = inv.base_currency || 'HTG'
                const investedDisplay = convert(Number(inv.total_invested ?? inv.initial_capital ?? 0), baseCcy, currency)
                const currentDisplay = convert(Number(inv.current_value ?? 0), baseCcy, currency)
                const poolShareIsNegative = Boolean(inv.share_pct_pool_negative)
                const globalShareIsNegative = Boolean(inv.share_pct_global_negative)
                return (
                  <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="p-3 md:p-4 font-mono text-xs text-slate-500" data-label={t('investors.col_code')}>{inv.code}</td>
                    <td className="p-3 md:p-4" data-label={t('investors.col_name')}>
                      <div className="font-medium">{inv.full_name}</div>
                      {inv.email && <div className="text-[11px] text-slate-400">{inv.email}</div>}
                    </td>
                    <td className="p-3 md:p-4 text-right text-slate-600 tabular-nums" data-label={t('investors.col_invested')}>
                      {formatMoney(investedDisplay, { currency, lang })}
                    </td>
                    <td className="p-3 md:p-4 text-right font-semibold text-slate-800 tabular-nums" data-label={t('investors.col_current_value')}>
                      {formatMoney(currentDisplay, { currency, lang })}
                    </td>
                    <td className="p-3 md:p-4 text-right hidden md:table-cell tabular-nums" data-label={t('kpi.share_pool')}>
                      {inv.status === 'active' ? (
                        <span className={`${poolShareIsNegative ? 'text-red-600' : 'text-emerald-600'} font-medium`}>
                          {fmtSharePct(inv.share_pct_pool, poolShareIsNegative, lang)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className={`p-3 md:p-4 text-right hidden lg:table-cell tabular-nums ${globalShareIsNegative ? 'text-red-600 font-medium' : 'text-slate-500'}`} data-label={t('kpi.share_global')}>
                      {fmtSharePct(inv.share_pct_global, globalShareIsNegative, lang)}
                    </td>
                    <td className="p-3 md:p-4" data-label={t('investors.col_status')}><Badge label={inv.status} variant={statusVariant[inv.status]} /></td>
                    <td className="p-3 md:p-4 hidden sm:table-cell" data-label={t('investors.col_account')}>
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
                          {generateBusy === inv.id ? t('investors.gen_login_busy') : t('investors.gen_login')}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 italic">{t('investors.account_email_required')}</span>
                      )}
                    </td>
                    <td className="p-3 md:p-4" data-label="">
                      <div className="flex items-center justify-end gap-1">
                        {/* Contact rapide : ouvre le client mail / téléphone
                            de l'OS. Désactivés visuellement quand pas de coord. */}
                        <a
                          href={inv.email ? `mailto:${inv.email}` : undefined}
                          onClick={e => { if (!inv.email) e.preventDefault() }}
                          title={inv.email ? t('investors.tooltip_email', { email: inv.email }) : t('investors.tooltip_no_email')}
                          className={`w-8 h-8 rounded-lg inline-flex items-center justify-center transition ${
                            inv.email
                              ? 'text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer'
                              : 'text-slate-200 cursor-not-allowed'
                          }`}
                        >
                          <Mail size={14} />
                        </a>
                        <a
                          href={inv.phone ? `tel:${(inv.phone || '').replace(/\s/g, '')}` : undefined}
                          onClick={e => { if (!inv.phone) e.preventDefault() }}
                          title={inv.phone ? t('investors.tooltip_phone', { phone: inv.phone }) : t('investors.tooltip_no_phone')}
                          className={`w-8 h-8 rounded-lg inline-flex items-center justify-center transition ${
                            inv.phone
                              ? 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 cursor-pointer'
                              : 'text-slate-200 cursor-not-allowed'
                          }`}
                        >
                          <Phone size={14} />
                        </a>
                        <Link
                          to={`/admin/investors/${inv.id}`}
                          className="text-[var(--color-primary)] hover:underline text-xs whitespace-nowrap mx-1"
                        >
                          {t('investors.col_view')}
                        </Link>
                        <button
                          type="button"
                          onClick={() => toggleStatus(inv)}
                          disabled={busyId === inv.id}
                          title={inv.status === 'active' ? t('investors.tooltip_disable') : t('investors.tooltip_enable')}
                          className={`w-8 h-8 rounded-lg inline-flex items-center justify-center transition disabled:opacity-40 ${
                            inv.status === 'active'
                              ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                              : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                          }`}
                        >
                          <Power size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeInvestor(inv)}
                          disabled={busyId === inv.id}
                          title={userRole === 'admin' ? t('investors.tooltip_delete') : t('investors.tooltip_delete_request')}
                          className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition disabled:opacity-40"
                        >
                          {busyId === inv.id ? (
                            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center text-slate-400">{t('investors.empty')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
