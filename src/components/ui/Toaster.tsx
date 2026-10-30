import { createPortal } from 'react-dom'
import { useToastStore } from '@/stores/useToastStore'

export function Toaster() {
  const { toasts, removeToast } = useToastStore()

  if (!toasts.length) return null

  return createPortal(
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      zIndex: 9999,
      maxWidth: 360,
      pointerEvents: 'none',
    }}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => removeToast(toast.id)}
          style={{
            background: toast.type === 'error' ? 'var(--color-danger-text, #ef4444)' : 'var(--surface-card)',
            color: 'white',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            fontSize: 13,
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
            border: '0.5px solid rgba(255,255,255,0.12)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            pointerEvents: 'all',
          }}
        >
          <span style={{ flex: 1 }}>{toast.message}</span>
          <span style={{ opacity: 0.6, fontSize: 15, lineHeight: 1, flexShrink: 0 }}>×</span>
        </div>
      ))}
    </div>,
    document.body,
  )
}
