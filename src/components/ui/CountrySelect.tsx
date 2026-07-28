import { useState, useRef, useEffect, useMemo } from 'react'
import { COUNTRIES, CONTINENTS, findCountry } from '@/data/countries'

interface Props {
  value?: string
  onChange: (code: string | undefined) => void
}

export default function CountrySelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 0) }
  }, [open])

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(q)) : COUNTRIES
    return CONTINENTS
      .map((continent) => ({ continent, countries: filtered.filter((c) => c.continent === continent) }))
      .filter((g) => g.countries.length > 0)
  }, [query])

  const selected = findCountry(value)

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between rounded-[var(--radius-md)] border px-3 py-2 text-sm text-left"
        style={{ borderColor: 'var(--border-default)', background: 'var(--surface-input)', color: selected ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
      >
        {selected ? selected.name : 'Selecione o país...'}
        <span style={{ color: 'var(--text-tertiary)' }}>▾</span>
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 z-50 rounded-[var(--radius-lg)] shadow-lg mt-1"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-default)', maxHeight: 320, display: 'flex', flexDirection: 'column' }}
        >
          <div className="p-2 border-b" style={{ borderColor: 'var(--border-default)' }}>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar país..."
              className="w-full text-sm focus:outline-none"
              style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '5px 8px', background: 'var(--surface-input)', color: 'var(--text-primary)' }}
            />
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
            {grouped.length === 0 && (
              <p className="text-xs py-3 px-3" style={{ color: 'var(--text-tertiary)' }}>Nenhum país encontrado.</p>
            )}
            {grouped.map((g) => (
              <div key={g.continent}>
                <p
                  className="text-[10px] font-semibold uppercase tracking-wide px-3 pt-2 pb-1"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {g.continent}
                </p>
                {g.countries.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => { onChange(c.code); setOpen(false) }}
                    className="w-full text-left px-3 py-1.5 text-sm transition-colors"
                    style={{ color: c.code === value ? 'var(--oe-primary)' : 'var(--text-secondary)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-subtle)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    {c.name} {c.code === value && '✓'}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
