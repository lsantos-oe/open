import { entryClientIds } from '@/utils/entryClients'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import type {
  Client, ClientContact, Entry, EntryOwner, HistoryEntry, Incident, MeetingLog, OpenPoint, Project, Risk,
} from '@/types'
import type { DbProfile } from '@/types/database'
import { computeEntrySignals } from '@/utils/signals'
import { isProjectDelayed, projectDeadline, projectEndVariance, projectProgress } from '@/utils/projectStats'
import { markdownForExport } from '@/utils/docText'

// Modelo de leitura do assistente: transforma o que já está carregado no app (projetos, incidentes, clientes, tarefas…)
// em resumos compactos e CALCULADOS (sinais de atraso, progresso, carga por pessoa…) para o modelo raciocinar com
// números verdadeiros em vez de adivinhar. Puro e sem rede — as ferramentas só leem o store e chamam estas funções.
// Fora de propósito: retros (o sigilo dos cards é garantido pelo banco e não passa pelo assistente).

export interface ReadCtx {
  /** Hoje, AAAA-MM-DD (injetado para os testes serem determinísticos). */
  today: string
  holidays: string[]
  projects: Project[]
  incidents: Incident[]
  clients: Client[]
  contacts: ClientContact[]
  teamDirectory: DbProfile[]
  standaloneTasks: Entry[]
}

// ─── utilitários ────────────────────────────────────────────────────────────

/** Remove campos vazios (undefined, '', [], {}), mantendo 0 e false: respostas menores = menos tokens. */
export function prune<T>(value: T): T {
  if (Array.isArray(value)) return value.map(prune) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const p = prune(v)
      const empty = p === undefined || p === null || p === '' || (Array.isArray(p) && p.length === 0)
        || (typeof p === 'object' && !Array.isArray(p) && Object.keys(p as object).length === 0)
      if (!empty) out[k] = p
    }
    return out as T
  }
  return value
}

