import { useEffect, useState } from 'react'
import { listFaq, createFaq, updateFaq, deleteFaq } from '../../api/faq.api'

function FaqRow({ item, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    question: item.question,
    answer: item.answer,
    category: item.category || '',
    sort_order: item.sort_order ?? 0,
    is_published: item.is_published,
  })
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      await onSave(item.id, draft)
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  const togglePublish = async () => {
    setBusy(true)
    try {
      await onSave(item.id, { is_published: !item.is_published })
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-4 border-2 border-[var(--color-primary)]/30">
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Question</label>
            <input
              value={draft.question}
              onChange={e => setDraft(p => ({ ...p, question: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Réponse</label>
            <textarea
              value={draft.answer}
              onChange={e => setDraft(p => ({ ...p, answer: e.target.value }))}
              rows={4}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Catégorie</label>
              <input
                value={draft.category}
                onChange={e => setDraft(p => ({ ...p, category: e.target.value }))}
                placeholder="Général, Compte, Investissement…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Ordre</label>
              <input
                type="number"
                value={draft.sort_order}
                onChange={e => setDraft(p => ({ ...p, sort_order: Number(e.target.value) || 0 }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={draft.is_published}
              onChange={e => setDraft(p => ({ ...p, is_published: e.target.checked }))}
            />
            Publié (visible par les investisseurs)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-sm px-3 py-1.5 text-slate-500 hover:text-slate-700"
            >Annuler</button>
            <button
              type="button"
              onClick={save}
              disabled={busy || !draft.question.trim() || !draft.answer.trim()}
              className="text-sm px-4 py-1.5 rounded-lg text-white disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {item.category && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                {item.category}
              </span>
            )}
            {item.is_published ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">Publié</span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-200">Brouillon</span>
            )}
            <span className="text-[10px] text-slate-400">#{item.sort_order ?? 0}</span>
          </div>
          <h4 className="font-semibold text-slate-800 text-sm">{item.question}</h4>
          <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{item.answer}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={togglePublish}
            disabled={busy}
            className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            title={item.is_published ? 'Dépublier' : 'Publier'}
          >
            {item.is_published ? 'Masquer' : 'Publier'}
          </button>
          <button
            onClick={() => setEditing(true)}
            className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >Modifier</button>
          <button
            onClick={() => onDelete(item.id)}
            className="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
          >Supprimer</button>
        </div>
      </div>
    </div>
  )
}

export default function FaqPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({
    question: '', answer: '', category: '', sort_order: 0, is_published: true,
  })
  const [busy, setBusy] = useState(false)

  const reload = () =>
    listFaq()
      .then(list => { setItems(list); setErr('') })
      .catch(e => setErr(e?.response?.data?.detail || 'Impossible de charger la FAQ'))

  useEffect(() => {
    reload().finally(() => setLoading(false))
  }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!draft.question.trim() || !draft.answer.trim()) return
    setBusy(true)
    try {
      const created = await createFaq(draft)
      setItems(prev => [...prev, created].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)))
      setDraft({ question: '', answer: '', category: '', sort_order: 0, is_published: true })
      setAdding(false)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Erreur lors de la création')
    } finally {
      setBusy(false)
    }
  }

  const handleSave = async (id, patch) => {
    const updated = await updateFaq(id, patch)
    setItems(prev => prev.map(it => it.id === id ? updated : it)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)))
  }

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette entrée FAQ ?')) return
    try {
      await deleteFaq(id)
      setItems(prev => prev.filter(it => it.id !== id))
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Erreur lors de la suppression')
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">Chargement…</div>
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-4 md:mb-6 gap-3 flex-wrap">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-slate-800">FAQ — Gestion</h2>
          <p className="text-sm text-slate-500 mt-1">
            Questions fréquemment posées par les investisseurs. Seules les entrées « publiées » sont visibles.
          </p>
        </div>
        <button
          onClick={() => setAdding(v => !v)}
          className="px-3 md:px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {adding ? 'Fermer' : '+ Nouvelle question'}
        </button>
      </div>

      {err && (
        <div className="mb-4 px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 border border-red-100">
          {err}
        </div>
      )}

      {adding && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl shadow-sm p-4 md:p-5 mb-5 space-y-3 border-2 border-[var(--color-primary)]/30">
          <h3 className="font-semibold text-slate-700 text-sm">Nouvelle entrée FAQ</h3>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Question *</label>
            <input
              value={draft.question}
              onChange={e => setDraft(p => ({ ...p, question: e.target.value }))}
              required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Réponse *</label>
            <textarea
              value={draft.answer}
              onChange={e => setDraft(p => ({ ...p, answer: e.target.value }))}
              required
              rows={4}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Catégorie</label>
              <input
                value={draft.category}
                onChange={e => setDraft(p => ({ ...p, category: e.target.value }))}
                placeholder="Général, Compte, Investissement…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Ordre d'affichage</label>
              <input
                type="number"
                value={draft.sort_order}
                onChange={e => setDraft(p => ({ ...p, sort_order: Number(e.target.value) || 0 }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={draft.is_published}
              onChange={e => setDraft(p => ({ ...p, is_published: e.target.checked }))}
            />
            Publier immédiatement
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700"
            >Annuler</button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-1.5 rounded-lg text-white text-sm disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {busy ? 'Création…' : 'Créer'}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {items.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center text-sm text-slate-400">
            Aucune entrée FAQ. Cliquez sur « + Nouvelle question » pour commencer.
          </div>
        )}
        {items.map(item => (
          <FaqRow key={item.id} item={item} onSave={handleSave} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  )
}
