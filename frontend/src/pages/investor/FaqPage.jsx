import { useEffect, useMemo, useState } from 'react'
import { listFaq } from '../../api/faq.api'

function AccordionItem({ item }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 md:p-5 text-left hover:bg-slate-50"
      >
        <span className="font-semibold text-slate-800 text-sm md:text-[15px]">{item.question}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`w-4 h-4 flex-shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="px-4 md:px-5 pb-4 md:pb-5 border-t border-slate-100">
          <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed pt-3">
            {item.answer}
          </p>
        </div>
      )}
    </div>
  )
}

export default function InvestorFaqPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [activeCat, setActiveCat] = useState('ALL')

  useEffect(() => {
    listFaq()
      .then(setItems)
      .catch(e => setErr(e?.response?.data?.detail || 'Impossible de charger la FAQ'))
      .finally(() => setLoading(false))
  }, [])

  const categories = useMemo(() => {
    const set = new Set()
    items.forEach(it => { if (it.category) set.add(it.category) })
    return ['ALL', ...Array.from(set).sort()]
  }, [items])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter(it => {
      if (activeCat !== 'ALL' && it.category !== activeCat) return false
      if (!needle) return true
      return (
        it.question.toLowerCase().includes(needle) ||
        it.answer.toLowerCase().includes(needle)
      )
    })
  }, [items, q, activeCat])

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">Chargement…</div>
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <div className="mb-5 md:mb-6">
        <h2 className="text-lg md:text-xl font-bold text-slate-800">Questions fréquentes</h2>
        <p className="text-sm text-slate-500 mt-1">
          Trouvez rapidement des réponses aux questions les plus courantes.
        </p>
      </div>

      {err && (
        <div className="mb-4 px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 border border-red-100">{err}</div>
      )}

      {/* Search */}
      <div className="mb-4">
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Rechercher dans la FAQ…"
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        />
      </div>

      {/* Category tabs */}
      {categories.length > 1 && (
        <div className="mb-4 flex gap-2 flex-wrap">
          {categories.map(cat => {
            const isActive = activeCat === cat
            return (
              <button
                key={cat}
                onClick={() => setActiveCat(cat)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${isActive
                  ? 'text-white border-transparent'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                style={isActive ? { backgroundColor: 'var(--color-primary)' } : undefined}
              >
                {cat === 'ALL' ? 'Toutes' : cat}
              </button>
            )
          })}
        </div>
      )}

      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center text-sm text-slate-400">
            {items.length === 0
              ? "Aucune question pour l'instant."
              : 'Aucun résultat pour cette recherche.'}
          </div>
        ) : (
          filtered.map(item => <AccordionItem key={item.id} item={item} />)
        )}
      </div>
    </div>
  )
}
