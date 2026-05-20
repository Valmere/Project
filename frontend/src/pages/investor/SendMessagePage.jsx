import { useEffect, useState } from 'react'
import { sendMessage, getMyMessages, replyMessage } from '../../api/messages.api'
import { useBrandStore } from '../../store/brand.store'
import { usePrefsStore, useT } from '../../store/prefs.store'

const fmtDateTime = (iso, lang = null) => {
  if (!iso) return '—'
  try {
    const activeLang = lang || usePrefsStore.getState().lang || 'fr'
    const locale = activeLang === 'en' ? 'en-US' : activeLang === 'es' ? 'es-ES' : 'fr-FR'
    return new Date(iso).toLocaleString(locale, {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

function Avatar({ name, role }) {
  const initials = (name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('') || '?'
  const bg = role === 'admin' ? 'var(--color-primary)' : '#64748b'
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
      style={{ backgroundColor: bg }}
    >
      {initials}
    </div>
  )
}

function MessageBubble({ author, email, role, at, children, color }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Avatar name={author} role={role === 'Admin' || role === 'Administrador' ? 'admin' : 'investor'} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-800 truncate">
            {author} <span className="text-[11px] font-normal text-slate-400">· {role}</span>
          </div>
          <div className="text-[11px] text-slate-400 truncate">
            {email || '—'} · {fmtDateTime(at)}
          </div>
        </div>
      </div>
      <div
        className={`ml-11 rounded-xl p-3.5 text-sm whitespace-pre-wrap ${color === 'primary' ? 'text-white' : 'text-slate-700'}`}
        style={{ backgroundColor: color === 'primary' ? 'var(--color-primary)' : '#f1f5f9' }}
      >
        {children}
      </div>
    </div>
  )
}

function describeError(err, fallback = "Erreur lors de l'envoi") {
  // Le backend renvoie usuellement `{detail: "..."}`. On expose le statut HTTP
  // et le message précis pour que l'utilisateur sache quoi faire.
  const status = err?.response?.status
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string' && detail) return detail
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg
  if (status) return `${fallback} (HTTP ${status})`
  if (err?.message) return `${fallback} — ${err.message}`
  return fallback
}

function MessageCard({ msg, onReply }) {
  const t = useT()
  const isOut = msg.direction === 'out'  // admin → investor
  const [replyOpen, setReplyOpen] = useState(false)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Auteur du premier message
  const first = isOut
    ? { name: msg.sender?.full_name || t('support.administration'), email: msg.sender?.email, role: t('role.admin') }
    : { name: t('support.you'), email: msg.sender?.email, role: t('role.investor') }

  // Auteur de la réponse (s'il y en a une)
  const resp = isOut
    ? { name: t('support.you'), email: null, role: t('role.investor') }
    : { name: msg.replied_by_user?.full_name || t('support.administration'), email: msg.replied_by_user?.email, role: t('role.admin') }

  // L'investisseur peut répondre uniquement aux messages reçus (out) non déjà répondus
  const canReply = isOut && !msg.reply_body

  const submit = async () => {
    setErr('')
    if (!reply.trim()) return
    setBusy(true)
    try {
      const updated = await replyMessage(msg.id, reply)
      onReply(updated)
      setReply('')
      setReplyOpen(false)
    } catch (e) {
      setErr(describeError(e, t('support.error_reply')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 md:p-5">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-slate-800 text-sm md:text-base">{msg.subject}</h3>
          <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${isOut ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
            {isOut ? t('support.received') : t('support.sent')}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          {msg.reply_body ? (
            <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
              ✓ {isOut ? t('support.you_replied') : t('support.replied')}
            </span>
          ) : isOut ? (
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              {t('support.to_read')}
            </span>
          ) : msg.read_at ? (
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              {t('support.read_waiting_reply')}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-200">
              {t('support.sent')}
            </span>
          )}
        </div>
      </div>

      <MessageBubble
        author={first.name}
        email={first.email}
        role={first.role}
        at={msg.sent_at}
        color={isOut ? 'primary' : 'slate'}
      >
        {msg.body}
      </MessageBubble>

      {msg.reply_body && (
        <MessageBubble
          author={resp.name}
          email={resp.email}
          role={resp.role}
          at={msg.replied_at}
          color={isOut ? 'slate' : 'primary'}
        >
          {msg.reply_body}
        </MessageBubble>
      )}

      {canReply && (
        <div className="ml-11 mt-2">
          {!replyOpen ? (
            <button
              onClick={() => setReplyOpen(true)}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              {t('support.reply')}
            </button>
          ) : (
            <div className="space-y-2">
              {err && <div className="px-3 py-2 rounded-lg text-xs bg-red-50 text-red-700">{err}</div>}
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                rows={3}
                placeholder={t('support.reply_placeholder')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setReplyOpen(false); setReply(''); setErr('') }}
                  className="text-xs px-3 py-1.5 text-slate-500 hover:text-slate-700"
                >{t('common.cancel')}</button>
                <button
                  onClick={submit}
                  disabled={busy || !reply.trim()}
                  className="text-xs px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  {busy ? t('support.sending') : t('support.send')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function SendMessagePage() {
  const { company } = useBrandStore()
  const t = useT()
  const [form, setForm] = useState({ subject: '', body: '' })
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState([])
  const [composeOpen, setComposeOpen] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [sendError, setSendError] = useState('')

  const reload = () =>
    getMyMessages()
      .then(list => { setMessages(list); setLoadError('') })
      .catch(err => { setLoadError(describeError(err, t('support.error_load'))); setMessages([]) })

  useEffect(() => { reload() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSendError('')
    setLoading(true)
    try {
      const created = await sendMessage(form)
      setMessages(prev => [created, ...prev])
      setForm({ subject: '', body: '' })
      setComposeOpen(false)
    } catch (err) {
      setSendError(describeError(err, t('support.error_send')))
    } finally {
      setLoading(false)
    }
  }

  const onMsgUpdated = (updated) => {
    setMessages(prev => prev.map(m => m.id === updated.id ? updated : m))
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-4 md:mb-6 gap-3 flex-wrap">
        <h2 className="text-lg md:text-xl font-bold text-slate-800">{t('support.messages')}</h2>
        <button
          onClick={() => setComposeOpen(v => !v)}
          className="px-3 md:px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {composeOpen ? t('common.close') : t('support.new_message')}
        </button>
      </div>

      {/* Coordonnées entreprise — pour ceux qui préfèrent communiquer
          en dehors de la plateforme (email perso, appel téléphonique).
          Les liens mailto: et tel: ouvrent l'app native. */}
      {(company?.email || company?.phone) && (
        <div className="mb-4 md:mb-6 bg-white rounded-xl shadow-sm p-4 md:p-5">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-slate-800 mb-1">
                {company?.company_name || t('support.our_team')}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {t('support.contact_direct')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {company?.email && (
                <a
                  href={`mailto:${company.email}`}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                  title={company.email}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 7 9 6 9-6" />
                  </svg>
                  Email
                </a>
              )}
              {company?.phone && (
                <a
                  href={`tel:${(company.phone || '').replace(/\s/g, '')}`}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50"
                  title={company.phone}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  {t('support.call')}
                </a>
              )}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {company?.email && (
              <div className="flex items-center gap-1.5 text-slate-500">
                <span className="text-slate-400">✉</span>
                <a href={`mailto:${company.email}`} className="hover:text-slate-800 truncate">
                  {company.email}
                </a>
              </div>
            )}
            {company?.phone && (
              <div className="flex items-center gap-1.5 text-slate-500">
                <span className="text-slate-400">☎</span>
                <a href={`tel:${(company.phone || '').replace(/\s/g, '')}`} className="hover:text-slate-800">
                  {company.phone}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {loadError && (
        <div className="mb-4 px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 border border-red-100">
          {loadError}
        </div>
      )}

      {composeOpen && (
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 mb-6">
          <h3 className="font-semibold text-slate-700 mb-4">{t('support.contact_admin')}</h3>
          {sendError && (
            <div className="mb-3 px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700">{sendError}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('support.subject')} *</label>
              <input
                value={form.subject}
                onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('support.message')} *</label>
              <textarea
                value={form.body}
                onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
                required
                rows={5}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setComposeOpen(false); setSendError('') }}
                className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700"
              >{t('common.cancel')}</button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-lg text-white font-medium text-sm disabled:opacity-60"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {loading ? t('support.sending') : t('support.send')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {messages.length === 0 && !loadError && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center text-sm text-slate-400">
            {t('support.empty')}
          </div>
        )}
        {messages.map(msg => (
          <MessageCard key={msg.id} msg={msg} onReply={onMsgUpdated} />
        ))}
      </div>
    </div>
  )
}
