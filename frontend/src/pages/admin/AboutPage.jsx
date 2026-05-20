import { useEffect, useState } from 'react'
import { getAbout, updateAbout } from '../../api/about.api'
import { usePrefsStore, useT } from '../../store/prefs.store'

const FIELDS = [
  { key: 'mission', labelKey: 'about.section.mission', placeholderKey: 'about.placeholder.mission', rows: 3 },
  { key: 'vision', labelKey: 'about.section.vision', placeholderKey: 'about.placeholder.vision', rows: 3 },
  { key: 'history', labelKey: 'about.section.history', placeholderKey: 'about.placeholder.history', rows: 5 },
  { key: 'services', labelKey: 'about.section.services', placeholderKey: 'about.placeholder.services', rows: 5 },
  { key: 'team', labelKey: 'about.section.team', placeholderKey: 'about.placeholder.team', rows: 5 },
  { key: 'contact_info', labelKey: 'about.section.contact_info', placeholderKey: 'about.placeholder.contact_info', rows: 4 },
]

export default function AboutPage() {
  const t = useT()
  const { lang } = usePrefsStore()
  const [form, setForm] = useState({ mission: '', vision: '', history: '', services: '', team: '', contact_info: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    setLoading(true)
    getAbout()
      .then(d => setForm({
        mission: d.mission || '',
        vision: d.vision || '',
        history: d.history || '',
        services: d.services || '',
        team: d.team || '',
        contact_info: d.contact_info || '',
      }))
      .catch(e => setErr(e?.response?.data?.detail || t('about.error_load')))
      .finally(() => setLoading(false))
  }, [lang])

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
      setErr(e?.response?.data?.detail || t('about.error_save'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">{t('common.loading')}</div>
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="mb-6">
        <h2 className="text-lg md:text-xl font-bold text-slate-800">{t('about.admin_title')}</h2>
        <p className="text-sm text-slate-500 mt-1">
          {t('about.admin_subtitle')}
        </p>
      </div>

      {err && (
        <div className="mb-4 px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 border border-red-100">
          {err}
        </div>
      )}
      {saved && (
        <div className="mb-4 px-3 py-2 rounded-lg text-sm bg-green-50 text-green-700 border border-green-100">
          ✓ {t('about.saved')}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-4 md:p-6 space-y-5">
        {FIELDS.map(f => (
          <div key={f.key}>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">{t(f.labelKey)}</label>
            <textarea
              value={form[f.key]}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              rows={f.rows}
              placeholder={t(f.placeholderKey)}
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
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </div>
  )
}