export function clip(text: string | undefined | null, max: number): string | undefined {
  if (!text) return undefined
  const t = markdownForExport(text).replace(/\n{3,}/g, '\n\n').trim()
  if (!t) return undefined
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** Lista limitada: avisa quando cortou, para o modelo saber que há mais e refinar o filtro. */
export function capList<T>(items: T[], max: number): { total: number; truncated?: true; items: T[] } {
  return items.length > max ? { total: items.length, truncated: true, items: items.slice(0, max) } : { total: items.length, items }
}

export const norm = (s: string | undefined | null) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export const includesNorm = (haystack: string | undefined | null, needle: string) => norm(haystack).includes(norm(needle))

const dayDiff = (a?: string, b?: string) => (a && b ? differenceInCalendarDays(parseISO(a), parseISO(b)) : undefined)

const nameOfProfile = (ctx: ReadCtx, id?: string) => {
  const p = id ? ctx.teamDirectory.find((x) => x.id === id) : undefined
  return p ? (p.name ?? p.email ?? undefined) : undefined
}

export function ownerName(ctx: ReadCtx, o: EntryOwner): string {
  return (o.type === 'member' ? nameOfProfile(ctx, o.memberId) : undefined) ?? o.name
}

/** Executores e validadores de uma tarefa. Linhas antigas sem `kind` tratam o primeiro responsável como executor. */
export function ownersOf(ctx: ReadCtx, e: Entry): { executors: string[]; validators: string[] } {
  const owners = e.owners ?? []
  if (owners.length === 0) return { executors: e.responsible ? [e.responsible] : [], validators: [] }
  const anyKind = owners.some((o) => o.kind)
  const executors = owners.filter((o, i) => (anyKind ? o.kind === 'executor' : i === 0)).map((o) => ownerName(ctx, o))
  const validators = owners.filter((o) => o.kind === 'validator').map((o) => ownerName(ctx, o))
  return { executors, validators }
}

export const clientNames = (ctx: ReadCtx, ids: string[]) =>
  ids.map((id) => ctx.clients.find((c) => c.id === id)?.name).filter((n): n is string => !!n)

// ─── tarefas ────────────────────────────────────────────────────────────────

export interface TaskRef {
  entry: Entry
  scope: 'project' | 'incident' | 'standalone'
  scopeId?: string
  scopeName?: string
  phaseName?: string
  /** Subtarefa: nome da tarefa-mãe. */
  parentName?: string
}

/** Todas as tarefas (e subtarefas) de um projeto, de um incidente ou soltas, com o contexto de onde vivem. */
export function projectTaskRefs(p: Project): TaskRef[] {
  const out: TaskRef[] = []
  for (const ph of p.phases) {
    for (const e of ph.entries) {
      out.push({ entry: e, scope: 'project', scopeId: p.id, scopeName: p.name, phaseName: ph.isUnassigned ? undefined : ph.name })
      for (const s of e.subtasks) out.push({ entry: s, scope: 'project', scopeId: p.id, scopeName: p.name, phaseName: ph.isUnassigned ? undefined : ph.name, parentName: e.name })
    }
  }
  return out
}

export function incidentTaskRefs(i: Incident): TaskRef[] {
  const out: TaskRef[] = []
  for (const e of i.entries) {
    out.push({ entry: e, scope: 'incident', scopeId: i.id, scopeName: i.title })
    for (const s of e.subtasks) out.push({ entry: s, scope: 'incident', scopeId: i.id, scopeName: i.title, parentName: e.name })
  }
  return out
}

export function allTaskRefs(ctx: ReadCtx): TaskRef[] {
  return [
    ...ctx.projects.filter((p) => !p.archived).flatMap(projectTaskRefs),
    ...ctx.incidents.flatMap(incidentTaskRefs),
    ...ctx.standaloneTasks.flatMap((e) => [
      { entry: e, scope: 'standalone' as const } as TaskRef,
      ...e.subtasks.map((s) => ({ entry: s, scope: 'standalone' as const, parentName: e.name }) as TaskRef),
    ]),
  ]
}

const endOf = (e: Entry) => (e.type === 'task' ? e.plannedEnd : e.plannedDate)

/** Uma tarefa em formato compacto, com os sinais calculados na hora (atrasada/parada/bloqueada). */
export function taskView(ctx: ReadCtx, ref: TaskRef, opts: { withContext?: boolean; withSubtasks?: boolean; descriptionMax?: number } = {}): Record<string, unknown> {
  const e = ref.entry
  const { executors, validators } = ownersOf(ctx, e)
  const end = endOf(e)
  const baselineEnd = e.type === 'task' ? e.baselineEnd : e.baselineDate
  const slip = dayDiff(end, baselineEnd)
  const signals = computeEntrySignals(e, ctx.today)
  const overdueDays = signals.includes('overdue') ? dayDiff(ctx.today, end) : undefined
  return prune({
    id: e.id,
    name: e.name,
    type: e.type,
    status: e.status,
    signals,
    executor: executors.join(', '),
    validator: validators.join(', '),
    start: e.type === 'task' ? e.plannedStart : e.plannedDate,
    end,
    overdueDays,
    durationDays: e.durationDays,
    durationHours: e.durationHours,
    baselineEnd,
    slipDaysVsBaseline: slip !== undefined && slip !== 0 ? slip : undefined,
    actualStart: e.actualStart,
    actualEnd: e.actualEnd,
    risk: e.riskFlag !== 'none' ? e.riskFlag : undefined,
    onCriticalPath: e.isCritical || undefined,
    dependsOn: e.dependsOn,
    hiddenFromPlan: e.hiddenFromPlan || undefined,
    comments: e.comments.length || undefined,
    lastActivity: (e.lastActivityAt ?? e.updatedAt)?.slice(0, 10),
    description: clip(e.description, opts.descriptionMax ?? 240),
    parentTask: ref.parentName,
    ...(opts.withContext ? { scope: ref.scope, scopeId: ref.scopeId, scopeName: ref.scopeName, phase: ref.phaseName } : {}),
    subtasks: opts.withSubtasks
      ? e.subtasks.map((s) => taskView(ctx, { ...ref, entry: s, parentName: e.name }, { ...opts, withSubtasks: false, withContext: false }))
      : undefined,
  })
}

export interface TaskFilter {
  status?: string[]
  ownerName?: string
  /** Só atrasadas, paradas ou bloqueadas. */
  onlyProblems?: boolean
  overdueOnly?: boolean
  riskFlag?: 'warning' | 'critical'
  type?: string
  endBefore?: string
  endAfter?: string
  text?: string
  includeDone?: boolean
}

export function filterTasks(ctx: ReadCtx, refs: TaskRef[], f: TaskFilter): TaskRef[] {
  return refs.filter(({ entry: e }) => {
    if (f.status?.length && !f.status.includes(e.status)) return false
    if (!f.status?.length && f.includeDone === false && e.status === 'done') return false
    if (f.type && e.type !== f.type) return false
    if (f.riskFlag && e.riskFlag !== f.riskFlag) return false
    if (f.ownerName) {
      const o = ownersOf(ctx, e)
      if (![...o.executors, ...o.validators].some((n) => includesNorm(n, f.ownerName!))) return false
    }
    const signals = computeEntrySignals(e, ctx.today)
    if (f.overdueOnly && !signals.includes('overdue')) return false
    if (f.onlyProblems && signals.length === 0) return false
    const end = endOf(e)
    if (f.endBefore && !(end && end <= f.endBefore)) return false
    if (f.endAfter && !(end && end >= f.endAfter)) return false
    if (f.text && !includesNorm(`${e.name} ${e.description ?? ''}`, f.text)) return false
    return true
  })
}

// ─── carga e contribuição por pessoa ────────────────────────────────────────

export interface WorkloadOptions {
  /** executor (padrão) ou validator. */
  role?: 'executor' | 'validator'
  /** Tipos considerados (padrão: só 'task'). */
  types?: string[]
  /** Restringe as tarefas CONCLUÍDAS às concluídas neste intervalo (AAAA-MM-DD). As abertas sempre entram. */
  from?: string
  to?: string
}

const completedOn = (e: Entry) => (e.actualEnd ?? endOf(e) ?? e.updatedAt?.slice(0, 10))

export function workload(ctx: ReadCtx, refs: TaskRef[], o: WorkloadOptions = {}) {
  const role = o.role ?? 'executor'
  const types = o.types ?? ['task']
  type Row = { name: string; tasks: number; done: number; inProgress: number; notStarted: number; blocked: number; overdue: number; stalled: number; plannedDays: number; doneDays: number }
  const rows = new Map<string, Row>()
  let unassigned = 0
  let considered = 0

  for (const { entry: e } of refs) {
    if (!types.includes(e.type)) continue
    if (e.status === 'done' && (o.from || o.to)) {
      const when = completedOn(e)
      if ((o.from && (!when || when < o.from)) || (o.to && (!when || when > o.to))) continue
    }
    considered++
    const names = role === 'executor' ? ownersOf(ctx, e).executors : ownersOf(ctx, e).validators
    if (names.length === 0) { unassigned++; continue }
    const signals = computeEntrySignals(e, ctx.today)
    for (const name of names) {
      const key = norm(name)
      const r = rows.get(key) ?? { name, tasks: 0, done: 0, inProgress: 0, notStarted: 0, blocked: 0, overdue: 0, stalled: 0, plannedDays: 0, doneDays: 0 }
      r.tasks++
      r.plannedDays += e.durationDays ?? 0
      if (e.status === 'done') { r.done++; r.doneDays += e.durationDays ?? 0 }
      else if (e.status === 'in_progress' || e.status === 'validation') r.inProgress++
      else if (e.status === 'blocked') r.blocked++
      else r.notStarted++
      if (signals.includes('overdue')) r.overdue++
      if (signals.includes('stalled')) r.stalled++
      rows.set(key, r)
    }
  }

  const list = [...rows.values()]
  const totalDone = list.reduce((s, r) => s + r.done, 0)
  const totalDoneDays = list.reduce((s, r) => s + r.doneDays, 0)
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : undefined)
  return {
    role,
    tasksConsidered: considered,
    unassignedTasks: unassigned,
    note: 'Uma tarefa com mais de um responsável conta inteira para cada um. "doneDays" soma a duração planejada (dias úteis) das tarefas concluídas — é a melhor aproximação de esforço entregue; sem duração, a tarefa pesa 0 dias (veja também a contagem).',
    people: list
      .sort((a, b) => b.doneDays - a.doneDays || b.done - a.done || b.tasks - a.tasks)
      .map((r) => prune({
        ...r,
        shareOfDoneTasksPct: pct(r.done, totalDone),
        shareOfDoneDaysPct: pct(r.doneDays, totalDoneDays),
      })),
  }
}

