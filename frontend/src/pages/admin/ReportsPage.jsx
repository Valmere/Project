import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { generateReport, previewReport, publishReport, scheduleReport } from '../../api/reports.api'
import ShareModal from '../../components/reports/ShareModal'
import StatementViewer from '../../components/reports/StatementViewer'
import { usePrefsStore, useT } from '../../store/prefs.store'
import { formatDate } from '../../utils/format'
import ExpandableRow, { DetailRow, ActionGroup } from '../../components/ui/ExpandableRow'

const Icons = {
  view: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  download: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  share: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  ),
  cog: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  ),
}

function SignaturePublishModal({ t, generating, onClose, onPublish, targetCount }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const [signatureDataUrl, setSignatureDataUrl] = useState('')
  const [signatureName, setSignatureName] = useState('')
  const [err, setErr] = useState('')

  const point = (event) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  const exportCroppedCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return ''
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas
    const pixels = ctx.getImageData(0, 0, width, height)
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    let found = false

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = (y * width + x) * 4
        if (pixels.data[idx + 3] > 12) {
          found = true
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        }
      }
    }

    if (!found) return ''
    const pad = 18
    minX = Math.max(0, minX - pad)
    minY = Math.max(0, minY - pad)
    maxX = Math.min(width, maxX + pad)
    maxY = Math.min(height, maxY + pad)

    const out = document.createElement('canvas')
    out.width = Math.max(1, maxX - minX)
    out.height = Math.max(1, maxY - minY)
    out.getContext('2d').drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height)
    return out.toDataURL('image/png')
  }

  const beginDraw = (event) => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const p = point(event)
    drawingRef.current = true
    ctx.strokeStyle = '#1A2740'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  const draw = (event) => {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const p = point(event)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  const endDraw = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    const cropped = exportCroppedCanvas()
    if (cropped) {
      setSignatureDataUrl(cropped)
      setSignatureName(t('admin_reports.signature_drawn'))
    }
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setSignatureDataUrl('')
    setSignatureName('')
    setErr('')
  }

  const handleUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErr(t('admin_reports.signature_error_image'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setSignatureDataUrl(String(reader.result || ''))
      setSignatureName(file.name)
      setErr('')
    }
    reader.readAsDataURL(file)
  }

  const submit = () => {
    const drawn = exportCroppedCanvas()
    const finalSignature = drawn || signatureDataUrl
    if (!finalSignature) {
      setErr(t('admin_reports.signature_required'))
      return
    }
    onPublish({ signatureDataUrl: finalSignature, signatureName })
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 flex items-center justify-center p-4 modal-mobile-sheet-overlay">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden modal-mobile-sheet-panel">
        <div className="p-5 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-900">{t('admin_reports.signature_title')}</h3>
          <p className="text-sm text-slate-500 mt-1">
            {t('admin_reports.signature_subtitle')} {targetCount > 1 ? t('admin_reports.batch_count', { count: targetCount }) : ''}
          </p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('admin_reports.signature_upload')}</label>
            <input type="file" accept="image/png,image/jpeg" onChange={handleUpload}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <label className="block text-xs text-slate-500">{t('admin_reports.signature_draw')}</label>
              <button type="button" onClick={clearSignature} className="text-xs text-slate-500 hover:text-slate-800">
                {t('common.clear')}
              </button>
            </div>
            <canvas
              ref={canvasRef}
              width={720}
              height={180}
              onPointerDown={beginDraw}
              onPointerMove={draw}
              onPointerUp={endDraw}
              onPointerLeave={endDraw}
              className="w-full h-40 rounded-xl border border-dashed border-slate-300 bg-[#FDF9EE] touch-none"
            />
          </div>
          {signatureDataUrl && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {t('admin_reports.signature_ready')} {signatureName ? `- ${signatureName}` : ''}
            </div>
          )}
          {err && <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{err}</div>}
        </div>
        <div className="p-5 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={onClose} disabled={generating}
            className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 disabled:opacity-50">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={submit} disabled={generating}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-primary)' }}>
            {generating ? t('admin_reports.generating') : t('admin_reports.publish_confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

function PreviewModal({ data, lang, t, onClose }) {
  return (
    <div className="fixed inset-0 z-40 bg-slate-950/45 overflow-y-auto p-3 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="sticky top-3 z-10 mb-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow"
          >
            {t('common.close')}
          </button>
        </div>
        <div className="rounded-2xl bg-[#FAFAF7] p-4 md:p-6 shadow-xl">
          <StatementViewer data={data} lang={lang} />
        </div>
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const t = useT()
  const { lang, currency } = usePrefsStore()
  const [investors, setInvestors] = useState([])
  const [reports, setReports] = useState([])
  const [form, setForm] = useState({
    investor_ids: [],
    all_active: false,
    period_start: '',
    period_end: '',
    available_at: '',
  })
  const [busy, setBusy] = useState(false)
  const [filterInvestor, setFilterInvestor] = useState('')
  const [showScheduledOnly, setShowScheduledOnly] = useState(false)
  const [shareTarget, setShareTarget] = useState(null)
  const [publishDraft, setPublishDraft] = useState(null)
  const [previewData, setPreviewData] = useState(null)
  const reportsListRef = useRef(null)
  const dash = '-'

  useEffect(() => {
    api.get('/investors').then(r => setInvestors(r.data))
    api.get('/reports').then(r => setReports(r.data))
  }, [])

  const activeInvestors = useMemo(
    () => investors.filter(inv => String(inv.status || '').toLowerCase() === 'active'),
    [investors],
  )
  const selectedIds = form.all_active ? activeInvestors.map(inv => inv.id) : form.investor_ids
  const selectedCount = selectedIds.length
  const investorMap = useMemo(() => Object.fromEntries(investors.map(i => [i.id, i])), [investors])
  const filtered = reports.filter((report) => {
    if (filterInvestor && report.investor_id !== filterInvestor) return false
    if (showScheduledOnly && report.status !== 'scheduled') return false
    return true
  })
  const isFutureSchedule = form.available_at && new Date(form.available_at).getTime() > Date.now()
  const dueScheduledReports = reports.filter(r =>
    r.status === 'scheduled' &&
    r.available_at &&
    new Date(r.available_at).getTime() <= Date.now()
  )
  const scheduledDue = dueScheduledReports.length

  const focusScheduledReports = () => {
    setFilterInvestor('')
    setShowScheduledOnly(true)
    window.setTimeout(() => {
      reportsListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  useEffect(() => {
    const view = new URLSearchParams(location.search).get('view')
    if (view === 'scheduled') {
      focusScheduledReports()
    }
  }, [location.search])

  const basePayload = (investorId) => ({
    investor_id: investorId,
    report_type: 'statement',
    period_start: form.period_start || null,
    period_end: form.period_end || null,
    lang,
    display_currency: currency,
  })

  const requireSelection = () => {
    if (selectedCount > 0) return true
    alert(t('admin_reports.select_required'))
    return false
  }

  const requireSingleSelection = () => {
    if (!requireSelection()) return false
    if (selectedCount === 1) return true
    alert(t('admin_reports.preview_one'))
    return false
  }

  const toggleInvestor = (investorId) => {
    setForm(p => {
      const current = new Set(p.investor_ids)
      if (current.has(investorId)) current.delete(investorId)
      else current.add(investorId)
      return { ...p, investor_ids: Array.from(current), all_active: false }
    })
  }

  const downloadBlob = async (report) => {
    // L'admin télécharge dans sa propre langue/devise courante (sinon le PDF
    // resterait figé sur la valeur initiale de publication).
    const res = await api.get(`/reports/${report.id}/download`, {
      responseType: 'blob',
      params: { lang, display_currency: currency },
    })
    const cd = res.headers?.['content-disposition'] || ''
    const match = /filename="?([^"]+)"?/.exec(cd)
    const ext = report.format === 'pdf' ? 'pdf' : 'xlsx'
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = match ? match[1] : `rapport_${report.id}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePreview = async () => {
    if (!requireSingleSelection()) return
    setBusy(true)
    try {
      const data = await previewReport({ ...basePayload(selectedIds[0]), format: 'pdf' })
      setPreviewData(data)
    } catch (err) {
      alert(err.response?.data?.detail || t('admin_reports.error_generate'))
    } finally {
      setBusy(false)
    }
  }

  const handleAdminExport = async (format) => {
    if (!requireSelection()) return
    setBusy(true)
    try {
      const generated = []
      for (const investorId of selectedIds) {
        const report = await generateReport({ ...basePayload(investorId), format })
        generated.push(report)
        await downloadBlob(report)
      }
      setReports(prev => [...generated, ...prev])
    } catch (err) {
      alert(err.response?.data?.detail || t('admin_reports.error_generate'))
    } finally {
      setBusy(false)
    }
  }

  const beginPublish = async (event) => {
    event.preventDefault()
    if (!requireSelection()) return
    const payload = {
      investor_ids: selectedIds,
      all_active: form.all_active,
      report_type: 'statement',
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      available_at: form.available_at ? new Date(form.available_at).toISOString() : null,
      lang,
      display_currency: currency,
    }

    if (isFutureSchedule) {
      setBusy(true)
      try {
        const created = await scheduleReport({ ...payload, period_start: null, period_end: null })
        const list = Array.isArray(created) ? created : [created]
        setReports(prev => [...list, ...prev])
        setForm({ investor_ids: [], all_active: false, period_start: '', period_end: '', available_at: '' })
      } catch (err) {
        alert(err.response?.data?.detail || t('admin_reports.error_schedule'))
      } finally {
        setBusy(false)
      }
      return
    }

    setPublishDraft(payload)
  }

  const handlePublish = async ({ signatureDataUrl, signatureName }) => {
    if (!publishDraft) return
    setBusy(true)
    try {
      const payload = {
        ...publishDraft,
        signature_data_url: signatureDataUrl,
        signature_name: signatureName || null,
      }
      const created = await publishReport(payload)
      const list = Array.isArray(created) ? created : [created]
      setReports(prev => {
        const incoming = new Set(list.map(report => report.id))
        return [...list, ...prev.filter(report => !incoming.has(report.id))]
      })
      setForm({ investor_ids: [], all_active: false, period_start: '', period_end: '', available_at: '' })
      setPublishDraft(null)
    } catch (err) {
      alert(err.response?.data?.detail || t('admin_reports.error_generate'))
    } finally {
      setBusy(false)
    }
  }

  const handleView = (report) => navigate(`/admin/reports/${report.id}`)

  const publishScheduledReport = (report) => {
    setPublishDraft({
      investor_ids: [report.investor_id],
      schedule_ids: [report.id],
      all_active: false,
      report_type: report.report_type || 'statement',
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      available_at: null,
      lang,
      display_currency: currency,
    })
  }

  const publishDueReports = () => {
    if (dueScheduledReports.length === 0) return
    const investorIds = Array.from(new Set(dueScheduledReports.map(report => report.investor_id).filter(Boolean)))
    setPublishDraft({
      investor_ids: investorIds,
      schedule_ids: dueScheduledReports.map(report => report.id),
      all_active: false,
      report_type: 'statement',
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      available_at: null,
      lang,
      display_currency: currency,
    })
  }

  const handleShare = (report) => {
    setShareTarget({
      reportId: report.id,
      displayName: investorMap[report.investor_id]?.full_name || t('role.investor'),
    })
  }

  const reportTypeLabel = (type) => {
    const key = `report.type.${String(type || '').toLowerCase()}`
    const label = t(key)
    return label === key ? type || dash : label
  }

  return (
    <div className="p-4 md:p-8">
      <h2 className="text-xl font-bold text-slate-800 mb-6">{t('admin_reports.title')}</h2>

      {scheduledDue > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span>{t('admin_reports.due_notice', { count: scheduledDue })}</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={focusScheduledReports}
              className="text-xs font-semibold underline"
            >
              {t('admin_reports.review_scheduled')}
            </button>
            <button
              type="button"
              onClick={publishDueReports}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {t('admin_reports.publish_due_all')}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={beginPublish} className="bg-white rounded-xl shadow-sm p-4 md:p-6 mb-6 grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
        <div className="lg:col-span-3">
          <label className="block text-xs text-slate-500 mb-1">{t('admin_reports.investor')} *</label>
          <div className={`rounded-lg border border-slate-200 bg-white max-h-36 overflow-y-auto ${form.all_active ? 'opacity-60 pointer-events-none' : ''}`}>
            {activeInvestors.map(inv => (
              <label key={inv.id} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.investor_ids.includes(inv.id)}
                  onChange={() => toggleInvestor(inv.id)}
                />
                <span className="truncate">{inv.full_name} ({inv.code})</span>
              </label>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setForm(p => ({ ...p, investor_ids: activeInvestors.map(inv => inv.id), all_active: false }))}
              className="text-[11px] text-slate-600 hover:text-slate-900"
            >
              {t('admin_reports.select_all_visible')}
            </button>
            <button
              type="button"
              onClick={() => setForm(p => ({ ...p, investor_ids: [], all_active: false }))}
              className="text-[11px] text-slate-500 hover:text-slate-900"
            >
              {t('common.clear')}
            </button>
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={form.all_active}
              onChange={e => setForm(p => ({ ...p, all_active: e.target.checked, investor_ids: e.target.checked ? [] : p.investor_ids }))}
            />
            {t('admin_reports.all_active')}
          </label>
          <div className="mt-1 text-[11px] text-slate-400">{t('admin_reports.selected_count', { count: selectedCount })}</div>
        </div>

        <div className="lg:col-span-2">
          <label className="block text-xs text-slate-500 mb-1">{t('admin_reports.period_start')}</label>
          <input type="date" value={form.period_start} disabled={isFutureSchedule} onChange={e => setForm(p => ({ ...p, period_start: e.target.value }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none disabled:opacity-50" />
        </div>
        <div className="lg:col-span-2">
          <label className="block text-xs text-slate-500 mb-1">{t('admin_reports.period_end')}</label>
          <input type="date" value={form.period_end} disabled={isFutureSchedule} onChange={e => setForm(p => ({ ...p, period_end: e.target.value }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none disabled:opacity-50" />
        </div>
        <div className="lg:col-span-3">
          <label className="block text-xs text-slate-500 mb-1">{t('admin_reports.available_at')}</label>
          <input type="datetime-local" value={form.available_at} onChange={e => {
              const availableAt = e.target.value
              const future = availableAt && new Date(availableAt).getTime() > Date.now()
              setForm(p => ({
                ...p,
                available_at: availableAt,
                period_start: future ? '' : p.period_start,
                period_end: future ? '' : p.period_end,
              }))
            }}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
          {isFutureSchedule && (
            <p className="mt-1 text-[11px] text-slate-400">{t('admin_reports.schedule_period_later')}</p>
          )}
        </div>

        <div className="lg:col-span-2 flex flex-col sm:flex-row lg:flex-col gap-2">
          <button type="button" onClick={handlePreview} disabled={busy || selectedCount !== 1}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm disabled:opacity-50">
            {Icons.view} {t('admin_reports.preview')}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => handleAdminExport('pdf')} disabled={busy || selectedCount === 0}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-700 disabled:opacity-50">
              {Icons.download} PDF
            </button>
            <button type="button" onClick={() => handleAdminExport('excel')} disabled={busy || selectedCount === 0}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-700 disabled:opacity-50">
              {Icons.download} Excel
            </button>
          </div>
          <button type="submit" disabled={busy || selectedCount === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-white font-medium text-sm disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-primary)' }}>
            {Icons.cog}
            {busy ? t('admin_reports.generating') : (isFutureSchedule ? t('admin_reports.schedule') : t('admin_reports.publish'))}
          </button>
        </div>
      </form>

      <div ref={reportsListRef} className="bg-white rounded-xl shadow-sm scroll-mt-24">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
          <select value={filterInvestor} onChange={e => setFilterInvestor(e.target.value)}
            className="w-full sm:w-auto border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">{t('admin_reports.all_investors')}</option>
            {investors.map(inv => <option key={inv.id} value={inv.id}>{inv.full_name}</option>)}
          </select>
          {showScheduledOnly && (
            <button
              type="button"
              onClick={() => setShowScheduledOnly(false)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"
            >
              {t('admin_reports.showing_scheduled')}
              <span className="text-amber-600 underline">{t('admin_reports.show_all_reports')}</span>
            </button>
          )}
        </div>
        {/* ─── Liste mobile : rapports compacts expandables ───── */}
        <div className="md:hidden divide-y divide-[var(--border-subtle)]">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">{t('admin_reports.empty')}</div>
          ) : filtered.map(r => {
            const dueNow = r.status === 'scheduled' && r.available_at && new Date(r.available_at).getTime() <= Date.now()
            return (
              <div key={`m-${r.id}`} className="p-2">
                <ExpandableRow
                  density="compact"
                  className="!rounded-lg"
                  summary={
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-[14px] text-[var(--text-1)] truncate">
                          {investorMap[r.investor_id]?.full_name || dash}
                        </span>
                        {r.status === 'scheduled' && (
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex-shrink-0 ${
                            dueNow ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {dueNow ? t('admin_reports.due_badge') : t('reports.scheduled')}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
                        <span className="capitalize">{reportTypeLabel(r.report_type)}</span>
                        <span>•</span>
                        <span className="font-mono uppercase">{r.format}</span>
                        <span>•</span>
                        <span>{r.generated_at ? formatDate(r.generated_at, lang) : dash}</span>
                      </div>
                    </div>
                  }
                >
                  <DetailRow
                    label={t('admin_reports.col.period')}
                    value={r.status === 'scheduled'
                      ? t('reports.period_to_define')
                      : r.period_start
                      ? `${formatDate(r.period_start, lang)} → ${formatDate(r.period_end, lang)}`
                      : t('reports.all_transactions')}
                  />
                  <DetailRow
                    label={t('admin_reports.col.available')}
                    value={r.available_at ? formatDate(r.available_at, lang) : dash}
                  />
                  <DetailRow
                    label={t('admin_reports.col.downloads')}
                    value={r.download_count || 0}
                  />

                  <ActionGroup>
                    <button
                      onClick={() => handleView(r)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] border border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      {Icons.view} {t('common.view')}
                    </button>
                    <button
                      onClick={() => downloadBlob(r)}
                      disabled={!r.storage_path || r.status === 'scheduled'}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      {Icons.download} {t('common.download')}
                    </button>
                    {r.status === 'scheduled' && (
                      <button
                        onClick={() => publishScheduledReport(r)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] text-white font-medium"
                        style={{ backgroundColor: 'var(--color-secondary)' }}
                      >
                        {Icons.cog} {t('admin_reports.publish_now')}
                      </button>
                    )}
                    <button
                      onClick={() => handleShare(r)}
                      disabled={r.status === 'scheduled' || !r.storage_path}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] border disabled:opacity-50"
                      style={{ borderColor: 'var(--color-secondary)', color: 'var(--color-secondary)' }}
                    >
                      {Icons.share} {t('common.share')}
                    </button>
                  </ActionGroup>
                </ExpandableRow>
              </div>
            )
          })}
        </div>

        {/* ─── Tableau desktop ─────────────────────────────────── */}
        <div className="hidden md:block md:overflow-x-auto">
          <table className="w-full md:min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500">
                <th className="text-left p-4">{t('admin_reports.col.investor')}</th>
                <th className="text-left p-4">{t('admin_reports.col.type')}</th>
                <th className="text-left p-4">{t('admin_reports.col.format')}</th>
                <th className="text-left p-4">{t('admin_reports.col.period')}</th>
                <th className="text-left p-4">{t('admin_reports.col.generated')}</th>
                <th className="text-left p-4">{t('admin_reports.col.available')}</th>
                <th className="text-center p-4">{t('admin_reports.col.downloads')}</th>
                <th className="p-4 text-right">{t('admin_reports.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="p-4 font-medium" data-label={t('admin_reports.col.investor')}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{investorMap[r.investor_id]?.full_name || dash}</span>
                      {r.status === 'scheduled' && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${
                          r.available_at && new Date(r.available_at).getTime() <= Date.now()
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {r.available_at && new Date(r.available_at).getTime() <= Date.now()
                            ? t('admin_reports.due_badge')
                            : t('reports.scheduled')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 capitalize" data-label={t('admin_reports.col.type')}>{reportTypeLabel(r.report_type)}</td>
                  <td className="p-4 uppercase font-mono text-xs" data-label={t('admin_reports.col.format')}>{r.format}</td>
                  <td className="p-4 text-slate-500 text-xs" data-label={t('admin_reports.col.period')}>
                    {r.status === 'scheduled'
                      ? t('reports.period_to_define')
                      : r.period_start
                      ? `${formatDate(r.period_start, lang)} -> ${formatDate(r.period_end, lang)}`
                      : t('reports.all_transactions')}
                  </td>
                  <td className="p-4 text-slate-500" data-label={t('admin_reports.col.generated')}>
                    {r.generated_at ? formatDate(r.generated_at, lang) : dash}
                  </td>
                  <td className="p-4 text-slate-500" data-label={t('admin_reports.col.available')}>
                    {r.available_at ? formatDate(r.available_at, lang) : dash}
                  </td>
                  <td className="p-4 text-center text-slate-400" data-label={t('admin_reports.col.downloads')}>{r.download_count || 0}</td>
                  <td className="p-4" data-label="">
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      <button
                        onClick={() => handleView(r)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        {Icons.view} {t('common.view')}
                      </button>
                      <button
                        onClick={() => downloadBlob(r)}
                        disabled={!r.storage_path || r.status === 'scheduled'}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ backgroundColor: 'var(--color-primary)' }}
                      >
                        {Icons.download} {t('common.download')}
                      </button>
                      {r.status === 'scheduled' && (
                        <button
                          onClick={() => publishScheduledReport(r)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-white font-medium"
                          style={{ backgroundColor: 'var(--color-secondary)' }}
                        >
                          {Icons.cog} {t('admin_reports.publish_now')}
                        </button>
                      )}
                      <button
                        onClick={() => handleShare(r)}
                        disabled={r.status === 'scheduled' || !r.storage_path}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border disabled:opacity-50"
                        style={{ borderColor: 'var(--color-secondary)', color: 'var(--color-secondary)' }}
                      >
                        {Icons.share} {t('common.share')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-slate-400">{t('admin_reports.empty')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {shareTarget && (
        <ShareModal
          reportId={shareTarget.reportId}
          displayName={shareTarget.displayName}
          onClose={() => setShareTarget(null)}
        />
      )}
      {publishDraft && (
        <SignaturePublishModal
          t={t}
          generating={busy}
          targetCount={publishDraft?.investor_ids?.length || selectedCount}
          onClose={() => !busy && setPublishDraft(null)}
          onPublish={handlePublish}
        />
      )}
      {previewData && (
        <PreviewModal data={previewData} lang={lang} t={t} onClose={() => setPreviewData(null)} />
      )}
    </div>
  )
}
