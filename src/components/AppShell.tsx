import { useQuery } from '@tanstack/react-query'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { api } from '../api/endpoints.ts'
import { useAuth } from '../auth/AuthContext.tsx'
import { navFor } from '../auth/rbac.ts'

export function AppShell() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()
  const nav = navFor(user?.roles ?? [])
  const reconQ = useQuery({
    queryKey: ['recon', token],
    queryFn: () => api.recon({ token }),
    enabled: Boolean(token) && nav.finance,
    staleTime: 0,
    refetchOnWindowFocus: true,
  })

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-kicker">Northwind Traders</span>
          <strong>Operations Console</strong>
        </div>
        <nav>
          {nav.warehouse ? (
            <NavLink to="/warehouse">Warehouse</NavLink>
          ) : null}
          {nav.procurement ? (
            <NavLink to="/procurement">Procurement</NavLink>
          ) : null}
          {nav.sales ? <NavLink to="/sales">Sales</NavLink> : null}
          {nav.finance ? <NavLink to="/finance">Finance</NavLink> : null}
        </nav>
        <div className="sidebar-foot">
          <div className="who">
            <div>{user?.name}</div>
            <div className="muted">{user?.email}</div>
            <div className="roles">{user?.roles.join(', ')}</div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              logout()
              navigate('/login')
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span className="muted">Source of truth: Stage 2 API · reload refetches · no mocked stock/ledger</span>
          {nav.finance ? (
            <span
              className={`recon-chip ${reconQ.isLoading ? 'is-loading' : reconQ.isError ? 'is-fail' : reconQ.data?.reconciled ? 'is-ok' : 'is-bad'}`}
              title="GET /api/v1/ledger/reconciliation"
            >
              {reconQ.isLoading
                ? 'Recon…'
                : reconQ.isError
                  ? 'Recon unreachable'
                  : `Ledger matches movements: ${reconQ.data?.reconciled ? 'YES' : 'NO'}`}
            </span>
          ) : (
            <span className="muted">Recon hidden — this role cannot GET /ledger/reconciliation</span>
          )}
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
