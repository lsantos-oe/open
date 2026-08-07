import { useEffect, useMemo, useState, CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useSmartPosition } from '@/hooks/useSmartPosition'

export interface SearchableOption {
  id: string
  label: string
  sublabel?: string
}

interface Props {
  value: string
  onChange: (id: string) => void
  options: SearchableOption[]
  placeholder?: string
  /** Extra option rendered at the top (e.g. "Todos os clientes" / "— Nenhuma fase —"), selecting id="" */
  emptyOptionLabel?: string
  disabled?: boolean
  className?: string
  style?: CSSProperties
}

const DEFAULT_CLASS = 'block w-full border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:border-[var(--oe-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--oe-primary)] disabled:bg-[var(--surface-subtle)] transition-colors'

function optionStyle(active: boolean): CSSProperties {
  return {
    display: 'block', width: '100%', textAlign: 'left',
    padding: '6px 8px', fontSize: 12.5, borderRadius: 'var(--radius-sm)',
    border: 'none', cursor: 'pointer',
    background: active ? 'var(--surface-subtle)' : 'transparent',
    color: 'var(--text-primary)',
  }
}

export function SearchableSelect({ value, onChange, options, placeholder, emptyOptionLabel, disabled, className = DEFAULT_CLASS, style }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [width, setWidth] = useState<number>()
  const { triggerRef, popoverRef, position } = useSmartPosition(open)

  const selected = options.find((o) => o.id === value)

  useEffect(() => {
    if (open && triggerRef.current) setWidth(triggerRef.current.getBoundingClientRect().width)
    if (!open) setQuery('')
  }, [open])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q))
  }, [options, query])

  function select(id: string) {
    onChange(id)
    setOpen(false)
  }

  return (
    <div ref={triggerRef as React.RefObject<HTMLDivElement>} style={{ position: 'relative' }}>
      <input
        disabled={disabled}
        value={open ? query : (selected?.label ?? '')}
        onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? selected?.label ?? ''}
        className={className}
        style={{ borderRadius: 'var(--radius-md)', cursor: disabled ? 'default' : 'text', ...style }}
      />
      {open && !disabled && createPortal(
        <div
          ref={popoverRef as React.RefObject<HTMLDivElement>}
          data-oe-nested-popover="searchable-select"
          style={{
            position: 'fixed', ...position, width,
            zIndex: 2000, maxHeight: 240, overflowY: 'auto',
            background: 'var(--surface-card)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', padding: 4,
          }}
        >
          {emptyOptionLabel && (
            <button type="button" onClick={() => select('')} style={optionStyle(value === '')}>
              {emptyOptionLabel}
            </button>
          )}
          {filtered.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '6px 8px' }}>Nada encontrado.</p>
          ) : (
            filtered.map((o) => (
              <button key={o.id} type="button" onClick={() => select(o.id)} style={optionStyle(o.id === value)}>
                {o.label}
                {o.sublabel && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 6 }}>{o.sublabel}</span>}
              </button>
            ))
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
