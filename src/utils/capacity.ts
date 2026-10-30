import { addDays, format, parseISO, startOfWeek } from 'date-fns'

// Capacidade do time: quanto cada pessoa tem em andamento, semana a semana, contra um limite de tarefas simultâneas.
// Regras puras (sem rede nem tela) para a visão "Carga" e para os testes.

export type CapStatus = 'pending' | 'todo' | 'in_progress' | 'validation' | 'blocked' | 'done' | string

/** O mínimo que a análise precisa de cada tarefa. */
export interface CapTask {
  id: string
  type: 'task' | 'milestone' | 'meeting' | string
  status: CapStatus
  start?: string
  end?: string
  executorKey?: string
  executorName?: string
  /** Quem valida (só conta na fila de validação quando a tarefa está em Validação). */
  validatorKeys?: string[]
}

export type LoadLevel = 'none' | 'free' | 'ok' | 'high' | 'over'

export const DEFAULT_LIMIT = 8
export const WEEKS = 6

/** Contra o limite: 0 = nada; até 50% = folgado; até 75% = ok; até 100% = perto do limite; acima = estourado. */
export function loadLevel(count: number, limit: number): LoadLevel {
  if (count <= 0) return 'none'
  const r = count / Math.max(1, limit)
  if (r <= 0.5) return 'free'
  if (r <= 0.75) return 'ok'
  if (r <= 1) return 'high'
  return 'over'
}

export interface PersonCapacity {
  key: string
  name: string
  /** Tarefas ativas (não concluídas) com esta pessoa como executora. */
  active: number
  byStatus: Record<'pending' | 'todo' | 'in_progress' | 'validation' | 'blocked', number>
  overdue: number
  dueThisWeek: number
  noDate: number
  /** Tarefas em Validação que esta pessoa precisa validar. */
  toValidate: number
  /** Quantas tarefas com data estão em curso em cada semana (a primeira inclui as atrasadas, que seguem abertas). */
  weeks: number[]
  peak: number
  peakLevel: LoadLevel
  /** Limite de tarefas simultâneas desta pessoa (o padrão do time, ou o dela, se ajustado). */
  limit: number
  /** Semanas (índices) acima do limite. */
  overWeeks: number[]
}

