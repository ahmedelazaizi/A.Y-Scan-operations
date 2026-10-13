import { useState, type FormEvent } from 'react'
import { completeSetup, errorMessage, login, MIN_PASSWORD_LENGTH, passwordPolicyError, type LoginResponse } from './api'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type SetupViewProps = {
  /** Called with the session of the new administrator, who is signed in right after the account is created. */
  onComplete: (session: LoginResponse) => Promise<void> | void
  /** Used when setup turns out to be finished already (e.g. done from another window). */
  onAlreadySetUp: () => void
}

export default function SetupView({ onComplete, onAlreadySetUp }: SetupViewProps) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!displayName.trim()) { setError('اكتب اسمك كما سيظهر في النظام.'); return }
    if (!EMAIL_PATTERN.test(email.trim())) { setError('أدخل بريدًا إلكترونيًا صحيحًا؛ سيُستخدم لتسجيل الدخول.'); return }
    const policy = passwordPolicyError(password)
    if (policy) { setError(policy); return }
    if (password !== confirm) { setError('كلمتا المرور غير متطابقتين.'); return }
    setSaving(true)
    setError('')
    try {
      await completeSetup({ email: email.trim(), displayName: displayName.trim(), password })
      await onComplete(await login({ email: email.trim(), password }))
    } catch (requestError) {
      if (requestError instanceof Error && /already set up|تم إعداد النظام/.test(requestError.message)) { onAlreadySetUp(); return }
      setError(errorMessage(requestError, 'تعذر إكمال الإعداد.'))
      setSaving(false)
    }
  }

  return (
    <main className="login-screen" dir="rtl">
      <section className="login-panel" aria-labelledby="setup-title">
        <div className="login-brand">
          <img src="/brand/ay-scan-logo.svg" alt="A.Y Scan" className="login-logo" />
          <span>مركز التحاليل والأشعة</span>
        </div>
        <div className="login-heading">
          <p className="login-eyebrow">الإعداد الأول</p>
          <h1 id="setup-title">أنشئ حساب مدير النظام</h1>
          <p>هذا الحساب يملك كل الصلاحيات، ومنه تضيف باقي الموظفين. اختر كلمة مرور قوية واحتفظ بها في مكان آمن.</p>
        </div>
        <form className="login-form" onSubmit={submit} noValidate aria-busy={saving}>
          <div className="login-field">
            <label htmlFor="setup-name">الاسم</label>
            <input id="setup-name" className="form-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={200} autoFocus required />
          </div>
          <div className="login-field">
            <label htmlFor="setup-email">البريد الإلكتروني (لتسجيل الدخول)</label>
            <input id="setup-email" className="form-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" inputMode="email" dir="ltr" maxLength={320} required placeholder="name@example.com" />
          </div>
          <div className="login-field">
            <label htmlFor="setup-password">كلمة المرور</label>
            <input id="setup-password" className="form-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" dir="ltr" maxLength={200} required aria-describedby="setup-password-hint" />
            <small id="setup-password-hint" className="field-hint">{MIN_PASSWORD_LENGTH} أحرف على الأقل، وتحتوي على حروف وأرقام.</small>
          </div>
          <div className="login-field">
            <label htmlFor="setup-confirm">تأكيد كلمة المرور</label>
            <input id="setup-confirm" className="form-input" type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" dir="ltr" maxLength={200} required />
          </div>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="primary-button login-submit" type="submit" disabled={saving}>{saving ? 'جارٍ الإنشاء…' : 'إنشاء الحساب والبدء'}</button>
        </form>
        <p className="login-note">يُتاح هذا الإعداد مرة واحدة فقط ومن جهاز الخادم نفسه.</p>
      </section>
    </main>
  )
}
