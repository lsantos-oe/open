import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/useAuthStore'

export default function AuthCallback() {
  const navigate = useNavigate()
  const { user, loading } = useAuthStore()

  useEffect(() => {
    // Reuse the session App.tsx's initialize() already resolved — calling
    // supabase.auth.getSession() again here races it for the same browser
    // lock and can leave this page stuck on the spinner forever.
    if (loading) return

    if (!user) {
      navigate('/login?error=failed', { replace: true })
      return
    }

    const email = user.email ?? ''
    const allowedDomain = (import.meta as any).env?.VITE_ALLOWED_EMAIL_DOMAIN as string | undefined

    if (allowedDomain && !email.endsWith('@' + allowedDomain)) {
      supabase.auth.signOut().then(() =>
        navigate('/login?error=unauthorized', { replace: true }),
      )
      return
    }

    supabase
      .from('profiles')
      .select('active')
      .eq('id', user.id)
      .single()
      .then(({ data: profile }) => {
        if (profile && profile.active === false) {
          supabase.auth.signOut().then(() =>
            navigate('/login?error=revoked', { replace: true }),
          )
          return
        }
        navigate('/', { replace: true })
      })
  }, [user, loading, navigate])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      background: 'var(--surface-page)',
    }}>
      <Spinner />
      <p style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>Autenticando...</p>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      width="32" height="32" viewBox="0 0 24 24" fill="none"
      style={{ animation: 'spin 0.8s linear infinite', color: 'var(--oe-primary)' }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round"/>
    </svg>
  )
}
