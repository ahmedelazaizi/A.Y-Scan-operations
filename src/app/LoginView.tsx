import { useState, type FormEvent } from 'react'
import { ApiError, login, type LoginResponse } from './api'

type LoginViewProps = {
  onSuccess: (session: LoginResponse) => Promise<void> | void
}

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'اسم المستخدم أو كلمة المرور غير صحيحة.'
    if (error.status === 429) {
      const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds ?? 60) / 60))
      return `محاولات كثيرة، حاول بعد ${new Intl.NumberFormat('ar-EG').format(minutes)} ${minutes === 1 ? 'دقيقة' : 'دقائق'}.`
    }
    if (error.status === 400) return 'أدخل اسم المستخدم وكلمة المرور.'
    if (error.status === 0 || error.status >= 500) return 'خدمة الدخول غير متاحة حاليًا. حاول مرة أخرى بعد قليل.'
  }
  return 'تعذر تسجيل الدخول. حاول مرة أخرى.'
}

export default function LoginView({ onSuccess }: LoginViewProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!username.trim() || !password) { setError('أدخل اسم المستخدم وكلمة المرور.'); return }
    setError('')
    setSubmitting(true)
    try {
      const session = await login({ username, password })
      await onSuccess(session)
    } catch (requestError) {
      setError(loginErrorMessage(requestError))
      setSubmitting(false)
    }
  }

  return (
    <main className="login-screen" dir="rtl">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <img src="/brand/ay-scan-logo.svg" alt="A.Y Scan" className="login-logo" />
          <span>مركز التحاليل والأشعة</span>
        </div>
        <div className="login-heading">
          <p className="login-eyebrow">مساحة عمل آمنة</p>
          <h1 id="login-title">تسجيل الدخول</h1>
          <p>أدخل بيانات حسابك للوصول إلى لوحة المركز.</p>
        </div>
        <form className="login-form" onSubmit={submit} noValidate aria-busy={isSubmitting}>
          <div className="login-field">
            <label htmlFor="login-username">اسم المستخدم</label>
            <input
              id="login-username"
              className="form-input"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              placeholder="admin"
            />
          </div>
          <div className="login-field">
            <label htmlFor="login-password">كلمة المرور</label>
            <input
              id="login-password"
              className="form-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              dir="ltr"
              required
            />
          </div>
          {error && <p className="login-error" id="login-error" role="alert">{error}</p>}
          <button className="primary-button login-submit" type="submit" disabled={isSubmitting} aria-describedby={error ? 'login-error' : undefined}>
            {isSubmitting ? 'جارٍ التحقق…' : 'دخول إلى مساحة العمل'}
          </button>
        </form>
        <p className="login-note">لأمان المركز، لا تشارك بيانات الدخول مع أي شخص.</p>
      </section>
    </main>
  )
}
