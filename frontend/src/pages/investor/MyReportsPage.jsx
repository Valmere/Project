import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { getMyReports } from '../../api/reports.api'
import { usePrefsStore, useT } from '../../store/prefs.store'
import { formatDate } from '../../utils/format'
import ExpandableRow, { DetailRow, ActionGroup } from '../../components/ui/ExpandableRow'

const Icons = {
  download: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  view: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  ),
}

const pad = (value) => String(value).padStart(2, '0')

function getCountdown(target) {
  if (!target) return null
  const diff = new Date(target).getTime() - Date.now()
  if (diff <= 0) return null
  const totalSeconds = Math.floor(diff / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return days > 0
    ? `${days}j ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

function isAvailable(report) {
  return report.status === 'ready' && !!report.published_at
}

export default function MyReportsPage() {
  const navigate = useNavigate()
  const t = useT()
  const { lang, currency } = usePrefsStore()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [tick, setTick] = useState(0)

  const reloadReports = async () => {
    setLoading(true)
    setErr('')
    try {
      const data = await getMyReports()
      setReports(Array.isArray(data) ? data : [])
    } catch (e) {
      setErr(e?.response?.data?.detail || t('reports.error_load'))
      setReports([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reloadReports() }, [])
  useEffect(() => {
    const id = window.setInterval(() => setTick(v => v + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  const orderedReports = useMemo(() => {
    void tick
    return [...reports].sort((a, b) => {
      const ad = new Date(a.available_at || a.generated_at || a.created_at || 0).getTime()
      const bd = new Date(b.available_at || b.generated_at || b.created_at || 0).getTime()
      return bd - ad
    })
  }, [reports, tick])

  const downloadReport = async (report) => {
    // On passe la langue + la devise courantes de l'investisseur : le backend
    // régénère le PDF/Excel à la volée pour qu'il soit dans la langue choisie
    // (et non figé sur celle de l'admin au moment de la publication).
    const res = await api.get(`/reports/${report.id}/download`, {
      responseType: 'blob',
      params: { lang, display_currency: currency },
    })
    const cd = res.headers?.['content-disposition'] || ''
    const match = /filename="?([^"]+)"?/.exec(cd)
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = match ? match[1] : `rapport_${report.id}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const viewReport = (report) => {
    navigate(`/investor/reports/${report.id}`)
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-slate-800">{t('reports.title')}</h2>
          <p className="text-sm text-slate-500 mt-1">{t('reports.subtitle_published')}</p>
        </div>
        <button
          onClick={reloadReports}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50"
        >
          {Icons.refresh} {t('reports.refresh')}
        </button>
      </div>

      {err && (
        <div className="px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 border border-red-100">{err}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 md:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">{t('reports.published_reports')}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{t('reports.published_hint')}</p>
          </div>
          <span className="text-[11px] text-slate-400">{orderedReports.length} PDF</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">{t('reports.loading')}</div>
        ) : orderedReports.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">{t('reports.no_published')}</div>
        ) : (
          <>
            {/* ─── Vue mobile : carte compacte + détails au clic ─── */}
            <div className="md:hidden divide-y divide-[var(--border-subtle)] p-2">
              {orderedReports.map(report => {
                const ready = isAvailable(report)
                const countdown = getCountdown(report.available_at)
                const isScheduleDue = report.status === 'scheduled' && report.available_at && new Date(report.available_at).getTime() <= Date.now()
                const period = report.status === 'scheduled'
                  ? t('reports.period_to_define')
                  : report.period_start
                  ? `${formatDate(report.period_start, lang)} → ${formatDate(report.period_end, lang)}`
                  : t('reports.all_transactions')
                // Date + heure de publication (ou génération). On l'affiche
                // dans le résumé pour que l'utilisateur sache immédiatement
                // quand le rapport est disponible avant de l'ouvrir.
                const stampSource = ready
                  ? (report.published_at || report.generated_at)
                  : report.available_at
                const stamp = stampSource
                  ? formatDate(stampSource, lang, {
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })
                  : null
                return (
                  <div key={`m-${report.id}`} className="py-1">
                    <ExpandableRow
                      density="compact"
                      className="!rounded-lg"
                      summary={
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[14px] font-semibold text-[var(--text-1)] truncate capitalize">
                              {report.report_type || t('report.type.statement')}
                            </span>
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex-shrink-0 ${
                              ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}>
                              {ready ? t('reports.ready') : t('reports.scheduled')}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] truncate" style={{ color: 'var(--text-3)' }}>
                            {period}
                          </div>
                          {stamp && (
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--text-2)' }}>
                              <span className="text-[var(--text-3)]">{Icons.clock}</span>
                              {stamp}
                            </div>
                          )}
                          {!ready && countdown && (
                            <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700">
                              {Icons.clock} {t('reports.ready_in')} {countdown}
                            </div>
                          )}
                        </div>
                      }
                    >
                      <DetailRow
                        label={ready ? t('reports.generated_on_label') || t('common.generated_on') : t('reports.scheduled_label') || t('reports.scheduled')}
                        value={
                          !ready && report.available_at
                            ? formatDate(report.available_at, lang, {
                                day: '2-digit', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })
                            : report.published_at || report.generated_at
                            ? formatDate(report.published_at || report.generated_at, lang, {
                                day: '2-digit', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })
                            : t('reports.pending_publication')
                        }
                      />
                      <DetailRow label={t('admin_reports.col.period') || 'Période'} value={period} />
                      {report.signature_name && (
                        <DetailRow label={t('reports.signed_with') || 'Signé par'} value={report.signature_name} />
                      )}
                      {!ready && isScheduleDue && (
                        <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-[12px] font-medium">
                          {Icons.clock} {t('reports.awaiting_admin_publication')}
                        </div>
                      )}

                      <ActionGroup>
                        <button
                          onClick={() => viewReport(report)}
                          disabled={!ready}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {Icons.view} {t('common.view')}
                        </button>
                        <button
                          onClick={() => downloadReport(report)}
                          disabled={!ready}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ backgroundColor: 'var(--color-primary)' }}
                        >
                          {Icons.download} {t('common.download') || 'PDF'}
                        </button>
                      </ActionGroup>
                    </ExpandableRow>
                  </div>
                )
              })}
            </div>

            {/* ─── Vue desktop : layout horizontal classique ─── */}
            <div className="hidden md:block divide-y divide-slate-50">
              {orderedReports.map(report => {
                const ready = isAvailable(report)
                const countdown = getCountdown(report.available_at)
                const isScheduleDue = report.status === 'scheduled' && report.available_at && new Date(report.available_at).getTime() <= Date.now()
                const period = report.status === 'scheduled'
                  ? t('reports.period_to_define')
                  : report.period_start
                  ? `${formatDate(report.period_start, lang)} → ${formatDate(report.period_end, lang)}`
                  : t('reports.all_transactions')
                return (
                  <div key={report.id} className="p-4 md:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800 capitalize">{report.report_type || t('report.type.statement')}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${
                          ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {ready ? t('reports.ready') : t('reports.scheduled')}
                        </span>
                      </div>
                      <div className="text-[12px] text-slate-500 mt-1">
                        {period}
                        {' — '}
                        {!ready && report.available_at
                          ? t('reports.scheduled_for', { date: formatDate(report.available_at, lang, {
                              day: '2-digit', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            }) })
                          : report.published_at || report.generated_at
                          ? t('reports.generated_on', { date: formatDate(report.published_at || report.generated_at, lang, {
                              day: '2-digit', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            }) })
                          : t('reports.pending_publication')}
                      </div>
                      {report.signature_name && (
                        <div className="text-[11px] text-slate-400 mt-1">
                          {t('reports.signed_with')} {report.signature_name}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      {!ready && countdown && (
                        <div className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 text-amber-700 text-xs font-medium">
                          {Icons.clock}
                          {t('reports.ready_in')} {countdown}
                        </div>
                      )}
                      {!ready && isScheduleDue && (
                        <div className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 text-amber-700 text-xs font-medium">
                          {Icons.clock}
                          {t('reports.awaiting_admin_publication')}
                        </div>
                      )}
                      <button
                        onClick={() => viewReport(report)}
                        disabled={!ready}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {Icons.view} {t('common.view')}
                      </button>
                      <button
                        onClick={() => downloadReport(report)}
                        disabled={!ready}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ backgroundColor: 'var(--color-primary)' }}
                      >
                        {Icons.download} PDF
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