// ─── projetos ───────────────────────────────────────────────────────────────

const OPEN_RISK = (r: Risk) => !['resolved', 'mitigated', 'closed', 'Mitigado', 'Fechado', 'Aceito'].includes(r.status)

export function projectRow(ctx: ReadCtx, p: Project) {
  const refs = projectTaskRefs(p)
  const signals = refs.map((r) => computeEntrySignals(r.entry, ctx.today))
  const progress = projectProgress(p)
  const deadline = projectDeadline(p)
  const variance = projectEndVariance(p, ctx.holidays)
  const openRisks = p.risks.filter(OPEN_RISK)
  const delayDays = p.delayLog.reduce((s, d) => s + Math.max(0, d.days), 0)
  const lastActivity = refs.map((r) => r.entry.lastActivityAt ?? r.entry.updatedAt).filter((x): x is string => !!x).sort().at(-1)
  return prune({
    id: p.id,
    name: p.name,
    status: p.status,
    type: p.type,
    clients: clientNames(ctx, p.clientIds),
    pm: p.pm,
    devLead: p.devLead,
    delayed: isProjectDelayed(p, ctx.holidays),
    varianceDaysVsBaseline: variance,
    progress: progress ? { done: progress.done, total: progress.total, pct: progress.pct } : undefined,
    overdueTasks: signals.filter((s) => s.includes('overdue')).length,
    blockedTasks: signals.filter((s) => s.includes('blocked')).length,
    stalledTasks: signals.filter((s) => s.includes('stalled')).length,
    openRisks: openRisks.length,
    highRisks: openRisks.filter((r) => r.score >= 6).length,
    openPoints: (p.openPoints ?? []).filter((o) => o.status === 'open').length,
    accumulatedDelayDays: delayDays || undefined,
    deadline: deadline ? { date: deadline.date, isGoLive: deadline.isGoLive, daysFromToday: dayDiff(deadline.date, ctx.today) } : undefined,
    lastActivity: lastActivity?.slice(0, 10),
  })
}

