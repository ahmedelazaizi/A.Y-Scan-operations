import { useState, type FormEvent } from 'react'
import { ApiError, login, type AuthenticatedUser, type LoginResponse } from './api'

type LoginViewProps = {
  onSuccess: (session: LoginResponse) => Promise<void> | void
}

const ROLE_LABELS: Record<AuthenticatedUser['role'], string> = {
  admin: 'مدير النظام',
  branch_manager: 'مدير الفرع',
  receptionist: 'الاستقبال',
  lab_technician: 'فني المختبر',
  radiologist: 'اختصاصي الأشعة',
  accountant: 'المحاسبة',
}

function safeLoginMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 503) return 'خدمة الدخول غير متاحة حاليًا. حاول مرة أخرى لاحقًا.'
  return 'تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور ثم حاول مرة أخرى.'
}

export default function LoginView({ onSuccess }: LoginViewProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [authenticatedUser, setAuthenticatedUser] = useState<AuthenticatedUser | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const session = await login({ email, password })
      setAuthenticatedUser(session.user)
      await onSuccess(session)
    } catch (requestError) {
      setAuthenticatedUser(null)
      setError(safeLoginMessage(requestError))
    } finally {
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
            <label htmlFor="login-email">البريد الإلكتروني</label>
            <input
              id="login-email"
              className="form-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              inputMode="email"
              dir="ltr"
              required
              placeholder="name@example.com"
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
        {authenticatedUser && (
          <div className="login-success" role="status" aria-live="polite">
            <strong>مرحبًا، {authenticatedUser.displayName}</strong>
            <span>{authenticatedUser.email}</span>
            <small>{ROLE_LABELS[authenticatedUser.role]}</small>
          </div>
        )}
        <p className="login-note">لأمان المركز، لا تشارك بيانات الدخول مع أي شخص.</p>
      </section>
    </main>
  )
}
