import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/useAuthStore'

export default function LoginPage() {
  const { signInWithGoogle, loading } = useAuthStore()
  const [searchParams] = useSearchParams()
  const error = searchParams.get('error')

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--surface-page)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--surface-card)',
        border: '0.5px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        padding: '40px 48px',
        width: '100%',
        maxWidth: 380,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
            OpEn
          </span>
        </div>

        {/* Subtitle */}
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center', marginBottom: 32 }}>
          Gestão de projetos de implementação Ploomes
        </p>

        {/* Error message */}
        {error && (
          <div style={{
            width: '100%',
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-danger-bg)',
            border: '0.5px solid var(--color-danger-text)',
            fontSize: 13,
            color: 'var(--color-danger-text)',
            textAlign: 'center',
          }}>
            {error === 'unauthorized'
              ? 'Acesso não autorizado. Use um e-mail corporativo.'
              : 'Erro ao autenticar. Tente novamente.'}
          </div>
        )}

        {/* Sign in button */}
        <button
          onClick={signInWithGoogle}
          disabled={loading}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '10px 20px',
            borderRadius: 'var(--radius-md)',
            border: '0.5px solid var(--border-default)',
            background: 'var(--surface-card)',
            color: 'var(--text-primary)',
            fontSize: 14,
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            transition: 'background 150ms',
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'var(--surface-subtle)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-card)' }}
        >
          <GoogleIcon />
          Entrar com Google
        </button>
      </div>

      {/* Footer */}
      <p style={{ marginTop: 24, fontSize: 12, color: 'var(--text-disabled)' }}>
        Apenas usuários autorizados
      </p>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}
