import { ReactNode } from 'react'

export type BadgeVariant = 'blue' | 'green' | 'red' | 'yellow' | 'gray' | 'orange' | 'purple' | 'violet' | 'primary'

// Cor suave (fundo translúcido + texto na mesma cor), sem borda — funciona nos dois temas porque o fundo é
// translúcido sobre o que estiver atrás. O significado é fixo: azul = em curso/técnico, âmbar = atenção/espera,
// verde = ok/concluído, vermelho = urgente/atrasado, violeta = executivo/direto, cinza = neutro.
const variants: Record<BadgeVariant, { bg: string; fg: string }> = {
  blue:    { bg: 'var(--badge-blue-bg)',   fg: 'var(--color-info-text)' },
  green:   { bg: 'var(--badge-green-bg)',  fg: 'var(--color-success-text)' },
  red:     { bg: 'var(--badge-red-bg)',    fg: 'var(--color-danger-text)' },
  yellow:  { bg: 'var(--badge-amber-bg)',  fg: 'var(--color-warning-text)' },
  violet:  { bg: 'var(--badge-violet-bg)', fg: 'var(--color-violet-text)' },
  primary: { bg: 'var(--oe-primary-light)', fg: 'var(--text-primary)' },
  gray:    { bg: 'var(--badge-gray-bg)',   fg: 'var(--text-secondary)' },
  // nomes antigos, mantidos por compatibilidade
  orange:  { bg: 'var(--badge-gray-bg)',   fg: 'var(--text-secondary)' },
  purple:  { bg: 'var(--badge-violet-bg)', fg: 'var(--color-violet-text)' },
}

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
  /** Ponto de cor antes do texto (para estados). */
  dot?: boolean
  /** sm = 20px (tabelas densas), md = 22px (padrão). */
  size?: 'sm' | 'md'
  /** Texto em fonte monoespaçada (códigos/IDs). */
  mono?: boolean
  title?: string
}

/** Pílula padrão do sistema. Nunca quebra de linha: se faltar espaço, o texto é cortado com reticências. */
export function Badge({ variant = 'gray', children, className = '', dot, size = 'md', mono, title }: BadgeProps) {
  const v = variants[variant]
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap max-w-full font-medium align-middle ${mono ? 'font-mono' : ''} ${className}`}
      style={{
        height: size === 'sm' ? 20 : 22,
        padding: size === 'sm' ? '0 8px' : '0 10px',
        fontSize: size === 'sm' ? 11 : 12,
        borderRadius: 'var(--radius-pill)',
        background: v.bg,
        color: v.fg,
      }}
    >
      {dot && <span className="shrink-0 rounded-full" style={{ width: 6, height: 6, background: 'currentColor' }} />}
      <span className="truncate">{children}</span>
    </span>
  )
}
