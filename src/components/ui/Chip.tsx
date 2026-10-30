import { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
}

/** Bolinha com as iniciais (pessoas). */
export function Avatar({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center shrink-0 font-semibold select-none"
      style={{ width: size, height: size, borderRadius: '50%', background: 'var(--oe-primary-light)', color: 'var(--oe-primary)', fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}

interface ChipProps {
  children: ReactNode
  /** Mostra a bolinha de iniciais desta pessoa. */
  person?: string
  to?: string
  onRemove?: () => void
  removeLabel?: string
  className?: string
}

/** Item escolhido (pessoa, cliente, projeto…): pílula suave sem borda, com × para tirar. */
export function Chip({ children, person, to, onRemove, removeLabel = 'Remover', className = '' }: ChipProps) {
  const body = to ? <Link to={to} className="hover:underline truncate">{children}</Link> : <span className="truncate">{children}</span>
  return (
    <span
      className={`inline-flex items-center gap-1.5 max-w-full text-xs font-medium ${className}`}
      style={{ height: 26, paddingLeft: person ? 3 : 10, paddingRight: onRemove ? 4 : 10, borderRadius: 'var(--radius-pill)', background: 'var(--badge-gray-bg)', color: 'var(--text-primary)' }}
    >
      {person && <Avatar name={person} size={20} />}
      {body}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="inline-flex items-center justify-center shrink-0 rounded-full transition-colors hover:bg-[var(--surface-subtle)]"
          style={{ width: 18, height: 18, color: 'var(--text-tertiary)', fontSize: 13, lineHeight: 1 }}
        >
          ×
        </button>
      )}
    </span>
  )
}

/** Botão "+ Adicionar" que acompanha os chips: discreto, mesma pílula, sem borda tracejada. */
export function AddChip({ children, onClick, buttonRef }: { children: ReactNode; onClick: () => void; buttonRef?: React.Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-medium transition-colors hover:bg-[var(--badge-gray-bg)]"
      style={{ height: 26, padding: '0 10px', borderRadius: 'var(--radius-pill)', color: 'var(--text-tertiary)' }}
    >
      {children}
    </button>
  )
}
