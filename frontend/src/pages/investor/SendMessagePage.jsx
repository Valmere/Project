import { useEffect, useState } from 'react'
import { sendMessage, getMyMessages, replyMessage } from '../../api/messages.api'

const fmtDateTime = (iso) => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fr-FR', {
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
        <Avatar name={author} role={role === 'Admin' ? 'admin' : 'investor'} />
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
  const isOut = msg.direction === 'out'  // admin → investor
  const [replyOpen, setReplyOpen] = useState(false)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Auteur du premier message
  const first = isOut
    ? { name: msg.sender?.full_name || 'Administration', email: msg.sender?.email, role: 'Admin' }
    : { name: 'Vous', email: msg.sender?.email, role: 'Investisseur' }

  // Auteur de la réponse (s'il y en a une)
  const resp = isOut
    ? { name: 'Vous', email: null, role: 'Investisseur' }
    : { name: msg.replied_by_user?.full_name || 'Administration', email: msg.replied_by_user?.email, role: 'Admin' }

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
      setErr(describeError(e, 'Erreur lors de la réponse'))
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
            {isOut ? 'REÇU' : 'ENVOYÉ'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          {msg.reply_body ? (
            <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
              ✓ {isOut ? 'Vous avez répondu' : 'Répondu'}
            </span>
          ) : isOut ? (
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              À lire
            </span>
          ) : msg.read_at ? (
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              Lu, en attente de réponse
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-200">
              Envoyé
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
              Répondre
            </button>
          ) : (
            <div className="space-y-2">
              {err && <div className="px-3 py-2 rounded-lg text-xs bg-red-50 text-red-700">{err}</div>}
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                rows={3}
                placeholder="Votre réponse…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setReplyOpen(false); setReply(''); setErr('') }}
                  className="text-xs px-3 py-1.5 text-slate-500 hover:text-slate-700"
                >Annuler</button>
                <button
                  onClick={submit}
                  disabled={busy || !reply.trim()}
                  className="text-xs px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  {busy ? 'Envoi…' : 'Envoyer'}
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
  const [form, setForm] = useState({ subject: '', body: '' })
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState([])
  const [composeOpen, setComposeOpen] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [sendError, setSendError] = useState('')

  const reload = () =>
    getMyMessages()
      .then(list => { setMessages(list); setLoadError('') })
      .catch(err => { setLoadError(describeError(err, 'Impossible de charger les messages')); setMessages([]) })

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
      setSendError(describeError(err))
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
        <h2 className="text-lg md:text-xl font-bold text-slate-800">Messagerie</h2>
        <button
          onClick={() => setComposeOpen(v => !v)}
          className="px-3 md:px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {composeOpen ? 'Fermer' : '+ Nouveau message'}
        </button>
      </div>

      {loadError && (
        <div className="mb-4 px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 border border-red-100">
          {loadError}
        </div>
      )}

      {composeOpen && (
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 mb-6">
          <h3 className="font-semibold text-slate-700 mb-4">Contacter l'administrateur</h3>
          {sendError && (
            <div className="mb-3 px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700">{sendError}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Sujet *</label>
              <input
                value={form.subject}
                onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Message *</label>
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
              >Annuler</button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-lg text-white font-medium text-sm disabled:opacity-60"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {loading ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {messages.length === 0 && !loadError && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center text-sm text-slate-400">
            Aucun message pour l'instant. Utilisez « + Nouveau message » pour contacter l'administrateur ; ses messages apparaîtront aussi ici.
          </div>
        )}
        {messages.map(msg => (
          <MessageCard key={msg.id} msg={msg} onReply={onMsgUpdated} />
        ))}
      </div>
    </div>
  )
}
