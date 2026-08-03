import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSmartPosition } from '@/hooks/useSmartPosition'

const base = 'block w-full border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:border-[var(--oe-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--oe-primary)] disabled:bg-[var(--surface-subtle)] transition-colors'

const radius = { borderRadius: 'var(--radius-md)' }

export function Input({ className = '', style, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${base} ${className}`} style={{ ...radius, ...style }} {...rest} />
}

export function Select({ className = '', style, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${base} ${className}`} style={{ ...radius, ...style }} {...rest}>
      {children}
    </select>
  )
}

export function Textarea({ className = '', style, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${base} ${className}`} style={{ ...radius, ...style }} rows={3} {...rest} />
}

function HintIcon({ hint }: { hint: string }) {
  const [open, setOpen] = useState(false)
  const { triggerRef, popoverRef, position } = useSmartPosition(open)
  return (
    <span
      ref={triggerRef as React.RefObject<HTMLSpanElement>}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-[var(--radius-pill)] text-[10px] font-semibold cursor-help shrink-0"
      style={{ background: 'var(--surface-subtle)', color: 'var(--text-tertiary)', border: '1px solid var(--border-default)' }}
    >
      ?
      {open && createPortal(
        <div
          ref={popoverRef as React.RefObject<HTMLDivElement>}
          style={{
            position: 'fixed', ...position, zIndex: 2000,
            maxWidth: 240, padding: '6px 10px', borderRadius: 'var(--radius-md)',
            background: 'var(--text-primary)', color: 'var(--surface-card)',
            fontSize: 11.5, fontWeight: 400, lineHeight: 1.4,
            boxShadow: 'var(--shadow-md)', pointerEvents: 'none',
          }}
        >
          {hint}
        </div>,
        document.body,
      )}
    </span>
  )
}

interface FieldProps { label: string; children: React.ReactNode; required?: boolean; className?: string; hint?: string }
export function Field({ label, children, required, className = '', hint }: FieldProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="flex items-center gap-1 text-[12px] font-[500] text-[var(--text-secondary)]">
        {label}{required && <span className="text-[var(--color-danger-text)] ml-0.5">*</span>}
        {hint && <HintIcon hint={hint} />}
      </label>
      {children}
    </div>
  )
}
