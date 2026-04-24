import { useState, useRef, useEffect } from 'react'

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
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`btn btn-secondary ${height} ${textSize} justify-between ${fullWidth ? 'w-full' : ''} ${className}`}
        style={{ minWidth }}
      >
        <span className="flex items-center gap-2 min-w-0">
          {icon && <span className="text-[var(--text-3)] flex-shrink-0">{icon}</span>}
          {selected?.icon && <span className="flex-shrink-0">{selected.icon}</span>}
          <span className="truncate" style={{ color: selected ? 'var(--text-1)' : 'var(--text-3)' }}>
            {selected?.label || placeholder}
          </span>
        </span>
        <span className="text-[var(--text-3)] flex-shrink-0 ml-2">
          <ChevronDown />
        </span>
      </button>

      {open && (
        <div
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1.5 min-w-full max-h-[300px] overflow-y-auto rounded-xl z-40 animate-fade py-1`}
          style={{
            background: 'var(--bg-surface)',
            boxShadow: 'var(--shadow-dropdown)',
            border: '1px solid var(--border)',
            minWidth: Math.max(minWidth, 180),
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
      )}
    </div>
  )
}
