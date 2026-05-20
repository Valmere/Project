import { CalendarDays, X } from 'lucide-react'
import { useT } from '../../store/prefs.store'

export default function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClear,
  className = '',
}) {
  const t = useT()
  const hasDates = Boolean(startDate || endDate)

  return (
    <div className={`flex flex-col sm:flex-row sm:items-end gap-2 ${className}`}>
      {/* Mobile : deux dates côte à côte, sans labels (icône calendrier suffit) */}
      <div className="flex sm:hidden items-center gap-1.5 w-full">
        <div className="relative flex-1 min-w-0">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-3)' }}>
            <CalendarDays size={14} />
          </span>
          <input
            type="date"
            aria-label={t('filter.from')}
            value={startDate || ''}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="input input-sm pl-8 h-9 w-full"
          />
        </div>
        <span className="text-[var(--text-3)] text-xs">→</span>
        <div className="relative flex-1 min-w-0">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-3)' }}>
            <CalendarDays size={14} />
          </span>
          <input
            type="date"
            aria-label={t('filter.to')}
            value={endDate || ''}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="input input-sm pl-8 h-9 w-full"
          />
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={!hasDates}
          aria-label={t('filter.clear_dates')}
          className="w-9 h-9 rounded-lg inline-flex items-center justify-center transition disabled:opacity-40 flex-shrink-0"
          style={{ color: 'var(--text-3)', border: '1px solid var(--border)' }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Desktop : labels au-dessus (inchangé) */}
      <div className="hidden sm:flex items-end gap-2">
        <div className="flex flex-col">
          <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
            {t('filter.from')}
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-3)' }}>
              <CalendarDays size={15} />
            </span>
            <input
              type="date"
              value={startDate || ''}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="input input-sm pl-9 h-9 w-full sm:w-[165px]"
            />
          </div>
        </div>

        <div className="flex flex-col">
          <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
            {t('filter.to')}
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-3)' }}>
              <CalendarDays size={15} />
            </span>
            <input
              type="date"
              value={endDate || ''}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="input input-sm pl-9 h-9 w-full sm:w-[165px]"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onClear}
          disabled={!hasDates}
          title={t('filter.clear_dates')}
          className="w-9 h-9 rounded-lg inline-flex items-center justify-center transition disabled:opacity-40"
          style={{ color: 'var(--text-3)', border: '1px solid var(--border)' }}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
