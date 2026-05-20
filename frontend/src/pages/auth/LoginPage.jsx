import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { useAuthStore } from '../../store/auth.store'
import { useBrandStore } from '../../store/brand.store'
import { usePrefsStore, useT } from '../../store/prefs.store'
import { LANGUAGES } from '../../i18n'
import Select from '../../components/ui/Select'
import {
  login, webauthnLoginBegin, webauthnLoginComplete,
  webauthnRegisterBegin, webauthnRegisterComplete, recoverAccount
} from '../../api/auth.api'

export default function LoginPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const { company } = useBrandStore()
  const { lang, setLang } = usePrefsStore()
  const t = useT()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showRegisterBio, setShowRegisterBio] = useState(false)
  const [deviceName, setDeviceName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showRecovery, setShowRecovery] = useState(false)
  const [recoveryUsername, setRecoveryUsername] = useState('')
  const [recoveryResult, setRecoveryResult] = useState(null)

  // WebAuthn exige un « secure context » : HTTPS ou localhost/127.0.0.1.
  // Sur 192.168.x.x en HTTP, le navigateur bloque l'API purement et simplement.
  const bioSupported = typeof window !== 'undefined'
    && !!window.PublicKeyCredential
    && !!window.isSecureContext
  const bioBlockedReason = typeof window === 'undefined'
    ? ''
    : !window.PublicKeyCredential
      ? t('login.bio_unsupported_browser')
      : !window.isSecureContext
        ? t('login.bio_insecure_context')
        : ''

  const handleSuccess = (data) => {
    setAuth(data.access_token, {
      id: data.id,
      email: data.email,
      username: data.username,
      full_name: data.full_name,
      role: data.role,
      investor_id: data.investor_id,
      must_change_password: !!data.must_change_password,
    })
    if (data.must_change_password) {
      navigate('/change-password')
      return
    }
    navigate(data.role === 'investor' ? '/investor' : '/admin')
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await login(email, password)
      handleSuccess(data)
    } catch (err) {
      // Distinguer une vraie erreur de credentials d'un problème réseau /
      // certificat / serveur, sinon l'utilisateur croit que son mot de
      // passe est faux alors que le backend n'a même pas été contacté.
      const status = err?.response?.status
      const detail = err?.response?.data?.detail
      if (status === 401 || status === 400) {
        setError(detail || t('login.error_credentials'))
      } else if (!err?.response) {
        // Pas de réponse HTTP → couche réseau / certificat / proxy
        setError("Impossible de joindre le serveur. Vérifiez votre connexion ou le certificat HTTPS.")
      } else {
        setError(detail || `Erreur serveur (${status}). Réessayez dans un instant.`)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleBiometricLogin = async () => {
    if (!bioSupported) { setError(bioBlockedReason); return }
    if (!email) { setError(t('login.error_email_required_bio')); return }
    setError('')
    setLoading(true)
    try {
      const options = await webauthnLoginBegin(email)
      const credential = await startAuthentication({ optionsJSON: options })
      const data = await webauthnLoginComplete(email, credential)
      handleSuccess(data)
    } catch (err) {
      // Les erreurs WebAuthn côté navigateur n'ont pas de response.data
      const serverDetail = err?.response?.data?.detail
      const domErrName = err?.name
      let msg = serverDetail || t('login.error_bio')
      if (!serverDetail && domErrName) {
        if (domErrName === 'NotAllowedError') msg = t('login.error_bio_cancelled')
        else if (domErrName === 'SecurityError') msg = t('login.bio_insecure_context')
        else if (domErrName === 'InvalidStateError') msg = t('login.error_bio_not_registered')
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleRecoverAccount = async (e) => {
    e.preventDefault()
    setError('')
    setRecoveryResult(null)
    setLoading(true)
    try {
      const data = await recoverAccount(recoveryUsername)
      setRecoveryResult(data)
      setEmail(data.username || recoveryUsername)
      setPassword('')
    } catch (err) {
      setError(err.response?.data?.detail || t('login.recovery_error'))
    } finally {
      setLoading(false)
    }
  }

  const handleRegisterBio = async () => {
    setError('')
    setLoading(true)
    try {
      const options = await webauthnRegisterBegin(deviceName)
      const credential = await startRegistration({ optionsJSON: options })
      await webauthnRegisterComplete(credential, deviceName)
      setShowRegisterBio(false)
    } catch (err) {
      setError(err.response?.data?.detail || t('login.error_bio'))
    } finally {
      setLoading(false)
    }
  }

  const langOptions = LANGUAGES.map((l) => ({
    value: l.code,
    label: l.label,
    icon: <span className="text-base leading-none">{l.flag}</span>,
  }))
  return (
    <div className="min-h-screen flex app-main">
      {/* Left panel — brand */}
      <div
        className="hidden lg:flex lg:w-[420px] xl:w-[480px] flex-col justify-between p-12 flex-shrink-0"
        style={{
          background:
            'linear-gradient(155deg, #061625 0%, var(--sidebar-bg) 52%, #0F766E 150%)',
          boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.08)',
        }}
      >
        <div>
          <div className="flex items-center gap-3 mb-16">
            {company?.logo_url ? (
              <img
                src={company.logo_url}
                alt={company.company_name || 'Logo'}
                className="h-10 w-auto object-contain"
                style={{ maxWidth: 180 }}
              />
            ) : (
              <>
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0"
                  style={{ background: 'var(--color-secondary)' }}
                >
                  {company?.company_name?.charAt(0) || 'V'}
                </div>
                <span className="text-white font-semibold text-[15px]">
                  {company?.company_name || 'Valmere & Co'}
                </span>
              </>
            )}
          </div>

          <h2 className="text-white text-[28px] font-bold leading-snug mb-4">
            {t('login.hero_title')}
          </h2>
          <p className="text-white/45 text-[14px] leading-relaxed max-w-xs">
            {t('login.hero_subtitle')}
          </p>
        </div>

        <div className="text-white/30 text-[11px] tracking-wider uppercase">
          {company?.company_name || 'Valmere & Co'} · {new Date().getFullYear()}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col p-6">
        {/* Language switcher only — currency lives inside the app */}
        <div className="flex justify-end mb-4">
          <Select
            value={lang}
            onChange={setLang}
            options={langOptions}
            size="sm"
            align="right"
            minWidth={120}
          />
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-[420px] bg-white/90 border border-white/70 rounded-2xl shadow-[var(--shadow-card)] p-6 sm:p-8 backdrop-blur">

            {/* Mobile logo */}
            <div className="lg:hidden flex items-center gap-3 mb-10 justify-center">
              {company?.logo_url ? (
                <img
                  src={company.logo_url}
                  alt={company.company_name || 'Logo'}
                  className="h-9 w-auto object-contain"
                  style={{ maxWidth: 160 }}
                />
              ) : (
                <>
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                    style={{ background: 'var(--color-secondary)' }}
                  >
                    {company?.company_name?.charAt(0) || 'V'}
                  </div>
                  <span className="font-bold text-[15px]" style={{ color: 'var(--text-1)' }}>
                    {company?.company_name || 'Valmere & Co'}
                  </span>
                </>
              )}
            </div>

            {!showRegisterBio ? (
              <>
                <div className="mb-8">
                  <h1 className="text-[22px] font-bold mb-1.5" style={{ color: 'var(--text-1)' }}>
                    {t('login.title')}
                  </h1>
                  <p className="text-[14px]" style={{ color: 'var(--text-3)' }}>
                    {t('login.subtitle')}
                  </p>
                </div>

                {showRecovery ? (
                  <form onSubmit={handleRecoverAccount} className="space-y-4">
                    <button
                      type="button"
                      onClick={() => { setShowRecovery(false); setError(''); setRecoveryResult(null) }}
                      className="flex items-center gap-1.5 text-[13px] transition-colors"
                      style={{ color: 'var(--text-3)' }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                        <polyline points="15 18 9 12 15 6"/>
                      </svg>
                      {t('common.back')}
                    </button>

                    <div>
                      <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
                        {t('login.recovery_username')}
                      </label>
                      <input
                        value={recoveryUsername}
                        onChange={e => setRecoveryUsername(e.target.value)}
                        required
                        className="input"
                        placeholder={t('login.recovery_placeholder')}
                      />
                    </div>

                    {error && (
                      <div
                        className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
                        style={{ background: 'var(--c-danger-bg)', color: 'var(--c-danger-text)' }}
                      >
                        {error}
                      </div>
                    )}

                    {recoveryResult && (
                      <div className="rounded-xl border px-4 py-3 text-[13px] space-y-2" style={{ borderColor: 'var(--color-secondary)', background: 'var(--bg-subtle)' }}>
                        <div className="font-medium" style={{ color: 'var(--text-1)' }}>{t('login.recovery_success')}</div>
                        <div style={{ color: 'var(--text-3)' }}>{t('login.recovery_instruction')}</div>
                        <div className="font-mono text-[16px] px-3 py-2 rounded-lg bg-white border" style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}>
                          {recoveryResult.temp_password}
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="btn btn-primary w-full"
                      style={{ height: 42, fontSize: 14 }}
                    >
                      {loading ? t('login.recovery_loading') : t('login.recovery_submit')}
                    </button>
                  </form>
                ) : (
                  <>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
                      {t('login.identifier')}
                    </label>
                    <input
                      type="text"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      className="input"
                      placeholder={t('login.identifier_placeholder')}
                    />
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
                      {t('login.password')}
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        className="input pr-10"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        aria-label={showPassword ? t('security.password.hide') : t('security.password.show')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-[var(--bg-subtle)] transition-colors"
                        style={{ color: 'var(--text-3)' }}
                      >
                        {showPassword ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                          </svg>
                        )}
                      </button>
                    </div>
                    <div className="flex justify-end mt-1.5">
                      <button
                        type="button"
                        onClick={() => { setShowRecovery(true); setError(''); setRecoveryResult(null); setRecoveryUsername(email) }}
                        className="text-[12px] font-medium hover:underline"
                        style={{ color: 'var(--color-secondary)' }}
                      >
                        {t('login.forgot_password')}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
                      style={{ background: 'var(--c-danger-bg)', color: 'var(--c-danger-text)' }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 flex-shrink-0">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn btn-primary w-full"
                    style={{ height: 42, fontSize: 14 }}
                  >
                    {loading ? t('login.loading') : t('login.submit')}
                  </button>

                  <div className="relative flex items-center gap-3">
                    <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                    <span className="text-[12px] flex-shrink-0" style={{ color: 'var(--text-3)' }}>{t('login.or')}</span>
                    <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                  </div>

                  <button
                    type="button"
                    onClick={handleBiometricLogin}
                    disabled={loading || !bioSupported}
                    title={!bioSupported ? bioBlockedReason : undefined}
                    className="btn btn-secondary w-full"
                    style={{
                      height: 42,
                      fontSize: 13,
                      borderColor: bioSupported ? 'var(--color-secondary)' : 'var(--border)',
                      color: bioSupported ? 'var(--color-secondary)' : 'var(--text-3)',
                      opacity: bioSupported ? 1 : 0.55,
                      cursor: bioSupported ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 flex-shrink-0">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                    {t('login.biometric')}
                  </button>
                </form>

                <p className="w-full mt-5 text-[11px] text-center leading-relaxed" style={{ color: 'var(--text-3)' }}>
                  {bioSupported
                    ? t('login.add_biometric_hint')
                    : bioBlockedReason}
                </p>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="mb-8">
                  <button
                    onClick={() => setShowRegisterBio(false)}
                    className="flex items-center gap-1.5 text-[13px] mb-6 transition-colors"
                    style={{ color: 'var(--text-3)' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--text-2)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                    {t('common.back')}
                  </button>
                  <h1 className="text-[22px] font-bold mb-1.5" style={{ color: 'var(--text-1)' }}>
                    {t('login.bio_title')}
                  </h1>
                  <p className="text-[14px]" style={{ color: 'var(--text-3)' }}>
                    {t('login.bio_subtitle')}
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
                      {t('login.device_name')}
                    </label>
                    <input
                      value={deviceName}
                      onChange={e => setDeviceName(e.target.value)}
                      className="input"
                      placeholder={t('login.device_placeholder')}
                    />
                  </div>

                  {error && (
                    <div
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
                      style={{ background: 'var(--c-danger-bg)', color: 'var(--c-danger-text)' }}
                    >
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleRegisterBio}
                    disabled={loading}
                    className="btn btn-primary w-full"
                    style={{ height: 42, fontSize: 14 }}
                  >
                    {loading ? t('login.bio_loading') : t('login.bio_activate')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