const riskView = (ctx: ReadCtx, p: Project, r: Risk) => prune({
  id: r.id,
  description: clip(r.description, 240),
  probability: r.probability,
  impact: r.impact,
  score: r.score,
  status: r.status,
  owner: r.owner,
  dueDate: r.dueDate,
  overdue: r.dueDate && r.dueDate < ctx.today && OPEN_RISK(r) ? true : undefined,
  linkedTasks: r.linkedEntryIds.length || undefined,
  actionTasks: r.actionTasks.length ? { done: r.actionTasks.filter((a) => a.done).length, total: r.actionTasks.length } : undefined,
  projectId: p.id,
})

const openPointView = (ctx: ReadCtx, o: OpenPoint, scope?: { type: string; id: string; name: string }) => prune({
  id: o.id,
  title: o.title,
  status: o.status,
  priority: o.priority,
  owner: o.responsible,
  dueDate: o.dueDate,
  overdue: o.dueDate && o.status === 'open' && o.dueDate < ctx.today ? true : undefined,
  ageDays: dayDiff(ctx.today, o.createdAt?.slice(0, 10)),
  description: clip(o.description, 240),
  resolution: clip(o.resolution, 240),
  comments: o.comments.length || undefined,
  ...(scope ? { scope: scope.type, scopeId: scope.id, scopeName: scope.name } : {}),
})

