import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'
import { useCommandPaletteStore } from '@/stores/useCommandPaletteStore'

interface Result {
  id: string
  type: 'Projeto' | 'Cliente' | 'Incidente' | 'Tarefa'
  label: string
  sublabel?: string
  path: string
}

export function CommandPalette() {
  const { projects, clients, incidents } = useAppStore()
  const navigate = useNavigate()
  const { open, setOpen, toggle } = useCommandPaletteStore()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toggle()
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggle, setOpen])

  useEffect(() => {
    if (open) {
      setQuery(''); setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const out: Result[] = []

    for (const p of projects) {
      if (p.name.toLowerCase().includes(q)) {
        out.push({ id: p.id, type: 'Projeto', label: p.name, sublabel: p.client, path: `/projects/${p.id}` })
      }
      for (const ph of p.phases) {
        for (const e of ph.entries) {
          if (!e.parentEntryId && e.name.toLowerCase().includes(q)) {
            out.push({ id: e.id, type: 'Tarefa', label: e.name, sublabel: p.name, path: `/projects/${p.id}` })
          }
        }
      }
    }
    for (const c of clients) {
      if (c.name.toLowerCase().includes(q)) {
        out.push({ id: c.id, type: 'Cliente', label: c.name, path: `/wallet/${c.id}` })
      }
    }
    for (const i of incidents) {
      if (i.title.toLowerCase().includes(q)) {
        out.push({ id: i.id, type: 'Incidente', label: i.title, path: `/support/${i.id}` })
      }
      for (const e of i.entries) {
        if (!e.parentEntryId && e.name.toLowerCase().includes(q)) {
          out.push({ id: e.id, type: 'Tarefa', label: e.name, sublabel: i.title, path: `/support/${i.id}` })
        }
      }
    }
    return out.slice(0, 20)
  }, [query, projects, clients, incidents])

  function activate(r: Result) {
    navigate(r.path)
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && results[activeIndex]) { activate(results[activeIndex]) }
  }

  if (!open) return null

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, display: 'flex', justifyContent: 'center', paddingTop: '12vh' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
    >
      <div
        style={{
          width: '100%', maxWidth: 560, maxHeight: '60vh', display: 'flex', flexDirection: 'column',
          background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', border: '0.5px solid var(--border-default)',
          boxShadow: 'var(--shadow-lg)', overflow: 'hidden', height: 'fit-content',
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveIndex(0) }}
          onKeyDown={handleKeyDown}
          placeholder="Buscar projetos, clientes, incidentes, tarefas..."
          className="w-full text-sm px-4 py-3 focus:outline-none"
          style={{ background: 'transparent', color: 'var(--text-primary)', borderBottom: '0.5px solid var(--border-default)' }}
        />
        <div className="overflow-y-auto">
          {query.trim() && results.length === 0 && (
            <p className="text-sm px-4 py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>Nada encontrado.</p>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.type}-${r.id}`}
              onClick={() => activate(r)}
              onMouseEnter={() => setActiveIndex(i)}
              className="w-full flex items-center justify-between text-left px-4 py-2.5 text-sm"
              style={{ background: i === activeIndex ? 'var(--surface-subtle)' : 'transparent', color: 'var(--text-primary)' }}
            >
              <span className="truncate">{r.label}{r.sublabel && <span style={{ color: 'var(--text-tertiary)' }}> · {r.sublabel}</span>}</span>
              <span
                className="shrink-0 ml-3 text-[10px] font-medium px-1.5 py-0.5 rounded-[var(--radius-pill)]"
                style={{ background: 'var(--oe-primary-light)', color: 'var(--oe-primary)' }}
              >
                {r.type}
              </span>
            </button>
          ))}
        </div>
        {!query.trim() && (
          <p className="text-xs px-4 py-3" style={{ color: 'var(--text-tertiary)' }}>
            Digite pra buscar · <kbd>⌘K</kbd> ou <kbd>Ctrl+K</kbd> pra abrir/fechar
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
