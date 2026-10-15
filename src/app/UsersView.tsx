import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  AUTH_ROLES,
  createUser,
  errorMessage,
  fetchUsers,
  MIN_PASSWORD_LENGTH,
  passwordPolicyError,
  resetUserPassword,
  ROLE_LABELS,
  updateUser,
  type AuthRole,
  type UserAccount,
} from './api'
import { formatCount, formatDateTime } from './format'
import { useSession } from './session'
import { ViewHeader } from './ViewHeader'

type ToastTone = 'success' | 'error'
type UsersViewProps = { onBack: () => void; onToast: (message: string, tone?: ToastTone) => void }
type DialogState = { kind: 'create' } | { kind: 'edit'; user: UserAccount } | { kind: 'reset'; user: UserAccount }

const USERNAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._@-]{1,63}$/u

function Dialog({ titleId, title, description, onClose, children }: { titleId: string; title: string; description: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={`${titleId}-description`}>
      <div className="modal-heading">
        <div><h2 id={titleId}>{title}</h2><p id={`${titleId}-description`}>{description}</p></div>
        <button className="modal-close" type="button" onClick={onClose} aria-label="إغلاق النافذة">إغلاق</button>
      </div>
      {children}
    </section>
  </div>
}

function PasswordFields({ idPrefix, password, confirm, onPassword, onConfirm, autoFocus = false }: { idPrefix: string; password: string; confirm: string; onPassword: (value: string) => void; onConfirm: (value: string) => void; autoFocus?: boolean }) {
  return <div className="form-grid">
    <div>
      <label className="form-label" htmlFor={`${idPrefix}-password`}>كلمة المرور المؤقتة <span className="required-mark">*</span></label>
      <input id={`${idPrefix}-password`} className="form-input" type="password" value={password} onChange={(event) => onPassword(event.target.value)} autoComplete="new-password" dir="ltr" minLength={MIN_PASSWORD_LENGTH} aria-describedby={`${idPrefix}-password-hint`} autoFocus={autoFocus} required />
    </div>
    <div>
      <label className="form-label" htmlFor={`${idPrefix}-confirm`}>تأكيد كلمة المرور <span className="required-mark">*</span></label>
      <input id={`${idPrefix}-confirm`} className="form-input" type="password" value={confirm} onChange={(event) => onConfirm(event.target.value)} autoComplete="new-password" dir="ltr" required />
    </div>
    <p className="field-status users-password-hint" id={`${idPrefix}-password-hint`}>{MIN_PASSWORD_LENGTH} أحرف على الأقل. سيُطلب من المستخدم تغييرها عند أول دخول.</p>
  </div>
}

function validatePasswordPair(password: string, confirm: string): string {
  const policyError = passwordPolicyError(password)
  if (policyError) return policyError
  if (password !== confirm) return 'تأكيد كلمة المرور غير مطابق.'
  return ''
}

function CreateUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (user: UserAccount) => void }) {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<AuthRole>('receptionist')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!USERNAME_PATTERN.test(username.trim())) { setError('اسم المستخدم: حروف وأرقام فقط (ويمكن . _ - @)، من حرفين إلى 64 حرفًا، بدون مسافات.'); return }
    if (!displayName.trim() || displayName.trim().length > 200) { setError('الاسم المعروض مطلوب (حتى 200 حرف).'); return }
    const passwordError = validatePasswordPair(password, confirm)
    if (passwordError) { setError(passwordError); return }
    setSaving(true)
    setError('')
    try {
      onCreated(await createUser({ username, displayName, role, password }))
    } catch (requestError) {
      setError(errorMessage(requestError, 'تعذر إنشاء المستخدم.'))
      setSaving(false)
    }
  }

  return <Dialog titleId="create-user-title" title="إضافة مستخدم" description="سيُطلب من المستخدم الجديد تغيير كلمة المرور المؤقتة عند أول تسجيل دخول. سلّمها له بطريقة آمنة." onClose={onClose}>
    <form onSubmit={submit} noValidate aria-busy={saving}>
      <label className="form-label" htmlFor="new-user-username">اسم المستخدم <span className="required-mark">*</span></label>
      <input id="new-user-username" className="form-input" type="text" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} dir="ltr" maxLength={64} autoFocus required />
      <div className="form-grid">
        <div>
          <label className="form-label" htmlFor="new-user-name">الاسم المعروض <span className="required-mark">*</span></label>
          <input id="new-user-name" className="form-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={200} required />
        </div>
        <div>
          <label className="form-label" htmlFor="new-user-role">الدور <span className="required-mark">*</span></label>
          <select id="new-user-role" className="form-input" value={role} onChange={(event) => setRole(event.target.value as AuthRole)}>{AUTH_ROLES.map((value) => <option value={value} key={value}>{ROLE_LABELS[value]}</option>)}</select>
        </div>
      </div>
      <PasswordFields idPrefix="new-user" password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="secondary-button" type="button" onClick={onClose}>إلغاء</button>
        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'جارٍ الإنشاء…' : 'إنشاء المستخدم'}</button>
      </div>
    </form>
  </Dialog>
}

