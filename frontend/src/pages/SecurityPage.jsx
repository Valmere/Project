import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { startRegistration } from '@simplewebauthn/browser'
import {
  Shield,
  ShieldCheck,
  User,
  Mail,
  KeyRound,
  Fingerprint,
  BadgeCheck,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  ChevronRight,
  Eye,
  EyeOff,
  Smartphone,
  Loader2,
  Lock,
  Info,
} from 'lucide-react'
import {
  changePassword,
  getMe,
  updateMe,
  listWebauthnCredentials,
  deleteWebauthnCredential,
  webauthnRegisterBegin,
  webauthnRegisterComplete,
} from '../api/auth.api'
import { useAuthStore } from '../store/auth.store'
import { usePrefsStore, useT } from '../store/prefs.store'
import { formatDate } from '../utils/format'

const bioSupported = typeof window !== 'undefined'
  && !!window.PublicKeyCredential
  && !!window.isSecureContext

/* ────────────────────────────────────────────────────────────────
   Reusable bits
   ──────────────────────────────────────────────────────────────── */

function SectionCard({ icon: Icon, iconBg = 'bg-blue-50', iconColor = 'text-blue-600', title, description, action, children }) {
  return (
    <section
      className="bg-white rounded-2xl p-6 sm:p-7 transition-shadow hover:shadow-md"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-xl ${iconBg} ${iconColor} flex items-center justify-center flex-shrink-0`}>
          <Icon size={20} strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
              {description && (
                <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">{description}</p>
              )}
            </div>
            {action && <div className="flex-shrink-0">{action}</div>}
          </div>
          {children && <div className="mt-5">{children}</div>}
        </div>
      </div>
    </section>
  )
}

function Feedback({ kind, children }) {
  if (!children) return null
  const isErr = kind === 'error'
  const Icon = isErr ? AlertCircle : CheckCircle2
  return (
    <div
      className={`flex items-start gap-2.5 px-3.5 py-3 rounded-xl text-[13px] animate-in ${
        isErr
          ? 'bg-rose-50 text-rose-700 border border-rose-100'
          : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
      }`}
      role={isErr ? 'alert' : 'status'}
    >
      <Icon size={16} className="flex-shrink-0 mt-0.5" />
      <span className="leading-relaxed">{children}</span>
    </div>
  )
}

function PasswordInput({ value, onChange, autoComplete, required, minLength }) {
  const t = useT()
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className="w-full h-11 rounded-xl border border-slate-200 bg-white pl-3.5 pr-11 text-[14px] text-slate-900 placeholder-slate-400 outline-none transition focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[rgba(26,58,92,0.08)]"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition"
        aria-label={show ? t('security.password.hide') : t('security.password.show')}
        tabIndex={-1}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}

function GhostButton({ onClick, children, type = 'button', disabled, className = '' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[13px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition disabled:opacity-50 disabled:pointer-events-none ${className}`}
    >
      {children}
    </button>
  )
}

