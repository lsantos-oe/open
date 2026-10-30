import type { ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/useAuthStore'

function Spinner() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--surface-page)',
    }}>
      <svg
        width="32" height="32" viewBox="0 0 24 24" fill="none"
        style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text-secondary)' }}
      >
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round"/>
      </svg>
    </div>
  )
}

interface Props { children?: ReactNode }

export function ProtectedRoute({ children }: Props) {
  const { user, loading } = useAuthStore()

  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  return children ? <>{children}</> : <Outlet />
}
