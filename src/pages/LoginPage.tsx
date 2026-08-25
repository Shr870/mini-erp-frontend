import { type FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import { firstAllowedPath, SEEDED_USERS } from '../auth/rbac.ts'
import { ErrorBanner, BusyButton } from '../components/Ui.tsx'

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('sales@northwind.local')
  const [password, setPassword] = useState('password123')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)

  if (user) return <Navigate to={firstAllowedPath(user.roles)} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const u = await login(email, password)
      navigate(firstAllowedPath(u.roles))
    } catch (ex) {
      setErr(ex)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <p className="brand-kicker">Northwind Traders</p>
        <h1>Operations Console</h1>
        <p className="muted">JWT against Stage 2 <code>POST /api/v1/auth/login</code>. Password for seed users: <code>password123</code>.</p>
        <ErrorBanner err={err} />
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <BusyButton type="submit" busy={busy}>
          Sign in
        </BusyButton>
        <p className="muted seed-hint">Click a role to fill credentials — still hits the real login API.</p>
        <ul className="seed-list">
          {SEEDED_USERS.map((u) => (
            <li key={u.email}>
              <button
                type="button"
                className="linkish"
                onClick={() => {
                  setEmail(u.email)
                  setPassword('password123')
                }}
              >
                {u.role}
              </button>
              <span className="muted"> — {u.note}</span>
            </li>
          ))}
        </ul>
      </form>
    </div>
  )
}
