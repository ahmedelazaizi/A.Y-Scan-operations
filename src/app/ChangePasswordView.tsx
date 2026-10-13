import { useEffect, useId, useState, type FormEvent } from 'react'
import { changePassword, errorMessage, MIN_PASSWORD_LENGTH, passwordPolicyError, type AuthenticatedUser } from './api'

type ChangePasswordFormProps = {
  onChanged: (user: AuthenticatedUser) => void
  onCancel?: () => void
  submitLabel: string
}

function ChangePasswordForm({ onChanged, onCancel, submitLabel }: ChangePasswordFormProps) {
  const id = useId()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!currentPassword) { setError('أدخل كلمة المرور الحالية.'); return }
    const policyError = passwordPolicyError(newPassword)
    if (policyError) { setError(policyError); return }
    if (newPassword !== confirmPassword) { setError('تأكيد كلمة المرور لا يطابق كلمة المرور الجديدة.'); return }
    if (newPassword === currentPassword) { setError('يجب أن تختلف كلمة المرور الجديدة عن الحالية.'); return }
    setSaving(true)
    setError('')
    try {
      const response = await changePassword({ currentPassword, newPassword })
      onChanged(response.user)
    } catch (requestError) {
      setError(errorMessage(requestError, 'تعذر تغيير كلمة المرور.'))
      setSaving(false)
    }
  }

  return (
    <form className="login-form" onSubmit={submit} noValidate aria-busy={saving} aria-describedby={error ? errorId : hintId}>
      <div className="login-field">
        <label htmlFor={`${id}-current`}>كلمة المرور الحالية</label>
        <input id={`${id}-current`} className="form-input" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" dir="ltr" required autoFocus />
      </div>
      <div className="login-field">
        <label htmlFor={`${id}-new`}>كلمة المرور الجديدة</label>
        <input id={`${id}-new`} className="form-input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" dir="ltr" minLength={MIN_PASSWORD_LENGTH} aria-describedby={hintId} required />
        <small className="field-hint" id={hintId}>{MIN_PASSWORD_LENGTH} أحرف على الأقل.</small>
      </div>
      <div className="login-field">
        <label htmlFor={`${id}-confirm`}>تأكيد كلمة المرور الجديدة</label>
        <input id={`${id}-confirm`} className="form-input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" dir="ltr" required />
      </div>
      {error && <p className="login-error" id={errorId} role="alert">{error}</p>}
      <div className="modal-actions">
        {onCancel && <button className="secondary-button" type="button" onClick={onCancel} disabled={saving}>إلغاء</button>}
        <button className="primary-button login-submit" type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ…' : submitLabel}</button>
      </div>
    </form>
  )
}

type RequiredProps = { user: AuthenticatedUser; onChanged: (user: AuthenticatedUser) => void; onLogout: () => void }

/** Full-screen gate shown when the account must change its password before using the app. */
export function RequiredPasswordChangeView({ user, onChanged, onLogout }: RequiredProps) {
  return (
    <main className="login-screen" dir="rtl">
      <section className="login-panel" aria-labelledby="change-password-title">
        <div className="login-brand">
          <img src="/brand/ay-scan-logo.svg" alt="A.Y Scan" className="login-logo" />
          <span>مركز التحاليل والأشعة</span>
        </div>
        <div className="login-heading">
          <p className="login-eyebrow">خطوة أمان مطلوبة</p>
          <h1 id="change-password-title">تغيير كلمة المرور</h1>
          <p>مرحبًا {user.displayName}، يجب تعيين كلمة مرور جديدة خاصة بك قبل الدخول إلى مساحة العمل.</p>
        </div>
        <ChangePasswordForm onChanged={onChanged} submitLabel="حفظ كلمة المرور والمتابعة" />
        <p className="login-note">
          لست {user.displayName}؟ <button className="text-button" type="button" onClick={onLogout}>تسجيل الخروج</button>
        </p>
      </section>
    </main>
  )
}

type DialogProps = { onChanged: (user: AuthenticatedUser) => void; onClose: () => void }

/** Voluntary password change from the user menu. */
export function ChangePasswordDialog({ onChanged, onClose }: DialogProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="change-password-dialog-title" aria-describedby="change-password-dialog-description">
        <div className="modal-heading">
          <div>
            <h2 id="change-password-dialog-title">تغيير كلمة المرور</h2>
            <p id="change-password-dialog-description">سيتم تسجيل خروج جلساتك الأخرى على الأجهزة الأخرى بعد التغيير.</p>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="إغلاق النافذة">إغلاق</button>
        </div>
        <ChangePasswordForm onChanged={onChanged} onCancel={onClose} submitLabel="حفظ كلمة المرور" />
      </section>
    </div>
  )
}
