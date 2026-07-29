interface Props {
  color: string
  label: string
  className?: string
}

/** Small colored glyph + neutral text — reserves saturated color for the dot only, not the whole row. */
export function StatusDot({ color, label, className = '' }: Props) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
    </span>
  )
}
