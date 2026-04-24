import { useEffect, useState } from 'react'
import api from '../../api/axios'
import { shareReport } from '../../api/reports.api'

const Ic = {
  copy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  mail: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  whatsapp: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
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
}

/**
 * Modal de partage d'un rapport :
 *   • Copie le lien public signé (valide 72h)
 *   • Ouvre le client mail avec le lien prérempli
 *   • Partage WhatsApp (lien web)
 *   • Partage natif (Web Share API, mobile) — fichier + lien
 *
 * Nécessite `reportId` et une `displayName` (nom investisseur pour le titre).
 */
export default function ShareModal({ reportId, displayName, onClose }) {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [url, setUrl] = useState('')
  const [expiresAt, setExpiresAt] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    shareReport(reportId)
      .then(d => {
        setUrl(d.url)
        setExpiresAt(d.expires_at)
      })
      .catch(e => setErr(e?.response?.data?.detail || 'Impossible de générer le lien'))
      .finally(() => setLoading(false))
  }, [reportId])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2000) }
      finally { document.body.removeChild(ta) }
    }
  }

  const subject = `Relevé de compte${displayName ? ` — ${displayName}` : ''}`
  const body = `Bonjour,\n\nVoici votre relevé de compte. Vous pouvez le télécharger via le lien ci-dessous (valide 72h) :\n\n${url}\n\nCordialement.`
  const mailHref = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  const waHref = `https://wa.me/?text=${encodeURIComponent(`${subject}\n${url}`)}`

  const nativeShare = async () => {
    // Télécharger d'abord le fichier pour le partager via Web Share API Level 2
    try {
      // essaye d'abord le partage de fichier
      const res = await api.get(`/reports/${reportId}/download`, { responseType: 'blob' })
      const file = new File([res.data], `releve.xlsx`, { type: res.data.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: subject, text: body })
        return
      }
      // Sinon partage juste le lien
      if (navigator.share) {
        await navigator.share({ title: subject, text: body, url })
        return
      }
    } catch { /* utilisateur a annulé ou impossible */ }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(26,58,92,0.08)', color: 'var(--color-primary)' }}
            >
              {Ic.share}
            </div>
            <h3 className="font-semibold text-slate-800">Partager le rapport</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            {Ic.close}
          </button>
        </div>

        {loading ? (
          <div className="py-6 text-center text-sm text-slate-400">Génération du lien…</div>
        ) : err ? (
          <div className="px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 border border-red-100">{err}</div>
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-2">
              Ce lien permet à la personne qui le reçoit de télécharger le rapport sans se connecter.
              Il expire {expiresAt ? `le ${new Date(expiresAt).toLocaleString('fr-FR')}` : 'dans 72h'}.
            </p>

            <div className="flex items-center gap-2 mb-4">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
              <button
                onClick={copyLink}
                className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg text-white font-medium whitespace-nowrap"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {Ic.copy}
                {copied ? 'Copié !' : 'Copier'}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <a
                href={mailHref}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
              >
                <span className="text-slate-500">{Ic.mail}</span>
                <span className="text-[11px] font-medium">Email</span>
              </a>
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-[#25D366]"
              >
                {Ic.whatsapp}
                <span className="text-[11px] font-medium text-slate-600">WhatsApp</span>
              </a>
              <button
                onClick={nativeShare}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
                disabled={typeof navigator !== 'undefined' && !navigator.share}
                title={typeof navigator !== 'undefined' && !navigator.share ? 'Non disponible sur ce navigateur' : 'Utiliser le partage système'}
              >
                <span className="text-slate-500">{Ic.share}</span>
                <span className="text-[11px] font-medium">Autre…</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