function EditUserDialog({ user, isSelf, onClose, onSaved }: { user: UserAccount; isSelf: boolean; onClose: () => void; onSaved: (user: UserAccount) => void }) {
  const [displayName, setDisplayName] = useState(user.displayName)
  const [role, setRole] = useState<AuthRole>(user.role)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const name = displayName.trim()
    if (!name || name.length > 200) { setError('الاسم المعروض مطلوب (حتى 200 حرف).'); return }
    const update = { ...(name !== user.displayName && { displayName: name }), ...(role !== user.role && { role }) }
    if (Object.keys(update).length === 0) { onClose(); return }
    setSaving(true)
    setError('')
    try {
      onSaved(await updateUser(user.id, update))
    } catch (requestError) {
      setError(errorMessage(requestError, 'تعذر حفظ التعديلات.'))
      setSaving(false)
    }
  }

  return <Dialog titleId="edit-user-title" title={`تعديل ${user.displayName}`} description={user.username} onClose={onClose}>
    <form onSubmit={submit} noValidate aria-busy={saving}>
      <label className="form-label" htmlFor="edit-user-name">الاسم المعروض <span className="required-mark">*</span></label>
      <input id="edit-user-name" className="form-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={200} autoFocus required />
      <label className="form-label" htmlFor="edit-user-role">الدور</label>
      <select id="edit-user-role" className="form-input" value={role} onChange={(event) => setRole(event.target.value as AuthRole)} disabled={isSelf} aria-describedby={isSelf ? 'edit-user-role-hint' : undefined}>{AUTH_ROLES.map((value) => <option value={value} key={value}>{ROLE_LABELS[value]}</option>)}</select>
      {isSelf && <p className="field-status" id="edit-user-role-hint">لا يمكنك تغيير دورك بنفسك؛ اطلب ذلك من مدير نظام آخر.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="secondary-button" type="button" onClick={onClose}>إلغاء</button>
        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}</button>
      </div>
    </form>
  </Dialog>
}

function ResetPasswordDialog({ user, onClose, onReset }: { user: UserAccount; onClose: () => void; onReset: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const passwordError = validatePasswordPair(password, confirm)
    if (passwordError) { setError(passwordError); return }
    setSaving(true)
    setError('')
    try {
      await resetUserPassword(user.id, password)
      onReset()
    } catch (requestError) {
      setError(errorMessage(requestError, 'تعذر إعادة تعيين كلمة المرور.'))
      setSaving(false)
    }
  }

  return <Dialog titleId="reset-password-title" title={`إعادة تعيين كلمة مرور ${user.displayName}`} description="سيُطلب من المستخدم تعيين كلمة مرور جديدة عند تسجيل الدخول التالي." onClose={onClose}>
    <form onSubmit={submit} noValidate aria-busy={saving}>
      <PasswordFields idPrefix="reset-user" password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} autoFocus />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="secondary-button" type="button" onClick={onClose}>إلغاء</button>
        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'تعيين كلمة المرور'}</button>
      </div>
    </form>
  </Dialog>
}

