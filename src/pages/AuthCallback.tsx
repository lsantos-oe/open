import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error || !session) {
        navigate('/login?error=failed', { replace: true })
        return
      }

      const email = session.user.email ?? ''
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
        .eq('id', session.user.id)
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
    })
  }, [navigate])

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
