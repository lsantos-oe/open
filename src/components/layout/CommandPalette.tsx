import { entryClientIds } from '@/utils/entryClients'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'
import { useCommandPaletteStore } from '@/stores/useCommandPaletteStore'
import { useEntryOpenerStore } from '@/stores/useEntryOpenerStore'
import { useRetroStore } from '@/stores/useRetroStore'

type ResultType = 'Projeto' | 'Cliente' | 'Incidente' | 'Tarefa' | 'Marco' | 'Reunião' | 'Retro'

interface Result {
  id: string
  type: ResultType
  label: string
  sublabel?: string
  /** Página aberta ao escolher o item (projeto, cliente, incidente, retro). */
  path?: string
  /** Tarefas abrem o próprio modal da tarefa, por cima da tela atual. */
  entryId?: string
}

const TYPE_ORDER: Record<ResultType, number> = { Projeto: 0, Cliente: 1, Incidente: 2, Retro: 3, Tarefa: 4, Marco: 4, Reunião: 4 }
const ENTRY_TYPE_LABEL = { task: 'Tarefa', milestone: 'Marco', meeting: 'Reunião' } as const

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** 0 = começa com a busca, 1 = alguma palavra começa com ela, 2 = só contém. Sem acento nem caixa. */
function rank(label: string, q: string): number | null {
  const l = fold(label)
  const at = l.indexOf(q)
  if (at === -1) return null
  if (at === 0) return 0
  return l[at - 1] === ' ' ? 1 : 2
}

export function CommandPalette() {
  const { projects, clients, incidents, standaloneTasks } = useAppStore()
  const { retros, loaded: retrosLoaded, loadRetros } = useRetroStore()
  const navigate = useNavigate()
  const { open, setOpen, toggle } = useCommandPaletteStore()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

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
      if (!retrosLoaded) void loadRetros() // as retros só carregam sob demanda
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const results = useMemo<Result[]>(() => {
    const q = fold(query.trim())
    if (!q) return []
    const scored: { r: Result; score: number }[] = []
    const add = (r: Result, haystack: string = r.label) => {
      const score = rank(haystack, q)
      if (score !== null) scored.push({ r, score })
    }

    for (const p of projects) {
      if (p.archived) continue
      add({ id: p.id, type: 'Projeto', label: p.name, sublabel: p.client, path: `/projects/${p.id}` })
      for (const ph of p.phases) {
        for (const e of ph.entries) {
          const type = ENTRY_TYPE_LABEL[e.type]
          add({ id: e.id, type, label: e.name, sublabel: p.name, entryId: e.id })
          for (const sub of e.subtasks) add({ id: sub.id, type: ENTRY_TYPE_LABEL[sub.type], label: sub.name, sublabel: `${p.name} › ${e.name}`, entryId: sub.id })
        }
      }
    }
    for (const c of clients) {
      if (c.archived) continue
      add({ id: c.id, type: 'Cliente', label: c.name, path: `/wallet/${c.id}` })
    }
    for (const i of incidents) {
      add({ id: i.id, type: 'Incidente', label: i.title, path: `/support/${i.id}` })
      for (const e of i.entries) add({ id: e.id, type: ENTRY_TYPE_LABEL[e.type], label: e.name, sublabel: i.title, entryId: e.id })
    }
    for (const e of standaloneTasks) {
      const client = entryClientIds(e).map((id) => clients.find((c) => c.id === id)?.name).filter(Boolean).join(', ') || undefined
      add({ id: e.id, type: ENTRY_TYPE_LABEL[e.type], label: e.name, sublabel: client ?? 'Tarefa solta', entryId: e.id })
    }
    for (const r of retros) add({ id: r.id, type: 'Retro', label: r.title, path: `/retros/${r.id}` })

    return scored
      .sort((a, b) => a.score - b.score || TYPE_ORDER[a.r.type] - TYPE_ORDER[b.r.type] || a.r.label.localeCompare(b.r.label))
      .slice(0, 30)
      .map((x) => x.r)
  }, [query, projects, clients, incidents, standaloneTasks, retros])

  // Com a seta do teclado o item ativo pode sair da área visível: rola até ele.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function activate(r: Result) {
    setOpen(false)
    if (r.entryId) useEntryOpenerStore.getState().open(r.entryId)
    else if (r.path) navigate(r.path)
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
          placeholder="Buscar projetos, clientes, incidentes, tarefas, retros..."
          className="w-full text-sm px-4 py-3 focus:outline-none"
          style={{ background: 'transparent', color: 'var(--text-primary)', borderBottom: '0.5px solid var(--border-default)' }}
        />
        <div className="overflow-y-auto" ref={listRef}>
          {query.trim() && results.length === 0 && (
            <p className="text-sm px-4 py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>Nada encontrado.</p>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.type}-${r.id}`}
              data-index={i}
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
            Digite pra buscar · ↑↓ navega · Enter ou clique abre · <kbd>⌘K</kbd> ou <kbd>Ctrl+K</kbd> abre/fecha
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
