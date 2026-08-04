import { ReactNode } from 'react'

interface Props {
  count: number
  onClear: () => void
  children: ReactNode
}

/** Floating bottom action bar shown when a table/kanban has a non-empty
 *  selection. Background is a fixed dark tone (like the sidebar) rather than
 *  the `--text-primary` token — that token flips to near-white in dark mode,
 *  which made the white label/icons on top of it disappear. */
export function SelectionBar({ count, onClear, children }: Props) {
  if (count === 0) return null
  return (
    <div
      className="fixed bottom-4 left-1/2 z-50 flex items-center gap-2.5 px-3.5 py-2 rounded-[var(--radius-lg)] shadow-lg text-[13px]"
      style={{ transform: 'translateX(-50%)', background: '#18140F', color: 'rgba(255,255,255,0.92)', maxWidth: 'calc(100vw - 32px)' }}
    >
      <span className="font-medium whitespace-nowrap">{count} selecionado{count !== 1 ? 's' : ''}</span>
      <div className="h-4 w-px shrink-0" style={{ background: 'rgba(255,255,255,0.16)' }} />
      <div className="flex items-center gap-1.5 flex-wrap">{children}</div>
      <button
        onClick={onClear}
        className="text-xs opacity-60 hover:opacity-100 transition-opacity ml-1 shrink-0"
      >
        ✕ limpar
      </button>
    </div>
  )
}
