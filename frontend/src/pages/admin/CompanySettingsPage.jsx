import { useEffect, useState } from 'react'
import { useBrandStore } from '../../store/brand.store'
import api from '../../api/axios'
import { useT } from '../../store/prefs.store'

export default function CompanySettingsPage() {
  const t = useT()
  const { company, setCompany } = useBrandStore()
  const [form, setForm] = useState({
    company_name: '',
    company_type: '',
    location: '',
    email: '',
    phone: '',
    primary_color: '#1A3A5C',
    secondary_color: '#C9A84C',
  })
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Politique de répartition des bénéfices/pertes (compagnie / investisseurs)
  const [policyCompany, setPolicyCompany] = useState(80) // % entre 0 et 100
  const [policySaving, setPolicySaving] = useState(false)
  const [policySaved, setPolicySaved] = useState(false)
  const [policyError, setPolicyError] = useState('')
  const policyInvestors = Math.max(0, 100 - policyCompany)

  // Transparence : exposer (ou non) aux investisseurs le taux de change
  // utilisé pour l'affichage de leurs transactions dans une autre devise.
  const [showFxRate, setShowFxRate] = useState(false)
  const [fxBusy, setFxBusy] = useState(false)
  const [fxSaved, setFxSaved] = useState(false)
  const [fxError, setFxError] = useState('')

  useEffect(() => {
    if (company) {
      setForm({
        company_name: company.company_name || '',
        company_type: company.company_type || '',
        location: company.location || '',
        email: company.email || '',
        phone: company.phone || '',
        primary_color: company.primary_color || '#1A3A5C',
        secondary_color: company.secondary_color || '#C9A84C',
      })
      if (company.logo_url) setLogoPreview(company.logo_url)
      // Les ratios sont stockés en fraction (0..1) côté backend ; on les
      // affiche en pourcentage entier pour la lisibilité.
      if (company.profit_share_company != null) {
        setPolicyCompany(Math.round(Number(company.profit_share_company) * 100))
      }
      setShowFxRate(Boolean(company.show_fx_rate_to_investors))
    }
  }, [company])

  const handleSaveTransparency = async (next) => {
    setFxError(''); setFxSaved(false); setFxBusy(true)
    try {
      const { data } = await api.put('/company/transparency', {
        show_fx_rate_to_investors: next,
      })
      setShowFxRate(Boolean(data.show_fx_rate_to_investors))
      setCompany({ ...(company || {}), show_fx_rate_to_investors: data.show_fx_rate_to_investors })
      setFxSaved(true)
      setTimeout(() => setFxSaved(false), 2500)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Erreur lors de la sauvegarde'
      setFxError(typeof msg === 'string' ? msg : 'Erreur')
      // Rollback visuel : on remet l'état précédent
      setShowFxRate(prev => !next)
    } finally {
      setFxBusy(false)
    }
  }

  const handleSavePolicy = async () => {
    setPolicyError('')
    setPolicySaved(false)
    if (policyCompany < 0 || policyCompany > 100) {
      setPolicyError('La part société doit être comprise entre 0 et 100 %.')
      return
    }
    setPolicySaving(true)
    try {
      const ratios = {
        profit_share_company: policyCompany / 100,
        profit_share_investors: (100 - policyCompany) / 100,
      }
      const res = await api.put('/company/profit-policy', ratios)
      // On synchronise le store pour que le reste de l'app ait les bons ratios.
      setCompany({ ...(company || {}), ...ratios, ...res.data })
      setPolicySaved(true)
      setTimeout(() => setPolicySaved(false), 3000)
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Erreur'
      setPolicyError(typeof msg === 'string' ? msg : 'Erreur lors de la sauvegarde')
    } finally {
      setPolicySaving(false)
    }
  }

  const handleLogoChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      const formData = new FormData()
      Object.entries(form).forEach(([k, v]) => formData.append(k, v))
      if (logoFile) formData.append('logo', logoFile)

      const res = await api.put('/company', formData)
      setCompany(res.data)
      setSaved(true)
      setLogoFile(null)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Erreur lors de la sauvegarde'
      alert(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <h2 className="text-xl font-bold text-slate-800 mb-6">{t('settings.company_title')}</h2>

      {saved && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
          {t('settings.saved')}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Logo */}
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
          <h3 className="font-semibold text-slate-700 mb-4">Logo de la société</h3>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden bg-slate-50">
              {logoPreview
                ? <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
                : <span className="text-3xl text-slate-300">🏢</span>
              }
            </div>
            <div>
              <label className="cursor-pointer px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 hover:bg-slate-50 transition-colors">
                Choisir un logo
                <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
              </label>
              <p className="text-xs text-slate-400 mt-1">PNG, JPG ou SVG recommandé</p>
            </div>
          </div>
        </div>

        {/* Informations */}
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <h3 className="sm:col-span-2 font-semibold text-slate-700">Informations générales</h3>
          {[
            ['company_name', 'Nom de la société'],
            ['company_type', 'Type (ex: Gestion de portefeuille)'],
            ['location', 'Adresse / Ville'],
            ['email', 'Email de contact'],
            ['phone', 'Téléphone'],
          ].map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs text-slate-500 mb-1">{label}</label>
              <input
                value={form[key]}
                onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
          ))}
        </div>

        {/* Colors */}
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
          <h3 className="font-semibold text-slate-700 mb-4">Couleurs de la charte graphique</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              ['primary_color', 'Couleur principale'],
              ['secondary_color', 'Couleur secondaire'],
            ].map(([key, label]) => (
              <div key={key}>
                <label className="block text-xs text-slate-500 mb-2">{label}</label>
                <div className="flex items-center gap-3 flex-wrap">
                  <input type="color" value={form[key]}
                    onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
                  <input type="text" value={form[key]}
                    onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                    maxLength={7}
                    className="w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none" />
                  <div className="w-8 h-8 rounded-lg border border-slate-100" style={{ backgroundColor: form[key] }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-500">Prévisualisation :</p>
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className="px-3 py-1 rounded text-white text-xs font-medium" style={{ backgroundColor: form.primary_color }}>Bouton principal</span>
              <span className="px-3 py-1 rounded text-white text-xs font-medium" style={{ backgroundColor: form.secondary_color }}>Accentuation</span>
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving}
          className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-60 transition-opacity"
          style={{ backgroundColor: 'var(--color-primary)' }}>
          {saving ? t('common.saving') : t('settings.save_settings')}
        </button>
      </form>

      {/* ─── Répartition des bénéfices ───────────────────────────────
          Hors du <form> principal pour éviter de soumettre les deux
          formulaires en même temps. Endpoint dédié /company/profit-policy. */}
      <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 mt-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-50 text-emerald-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
              <path d="M12 2v20" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-800">{t('settings.profit_policy_title')}</h3>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              {t('settings.profit_policy_desc')}
            </p>
          </div>
        </div>

        {/* Sliders synchronisés : ajuster l'un ajuste l'autre. */}
        <div>
          <div className="flex items-start sm:items-center justify-between gap-3 mb-2">
            <label className="text-[12px] font-semibold text-slate-600 uppercase tracking-wider">
              {t('kpi.company_share')} · Valmere & Co
            </label>
            <span className="text-[18px] font-bold text-slate-900 tabular-nums">{policyCompany} %</span>
          </div>
          <input
            type="range" min="0" max="100" step="1"
            value={policyCompany}
            onChange={e => setPolicyCompany(Number(e.target.value))}
            className="w-full accent-[var(--color-primary)]"
          />
          <div className="flex justify-between text-[10.5px] text-slate-400 mt-1">
            <span>0 %</span><span>50 %</span><span>100 %</span>
          </div>
        </div>

        {/* Récapitulatif visuel : barre 80/20 façon fintech */}
        <div>
          <div className="text-[12px] font-semibold text-slate-600 uppercase tracking-wider mb-2">
            {t('settings.distribution_preview')}
          </div>
          <div className="h-10 rounded-xl bg-slate-100 overflow-hidden flex shadow-inner">
            <div
              className="bg-gradient-to-r from-[var(--color-primary)] to-[#2a5388] flex items-center justify-center text-white text-[12px] font-semibold transition-all"
              style={{ width: `${policyCompany}%`, minWidth: policyCompany > 0 ? '40px' : 0 }}
            >
              {policyCompany >= 8 && `${policyCompany}%`}
            </div>
            <div
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 flex items-center justify-center text-white text-[12px] font-semibold transition-all"
              style={{ width: `${policyInvestors}%`, minWidth: policyInvestors > 0 ? '40px' : 0 }}
            >
              {policyInvestors >= 8 && `${policyInvestors}%`}
            </div>
          </div>
          <div className="flex items-center justify-between text-[11.5px] mt-2 text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-primary)' }} />
              {t('settings.company')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {t('settings.investors_prorata')}
            </span>
          </div>
        </div>

        {/* Exemple chiffré pour rassurer l'admin */}
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-[12.5px] text-slate-600 leading-relaxed">
          <strong className="text-slate-800">Exemple :</strong> sur un bénéfice de 1 000 $,
          {' '}<strong>{(policyCompany * 10).toFixed(0)} $</strong> seront crédités au compte société et
          {' '}<strong>{(policyInvestors * 10).toFixed(0)} $</strong> seront répartis entre les
          investisseurs actifs au pro-rata de leur part dans le pool.
        </div>

        {policyError && (
          <div className="text-[13px] px-3.5 py-2.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-100">
            {policyError}
          </div>
        )}
        {policySaved && (
          <div className="text-[13px] px-3.5 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100">
            {t('settings.policy_saved')}
          </div>
        )}

        <div className="flex justify-stretch sm:justify-end">
          <button
            type="button"
            onClick={handleSavePolicy}
            disabled={policySaving}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-60 transition"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {policySaving ? t('common.saving') : t('settings.save_policy')}
          </button>
        </div>
      </div>

      {/* ─── Transparence côté investisseur ─────────────────────────
          Toggle simple : quand activé, les investisseurs voient sur leur
          relevé le taux de change utilisé pour chaque transaction. */}
      <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 mt-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-50 text-blue-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
                <path d="M1 12h22" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-slate-800">Afficher le taux de change aux investisseurs</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Quand activé, l'investisseur voit sur son relevé le taux appliqué
                pour chaque transaction quand il filtre dans une autre devise
                (ex : « 1 USD = 130,5500 HTG »). Idéal pour la transparence.
                Désactivé par défaut pour ne pas surcharger l'écran.
              </p>
            </div>
          </div>

          {/* Switch iOS-style */}
          <button
            type="button"
            role="switch"
            aria-checked={showFxRate}
            onClick={() => handleSaveTransparency(!showFxRate)}
            disabled={fxBusy}
            className="relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50"
            style={{ backgroundColor: showFxRate ? 'var(--color-primary)' : '#cbd5e1' }}
          >
            <span
              className="inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform"
              style={{ transform: showFxRate ? 'translateX(20px)' : 'translateX(0px)' }}
            />
          </button>
        </div>

        {fxError && (
          <div className="mt-3 text-[12px] px-3 py-2 rounded-lg bg-rose-50 text-rose-700 border border-rose-100">
            {fxError}
          </div>
        )}
        {fxSaved && (
          <div className="mt-3 text-[12px] px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100">
            {showFxRate
              ? 'Les investisseurs verront désormais le taux de change sur leurs transactions.'
              : 'Le taux de change est désormais masqué pour les investisseurs.'}
          </div>
        )}
      </div>
    </div>
  )
}