const meetingView = (m: MeetingLog) => prune({
  id: m.id,
  title: m.title,
  date: m.date,
  participants: m.participants.map((x) => x.name),
  notes: clip(m.notes, 500),
  items: m.items.map((i) => ({ type: i.type, text: i.text, done: i.done, responsible: i.responsible, dueDate: i.dueDate })),
})

const historyView = (h: HistoryEntry) => prune({
  date: h.createdAt.slice(0, 10), event: h.event, title: h.title, detail: clip(h.detail, 240), manualNote: h.isManualNote || undefined,
})

export type ProjectSection = 'summary' | 'team' | 'charter' | 'phases' | 'risks' | 'delays' | 'open_points' | 'meetings' | 'history' | 'links'
export const DEFAULT_PROJECT_SECTIONS: ProjectSection[] = ['summary', 'team', 'phases', 'risks', 'delays', 'open_points']

export function projectDetails(ctx: ReadCtx, p: Project, sections: ProjectSection[] = DEFAULT_PROJECT_SECTIONS) {
  const want = new Set<ProjectSection>(['summary', ...sections])
  const out: Record<string, unknown> = {}
  if (want.has('summary')) out.summary = { ...projectRow(ctx, p), language: p.language, baselineSetAt: p.baselineSetAt?.slice(0, 10), overview: clip(p.overview, 1200), proposalLink: p.proposalLink, dealLink: p.dealLink }
  if (want.has('team')) out.team = prune({ pm: p.pm, devLead: p.devLead, members: p.team.map((m) => ({ name: m.name, role: m.role })) })
  if (want.has('charter')) {
    const c = p.charter
    out.charter = prune({
      sponsor: c?.sponsor, budget: c?.budget,
      document: clip(p.charterDoc, 3500),
      // Projetos antigos ainda sem documento: os campos separados.
      legacy: p.charterDoc ? undefined : c && { objectives: clip(c.objectives, 600), scope: clip(c.scope, 600), outOfScope: clip(c.outOfScope, 400), successCriteria: clip(c.successCriteria, 400), constraints: clip(c.constraints, 400), assumptions: clip(c.assumptions, 400) },
    })
  }
  if (want.has('phases')) {
    const prog = (es: Entry[]) => {
      const flat = es.flatMap((e) => [e, ...e.subtasks])
      return { total: flat.length, done: flat.filter((e) => e.status === 'done').length, overdue: flat.filter((e) => computeEntrySignals(e, ctx.today).includes('overdue')).length }
    }
    out.phases = p.phases.filter((ph) => !ph.isUnassigned).sort((a, b) => a.order - b.order).map((ph) => ({ id: ph.id, name: ph.name, ...prog(ph.entries) }))
  }
  if (want.has('risks')) out.risks = capList(p.risks.map((r) => riskView(ctx, p, r)), 40)
  if (want.has('delays')) {
    const byResp: Record<string, number> = {}
    const byType: Record<string, number> = {}
    for (const d of p.delayLog) {
      if (d.days <= 0) continue
      byResp[d.responsibility] = (byResp[d.responsibility] ?? 0) + d.days
      byType[d.type] = (byType[d.type] ?? 0) + d.days
    }
    out.delays = {
      totalDaysOfDelay: Object.values(byResp).reduce((s, n) => s + n, 0),
      byResponsibility: byResp,
      byType,
      recent: [...p.delayLog].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15).map((d) => prune({
        date: d.date, task: d.entryName, days: d.days, responsibility: d.responsibility, type: d.type, description: clip(d.description, 200), comments: clip(d.comments, 160), automatic: d.triggeredBy === 'cascade' || undefined,
      })),
    }
  }
  if (want.has('open_points')) out.openPoints = capList((p.openPoints ?? []).sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1)).map((o) => openPointView(ctx, o)), 40)
  if (want.has('meetings')) out.meetings = capList([...(p.meetings ?? [])].sort((a, b) => b.date.localeCompare(a.date)).map(meetingView), 12)
  if (want.has('history')) out.history = capList([...(p.history ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(historyView), 25)
  if (want.has('links')) out.links = p.links.map((l) => ({ label: l.label, url: l.url }))
  return prune(out)
}

export function portfolio(ctx: ReadCtx, f: { pmName?: string; clientName?: string; status?: string; onlyAtRisk?: boolean; sortBy?: 'attention' | 'name' | 'deadline' }) {
  let list = ctx.projects.filter((p) => !p.archived && !p.hidden)
  if (f.pmName) list = list.filter((p) => includesNorm(p.pm, f.pmName!) || includesNorm(p.devLead, f.pmName!))
  if (f.clientName) list = list.filter((p) => clientNames(ctx, p.clientIds).some((n) => includesNorm(n, f.clientName!)))
  if (f.status) list = list.filter((p) => p.status === f.status)
  const rows = list.map((p) => projectRow(ctx, p) as Record<string, any>)
  // "Atenção" = soma ponderada de sinais ruins: é só uma ordenação, o modelo deve olhar os números.
  const attention = (r: Record<string, any>) =>
    (r.delayed ? 5 : 0) + (r.overdueTasks ?? 0) * 2 + (r.blockedTasks ?? 0) * 2 + (r.highRisks ?? 0) * 3 + (r.stalledTasks ?? 0) + Math.max(0, r.varianceDaysVsBaseline ?? 0) * 0.5
  const atRisk = (r: Record<string, any>) => r.status !== 'done' && attention(r) > 0
  const filtered = f.onlyAtRisk ? rows.filter(atRisk) : rows
  const sorted = [...filtered].sort(
    f.sortBy === 'name' ? (a, b) => a.name.localeCompare(b.name)
      : f.sortBy === 'deadline' ? (a, b) => (a.deadline?.date ?? '9999').localeCompare(b.deadline?.date ?? '9999')
        : (a, b) => attention(b) - attention(a),
  )
  return {
    today: ctx.today,
    counts: {
      projects: rows.length,
      delayed: rows.filter((r) => r.delayed).length,
      withOverdueTasks: rows.filter((r) => (r.overdueTasks ?? 0) > 0).length,
      byStatus: rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {}),
    },
    projects: capList(sorted, 80),
  }
}

