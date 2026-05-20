import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useT } from '../../store/prefs.store'

export default function PasswordInput({
  value,
  onChange,
  className = 'input',
  buttonClassName = '',
  placeholder,
  autoComplete,
  required,
  minLength,
  autoFocus,
  disabled,
  name,
}) {
  const t = useT()
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        autoFocus={autoFocus}
        disabled={disabled}
        className={`${className} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? t('security.password.hide') : t('security.password.show')}
        title={visible ? t('security.password.hide') : t('security.password.show')}
        className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-[var(--bg-subtle)] transition-colors ${buttonClassName}`}
        style={{ color: 'var(--text-3)' }}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}
