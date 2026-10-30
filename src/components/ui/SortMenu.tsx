import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSmartPosition } from '@/hooks/useSmartPosition'

export interface SortGroup {
  label: string
  value: string
  /** Valor que significa "sem ordenar/agrupar" (não conta como ativo). */
  neutral?: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}

/** Seta de ordenação: um botão só (ícone) com as opções de ordenar e agrupar num painel limpo. */
export function SortMenu({ groups, title = 'Ordenar' }: { groups: SortGroup[]; title?: string }) {
  const [open, setOpen] = useState(false)
  const { triggerRef, popoverRef, position } = useSmartPosition(open)
  const active = groups.some((g) => g.neutral !== undefined && g.value !== g.neutral)

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (popoverRef.current && !(popoverRef.current as HTMLElement).contains(t) && triggerRef.current && !(triggerRef.current as HTMLElement).contains(t)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef as any}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center h-8 w-8 rounded-full transition-colors"
        style={{ background: active ? 'var(--text-primary)' : 'var(--surface-subtle)', color: active ? 'var(--surface-page)' : 'var(--text-secondary)' }}
        aria-label={title} title={title} aria-expanded={open}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 4v16M8 20l-3-3M8 20l3-3M16 20V4M16 4l-3 3M16 4l3 3" />
        </svg>
      </button>
      {open && createPortal(
        <div
          ref={popoverRef as any}
          className="w-72 p-2"
          style={{ position: 'fixed', ...position, zIndex: 1000, background: 'var(--surface-card)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)' }}
          role="dialog" aria-label={title}
        >
          {groups.map((g, i) => (
            <div key={g.label} className={i > 0 ? 'mt-2 pt-2' : ''} style={i > 0 ? { borderTop: '1px solid var(--border-soft)' } : undefined}>
              <p className="px-2 py-1 text-[11.5px] font-medium" style={{ color: 'var(--text-tertiary)' }}>{g.label}</p>
              {g.options.map((o) => (
                <button
                  key={o.value}
                  onClick={() => { g.onChange(o.value); setOpen(false) }}
                  role="menuitemradio" aria-checked={g.value === o.value}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-[13px] text-left rounded-[var(--radius-md)] hover:bg-[var(--surface-subtle)] transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {o.label}
                  {g.value === o.value && <span aria-hidden="true" style={{ fontSize: 13 }}>✓</span>}
                </button>
              ))}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