// ─── incidentes ─────────────────────────────────────────────────────────────

export function incidentRow(ctx: ReadCtx, i: Incident) {
  const open = i.status !== 'resolved' && i.status !== 'closed'
  return prune({
    id: i.id,
    title: i.title,
    status: i.status,
    priority: i.priority,
    impact: i.impact,
    owner: i.owner ? ownerName(ctx, i.owner) : undefined,
    clients: clientNames(ctx, i.clientIds),
    projects: i.projectIds.map((id) => ctx.projects.find((p) => p.id === id)?.name).filter(Boolean),
    deadline: i.deadline,
    overdue: open && i.deadline && i.deadline < ctx.today ? true : undefined,
    ageDays: dayDiff(ctx.today, i.createdAt.slice(0, 10)),
    daysInStatus: dayDiff(ctx.today, i.statusChangedAt.slice(0, 10)),
    resolutionDays: i.resolvedAt ? dayDiff(i.resolvedAt.slice(0, 10), i.createdAt.slice(0, 10)) : undefined,
    openTasks: i.entries.filter((e) => e.status !== 'done').length || undefined,
    openPoints: i.openPoints.filter((o) => o.status === 'open').length || undefined,
  })
}

export function incidentDetails(ctx: ReadCtx, i: Incident) {
  return prune({
    ...incidentRow(ctx, i),
    createdAt: i.createdAt.slice(0, 10),
    description: clip(i.description, 2500),
    stakeholders: i.stakeholders.map((s) => ({ name: ownerName(ctx, s), role: s.role })),
    tasks: capList(incidentTaskRefs(i).filter((r) => !r.parentName).map((r) => taskView(ctx, r, { withSubtasks: true })), 40),
    openPoints: capList(i.openPoints.map((o) => openPointView(ctx, o)), 30),
    history: capList([...i.history].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(historyView), 20),
  })
}

