import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSmartPosition } from '@/hooks/useSmartPosition'

export function getStatusStyle(status: string): { background: string; color: string } {
  switch (status) {
    case 'done':        return { background: 'var(--color-success-bg)', color: 'var(--color-success-text)' }
    case 'in_progress': return { background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' }
    case 'pending':     return { background: 'var(--surface-subtle)',   color: 'var(--text-tertiary)' }
    case 'blocked':
    case 'overdue':
    case 'delayed':     return { background: 'var(--color-danger-bg)',  color: 'var(--color-danger-text)' }
    case 'planning':    return { background: 'var(--surface-subtle)',   color: 'var(--text-tertiary)' }
    default:            return { background: 'var(--surface-subtle)',   color: 'var(--text-tertiary)' }
  }
}

interface Option { value: string; label: string }

interface Props {
  value: string
  onChange: (newValue: string) => void
  options: Option[]
  readonly?: boolean
}

export default function StatusBadge({ value, onChange, options, readonly = false }: Props) {
  const [open, setOpen] = useState(false)
  const { triggerRef, popoverRef, position } = useSmartPosition(open)
  const style = getStatusStyle(value)
  const currentLabel = options.find(o => o.value === value)?.label ?? value

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  return (
    <>
      <span
        ref={triggerRef as any}
        onClick={() => { if (!readonly) setOpen(v => !v) }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 10px',
          borderRadius: 20,
          fontSize: 11,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          userSelect: 'none',
          cursor: readonly ? 'default' : 'pointer',
          background: style.background,
          color: style.color,
        }}
        onMouseEnter={e => { if (!readonly) e.currentTarget.style.filter = 'brightness(0.96)' }}
        onMouseLeave={e => { e.currentTarget.style.filter = '' }}
      >
        {currentLabel}
        {!readonly && (
          <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
            <path d="M1 1L4 4.5L7 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </span>

      {open && createPortal(
        <div
          ref={popoverRef as any}
          style={{
            position: 'fixed',
            ...position,
            zIndex: 1000,
            background: 'var(--surface-card)',
            border: '0.5px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: 5,
            minWidth: 160,
          }}
        >
          {options.map(opt => {
            const s = getStatusStyle(opt.value)
            const isCurrent = opt.value === value
            return (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className="w-full flex items-center gap-2 transition-colors"
                style={{ padding: '5px 8px', borderRadius: 'var(--radius-md)', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-subtle)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  flex: 1,
                  padding: '2px 8px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 500,
                  background: s.background,
                  color: s.color,
                }}>
                  {opt.label}
                </span>
                {isCurrent && (
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>✓</span>
                )}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
