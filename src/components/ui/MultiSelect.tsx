import { useEffect, useMemo, useRef, useState, CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useSmartPosition } from '@/hooks/useSmartPosition'
import type { SearchableOption } from './SearchableSelect'

interface Props {
  values: string[]
  onChange: (ids: string[]) => void
  options: SearchableOption[]
  placeholder: string
  disabled?: boolean
  className?: string
  style?: CSSProperties
}

const DEFAULT_CLASS = 'flex items-center justify-between gap-2 w-full border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-2 text-[13px] text-left focus:border-[var(--oe-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--oe-primary)] disabled:bg-[var(--surface-subtle)] transition-colors'

function rowStyle(): CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
    padding: '6px 8px', fontSize: 12.5, borderRadius: 'var(--radius-sm)',
    border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-primary)',
  }
}

/** Multi-value picker, styled like SearchableSelect but selecting keeps the
 *  dropdown open (checkboxes, not radio-like single-pick) — used for filter
 *  fields where "show items matching any of these" makes sense. Never uses
 *  the browser's native `<select multiple>` (ugly, needs ctrl/cmd+click). */
export function MultiSelect({ values, onChange, options, placeholder, disabled, className = DEFAULT_CLASS, style }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [width, setWidth] = useState<number>()
  const { triggerRef, popoverRef, position } = useSmartPosition(open)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && triggerRef.current) setWidth(triggerRef.current.getBoundingClientRect().width)
    if (open) setTimeout(() => searchInputRef.current?.focus(), 0)
    if (!open) setQuery('')
  }, [open])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (target.closest('[data-oe-nested-popover]')) return
      if (
        popoverRef.current && !popoverRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q))
  }, [options, query])

  function toggle(id: string) {
    onChange(values.includes(id) ? values.filter((v) => v !== id) : [...values, id])
  }

  const selectedLabels = values.map((v) => options.find((o) => o.id === v)?.label).filter(Boolean) as string[]
  const summary = selectedLabels.length === 0 ? placeholder
    : selectedLabels.length === 1 ? selectedLabels[0]
    : `${selectedLabels.length} selecionados`

  return (
    <div ref={triggerRef as React.RefObject<HTMLDivElement>} style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={className}
        style={{
          borderRadius: 'var(--radius-md)', cursor: disabled ? 'default' : 'pointer',
          color: values.length > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)',
          ...style,
        }}
      >
        <span className="truncate">{summary}</span>
        <ChevronIcon />
      </button>
      {open && !disabled && createPortal(
        <div
          ref={popoverRef as React.RefObject<HTMLDivElement>}
          data-oe-nested-popover="multi-select"
          style={{
            position: 'fixed', ...position, width,
            zIndex: 2000, maxHeight: 280, display: 'flex', flexDirection: 'column',
            background: 'var(--surface-card)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
          }}
        >
          <div style={{ padding: 4, borderBottom: '1px solid var(--border-default)' }}>
            <input
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar..."
              style={{
                width: '100%', fontSize: 12.5, border: 'none', outline: 'none',
                padding: '6px 8px', background: 'transparent', color: 'var(--text-primary)',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', padding: 4 }}>
            {filtered.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '6px 8px' }}>Nada encontrado.</p>
            ) : (
              filtered.map((o) => {
                const checked = values.includes(o.id)
                return (
                  <label
                    key={o.id}
                    style={rowStyle()}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-subtle)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(o.id)}
                      className="rounded border-[var(--border-default)] accent-[var(--oe-primary)]"
                    />
                    <span style={{ flex: 1 }}>{o.label}</span>
                    {o.sublabel && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{o.sublabel}</span>}
                  </label>
                )
              })
            )}
          </div>
          {values.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              style={{
                padding: '6px 8px', fontSize: 11.5, color: 'var(--text-tertiary)', textDecoration: 'underline',
                background: 'none', border: 'none', borderTop: '1px solid var(--border-default)', cursor: 'pointer', textAlign: 'left',
              }}
            >
              Limpar seleção
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}

function ChevronIcon() {
  return (
    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: 'var(--text-tertiary)' }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  )
}
