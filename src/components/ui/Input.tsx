import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSmartPosition } from '@/hooks/useSmartPosition'

const base = 'block w-full border border-transparent bg-[var(--surface-subtle)] px-4 py-2 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:border-[var(--text-tertiary)] focus:outline-none disabled:bg-[var(--surface-subtle)] transition-colors'

const radius = { borderRadius: 'var(--radius-pill)' }

export function Input({ className = '', style, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${base} ${className}`} style={{ ...radius, ...style }} {...rest} />
}

/** Seta única de todos os seletores (nativo, com busca, múltiplo, país): mesmo traço, tamanho e cor. */
export function SelectChevron({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-3.5 h-3.5 shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25} style={{ color: 'var(--text-tertiary)' }} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  )
}

/** Seletor nativo com a mesma cara dos demais: sem as setas duplas do navegador, com a seta padrão à direita. */
export function Select({ className = '', style, children, wrapperClassName = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }) {
  return (
    <div className={`relative ${wrapperClassName}`}>
      <select className={`${base} appearance-none pr-9 cursor-pointer ${className}`} style={{ ...radius, ...style }} {...rest}>
        {children}
      </select>
      <SelectChevron className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  )
}

export function Textarea({ className = '', style, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${base} ${className}`} style={{ borderRadius: 'var(--radius-lg)', ...style }} rows={3} {...rest} />
}

function HintIcon({ hint }: { hint: string }) {
  const [open, setOpen] = useState(false)
  const { triggerRef, popoverRef, position } = useSmartPosition(open)
  return (
    <span
      ref={triggerRef as React.RefObject<HTMLSpanElement>}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-[var(--radius-pill)] text-[11.5px] font-semibold cursor-help shrink-0"
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
      <label className="flex items-center gap-1 text-[13px] font-[500] text-[var(--text-secondary)]">
        {label}{required && <span className="text-[var(--color-danger-text)] ml-0.5">*</span>}
        {hint && <HintIcon hint={hint} />}
      </label>
      {children}
    </div>
  )
}
