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
      className="h-8 px-3 text-[13px] font-medium rounded-[var(--radius-md)] transition-colors whitespace-nowrap"
      style={active
        ? { background: 'var(--oe-primary)', color: 'white' }
        : { background: 'var(--surface-subtle)', color: 'var(--text-secondary)' }}
    >
      {label ?? t('actions.onlyMine')}
    </button>
  )
}
