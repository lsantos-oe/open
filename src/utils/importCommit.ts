import type {
  AppLanguage, Client, ClientStatus, Entry, EntryOwner, EntryStatus, Incident, IncidentStatus, Probability, Project, ProjectStatus, RiskFlag, TeamMember,
} from '@/types'
import type { StagingClientRow, StagingIncidentRow, StagingProjectRow, StagingTaskRow } from './importStaging'
import { fold } from './importStaging'
import { resolveOwnerByName } from '@/ai/tools/helpers'

// Grava no Open as linhas aprovadas na tela de revisão. A ordem importa: clientes → projetos → incidentes → tarefas,
// porque cada etapa pode referenciar itens criados na anterior (pelo NOME, dentro do mesmo arquivo). As ações do
// store entram por injeção (`ImportDeps`) para esta lógica ser testável sem o app.

export type RowAction = 'create' | 'update' | 'skip'
export type TaskScope = 'projeto' | 'incidente' | 'solta'

export interface ClientRowState {
  row: StagingClientRow
  include: boolean
  action: RowAction
  matchClientId?: string
  name: string
  status: ClientStatus
}

export interface ProjectRowState {
  row: StagingProjectRow
  include: boolean
  action: RowAction
  /** id de um cliente existente, `batch:<nome>` (cliente criado neste arquivo), `new:<nome>` (criar agora) ou '' (sem cliente). */
  clientId: string
  matchProjectId?: string
  /** Nome do projeto parecido (mas não igual) encontrado: a ação padrão é Criar, e o usuário pode trocar para Atualizar. */
  similarTo?: string
  name: string
  status: ProjectStatus
}

export interface IncidentRowState {
  row: StagingIncidentRow
  include: boolean
  action: RowAction
  clientId: string
  matchIncidentId?: string
  similarTo?: string
  title: string
  status: IncidentStatus
  priority: Probability
  impact: Probability
}

export interface TaskRowState {
  row: StagingTaskRow
  include: boolean
  scope: TaskScope
  /** `existing:<id>` ou `batch:<nome dobrado>` (projeto/incidente criado neste arquivo). */
  targetKey?: string
  clientId: string
  name: string
  status: EntryStatus
  riskFlag: RiskFlag
  responsavel: string
}

export interface ImportRows {
  clients: ClientRowState[]
  projects: ProjectRowState[]
  incidents: IncidentRowState[]
  tasks: TaskRowState[]
}

type NewEntry = Omit<Entry, 'id' | 'isCritical' | 'comments' | 'links' | 'subtasks'>

export interface ImportDeps {
  clients: Client[]
  projects: Project[]
  incidents: Incident[]
  teamMembers: TeamMember[]
  defaultLanguage: AppLanguage
  createClient: (d: { name: string; country?: string; ploomesLink?: string; notes?: string; status?: ClientStatus; owners?: EntryOwner[] }) => string
  updateClient: (id: string, patch: Partial<Client>) => void
  createProject: (d: { name: string; type: 'nova_conta' | 'novo_projeto'; pm: string; pmMemberId?: string; language: AppLanguage; clientIds: string[] }) => string
  updateProject: (id: string, patch: Partial<Project>) => void
  createIncident: (d: { title: string; description?: string; owner?: EntryOwner; priority: Probability; impact: Probability; deadline?: string; clientIds?: string[]; projectIds?: string[] }) => string
  updateIncident: (id: string, patch: Partial<Incident>) => void
  addEntry: (projectId: string, phaseId: string, entry: NewEntry) => void
  addUnassignedEntry: (projectId: string, entry: NewEntry) => void
  addIncidentEntry: (incidentId: string, entry: NewEntry) => void
  addStandaloneTask: (entry: NewEntry) => void
  updateEntry: (projectId: string, entryId: string, patch: Partial<Entry>) => void
  /** Projeto atual no store (depois de criado, para achar as fases do template e o marco de go-live). */
  getProject: (id: string) => Project | undefined
}

export interface ImportSummary {
  clients: { created: number; updated: number }
  projects: { created: number; updated: number }
  incidents: { created: number; updated: number }
  tasks: { created: number }
  skipped: number
}