// ─── clientes ───────────────────────────────────────────────────────────────

export function clientRow(ctx: ReadCtx, c: Client) {
  const projs = ctx.projects.filter((p) => !p.archived && p.clientIds.includes(c.id))
  const incs = ctx.incidents.filter((i) => i.clientIds.includes(c.id))
  return prune({
    id: c.id,
    name: c.name,
    status: c.status,
    country: c.country,
    owners: (c.owners ?? []).map((o) => ownerName(ctx, o)),
    projects: projs.length,
    activeProjects: projs.filter((p) => p.status !== 'done').length,
    openIncidents: incs.filter((i) => i.status !== 'resolved' && i.status !== 'closed').length,
  })
}

export function clientDetails(ctx: ReadCtx, c: Client) {
  const projs = ctx.projects.filter((p) => !p.archived && p.clientIds.includes(c.id))
  const incs = ctx.incidents.filter((i) => i.clientIds.includes(c.id))
  return prune({
    ...clientRow(ctx, c),
    ploomesLink: c.ploomesLink,
    createdAt: c.createdAt?.slice(0, 10),
    notes: clip(c.notes, 2500),
    csHistory: (c.csHistory ?? []).map((h) => ({ owner: ownerName(ctx, h.owner), since: h.assignedAt.slice(0, 10), note: clip(h.note, 160) })),
    contacts: ctx.contacts.filter((k) => k.clientIds.includes(c.id)).map((k) => ({ name: k.name, role: k.role, email: k.email, phone: k.phone })),
    projectList: projs.map((p) => projectRow(ctx, p)),
    incidentList: capList(incs.map((i) => incidentRow(ctx, i)), 30),
    standaloneTasks: ctx.standaloneTasks.filter((e) => entryClientIds(e).includes(c.id)).map((e) => taskView(ctx, { entry: e, scope: 'standalone' })),
  })
}

// ─── pontos em aberto (todos os escopos) ────────────────────────────────────

export function allOpenPoints(ctx: ReadCtx, f: { status?: 'open' | 'resolved' | 'all'; ownerName?: string; projectName?: string; overdueOnly?: boolean }) {
  const status = f.status ?? 'open'
  const rows: ReturnType<typeof openPointView>[] = []
  const push = (o: OpenPoint, scope: { type: string; id: string; name: string }) => {
    if (status !== 'all' && o.status !== status) return
    if (f.ownerName && !includesNorm(o.responsible, f.ownerName)) return
    if (f.overdueOnly && !(o.status === 'open' && o.dueDate && o.dueDate < ctx.today)) return
    rows.push(openPointView(ctx, o, scope))
  }
  for (const p of ctx.projects.filter((x) => !x.archived)) {
    if (f.projectName && !includesNorm(p.name, f.projectName)) continue
    for (const o of p.openPoints ?? []) push(o, { type: 'project', id: p.id, name: p.name })
  }
  if (!f.projectName) for (const i of ctx.incidents) for (const o of i.openPoints) push(o, { type: 'incident', id: i.id, name: i.title })
  return capList(rows, 80)
}

// ─── busca em todo o texto ──────────────────────────────────────────────────

export interface SearchHit { kind: string; id: string; title: string; where?: string; field: string; snippet: string; scopeId?: string }

