import { useEffect, useState } from 'react'
import { useBrandStore } from '../../store/brand.store'
import api from '../../api/axios'

export default function CompanySettingsPage() {
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
    }
  }, [company])

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
    <div className="p-8 max-w-2xl">
      <h2 className="text-xl font-bold text-slate-800 mb-6">Paramètres de la société</h2>

      {saved && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
          Paramètres enregistrés avec succès.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Logo */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="font-semibold text-slate-700 mb-4">Logo de la société</h3>
          <div className="flex items-center gap-6">
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
        <div className="bg-white rounded-xl shadow-sm p-6 grid grid-cols-2 gap-4">
          <h3 className="col-span-2 font-semibold text-slate-700">Informations générales</h3>
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
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="font-semibold text-slate-700 mb-4">Couleurs de la charte graphique</h3>
          <div className="grid grid-cols-2 gap-6">
            {[
              ['primary_color', 'Couleur principale'],
              ['secondary_color', 'Couleur secondaire'],
            ].map(([key, label]) => (
              <div key={key}>
                <label className="block text-xs text-slate-500 mb-2">{label}</label>
                <div className="flex items-center gap-3">
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
            <div className="flex gap-2 mt-2">
              <span className="px-3 py-1 rounded text-white text-xs font-medium" style={{ backgroundColor: form.primary_color }}>Bouton principal</span>
              <span className="px-3 py-1 rounded text-white text-xs font-medium" style={{ backgroundColor: form.secondary_color }}>Accentuation</span>
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving}
          className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-60 transition-opacity"
          style={{ backgroundColor: 'var(--color-primary)' }}>
          {saving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
        </button>
      </form>
    </div>
  )
}
