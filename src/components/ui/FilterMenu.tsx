import { Children, isValidElement, ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSmartPosition } from '@/hooks/useSmartPosition'
import { Field, SelectChevron } from './Input'

export interface FilterToggleDef {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}

interface Props {
  /** Quantos filtros (fora os interruptores) estão ativos. */
  activeCount: number
  onClear?: () => void
  /** Opções do tipo liga/desliga (Meus, Incluir backlog…): ficam no topo do painel. */
  toggles?: FilterToggleDef[]
  /** Campos de filtro. Cada <Field label="…"> vira uma seção colapsável. */
  children?: ReactNode
}

/** Interruptor pequeno, mesmo visual em todo o sistema. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative shrink-0 transition-colors"
      style={{ width: 32, height: 18, borderRadius: 999, background: checked ? 'var(--text-primary)' : 'var(--border-strong)' }}
    >
      <span className="absolute top-0.5 transition-all" style={{ left: checked ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: checked ? 'var(--surface-page)' : 'var(--surface-card)' }} />
    </button>
  )
}

/** Seção que abre e fecha dentro do painel de filtros. */
export function FilterSection({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="w-full flex items-center justify-between px-2 py-2 text-[13px] font-medium rounded-[var(--radius-md)] hover:bg-[var(--surface-subtle)] transition-colors"
        style={{ color: 'var(--text-primary)' }}
      >
        {title}
        <span style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .12s' }}><SelectChevron /></span>
      </button>
      {open && <div className="px-2 pb-2 pt-1 space-y-2">{children}</div>}
    </div>
  )
}

/** Funil: um botão só (ícone) que abre os filtros num painel limpo, com seções colapsáveis. */
export function FilterMenu({ activeCount, onClear, toggles = [], children }: Props) {
  const [open, setOpen] = useState(false)
  const { triggerRef, popoverRef, position } = useSmartPosition(open)
  const total = activeCount + toggles.filter((t) => t.checked).length

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      const target = e.target as HTMLElement
      // Um campo dentro do painel (ex.: SearchableSelect) pode abrir a própria lista direto no body;
      // esse clique cai "fora" do painel pela estrutura do DOM, mas faz parte dele.
      if (target.closest('[data-oe-nested-popover]')) return
      if (
        popoverRef.current && !(popoverRef.current as HTMLElement).contains(target) &&
        triggerRef.current && !(triggerRef.current as HTMLElement).contains(target)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  // <Field label="X"> vira seção colapsável; a primeira começa aberta.
  let first = true
  const sections = Children.map(children, (child) => {
    if (isValidElement<{ label?: string; children?: ReactNode }>(child) && child.type === Field) {
      const el = <FilterSection key={child.props.label} title={child.props.label ?? ''} defaultOpen={first}>{child.props.children}</FilterSection>
      first = false
      return el
    }
    return child
  })

  function clearAll() {
    onClear?.()
    toggles.forEach((t) => { if (t.checked) t.onChange(false) })
    setOpen(false)
  }

  return (
    <>
      <button
        ref={triggerRef as any}
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center h-8 w-8 rounded-full transition-colors"
        style={{ background: total > 0 ? 'var(--text-primary)' : 'var(--surface-subtle)', color: total > 0 ? 'var(--surface-page)' : 'var(--text-secondary)' }}
        aria-label={total > 0 ? `Filtros (${total} ativos)` : 'Filtros'} title="Filtros" aria-expanded={open}
      >
        <FilterIcon />
        {total > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center text-[10px] font-semibold" style={{ minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: 'var(--oe-primary)', color: 'white' }}>{total}</span>
        )}
      </button>

      {open && createPortal(
        <div
          ref={popoverRef as any}
          className="w-80 p-2"
          style={{ position: 'fixed', ...position, zIndex: 1000, background: 'var(--surface-card)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', maxHeight: '70vh', overflowY: 'auto' }}
          role="dialog" aria-label="Filtros"
        >
          {toggles.length > 0 && (
            <div className="px-1 pb-1">
              {toggles.map((t) => (
                <div key={t.label} className="flex items-center justify-between gap-3 px-1 py-2 text-[13px]" style={{ color: 'var(--text-primary)' }}>
                  <span>{t.label}</span>
                  <Switch checked={t.checked} onChange={t.onChange} label={t.label} />
                </div>
              ))}
            </div>
          )}
          {sections}
          {total > 0 && (
            <div className="px-2 pt-2 pb-1">
              <button onClick={clearAll} className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>Limpar tudo</button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

function FilterIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16l-6 7.5V19l-4-2v-4.5L4 5z" />
    </svg>
  )
}