/** Busca todas as palavras (sem acento, sem diferenciar caixa) em qualquer campo de texto do Open. */
export function searchKnowledge(ctx: ReadCtx, query: string, limit = 25): { total: number; hits: SearchHit[] } {
  const terms = norm(query).split(/\s+/).filter((t) => t.length > 1)
  if (terms.length === 0) return { total: 0, hits: [] }
  const hits: SearchHit[] = []

  const consider = (hit: Omit<SearchHit, 'snippet'>, text: string | undefined | null) => {
    if (!text) return
    const plain = markdownForExport(text).replace(/\s+/g, ' ')
    const n = norm(plain)
    if (!terms.every((t) => n.includes(t))) return
    const at = Math.max(0, n.indexOf(terms[0]) - 90)
    hits.push({ ...hit, snippet: `${at > 0 ? '…' : ''}${plain.slice(at, at + 260)}${at + 260 < plain.length ? '…' : ''}` })
  }
  const entryHits = (refs: TaskRef[], where: string) => {
    for (const { entry: e, scopeId } of refs) {
      consider({ kind: 'task', id: e.id, title: e.name, where, field: 'name/descrição', scopeId }, `${e.name}. ${e.description ?? ''}`)
      for (const c of e.comments) consider({ kind: 'task_comment', id: e.id, title: e.name, where, field: `comentário de ${c.author}`, scopeId }, c.text)
    }
  }

  for (const p of ctx.projects.filter((x) => !x.archived)) {
    const w = `projeto ${p.name}`
    consider({ kind: 'project', id: p.id, title: p.name, field: 'anotações', scopeId: p.id }, p.overview)
    consider({ kind: 'project', id: p.id, title: p.name, field: 'charter', scopeId: p.id }, p.charterDoc ?? Object.values(p.charter ?? {}).join('\n'))
    entryHits(projectTaskRefs(p), w)
    for (const r of p.risks) consider({ kind: 'risk', id: r.id, title: clip(r.description, 60) ?? 'risco', where: w, field: 'descrição', scopeId: p.id }, r.description)
    for (const d of p.delayLog) consider({ kind: 'delay', id: d.id, title: d.entryName, where: w, field: 'atraso', scopeId: p.id }, `${d.description} ${d.comments}`)
    for (const o of p.openPoints ?? []) {
      consider({ kind: 'open_point', id: o.id, title: o.title, where: w, field: 'descrição', scopeId: p.id }, `${o.title}. ${o.description ?? ''}`)
      consider({ kind: 'open_point', id: o.id, title: o.title, where: w, field: 'resolução', scopeId: p.id }, o.resolution)
      for (const c of o.comments) consider({ kind: 'open_point', id: o.id, title: o.title, where: w, field: `comentário de ${c.author}`, scopeId: p.id }, c.text)
    }
    for (const m of p.meetings ?? []) {
      consider({ kind: 'meeting', id: m.id, title: `${m.title} (${m.date})`, where: w, field: 'notas', scopeId: p.id }, m.notes)
      for (const it of m.items) consider({ kind: 'meeting', id: m.id, title: `${m.title} (${m.date})`, where: w, field: `item (${it.type})`, scopeId: p.id }, it.text)
    }
    for (const h of p.history ?? []) consider({ kind: 'history', id: h.id, title: h.title, where: w, field: 'detalhe', scopeId: p.id }, `${h.title}. ${h.detail ?? ''}`)
  }
  for (const i of ctx.incidents) {
    const w = `incidente ${i.title}`
    consider({ kind: 'incident', id: i.id, title: i.title, field: 'título/descrição', scopeId: i.id }, `${i.title}. ${i.description ?? ''}`)
    entryHits(incidentTaskRefs(i), w)
    for (const o of i.openPoints) consider({ kind: 'open_point', id: o.id, title: o.title, where: w, field: 'descrição', scopeId: i.id }, `${o.title}. ${o.description ?? ''} ${o.resolution ?? ''}`)
    for (const h of i.history) consider({ kind: 'history', id: h.id, title: h.title, where: w, field: 'detalhe', scopeId: i.id }, `${h.title}. ${h.detail ?? ''}`)
  }
  for (const c of ctx.clients) consider({ kind: 'client', id: c.id, title: c.name, field: 'notas', scopeId: c.id }, c.notes)
  entryHits(ctx.standaloneTasks.flatMap((e) => [{ entry: e, scope: 'standalone' as const } as TaskRef]), 'tarefa solta')

  return { total: hits.length, hits: hits.slice(0, limit) }
}
