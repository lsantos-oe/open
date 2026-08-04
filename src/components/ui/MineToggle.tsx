import { useTranslation } from 'react-i18next'

interface MineToggleProps {
  active: boolean
  onClick: () => void
  label?: string
}

/** Shared "Meus" pill — same active color and shape everywhere it appears. */
export function MineToggle({ active, onClick, label }: MineToggleProps) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border transition-colors whitespace-nowrap"
      style={active
        ? { background: 'var(--oe-primary)', color: 'white', borderColor: 'var(--oe-primary)' }
        : { background: 'var(--surface-card)', color: 'var(--text-secondary)', borderColor: 'var(--border-default)' }}
    >
      {label ?? t('actions.onlyMine')}
    </button>
  )
}
