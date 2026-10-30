import { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'pill'
type Size = 'xs' | 'sm' | 'md'

const base = 'inline-flex items-center gap-1.5 font-[500] transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed'

const variants: Record<Variant, string> = {
  primary:   'bg-[var(--oe-primary)] text-white hover:bg-[var(--oe-primary-hover)]',
  secondary: 'bg-[var(--surface-card)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--surface-subtle)]',
  ghost:     'text-[var(--text-tertiary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-secondary)]',
  danger:    'bg-[var(--color-danger-bg)] text-[var(--color-danger-text)] border border-[var(--border-default)] hover:bg-red-100',
  pill:      'bg-[var(--surface-card)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:text-[var(--text-secondary)] hover:border-[var(--oe-primary-mid)]',
}

const radii: Record<Variant, string> = {
  primary:   'var(--radius-pill)',
  secondary: 'var(--radius-pill)',
  ghost:     'var(--radius-pill)',
  danger:    'var(--radius-pill)',
  pill:      'var(--radius-pill)',
}

const sizes: Record<Size, string> = {
  xs: 'px-3 py-[3px] text-[11px]',
  sm: 'px-3.5 py-[5px] text-[12px]',
  md: 'px-4 py-[7px] text-[13px]',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

export function Button({ variant = 'primary', size = 'md', className = '', style, children, ...rest }: ButtonProps) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      style={{ borderRadius: radii[variant], ...style }}
      {...rest}
    >
      {children}
    </button>
  )
}
