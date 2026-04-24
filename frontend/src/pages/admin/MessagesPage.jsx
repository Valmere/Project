import { useEffect, useMemo, useState } from 'react'
import { getMessages, replyMessage, markRead, broadcastMessage } from '../../api/messages.api'
import { getInvestors } from '../../api/investors.api'

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

function MessageListItem({ msg, selected, onClick }) {
  const investor = msg.investor?.full_name || 'Investisseur'
  const preview = msg.body?.slice(0, 60) + (msg.body?.length > 60 ? '…' : '')
  const isOut = msg.direction === 'out'
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selected ? 'bg-slate-50' : ''}`}
    >
      <div className="flex items-start gap-3">
        <Avatar name={investor} role="investor" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-sm font-semibold text-slate-800 truncate">{investor}</span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {isOut && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 font-medium">ENVOYÉ</span>
              )}
              {!msg.read_at && !isOut && (
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
              )}
            </div>
          </div>
          <div className="text-xs text-slate-600 truncate font-medium">{msg.subject}</div>
          <div className="text-[11px] text-slate-400 truncate">{preview}</div>
          <div className="text-[10px] text-slate-400 mt-1">{fmtDateTime(msg.sent_at)}</div>
        </div>
      </div>
    </button>
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
          <div className="text-[11px] text-slate-400 truncate">{email || '—'} · {fmtDateTime(at)}</div>
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

function ConversationView({ msg, reply, setReply, onReply, busy }) {
  const isOut = msg.direction === 'out'
  // Premier message : auteur varie selon direction
  const firstAuthor = isOut
    ? { name: msg.sender?.full_name || 'Admin', email: msg.sender?.email, role: 'Admin' }
    : { name: msg.investor?.full_name || 'Investisseur', email: msg.investor?.email, role: 'Investisseur' }

  // Réponse (le cas échéant) vient de l'autre partie
  const replyAuthor = isOut
    ? { name: msg.replied_by_user?.full_name || msg.investor?.full_name || 'Investisseur', email: msg.replied_by_user?.email || msg.investor?.email, role: 'Investisseur' }
    : { name: msg.replied_by_user?.full_name || 'Admin', email: msg.replied_by_user?.email, role: 'Admin' }

  // L'admin ne peut répondre que aux messages entrants (direction='in') non déjà répondus
  const canReply = !isOut && !msg.reply_body

  return (
    <>
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold text-slate-800">{msg.subject}</h3>
          <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${isOut ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
            {isOut ? 'ENVOYÉ À' : 'REÇU DE'}
          </span>
        </div>
        <div className="text-xs text-slate-500">
          <span className="font-medium text-slate-700">{msg.investor?.full_name}</span>
          {msg.investor?.code && <span className="ml-1.5 px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-mono">{msg.investor.code}</span>}
          {msg.investor?.email && <span className="ml-2 text-slate-400">· {msg.investor.email}</span>}
        </div>
      </div>

      <div className="flex-1 p-5 overflow-auto">
        <MessageBubble
          author={firstAuthor.name}
          email={firstAuthor.email}
          role={firstAuthor.role}
          at={msg.sent_at}
          color={isOut ? 'primary' : 'slate'}
        >
          {msg.body}
        </MessageBubble>

        {msg.reply_body && (
          <MessageBubble
            author={replyAuthor.name}
            email={replyAuthor.email}
            role={replyAuthor.role}
            at={msg.replied_at}
            color={isOut ? 'slate' : 'primary'}
          >
            {msg.reply_body}
          </MessageBubble>
        )}

        {isOut && !msg.reply_body && (
          <div className="ml-11 mt-3 text-[11px] text-slate-400 italic">
            En attente de réponse de l'investisseur…
          </div>
        )}
      </div>

      {canReply && (
        <div className="p-4 border-t border-slate-100">
          <div className="flex gap-3">
            <textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              rows={2}
              placeholder={`Répondre à ${msg.investor?.full_name || 'l\'investisseur'}…`}
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
            <button
              onClick={onReply}
              disabled={busy || !reply.trim()}
              className="px-4 rounded-lg text-white text-sm font-medium self-stretch disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {busy ? '…' : 'Envoyer'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function ComposeModal({ onClose, onSent }) {
  const [investors, setInvestors] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [toAll, setToAll] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getInvestors().then(setInvestors).catch(() => setInvestors([]))
  }, [])

  const toggleInvestor = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!subject.trim() || !body.trim()) {
      setError('Sujet et message requis')
      return
    }
    if (!toAll && selectedIds.size === 0) {
      setError('Sélectionnez au moins un destinataire ou cochez « Tous les investisseurs »')
      return
    }
    setBusy(true)
    try {
      const res = await broadcastMessage({
        subject,
        body,
        to_all: toAll,
        investor_ids: toAll ? [] : Array.from(selectedIds),
      })
      onSent(res)
      onClose()
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : `Erreur ${err.response?.status || ''}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.55)' }}
      onClick={() => !busy && onClose()}
    >
      <form
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 flex flex-col max-h-[90vh]"
      >
        <h3 className="text-lg font-semibold text-slate-800 mb-1">Nouveau message</h3>
        <p className="text-xs text-slate-500 mb-4">
          Envoyer à un ou plusieurs investisseurs. Ils recevront le message dans leur messagerie.
        </p>

        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700">{error}</div>
        )}

        <label className="block text-xs text-slate-500 mb-1">Destinataires *</label>
        <div className="border border-slate-200 rounded-lg mb-4 max-h-52 overflow-auto">
          <label className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              checked={toAll}
              onChange={e => setToAll(e.target.checked)}
              className="accent-[var(--color-primary)]"
            />
            <span className="text-sm font-medium text-slate-700">
              Tous les investisseurs actifs ({investors.filter(i => i.status === 'active').length})
            </span>
          </label>
          <div className={toAll ? 'opacity-40 pointer-events-none' : ''}>
            {investors.length === 0 && <div className="p-3 text-xs text-slate-400">Aucun investisseur</div>}
            {investors.map(inv => (
              <label key={inv.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={selectedIds.has(inv.id)}
                  onChange={() => toggleInvestor(inv.id)}
                  disabled={toAll}
                  className="accent-[var(--color-primary)]"
                />
                <span className="font-medium text-slate-700">{inv.full_name}</span>
                <span className="text-xs text-slate-400 font-mono">{inv.code}</span>
                {inv.email && <span className="text-xs text-slate-400 truncate">· {inv.email}</span>}
              </label>
            ))}
          </div>
        </div>

        <label className="block text-xs text-slate-500 mb-1">Sujet *</label>
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          required
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        />

        <label className="block text-xs text-slate-500 mb-1">Message *</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          required rows={5}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-5 resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        />

        <div className="flex justify-end gap-2">
          <button
            type="button" disabled={busy} onClick={onClose}
            className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700"
          >Annuler</button>
          <button
            type="submit" disabled={busy}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {busy ? 'Envoi…' : (toAll ? 'Envoyer à tous' : `Envoyer (${selectedIds.size})`)}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function MessagesPage() {
  const [messages, setMessages] = useState([])
  const [selected, setSelected] = useState(null)
  const [reply, setReply] = useState('')
  const [showDetail, setShowDetail] = useState(false)
  const [busy, setBusy] = useState(false)
  const [composing, setComposing] = useState(false)
  const [tab, setTab] = useState('all') // all | in | out

  const reload = () => getMessages().then(setMessages).catch(() => setMessages([]))
  useEffect(() => { reload() }, [])

  const visible = useMemo(() => {
    if (tab === 'in') return messages.filter(m => m.direction === 'in')
    if (tab === 'out') return messages.filter(m => m.direction === 'out')
    return messages
  }, [messages, tab])

  const handleSelect = async (msg) => {
    setSelected(msg)
    setReply('')
    setShowDetail(true)
    if (!msg.read_at && msg.direction === 'in') {
      try {
        const updated = await markRead(msg.id)
        setMessages(prev => prev.map(m => m.id === updated.id ? updated : m))
        setSelected(updated)
      } catch {}
    }
  }

  const handleReply = async () => {
    if (!reply.trim() || !selected) return
    setBusy(true)
    try {
      const updated = await replyMessage(selected.id, reply)
      setMessages(prev => prev.map(m => m.id === updated.id ? updated : m))
      setSelected(updated)
      setReply('')
    } finally {
      setBusy(false)
    }
  }

  const handleSent = (result) => {
    // Rafraîchit : les N messages broadcast apparaissent en tête de liste
    reload()
  }

  const unreadCount = messages.filter(m => m.direction === 'in' && !m.read_at).length

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-4 md:mb-6 gap-3 flex-wrap">
        <h2 className="text-lg md:text-xl font-bold text-slate-800">Messages</h2>
        <button
          onClick={() => setComposing(true)}
          className="px-3 md:px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          + Nouveau message
        </button>
      </div>

      <div className="flex gap-1 mb-4 text-sm">
        {[
          { k: 'all', label: 'Tous', count: messages.length },
          { k: 'in', label: 'Reçus', count: messages.filter(m => m.direction === 'in').length, badge: unreadCount },
          { k: 'out', label: 'Envoyés', count: messages.filter(m => m.direction === 'out').length },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-3 py-1.5 rounded-lg transition-colors ${tab === t.k ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            {t.label} <span className="text-xs opacity-70">({t.count})</span>
            {t.badge > 0 && (
              <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-semibold">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Mobile */}
      <div className="md:hidden">
        {!showDetail ? (
          <div className="bg-white rounded-xl shadow-sm overflow-auto">
            {visible.length === 0 && <div className="p-6 text-slate-400 text-sm text-center">Aucun message</div>}
            {visible.map(msg => (
              <MessageListItem key={msg.id} msg={msg} selected={selected?.id === msg.id} onClick={() => handleSelect(msg)} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm flex flex-col min-h-[500px]">
            <div className="px-4 pt-3 pb-1">
              <button onClick={() => setShowDetail(false)} className="text-xs text-slate-400 hover:text-slate-600">
                ← Retour à la liste
              </button>
            </div>
            {selected && (
              <ConversationView msg={selected} reply={reply} setReply={setReply} onReply={handleReply} busy={busy} />
            )}
          </div>
        )}
      </div>

      {/* Desktop */}
      <div className="hidden md:grid grid-cols-3 gap-6 h-[650px]">
        <div className="col-span-1 bg-white rounded-xl shadow-sm overflow-auto">
          {visible.length === 0 && <div className="p-6 text-slate-400 text-sm text-center">Aucun message</div>}
          {visible.map(msg => (
            <MessageListItem key={msg.id} msg={msg} selected={selected?.id === msg.id} onClick={() => handleSelect(msg)} />
          ))}
        </div>
        <div className="col-span-2 bg-white rounded-xl shadow-sm flex flex-col">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              Sélectionnez un message pour voir la conversation
            </div>
          ) : (
            <ConversationView msg={selected} reply={reply} setReply={setReply} onReply={handleReply} busy={busy} />
          )}
        </div>
      </div>

      {composing && <ComposeModal onClose={() => setComposing(false)} onSent={handleSent} />}
    </div>
  )
}