/** Junta texto novo ao existente sem perder o que já estava lá e sem repetir. */
export function mergeText(existing: string | undefined, incoming: string | undefined): string | undefined {
  const inc = incoming?.trim()
  if (!inc) return existing
  const ex = existing?.trim()
  if (!ex) return inc
  return ex.includes(inc) ? ex : `${ex}\n\n${inc}`
}

/** O que bloqueia a importação: linhas incluídas sem cliente ou sem origem resolvida. */
export function blockedRows(rows: ImportRows) {
  const active = <T extends { include: boolean; action?: RowAction }>(r: T) => r.include && r.action !== 'skip'
  return {
    projects: rows.projects.filter((r) => active(r) && !r.clientId),
    incidents: rows.incidents.filter((r) => active(r) && !r.clientId),
    tasks: rows.tasks.filter((r) => r.include && r.scope !== 'solta' && !r.targetKey),
  }
}

export function commitImport(rows: ImportRows, deps: ImportDeps): ImportSummary {
  const summary: ImportSummary = { clients: { created: 0, updated: 0 }, projects: { created: 0, updated: 0 }, incidents: { created: 0, updated: 0 }, tasks: { created: 0 }, skipped: 0 }
  const owner = (name: string | undefined, kind: EntryOwner['kind']) => (name?.trim() ? resolveOwnerByName(name, deps.teamMembers, kind) : undefined)

  // ── clientes ──────────────────────────────────────────────────────────────
  const clientByName = new Map<string, string>() // nome dobrado → id (existentes e criados agora)
  for (const c of deps.clients) clientByName.set(fold(c.name), c.id)
  for (const r of rows.clients) {
    if (!r.include || r.action === 'skip') { if (r.include) summary.skipped++; continue }
    const o = owner(r.row.responsavel, undefined)
    if (r.action === 'update' && r.matchClientId) {
      const existing = deps.clients.find((c) => c.id === r.matchClientId)
      deps.updateClient(r.matchClientId, {
        status: r.status,
        ...(r.row.pais ? { country: r.row.pais } : {}),
        ...(r.row.linkPloomes ? { ploomesLink: r.row.linkPloomes } : {}),
        ...(r.row.notas ? { notes: mergeText(existing?.notes, r.row.notas) } : {}),
        ...(o ? { owners: [o] } : {}),
      })
      clientByName.set(fold(r.name), r.matchClientId)
      summary.clients.updated++
    } else {
      const id = deps.createClient({ name: r.name.trim(), country: r.row.pais, ploomesLink: r.row.linkPloomes, notes: r.row.notas, status: r.status, owners: o ? [o] : [] })
      clientByName.set(fold(r.name), id)
      summary.clients.created++
    }
  }

  const resolveClient = (value: string): string | undefined => {
    if (!value) return undefined
    if (value.startsWith('batch:')) return clientByName.get(value.slice(6))
    if (value.startsWith('new:')) {
      const name = value.slice(4)
      const key = fold(name)
      const known = clientByName.get(key)
      if (known) return known
      const id = deps.createClient({ name })
      clientByName.set(key, id)
      summary.clients.created++
      return id
    }
    return value
  }

  // ── projetos ──────────────────────────────────────────────────────────────
  const projectByName = new Map<string, string>()
  for (const p of deps.projects) if (!p.archived) projectByName.set(fold(p.name), p.id)
  for (const r of rows.projects) {
    if (!r.include || r.action === 'skip') { if (r.include) summary.skipped++; continue }
    const clientId = resolveClient(r.clientId)
    if (!clientId) continue
    const imported = [r.row.descricao, r.row.linkReferencia, r.row.notas].filter(Boolean).join('\n\n') || undefined
    if (r.action === 'update' && r.matchProjectId) {
      const existing = deps.getProject(r.matchProjectId)
      deps.updateProject(r.matchProjectId, { status: r.status, ...(imported ? { overview: mergeText(existing?.overview, imported) } : {}) })
      projectByName.set(fold(r.name), r.matchProjectId)
      summary.projects.updated++
    } else {
      const pm = deps.teamMembers.find((m) => fold(m.name) === fold(r.row.pm))
      const id = deps.createProject({ name: r.name.trim(), type: r.row.tipo, pm: pm?.name ?? r.row.pm, pmMemberId: pm?.userId, language: deps.defaultLanguage, clientIds: [clientId] })
      if (r.status !== 'planning') deps.updateProject(id, { status: r.status })
      if (imported) deps.updateProject(id, { overview: imported })
      if (r.row.dataGoLive) {
        const created = deps.getProject(id)
        const milestones = created?.phases.flatMap((ph) => ph.entries.filter((e) => e.type === 'milestone')) ?? []
        const goLive = milestones.find((e) => e.name.toLowerCase().includes('go live') || e.name.toLowerCase().includes('go-live'))
        if (goLive) deps.updateEntry(id, goLive.id, { plannedDate: r.row.dataGoLive })
      }
      projectByName.set(fold(r.name), id)
      summary.projects.created++
    }
  }

  // ── incidentes ────────────────────────────────────────────────────────────
  const incidentByName = new Map<string, string>()
  for (const i of deps.incidents) incidentByName.set(fold(i.title), i.id)
  for (const r of rows.incidents) {
    if (!r.include || r.action === 'skip') { if (r.include) summary.skipped++; continue }
    const clientId = resolveClient(r.clientId)
    if (!clientId) continue
    const imported = [r.row.descricao, r.row.linkEvidencia, r.row.notas].filter(Boolean).join('\n\n') || undefined
    if (r.action === 'update' && r.matchIncidentId) {
      const existing = deps.incidents.find((i) => i.id === r.matchIncidentId)
      const o = owner(r.row.responsavel, undefined)
      deps.updateIncident(r.matchIncidentId, {
        status: r.status, priority: r.priority, impact: r.impact,
        ...(imported ? { description: mergeText(existing?.description, imported) } : {}),
        ...(o ? { owner: o } : {}),
      })
      incidentByName.set(fold(r.title), r.matchIncidentId)
      summary.incidents.updated++
    } else {
      const relatedProjectId = r.row.projetoRelacionado ? projectByName.get(fold(r.row.projetoRelacionado)) : undefined
      const id = deps.createIncident({
        title: r.title.trim(), description: imported, owner: owner(r.row.responsavel, undefined),
        priority: r.priority, impact: r.impact, deadline: r.row.prazo, clientIds: [clientId], projectIds: relatedProjectId ? [relatedProjectId] : undefined,
      })
      if (r.status !== 'open') deps.updateIncident(id, { status: r.status })
      incidentByName.set(fold(r.title), id)
      summary.incidents.created++
    }
  }

  // ── tarefas ───────────────────────────────────────────────────────────────
  for (const r of rows.tasks) {
    if (!r.include) continue
    const description = [r.row.descricao, r.row.linkEvidencia, r.row.notas].filter(Boolean).join('\n\n') || undefined
    const executor = owner(r.responsavel, 'executor')
    const entry: NewEntry = {
      type: 'task',
      name: r.name.trim(),
      description,
      responsible: executor?.name ?? r.responsavel,
      ...(executor ? { owners: [executor], responsibleMemberId: executor.type === 'member' ? executor.memberId : undefined, responsibleMode: executor.type === 'member' ? 'member' as const : 'free' as const } : {}),
      dependsOn: [],
      riskFlag: r.riskFlag,
      status: r.status,
      order: 0,
      plannedStart: r.row.inicio,
      plannedEnd: r.row.fim,
      durationDays: r.row.duracaoDias,
      clientId: r.scope === 'solta' ? (resolveClient(r.clientId) || undefined) : undefined,
    }
    if (r.scope === 'solta') {
      deps.addStandaloneTask(entry)
      summary.tasks.created++
    } else if (r.scope === 'projeto' && r.targetKey) {
      const id = r.targetKey.startsWith('batch:') ? projectByName.get(r.targetKey.slice(6)) : r.targetKey.slice(9)
      if (!id) continue
      const phase = r.row.fase ? deps.getProject(id)?.phases.find((ph) => !ph.isUnassigned && fold(ph.name) === fold(r.row.fase)) : undefined
      if (phase) deps.addEntry(id, phase.id, entry)
      else deps.addUnassignedEntry(id, entry)
      summary.tasks.created++
    } else if (r.scope === 'incidente' && r.targetKey) {
      const id = r.targetKey.startsWith('batch:') ? incidentByName.get(r.targetKey.slice(6)) : r.targetKey.slice(9)
      if (!id) continue
      deps.addIncidentEntry(id, entry)
      summary.tasks.created++
    }
  }

  return summary
}
