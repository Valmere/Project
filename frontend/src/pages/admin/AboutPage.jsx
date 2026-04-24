import { useEffect, useState } from 'react'
import { getAbout, updateAbout } from '../../api/about.api'

const FIELDS = [
  { key: 'mission', label: 'Mission', placeholder: "Quelle est la mission de l'entreprise ?", rows: 3 },
  { key: 'vision', label: 'Vision', placeholder: "Quelle est la vision à long terme ?", rows: 3 },
  { key: 'history', label: 'Historique', placeholder: "Histoire, dates clés, étapes importantes…", rows: 5 },
  { key: 'services', label: 'Nos services', placeholder: "Décrivez les services offerts aux investisseurs…", rows: 5 },
  { key: 'team', label: "L'équipe", placeholder: "Présentez les membres fondateurs, dirigeants, conseillers…", rows: 5 },
  { key: 'contact_info', label: 'Informations de contact', placeholder: "Adresse, téléphone, email, horaires…", rows: 4 },
]

export default function AboutPage() {
  const [form, setForm] = useState({ mission: '', vision: '', history: '', services: '', team: '', contact_info: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    getAbout()
      .then(d => setForm({
        mission: d.mission || '',
        vision: d.vision || '',
        history: d.history || '',
        services: d.services || '',
        team: d.team || '',
        contact_info: d.contact_info || '',
      }))
      .catch(e => setErr(e?.response?.data?.detail || 'Impossible de charger la page À propos'))
      .finally(() => setLoading(false))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr('')
    setSaved(false)
    try {
      await updateAbout(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">Chargement…</div>
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="mb-6">
        <h2 className="text-lg md:text-xl font-bold text-slate-800">À propos — Éditeur</h2>
        <p className="text-sm text-slate-500 mt-1">
          Renseignez les informations que les investisseurs verront sur la page « À propos ». Le contenu est commun à tous les investisseurs.
        </p>
      </div>

      {err && (
        <div className="mb-4 px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 border border-red-100">
          {err}
        </div>
      )}
      {saved && (
        <div className="mb-4 px-3 py-2 rounded-lg text-sm bg-green-50 text-green-700 border border-green-100">
          ✓ Contenu enregistré avec succès
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-4 md:p-6 space-y-5">
        {FIELDS.map(f => (
          <div key={f.key}>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">{f.label}</label>
            <textarea
              value={form[f.key]}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              rows={f.rows}
              placeholder={f.placeholder}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
        ))}

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-lg text-white font-medium text-sm disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  )
}
