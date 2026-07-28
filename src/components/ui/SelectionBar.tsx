import { ReactNode } from 'react'

interface Props {
  count: number
  onClear: () => void
  children: ReactNode
}

/** Floating bottom action bar shown when a table/kanban has a non-empty selection. */
export function SelectionBar({ count, onClear, children }: Props) {
  if (count === 0) return null
  return (
    <div
      className="fixed bottom-4 left-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-lg"
      style={{ transform: 'translateX(-50%)', background: 'var(--text-primary)', color: 'white' }}
    >
      <span className="text-sm font-medium whitespace-nowrap">{count} selecionado{count !== 1 ? 's' : ''}</span>
      <div className="h-4 w-px" style={{ background: 'rgba(255,255,255,0.2)' }} />
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
      <button
        onClick={onClear}
        className="text-xs opacity-70 hover:opacity-100 transition-opacity ml-1"
      >
        ✕ limpar
      </button>
    </div>
  )
}
