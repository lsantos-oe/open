import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useSyncExternalStore } from 'react'

// Acesso rápido: cada pessoa escolhe até 2 atalhos para a barra superior. Cada atalho já abre a tela com a vista e o
// filtro aplicados (?view=, ?mine=1, ?overdue=1, ?delayed=1). A escolha fica neste navegador.

export interface QuickPreset { id: string; label: string; short: string; path: string; icon: 'tasks' | 'people' | 'projects' | 'incidents' | 'wallet' | 'contacts' | 'retros' }

export const QUICK_PRESETS: QuickPreset[] = [
  { id: 'tasks-mine', label: 'Minhas tarefas', short: 'Minhas tarefas', path: '/tasks?view=kanban&mine=1', icon: 'tasks' },
  { id: 'tasks-overdue', label: 'Minhas tarefas atrasadas', short: 'Atrasadas', path: '/tasks?view=table&mine=1&overdue=1', icon: 'tasks' },
  { id: 'tasks-capacity', label: 'Carga do time', short: 'Carga', path: '/tasks?view=capacity', icon: 'people' },
  { id: 'projects-mine', label: 'Meus projetos', short: 'Meus projetos', path: '/portfolio?view=list&mine=1', icon: 'projects' },
  { id: 'projects-delayed', label: 'Projetos atrasados', short: 'Projetos atrasados', path: '/portfolio?view=list&delayed=1', icon: 'projects' },
  { id: 'incidents-mine', label: 'Meus incidentes', short: 'Meus incidentes', path: '/support?view=kanban&mine=1', icon: 'incidents' },
  { id: 'incidents-all', label: 'Incidentes (lista)', short: 'Incidentes', path: '/support?view=list', icon: 'incidents' },
  { id: 'wallet-mine', label: 'Meus clientes', short: 'Meus clientes', path: '/wallet?view=list&mine=1', icon: 'wallet' },
  { id: 'wallet-groups', label: 'Grupos de clientes', short: 'Grupos', path: '/wallet?tab=groups', icon: 'wallet' },
  { id: 'contacts', label: 'Contatos', short: 'Contatos', path: '/contacts', icon: 'contacts' },
  { id: 'retros', label: 'Retros', short: 'Retros', path: '/retros', icon: 'retros' },
]

const KEY = 'pb-quick-access'
const EVENT = 'oe-quick-access'
export const QUICK_SLOTS = 2

export function getQuickAccess(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return ['tasks-overdue', 'incidents-mine']   // padrão até a pessoa escolher
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((id) => QUICK_PRESETS.some((p) => p.id === id)).slice(0, QUICK_SLOTS) : []
  } catch { return [] }
}

export function setQuickAccess(ids: string[]) {
  try { localStorage.setItem(KEY, JSON.stringify(ids.filter(Boolean).slice(0, QUICK_SLOTS))) } catch { /* sem armazenamento */ }
  window.dispatchEvent(new Event(EVENT))
}

let snapshot = ''
function subscribe(cb: () => void) { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb) }
const getSnapshot = () => { const s = JSON.stringify(getQuickAccess()); if (s !== snapshot) snapshot = s; return snapshot }
export function useQuickAccess(): string[] {
  return JSON.parse(useSyncExternalStore(subscribe, getSnapshot, () => '[]')) as string[]
}

/** O atalho está aberto agora? (mesma tela e os mesmos parâmetros do atalho) */
export function presetActive(preset: QuickPreset, pathname: string, search: string): boolean {
  const [path, qs] = preset.path.split('?')
  if (pathname !== path) return false
  const want = new URLSearchParams(qs ?? '')
  const have = new URLSearchParams(search)
  for (const [k, v] of want) if (have.get(k) !== v) return false
  return true
}

/**
 * Aplica ?view=, ?mine=1, ?overdue=1, ?delayed=1 quando a pessoa chega por um atalho. Roda uma vez por chegada
 * (os filtros que ela mexer depois não são sobrescritos).
 */
export function useAppliedQuery(apply: (q: URLSearchParams) => void, { watchView = true }: { watchView?: boolean } = {}) {
  const { search, state } = useLocation()
  const q = new URLSearchParams(search)
  const sig = [watchView ? q.get('view') : '', q.get('mine'), q.get('overdue'), q.get('delayed')].join('|')
  const token = (state as { qa?: number } | null)?.qa
  useEffect(() => { apply(new URLSearchParams(search)) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [sig, token])
}
