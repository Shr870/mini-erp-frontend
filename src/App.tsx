import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext.tsx'
import { AppShell } from './components/AppShell.tsx'
import { FinancePage } from './pages/FinancePage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { ProcurementPage } from './pages/ProcurementPage.tsx'
import { SalesPage } from './pages/SalesPage.tsx'
import { WarehousePage } from './pages/WarehousePage.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: 0,
      refetchOnWindowFocus: true,
      refetchOnMount: 'always',
      retry: (count, err) => {
        const status = (err as { status?: number }).status
        if (status && status >= 400 && status < 500) return false
        return count < 1
      },
    },
    mutations: { retry: false },
  },
})

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route path="/warehouse" element={<WarehousePage />} />
              <Route path="/procurement" element={<ProcurementPage />} />
              <Route path="/sales" element={<SalesPage />} />
              <Route path="/finance" element={<FinancePage />} />
            </Route>
            <Route path="*" element={<Navigate to="/warehouse" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
