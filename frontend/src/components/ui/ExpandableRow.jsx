import { useState, useId } from 'react'

function ChevronIcon({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`w-4 h-4 flex-shrink-0 text-[var(--text-3)] transition-transform ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

/**
 * Carte/ligne cliquable qui révèle un panneau de détails au clic.
 *
 * Props:
 *  - summary    : ReactNode — vue compacte toujours visible (en-tête + valeur + statut)
 *  - children   : ReactNode — détail révélé à l'ouverture (actions, métadonnées…)
 *  - defaultOpen: boolean
 *  - className  : classes additionnelles sur le wrapper
 *  - badge      : ReactNode optionnel placé à droite de la flèche
 *  - onToggle   : callback(open) si le parent veut tracker l'état
 *  - id         : id explicite pour le panneau (sinon généré via useId)
 *  - density    : 'comfortable' (par défaut) | 'compact'
 */
export default function ExpandableRow({
  summary,
  children,
  defaultOpen = false,
  className = '',
  badge,
  onToggle,
  id,
  density = 'comfortable',
}) {
  const [open, setOpen] = useState(defaultOpen)
  const autoId = useId()
  const panelId = id || `expandable-${autoId}`

  const padding = density === 'compact' ? 'px-3 py-2.5' : 'px-3.5 py-3 sm:px-4 sm:py-3.5'

  return (
    <div
      className={`bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl overflow-hidden transition-shadow ${open ? 'shadow-[var(--shadow-card)]' : 'hover:shadow-[var(--shadow-sm)]'} ${className}`}
    >
      <button
        type="button"
        onClick={() => {
          const next = !open
          setOpen(next)
          onToggle?.(next)
        }}
        aria-expanded={open}
        aria-controls={panelId}
        className={`w-full text-left flex items-center gap-2 sm:gap-3 ${padding} hover:bg-[var(--bg-subtle)] transition-colors`}
      >
        <div className="flex-1 min-w-0">{summary}</div>
        {badge && <div className="flex-shrink-0">{badge}</div>}
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div
          id={panelId}
          className="border-t border-[var(--border-subtle)] px-3.5 sm:px-4 py-3 sm:py-3.5 bg-[var(--bg-app)]"
        >
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * Helper d'affichage clé/valeur pour le détail (label gris, valeur foncée).
 */
export function DetailRow({ label, value, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-3 py-1.5 ${className}`}>
      <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-3)]">{label}</span>
      <span className="text-[13px] font-medium text-[var(--text-1)] text-right break-words min-w-0">{value}</span>
    </div>
  )
}

/**
 * Groupe d'actions aligné, qui wrap proprement.
 */
export function ActionGroup({ children, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 mt-3 actions-wrap ${className}`}>
      {children}
    </div>
  )
}
