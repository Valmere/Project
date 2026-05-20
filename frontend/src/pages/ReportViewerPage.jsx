import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { viewReport } from '../api/reports.api'
import { useAuthStore } from '../store/auth.store'
import { usePrefsStore, useT } from '../store/prefs.store'
import StatementViewer from '../components/reports/StatementViewer'
import ShareModal from '../components/reports/ShareModal'

const Ic = {
  back: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
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
  print: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  ),
}

export default function ReportViewerPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const t = useT()
  const { lang, currency } = usePrefsStore()
  const { user } = useAuthStore()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const downloadable = !!data?.report?.storage_path && data?.report?.status !== 'scheduled'

  useEffect(() => {
    setLoading(true)
    viewReport(id, { display_currency: currency, lang })
      .then(setData)
      .catch(e => setErr(e?.response?.data?.detail || t('report_viewer.load_error')))
      .finally(() => setLoading(false))
  }, [id, currency, lang])

  const handleDownload = async () => {
    // Régénération à la volée dans la langue + devise affichée à l'écran,
    // pour que le téléchargement matche ce que l'utilisateur lit.
    const res = await api.get(`/reports/${id}/download`, {
      responseType: 'blob',
      params: { lang, display_currency: currency },
    })
    const cd = res.headers?.['content-disposition'] || ''
    const match = /filename="?([^"]+)"?/.exec(cd)
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = match ? match[1] : `rapport_${id}.${data?.report?.format === 'excel' ? 'xlsx' : 'pdf'}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="p-3 sm:p-4 md:p-8 max-w-5xl mx-auto">
      {/* Toolbar — hidden when printing */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4 print:hidden">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          {Ic.back} {t('report_viewer.back')}
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handlePrint}
            disabled={!data}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {Ic.print} {t('report_viewer.print')}
          </button>
          {user?.role !== 'investor' && (
            <button
              onClick={() => setShareOpen(true)}
              disabled={!downloadable}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm disabled:opacity-50"
              style={{ borderColor: 'var(--color-secondary)', color: 'var(--color-secondary)' }}
            >
              {Ic.share} {t('report_viewer.share')}
            </button>
          )}
          <button
            onClick={handleDownload}
            disabled={!downloadable}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {Ic.download} {t('report_viewer.download')}
          </button>
        </div>
      </div>

      {loading && (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center text-sm text-slate-400 print:hidden">
          {t('report_viewer.loading')}
        </div>
      )}
      {err && (
        <div className="px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 border border-red-100 print:hidden">{err}</div>
      )}
      {data && <StatementViewer data={data} lang={lang} />}

      {shareOpen && user?.role !== 'investor' && (
        <ShareModal
          reportId={id}
          displayName={data?.investor?.full_name}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}
