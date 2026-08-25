import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiRequest } from '../api/http.ts'
import type { AuthUser, LoginResponse } from '../api/types.ts'

const STORAGE = 'nw-ops.session'

type Session = { token: string; user: AuthUser }

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session
    if (!parsed?.token || !parsed?.user?.roles) return null
    return parsed
  } catch {
    return null
  }
}

type AuthState = {
  token: string | null
  user: AuthUser | null
  login: (email: string, password: string) => Promise<AuthUser>
  logout: () => void
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readSession())

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    const next = { token: res.token, user: res.user }
    localStorage.setItem(STORAGE, JSON.stringify(next))
    setSession(next)
    return res.user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE)
    setSession(null)
  }, [])

  useEffect(() => {
    const onUnauthorized = () => logout()
    window.addEventListener('nw-ops:unauthorized', onUnauthorized)
    return () => window.removeEventListener('nw-ops:unauthorized', onUnauthorized)
  }, [logout])

  const value = useMemo<AuthState>(
    () => ({
      token: session?.token ?? null,
      user: session?.user ?? null,
      login,
      logout,
    }),
    [session, login, logout],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