function UsersView({ onBack, onToast }: UsersViewProps) {
  const { user: currentUser } = useSession()
  const [users, setUsers] = useState<UserAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setUsers(await fetchUsers())
    } catch (requestError) {
      setError(errorMessage(requestError, 'تعذر تحميل المستخدمين.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadUsers(), 0)
    return () => window.clearTimeout(timer)
  }, [loadUsers])

  const replaceUser = (user: UserAccount) => setUsers((current) => current.some((entry) => entry.id === user.id) ? current.map((entry) => entry.id === user.id ? user : entry) : [...current, user])

  const toggleActive = async (user: UserAccount) => {
    if (user.isActive && !window.confirm(`تعطيل حساب ${user.displayName}؟ سيتم تسجيل خروجه ولن يتمكن من الدخول حتى يُعاد تفعيله.`)) return
    setBusyId(user.id)
    try {
      const updated = await updateUser(user.id, { isActive: !user.isActive })
      replaceUser(updated)
      onToast(updated.isActive ? `تم تفعيل حساب ${updated.displayName}` : `تم تعطيل حساب ${updated.displayName}`)
    } catch (requestError) {
      onToast(errorMessage(requestError, 'تعذر تحديث حالة الحساب.'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const activeCount = users.filter((user) => user.isActive).length

  return <>
    <ViewHeader title="المستخدمون" description="أنشئ حسابات الموظفين وحدّد أدوارهم وأدر الوصول." onBack={onBack} action={<button className="primary-button" type="button" onClick={() => setDialog({ kind: 'create' })}>إضافة مستخدم</button>} />
    {loading && <div className="state-card" role="status">جارٍ تحميل المستخدمين…</div>}
    {!loading && error && <div className="state-card state-card-error" role="alert"><strong>تعذر تحميل المستخدمين</strong><span>{error}</span><button className="secondary-button" type="button" onClick={() => void loadUsers()}>إعادة المحاولة</button></div>}
    {!loading && !error && <section className="panel catalog-panel" aria-labelledby="users-table-title">
      <div className="panel-heading"><div><h2 id="users-table-title">الحسابات</h2><p>{formatCount(users.length)} حساب · {formatCount(activeCount)} نشط</p></div></div>
      {users.length === 0 ? <div className="empty-state" role="status">لا يوجد مستخدمون.</div> : <div className="catalog-table-wrap"><table className="catalog-table users-table">
        <caption className="sr-only">قائمة المستخدمين</caption>
        <thead><tr><th scope="col">الاسم</th><th scope="col">اسم المستخدم</th><th scope="col">الدور</th><th scope="col">الحالة</th><th scope="col">آخر دخول</th><th scope="col"><span className="sr-only">إجراءات</span></th></tr></thead>
        <tbody>{users.map((user) => {
          const isSelf = user.id === currentUser.id
          return <tr key={user.id}>
            <td><strong>{user.displayName}</strong>{isSelf && <span className="table-subtext">(أنت)</span>}</td>
            <td dir="ltr">{user.username}</td>
            <td>{ROLE_LABELS[user.role]}</td>
            <td><div className="inventory-status-list">
              <span className={`status ${user.isActive ? 'status-success' : 'status-neutral'}`}><span className="status-dot" aria-hidden="true" />{user.isActive ? 'نشط' : 'معطّل'}</span>
              {user.mustChangePassword && <span className="status status-warning"><span className="status-dot" aria-hidden="true" />بانتظار تغيير كلمة المرور</span>}
            </div></td>
            <td>{formatDateTime(user.lastLoginAt, 'لم يسجّل الدخول بعد')}</td>
            <td><div className="row-actions">
              <button className="secondary-button row-action-button" type="button" onClick={() => setDialog({ kind: 'edit', user })} aria-label={`تعديل ${user.displayName}`}>تعديل</button>
              <button className="secondary-button row-action-button" type="button" onClick={() => setDialog({ kind: 'reset', user })} aria-label={`إعادة تعيين كلمة مرور ${user.displayName}`}>كلمة المرور</button>
              {!isSelf && <button className="secondary-button row-action-button" type="button" onClick={() => void toggleActive(user)} disabled={busyId !== null} aria-label={`${user.isActive ? 'تعطيل' : 'تفعيل'} ${user.displayName}`}>{busyId === user.id ? 'جارٍ الحفظ…' : user.isActive ? 'تعطيل' : 'تفعيل'}</button>}
            </div></td>
          </tr>
        })}</tbody>
      </table></div>}
    </section>}
    {dialog?.kind === 'create' && <CreateUserDialog onClose={() => setDialog(null)} onCreated={(user) => { replaceUser(user); setDialog(null); onToast(`تم إنشاء حساب ${user.displayName}. سيُطلب منه تغيير كلمة المرور عند أول دخول.`) }} />}
    {dialog?.kind === 'edit' && <EditUserDialog user={dialog.user} isSelf={dialog.user.id === currentUser.id} onClose={() => setDialog(null)} onSaved={(user) => { replaceUser(user); setDialog(null); onToast(`تم حفظ بيانات ${user.displayName}`) }} />}
    {dialog?.kind === 'reset' && <ResetPasswordDialog user={dialog.user} onClose={() => setDialog(null)} onReset={() => { const target = dialog.user; replaceUser({ ...target, mustChangePassword: true }); setDialog(null); onToast(`تم تعيين كلمة مرور مؤقتة لـ ${target.displayName}`) }} />}
  </>
}

export default UsersView