function PrimaryButton({ onClick, children, type = 'button', disabled, busy, className = '' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 h-10 px-5 rounded-xl text-[13px] font-semibold text-white bg-[var(--color-primary)] hover:bg-[#163151] hover:shadow-md transition disabled:opacity-50 disabled:pointer-events-none ${className}`}
    >
      {busy && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  )
}

/* ────────────────────────────────────────────────────────────────
   Page
   ──────────────────────────────────────────────────────────────── */

export default function SecurityPage() {
  const t = useT()
  const { lang } = usePrefsStore()
  const { token, user, logout, setAuth } = useAuthStore()
  const navigate = useNavigate()

  const [devices, setDevices] = useState([])
  const [loadingDevices, setLoadingDevices] = useState(true)

  // Profile
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileForm, setProfileForm] = useState({ full_name: '', email: '', username: '' })
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')
  const [profileErr, setProfileErr] = useState('')

  // Password
  const [pwOpen, setPwOpen] = useState(false)
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwMsg, setPwMsg] = useState('')
  const [pwErr, setPwErr] = useState('')

  // Biometric
  const [bioOpen, setBioOpen] = useState(false)
  const [deviceName, setDeviceName] = useState('')
  const [bioBusy, setBioBusy] = useState(false)
  const [bioMsg, setBioMsg] = useState('')
  const [bioErr, setBioErr] = useState('')

  const loadDevices = () => {
    setLoadingDevices(true)
    listWebauthnCredentials()
      .then(setDevices)
      .catch(() => setDevices([]))
      .finally(() => setLoadingDevices(false))
  }
  useEffect(loadDevices, [])

  useEffect(() => {
    if (!token) return
    getMe()
      .then((me) => setAuth(token, me))
      .catch(() => {})
  }, [token, setAuth])

  useEffect(() => {
    setProfileForm({
      full_name: user?.full_name || '',
      email: user?.email || '',
      username: user?.username || '',
    })
  }, [user?.full_name, user?.email, user?.username])

  /* ── Security score ───────────────────────────────────────── */
  const securityScore = useMemo(() => {
    let pts = 50 // password account exists
    if (devices.length > 0) pts += 35
    if (devices.length > 1) pts += 15
    return Math.min(pts, 100)
  }, [devices.length])

  const scoreState = securityScore >= 90
    ? { label: t('security.score.excellent'), color: 'text-emerald-600', ring: 'stroke-emerald-500', bg: 'bg-emerald-50' }
    : securityScore >= 70
      ? { label: t('security.score.good'), color: 'text-blue-600', ring: 'stroke-blue-500', bg: 'bg-blue-50' }
      : { label: t('security.score.strengthen'), color: 'text-amber-600', ring: 'stroke-amber-500', bg: 'bg-amber-50' }
  const roleLabel = (role) => {
    const label = t(`role.${role}`)
    return label === `role.${role}` ? role : label
  }

  /* ── Handlers ─────────────────────────────────────────────── */

  const handleUpdateProfile = async (e) => {
    e.preventDefault()
    setProfileMsg(''); setProfileErr('')
    if (!profileForm.full_name.trim()) { setProfileErr(t('security.profile.name_required')); return }
    if (!profileForm.email.trim()) { setProfileErr(t('security.profile.email_required')); return }
    if (!profileForm.username.trim()) { setProfileErr(t('security.profile.username_required')); return }

    setProfileBusy(true)
    try {
      const updated = await updateMe({
        full_name: profileForm.full_name.trim(),
        email: profileForm.email.trim(),
        username: profileForm.username.trim(),
      })
      setAuth(token, updated)
      setProfileMsg(t('security.profile.success'))
      setTimeout(() => setProfileOpen(false), 900)
    } catch (err) {
      setProfileErr(err.response?.data?.detail || t('security.profile.failed'))
    } finally {
      setProfileBusy(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPwMsg(''); setPwErr('')
    if (pwNew.length < 8) { setPwErr(t('security.password.min_error')); return }
    if (pwNew !== pwConfirm) { setPwErr(t('security.password.match_error')); return }
    if (pwNew === pwCurrent) { setPwErr(t('security.password.same_error')); return }
    setPwBusy(true)
    try {
      await changePassword(pwCurrent, pwNew)
      setPwMsg(t('security.password.success'))
      setPwCurrent(''); setPwNew(''); setPwConfirm('')
      setTimeout(() => setPwOpen(false), 1200)
    } catch (err) {
      setPwErr(err.response?.data?.detail || t('security.password.failed'))
    } finally {
      setPwBusy(false)
    }
  }

  const handleRegisterBio = async () => {
    setBioMsg(''); setBioErr('')
    if (!bioSupported) {
      setBioErr(t('security.bio.requires_secure'))
      return
    }
    const name = (deviceName || '').trim() || t('security.device.default')
    setBioBusy(true)
    try {
      const options = await webauthnRegisterBegin(name)
      const credential = await startRegistration({ optionsJSON: options })
      await webauthnRegisterComplete(credential, name)
      setBioMsg(t('security.device.saved', { name }))
      setDeviceName('')
      loadDevices()
      setTimeout(() => setBioOpen(false), 1500)
    } catch (err) {
      const serverDetail = err?.response?.data?.detail
      const errName = err?.name
      let msg = serverDetail || t('security.bio.failed')
      if (!serverDetail) {
        if (errName === 'NotAllowedError') msg = t('security.bio.cancelled')
        else if (errName === 'SecurityError') msg = t('security.bio.requires_secure')
        else if (errName === 'InvalidStateError') msg = t('security.bio.duplicate')
      }
      setBioErr(msg)
    } finally {
      setBioBusy(false)
    }
  }

  const handleDeleteDevice = async (d) => {
    if (!window.confirm(t('security.device.delete_confirm', { name: d.device_name || t('security.device.default') }))) return
    try {
      await deleteWebauthnCredential(d.id)
      loadDevices()
    } catch (err) {
      window.alert(err.response?.data?.detail || t('security.delete_failed'))
    }
  }

  const handleLogout = () => {
    if (window.confirm(t('security.logout.confirm'))) {
      logout()
      navigate('/login', { replace: true })
    }
  }

  const initials = (user?.full_name || '?')
    .split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()

  /* ── Render ───────────────────────────────────────────────── */

  return (
    <div className="min-h-full" style={{ background: 'var(--bg-app)' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">

        {/* ─── Hero ───────────────────────────────────────────── */}
        <header className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
            <Shield size={14} />
            {t('security.eyebrow')}
          </div>
          <h1 className="text-[26px] sm:text-[28px] font-bold tracking-tight text-slate-900">
            {t('security.title')}
          </h1>
          <p className="text-[14px] text-slate-500 max-w-xl">
            {t('security.subtitle')}
          </p>
        </header>

        {/* ─── Identity + Score banner ─────────────────────────── */}
        <div
          className="bg-white rounded-2xl p-5 sm:p-6 flex items-center gap-5"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-[18px] font-bold flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--color-primary) 0%, #2a5388 100%)' }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-slate-900 truncate">{user?.full_name || '—'}</div>
            <div className="text-[12px] text-slate-500 truncate flex items-center gap-1.5">
              <Mail size={12} />
              {user?.email}
              <span className="mx-1.5 text-slate-300">·</span>
              <BadgeCheck size={12} className="text-blue-500" />
              {roleLabel(user?.role)}
            </div>
          </div>

          {/* Security score ring */}
          <div className="hidden sm:flex items-center gap-3">
            <div className="text-right">
              <div className={`text-[11px] font-semibold uppercase tracking-wider ${scoreState.color}`}>
                {scoreState.label}
              </div>
              <div className="text-[12px] text-slate-500">{t('security.score_label')}</div>
            </div>
            <div className={`relative w-12 h-12 ${scoreState.bg} rounded-full flex items-center justify-center`}>
              <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15"
                  fill="none"
                  className={scoreState.ring}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${(securityScore / 100) * 94.25} 94.25`}
                />
              </svg>
              <span className={`relative text-[12px] font-bold ${scoreState.color}`}>{securityScore}</span>
            </div>
          </div>
        </div>

        {/* ─── Personal info ──────────────────────────────────── */}
        <SectionCard
          icon={User}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          title={t('security.personal.title')}
          description={t('security.personal.desc')}
          action={
            !profileOpen && (
              <GhostButton onClick={() => setProfileOpen(true)}>
                {t('security.profile.edit')}
                <ChevronRight size={14} />
              </GhostButton>
            )
          }
        >
          {profileOpen ? (
            <form onSubmit={handleUpdateProfile} className="space-y-4 animate-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextInput
                  label={t('security.full_name')}
                  value={profileForm.full_name}
                  onChange={e => setProfileForm(p => ({ ...p, full_name: e.target.value }))}
                  autoComplete="name"
                  required
                />
                <TextInput
                  label={t('security.email')}
                  value={profileForm.email}
                  onChange={e => setProfileForm(p => ({ ...p, email: e.target.value }))}
                  autoComplete="email"
                  required
                />
                <TextInput
                  label={t('security.username')}
                  value={profileForm.username}
                  onChange={e => setProfileForm(p => ({ ...p, username: e.target.value }))}
                  autoComplete="username"
                  required
                />
                <ReadField label={t('security.role')} value={roleLabel(user?.role)} />
              </div>

              <Feedback kind="error">{profileErr}</Feedback>
              <Feedback kind="success">{profileMsg}</Feedback>

              <div className="flex items-center justify-end gap-2 pt-1">
                <GhostButton
                  onClick={() => {
                    setProfileOpen(false)
                    setProfileErr('')
                    setProfileMsg('')
                    setProfileForm({
                      full_name: user?.full_name || '',
                      email: user?.email || '',
                      username: user?.username || '',
                    })
                  }}
                >
                  {t('common.cancel')}
                </GhostButton>
                <PrimaryButton type="submit" busy={profileBusy}>
                  {t('common.save')}
                </PrimaryButton>
              </div>
            </form>
          ) : (
            <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ReadField label={t('security.full_name')} value={user?.full_name} />
            <ReadField label={t('security.email')} value={user?.email} />
            <ReadField label={t('security.username')} value={user?.username} mono />
            <ReadField label={t('security.role')} value={roleLabel(user?.role)} />
          </div>
          <div className="mt-4 flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-xl px-3.5 py-2.5">
            <Info size={14} className="flex-shrink-0 mt-0.5 text-slate-400" />
            <span>{t('security.contact_hint')}</span>
          </div>
            </>
          )}
        </SectionCard>

        {/* ─── Identity verification (KYC) ─────────────────────── */}
        <SectionCard
          icon={BadgeCheck}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          title={t('security.identity.title')}
          description={t('security.identity.desc')}
          action={
            <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-emerald-50 text-emerald-700 text-[12px] font-semibold border border-emerald-100">
              <CheckCircle2 size={13} />
              {t('security.identity.verified')}
            </span>
          }
        />

        {/* ─── Two-factor / Biometric ─────────────────────────── */}
        <SectionCard
          icon={Fingerprint}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
          title={t('security.twofactor.title')}
          description={
            bioSupported
              ? t('security.twofactor.desc_supported')
              : t('security.twofactor.desc_unsupported')
          }
          action={
            bioSupported && !bioOpen && (
              <PrimaryButton onClick={() => setBioOpen(true)} className="!h-9 !px-3.5">
                <Plus size={15} />
                <span className="hidden sm:inline">{t('security.add')}</span>
              </PrimaryButton>
            )
          }
        >
          {/* Devices list */}
          <div className="space-y-2">
            {loadingDevices ? (
              <div className="text-[13px] text-slate-400 py-2">{t('common.loading')}</div>
            ) : devices.length === 0 ? (
              <EmptyDevices />
            ) : (
              devices.map(d => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-slate-100 hover:border-slate-200 transition"
                >
                  <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0">
                    <Smartphone size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-medium text-slate-800 truncate">
                      {d.device_name || t('security.device.default')}
                    </div>
                    <div className="text-[11.5px] text-slate-500">
                      {t('security.device.added_on', { date: d.created_at ? formatDate(d.created_at, lang) : '—' })}
                      {d.last_used_at && (
                        <> · {t('security.device.used_on', { date: formatDate(d.last_used_at, lang) })}</>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteDevice(d)}
                    className="w-9 h-9 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition flex items-center justify-center"
                    aria-label={t('common.delete')}
                    title={t('security.device.delete')}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Add device form */}
          {bioOpen && bioSupported && (
            <div className="mt-4 rounded-2xl bg-slate-50 border border-slate-100 p-4 sm:p-5 space-y-4 animate-in">
              <div>
                <label className="block text-[12px] font-medium text-slate-600 mb-1.5">
                  {t('security.device.name')}
                </label>
                <input
                  value={deviceName}
                  onChange={e => setDeviceName(e.target.value)}
                  placeholder={t('security.device.placeholder')}
                  disabled={bioBusy}
                  className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-[14px] text-slate-900 placeholder-slate-400 outline-none transition focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[rgba(26,58,92,0.08)]"
                />
                <p className="text-[11.5px] text-slate-500 mt-1.5">
                  {t('security.device.name_hint')}
                </p>
              </div>

              <Feedback kind="error">{bioErr}</Feedback>
              <Feedback kind="success">{bioMsg}</Feedback>

              <div className="flex items-center justify-end gap-2">
                <GhostButton onClick={() => { setBioOpen(false); setBioErr(''); setBioMsg('') }}>
                  {t('common.cancel')}
                </GhostButton>
                <PrimaryButton onClick={handleRegisterBio} busy={bioBusy} disabled={!bioSupported}>
                  <Fingerprint size={15} />
                  {bioBusy ? t('security.device.registering') : t('security.device.register')}
                </PrimaryButton>
              </div>
            </div>
          )}

          {/* Inline messages when collapsed */}
          {!bioOpen && (bioErr || bioMsg) && (
            <div className="mt-3 space-y-2">
              <Feedback kind="error">{bioErr}</Feedback>
              <Feedback kind="success">{bioMsg}</Feedback>
            </div>
          )}
        </SectionCard>

        {/* ─── Password ────────────────────────────────────────── */}
        <SectionCard
          icon={KeyRound}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          title={t('security.password.title')}
          description={t('security.password.desc')}
          action={
            !pwOpen && (
              <GhostButton onClick={() => setPwOpen(true)}>
                {t('security.password.modify')}
                <ChevronRight size={14} />
              </GhostButton>
            )
          }
        >
          {pwOpen ? (
            <form onSubmit={handleChangePassword} className="space-y-4 animate-in">
              <div>
                <label className="block text-[12px] font-medium text-slate-600 mb-1.5">
                  {t('security.password.current')}
                </label>
                <PasswordInput
                  value={pwCurrent}
                  onChange={e => setPwCurrent(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-slate-600 mb-1.5">
                    {t('security.password.new')}
                  </label>
                  <PasswordInput
                    value={pwNew}
                    onChange={e => setPwNew(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-slate-600 mb-1.5">
                    {t('security.password.confirm')}
                  </label>
                  <PasswordInput
                    value={pwConfirm}
                    onChange={e => setPwConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                </div>
              </div>

              <PasswordStrength value={pwNew} />

              <Feedback kind="error">{pwErr}</Feedback>
              <Feedback kind="success">{pwMsg}</Feedback>

              <div className="flex items-center justify-end gap-2 pt-1">
                <GhostButton
                  onClick={() => { setPwOpen(false); setPwCurrent(''); setPwNew(''); setPwConfirm(''); setPwErr(''); setPwMsg('') }}
                >
                  {t('common.cancel')}
                </GhostButton>
                <PrimaryButton type="submit" busy={pwBusy}>
                  <Lock size={15} />
                  {t('security.password.update')}
                </PrimaryButton>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-2 text-[13px] text-slate-500">
              <ShieldCheck size={15} className="text-emerald-500" />
              {t('security.password.defined')}
            </div>
          )}
        </SectionCard>

        {/* ─── Sign out ────────────────────────────────────────── */}
        <SectionCard
          icon={LogOut}
          iconBg="bg-rose-50"
          iconColor="text-rose-600"
          title={t('security.logout.title')}
          description={t('security.logout.desc')}
          action={
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 transition"
            >
              <LogOut size={15} />
              {t('security.logout.button')}
            </button>
          }
        />

        <footer className="text-center text-[11.5px] text-slate-400 pt-2 pb-4">
          {t('security.footer', { name: user?.full_name || '—' })}
        </footer>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
   Sub-components
   ──────────────────────────────────────────────────────────────── */

function TextInput({ label, value, onChange, autoComplete, required }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
        {label}
      </label>
      <input
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        required={required}
        className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-[14px] text-slate-900 placeholder-slate-400 outline-none transition focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[rgba(26,58,92,0.08)]"
      />
    </div>
  )
}

function ReadField({ label, value, mono }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3.5 py-2.5">
      <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">{label}</div>
      <div className={`text-[13.5px] text-slate-800 mt-0.5 truncate ${mono ? 'font-mono' : 'font-medium'}`}>
        {value || '—'}
      </div>
    </div>
  )
}

function EmptyDevices() {
  const t = useT()
  return (
    <div className="text-center py-8 px-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200">
      <div className="w-12 h-12 mx-auto rounded-2xl bg-white flex items-center justify-center text-slate-400 mb-3">
        <Fingerprint size={22} />
      </div>
      <div className="text-[13.5px] font-medium text-slate-700">{t('security.device.empty')}</div>
      <div className="text-[12px] text-slate-500 mt-1 max-w-xs mx-auto">
        {t('security.device.empty_desc')}
      </div>
    </div>
  )
}

function PasswordStrength({ value }) {
  const t = useT()
  const score = useMemo(() => {
    if (!value) return 0
    let s = 0
    if (value.length >= 8) s++
    if (value.length >= 12) s++
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) s++
    if (/\d/.test(value)) s++
    if (/[^A-Za-z0-9]/.test(value)) s++
    return Math.min(s, 4)
  }, [value])

  if (!value) return null

  const levels = [
    { label: t('security.password.level.very_weak'), color: 'bg-rose-400', text: 'text-rose-600' },
    { label: t('security.password.level.weak'), color: 'bg-rose-400', text: 'text-rose-600' },
    { label: t('security.password.level.ok'), color: 'bg-amber-400', text: 'text-amber-600' },
    { label: t('security.password.level.good'), color: 'bg-blue-400', text: 'text-blue-600' },
    { label: t('security.password.level.excellent'), color: 'bg-emerald-500', text: 'text-emerald-600' },
  ]
  const level = levels[score]

  return (
    <div>
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`flex-1 h-1.5 rounded-full transition-colors ${i < score ? level.color : 'bg-slate-100'}`}
          />
        ))}
      </div>
      <div className={`text-[11.5px] mt-1.5 font-medium ${level.text}`}>
        {t('security.password.strength', { level: level.label })}
      </div>
    </div>
  )
}
