/** Excluir, discreto: só a lixeira (a confirmação vem depois do clique). */
export function TrashButton({ onClick, label = 'Excluir', className = '' }: { onClick: () => void; label?: string; className?: string }) {
  return (
    <button
      type="button" onClick={onClick} title={label} aria-label={label}
      className={`inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-text)] shrink-0 ${className}`}
      style={{ color: 'var(--text-tertiary)' }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />
      </svg>
    </button>
  )
}