export interface TeamCapacity {
  weekStarts: string[]
  people: PersonCapacity[]
  unassigned: { active: number; overdue: number }
  totals: { active: number; overdue: number; dueThisWeek: number; noDate: number; blocked: number; toValidate: number }
  /** Frases curtas sobre o que merece atenção. */
  insights: { tone: 'bad' | 'warn' | 'good'; text: string }[]
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

export function weekStartsFrom(today: string, weeks = WEEKS): string[] {
  const first = startOfWeek(parseISO(today), { weekStartsOn: 1 })
  return Array.from({ length: weeks }, (_, i) => iso(addDays(first, i * 7)))
}

/** Índices das semanas (0..weeks-1) em que a tarefa está em curso. Atrasada conta na semana atual; sem data, em nenhuma. */
export function weeksOf(t: Pick<CapTask, 'start' | 'end'>, today: string, weekStarts: string[]): number[] {
  const end = t.end ?? t.start
  if (!end) return []
  const effStart = t.start && t.start > today ? t.start : (end < today ? today : (t.start ?? today))
  const effEnd = end < today ? today : end
  const out: number[] = []
  weekStarts.forEach((ws, i) => {
    const we = iso(addDays(parseISO(ws), 6))
    if (effStart <= we && effEnd >= ws) out.push(i)
  })
  return out
}

export function buildCapacity(tasks: CapTask[], opts: { today: string; limit?: number; /** Limites por pessoa (chave = executorKey); quem não está aqui usa o padrão. */ limits?: Record<string, number>; weeks?: number }): TeamCapacity {
  const limit = opts.limit ?? DEFAULT_LIMIT
  const limitOf = (key: string) => { const v = opts.limits?.[key]; return v && v >= 1 ? v : limit }
  const weekStarts = weekStartsFrom(opts.today, opts.weeks ?? WEEKS)
  const weekEnd0 = iso(addDays(parseISO(weekStarts[0]), 6))
  const people = new Map<string, PersonCapacity>()
  const blank = (key: string, name: string): PersonCapacity => ({
    key, name, active: 0, byStatus: { pending: 0, todo: 0, in_progress: 0, validation: 0, blocked: 0 },
    overdue: 0, dueThisWeek: 0, noDate: 0, toValidate: 0, weeks: weekStarts.map(() => 0), peak: 0, peakLevel: 'none', limit: limitOf(key), overWeeks: [],
  })
  const validators = new Map<string, number>()
  const names = new Map<string, string>()
  const unassigned = { active: 0, overdue: 0 }
  const totals = { active: 0, overdue: 0, dueThisWeek: 0, noDate: 0, blocked: 0, toValidate: 0 }

  for (const t of tasks) {
    if (t.type !== 'task' || t.status === 'done') continue   // marcos e reuniões não são carga de trabalho
    const end = t.end
    const late = !!end && end < opts.today
    const thisWeek = !!end && end >= opts.today && end <= weekEnd0
    totals.active++
    if (late) totals.overdue++
    if (thisWeek) totals.dueThisWeek++
    if (!end) totals.noDate++
    if (t.status === 'blocked') totals.blocked++
    if (t.status === 'validation') {
      for (const v of t.validatorKeys ?? []) { validators.set(v, (validators.get(v) ?? 0) + 1); totals.toValidate++ }
    }
    if (!t.executorKey) { unassigned.active++; if (late) unassigned.overdue++; continue }
    names.set(t.executorKey, t.executorName ?? t.executorKey)
    let p = people.get(t.executorKey)
    if (!p) { p = blank(t.executorKey, t.executorName ?? t.executorKey); people.set(t.executorKey, p) }
    p.active++
    const st = (['pending', 'todo', 'in_progress', 'validation', 'blocked'] as const).find((s) => s === t.status) ?? 'pending'
    p.byStatus[st]++
    if (late) p.overdue++
    if (thisWeek) p.dueThisWeek++
    if (!end) p.noDate++
    for (const i of weeksOf(t, opts.today, weekStarts)) p.weeks[i]++
  }
  // quem só valida (sem tarefas como executor) também aparece
  for (const [key, n] of validators) {
    let p = people.get(key)
    if (!p) { p = blank(key, names.get(key) ?? key); people.set(key, p) }
    p.toValidate = n
  }
  const list = [...people.values()]
  for (const p of list) {
    p.peak = Math.max(0, ...p.weeks)
    p.peakLevel = loadLevel(p.peak, p.limit)
    p.overWeeks = p.weeks.flatMap((c, i) => (c > p.limit ? [i] : []))
  }
  // mais pressionados primeiro: estouro, depois pico, depois atrasadas, depois total
  list.sort((a, b) => b.overWeeks.length - a.overWeeks.length || b.peak - a.peak || b.overdue - a.overdue || b.active - a.active || a.name.localeCompare(b.name, 'pt-BR'))

  const insights: TeamCapacity['insights'] = []
  const over = list.filter((p) => p.overWeeks.length > 0)
  if (over.length) insights.push({ tone: 'bad', text: `${over.length} ${over.length === 1 ? 'pessoa passa' : 'pessoas passam'} do limite de tarefas simultâneas em alguma semana: ${over.slice(0, 3).map((p) => p.name.split(' ')[0]).join(', ')}${over.length > 3 ? '…' : ''}.` })
  const lateTotal = totals.overdue
  if (lateTotal > 0) insights.push({ tone: 'warn', text: `${lateTotal} ${lateTotal === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'} ainda ${lateTotal === 1 ? 'ocupa' : 'ocupam'} a capacidade da semana atual.` })
  if (unassigned.active > 0) insights.push({ tone: 'warn', text: `${unassigned.active} ${unassigned.active === 1 ? 'tarefa' : 'tarefas'} sem responsável do time (sem usuário, ou só contato ou texto) — a carga real é maior que a mostrada.` })
  const free = list.filter((p) => p.weeks.slice(0, 2).every((c) => c <= Math.floor(p.limit * 0.5)) && p.overWeeks.length === 0)
  if (free.length && list.length > 1) insights.push({ tone: 'good', text: `Com folga nas próximas 2 semanas: ${free.slice(0, 4).map((p) => p.name.split(' ')[0]).join(', ')}${free.length > 4 ? '…' : ''}.` })
  const idleDates = list.filter((p) => p.active > 0 && p.noDate === p.active)
  if (idleDates.length) insights.push({ tone: 'warn', text: `${idleDates.length === 1 ? idleDates[0].name.split(' ')[0] + ' não tem' : idleDates.length + ' pessoas não têm'} nenhuma tarefa com prazo: a carga por semana não aparece.` })

  return { weekStarts, people: list, unassigned, totals, insights }
}
