import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

function ChevronDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 flex-shrink-0">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 flex-shrink-0">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

/**
 * Premium dropdown select.
 *
 * Props:
 *  - value: currently selected value
 *  - onChange: (value) => void
 *  - options: [{ value, label, description?, icon?, disabled? }]
 *  - placeholder: string
 *  - icon: optional leading icon
 *  - label: optional label above
 *  - size: 'sm' | 'md' (default 'md')
 *  - align: 'left' | 'right' — dropdown alignment
 *  - className: extra button classes
 *  - fullWidth: boolean
 */
export default function Select({
  value,
  onChange,
  options = [],
  placeholder = '—',
  icon,
  label,
  size = 'md',
  align = 'left',
  className = '',
  fullWidth = false,
  minWidth = 160,
  // Chip mode : bouton compact sans largeur min, idéal en barre de filtres mobile.
  chip = false,
  // Étiquette d'accessibilité quand on n'affiche pas de `label` visible.
  ariaLabel,
  // Override de la valeur affichée dans le trigger (sinon = selected.label).
  displayValue,
}) {
  const [open, setOpen] = useState(false)
  const [portalStyle, setPortalStyle] = useState(null)
  const ref = useRef(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    function handler(e) {
      const inTrigger = ref.current && ref.current.contains(e.target)
      const inMenu = menuRef.current && menuRef.current.contains(e.target)
      if (!inTrigger && !inMenu) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    // Sur iOS Safari les `mousedown` ne sont pas toujours fiables pour les
    // taps en dehors d'un portail position:fixed. On double avec touchstart
    // pour fermer proprement le menu chip au tap sur le fond.
    document.addEventListener('touchstart', handler, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [])

  // Quand on referme, on remet à zéro la position du portail pour que
  // la prochaine ouverture recalcule par rapport à la position courante
  // du chip (très important si l'utilisateur a scrollé entre-temps).
  useEffect(() => {
    if (!open) setPortalStyle(null)
  }, [open])

  const computePortalStyle = () => {
    if (!chip || !buttonRef.current) return null
    const rect = buttonRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    // On évite minWidth=180 imposé pour les chips : ça forçait le menu hors
    // viewport sur les petits téléphones. On respecte la largeur du chip,
    // bornée entre 200 et la largeur dispo.
    const targetWidth = Math.min(
      Math.max(rect.width, 200),
      viewportWidth - 16,
    )
    const wantedLeft = align === 'right' ? rect.right - targetWidth : rect.left
    const left = Math.max(8, Math.min(wantedLeft, viewportWidth - targetWidth - 8))
    // Préférence : ouverture sous le chip. Si pas la place, on ouvre au-dessus.
    const spaceBelow = viewportHeight - rect.bottom - 12
    const spaceAbove = rect.top - 12
    const openUpwards = spaceBelow < 200 && spaceAbove > spaceBelow
    const maxH = Math.max(160, Math.min(320, openUpwards ? spaceAbove : spaceBelow))
    const top = openUpwards ? rect.top - 6 - maxH : rect.bottom + 6
    return {
      position: 'fixed',
      top: Math.max(8, top),
      left,
      width: targetWidth,
      maxHeight: maxH,
      zIndex: 80,
    }
  }

  const updatePortalPosition = () => {
    const next = computePortalStyle()
    if (next) setPortalStyle(next)
  }

  useLayoutEffect(() => {
    if (!open || !chip) return
    // Recalcul après mount pour caler exactement, puis suivre resize/scroll.
    updatePortalPosition()
    window.addEventListener('resize', updatePortalPosition)
    window.addEventListener('scroll', updatePortalPosition, true)
    return () => {
      window.removeEventListener('resize', updatePortalPosition)
      window.removeEventListener('scroll', updatePortalPosition, true)
    }
  }, [open, chip, align, minWidth])

  const selected = options.find((o) => o.value === value)
  const height = size === 'sm' ? 'h-8' : 'h-9'
  const textSize = size === 'sm' ? 'text-[12px]' : 'text-[13px]'

  return (
    <div className={`relative ${fullWidth ? 'w-full' : ''}`} ref={ref}>
      {label && (
        <label
          className="block text-[12px] font-medium mb-1.5"
          style={{ color: 'var(--text-2)' }}
        >
          {label}
        </label>
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setOpen((v) => {
            const next = !v
            if (next && chip) {
              // Pré-calcul synchrone de la position avant le render du menu
              // pour éviter le flash en haut de page sur mobile.
              const initial = computePortalStyle()
              if (initial) setPortalStyle(initial)
            }
            return next
          })
        }}
        aria-label={ariaLabel || label}
        className={`${chip
          ? `inline-flex items-center gap-1.5 ${height} px-2.5 ${textSize} rounded-full border whitespace-nowrap`
          : `btn btn-secondary ${height} ${textSize} justify-between ${fullWidth ? 'w-full' : ''}`} ${className}`}
        style={chip
          ? {
              borderColor: 'var(--border)',
              background: 'var(--bg-surface)',
              color: 'var(--text-1)',
              flexShrink: 0,
            }
          : { minWidth }
        }
      >
        <span className={`flex items-center gap-1.5 min-w-0 ${chip ? '' : 'gap-2'}`}>
          {icon && <span className="text-[var(--text-3)] flex-shrink-0">{icon}</span>}
          {selected?.icon && <span className="flex-shrink-0">{selected.icon}</span>}
          <span className="truncate" style={{ color: selected ? 'var(--text-1)' : 'var(--text-3)' }}>
            {displayValue ?? selected?.label ?? placeholder}
          </span>
        </span>
        <span className="text-[var(--text-3)] flex-shrink-0 ml-1.5">
          <ChevronDown />
        </span>
      </button>

      {open && (() => {
        // Guard pour le mode chip : tant que portalStyle n'est pas calculé,
        // on rend le menu hors-écran et invisible plutôt qu'au milieu de
        // document.body avec un layout non défini (cause de glitch mobile).
        const chipFallbackStyle = {
          position: 'fixed',
          top: -9999,
          left: -9999,
          width: 200,
          maxHeight: 0,
          opacity: 0,
          pointerEvents: 'none',
          zIndex: 80,
        }
        const menu = (
        <div
          ref={menuRef}
          className={`${chip ? '' : `absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1.5 min-w-full max-h-[300px] z-40`} overflow-y-auto rounded-xl animate-fade py-1`}
          style={{
            background: 'var(--bg-surface)',
            boxShadow: 'var(--shadow-dropdown)',
            border: '1px solid var(--border)',
            minWidth: chip ? undefined : Math.max(minWidth, 180),
            ...(chip ? (portalStyle || chipFallbackStyle) : {}),
          }}
        >
          {options.length === 0 ? (
            <div className="px-3.5 py-4 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>
              —
            </div>
          ) : (
            options.map((opt) => {
              const isActive = opt.value === value
              return (
                <button
                  key={opt.value ?? '__null__'}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => { onChange(opt.value); setOpen(false) }}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors ${opt.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[var(--bg-subtle)]'}`}
                  style={{ fontSize: 13, color: isActive ? 'var(--text-1)' : 'var(--text-2)' }}
                >
                  {opt.icon && <span className="flex-shrink-0">{opt.icon}</span>}
                  <span className="flex-1 min-w-0">
                    <span className={`block truncate ${isActive ? 'font-semibold' : ''}`}>{opt.label}</span>
                    {opt.description && (
                      <span className="block text-[11px] truncate" style={{ color: 'var(--text-3)' }}>
                        {opt.description}
                      </span>
                    )}
                  </span>
                  {isActive && (
                    <span style={{ color: 'var(--color-primary)' }}>
                      <CheckIcon />
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
        )
        return chip && typeof document !== 'undefined'
          ? createPortal(menu, document.body)
          : menu
      })()}
    </div>
  )
}
