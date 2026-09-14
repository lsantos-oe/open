import { Client, Project, Incident } from '@/types'
import { matchesQuery, findByName } from '@/ai/tools/helpers'
import { StagingProjectRow, StagingIncidentRow, StagingTaskRow } from './importStaging'

export type SuggestedAction = 'create' | 'update' | 'ambiguous'

export interface MatchResult<T> {
  action: SuggestedAction
  match?: T
  candidates: T[]
}

function matchOne<T>(items: T[], query: string, getName: (item: T) => string): MatchResult<T> {
  const q = query.trim()
  if (!q) return { action: 'create', candidates: [] }
  const candidates = findByName(items, q, getName)
  if (candidates.length === 0) return { action: 'create', candidates: [] }
  if (candidates.length === 1) return { action: 'update', match: candidates[0], candidates }
  // Prefer an exact (case-insensitive) name match among the candidates to
  // resolve the common case of one name being a substring of another.
  const exact = candidates.filter((c) => getName(c).trim().toLowerCase() === q.toLowerCase())
  if (exact.length === 1) return { action: 'update', match: exact[0], candidates }
  return { action: 'ambiguous', candidates }
}

export function matchClient(clients: Client[], nome: string): MatchResult<Client> {
  return matchOne(clients, nome, (c) => c.name)
}

/** Same-batch rows being created get a synthetic id (`new:<linha_origem>`) so
 *  a Tarefa row in the same import can reference a Projeto/Incidente that
 *  doesn't have a real id yet — resolved to the real id right after commit. */
export function newRowId(linhaOrigem: string): string {
  return `new:${linhaOrigem}`
}

export interface ScopedMatchOptions<T> {
  existing: T[]
  scopedTo?: string // matched client id — narrows the search when present
  getName: (item: T) => string
  getClientIds: (item: T) => string[]
}

export function matchScoped<T>(query: string, opts: ScopedMatchOptions<T>): MatchResult<T> {
  const q = query.trim()
  if (!q) return { action: 'create', candidates: [] }
  if (opts.scopedTo) {
    const scoped = opts.existing.filter((item) => opts.getClientIds(item).includes(opts.scopedTo!))
    const scopedResult = matchOne(scoped, q, opts.getName)
    if (scopedResult.action !== 'create') return scopedResult
  }
  return matchOne(opts.existing, q, opts.getName)
}

export function matchProject(projects: Project[], nome: string, clientId?: string): MatchResult<Project> {
  return matchScoped(nome, {
    existing: projects,
    scopedTo: clientId,
    getName: (p) => p.name,
    getClientIds: (p) => p.clientIds,
  })
}

export function matchIncident(incidents: Incident[], titulo: string, clientId?: string): MatchResult<Incident> {
  return matchScoped(titulo, {
    existing: incidents,
    scopedTo: clientId,
    getName: (i) => i.title,
    getClientIds: (i) => i.clientIds,
  })
}

/** Resolves a Tarefa row's origem_nome, checking rows being created in this
 *  same batch first (by linha_origem), then falling back to existing data. */
export function matchTaskOrigin(
  task: StagingTaskRow,
  batch: { projetos: StagingProjectRow[]; incidentes: StagingIncidentRow[] },
  existing: { projects: Project[]; incidents: Incident[] },
): { kind: 'projeto' | 'incidente'; batchRow?: StagingProjectRow | StagingIncidentRow; match?: Project | Incident } | undefined {
  if (task.origemTipo === 'solta' || !task.origemNome) return undefined

  if (task.origemTipo === 'projeto') {
    const batchRow = batch.projetos.find((p) => matchesQuery(p.nome, task.origemNome!) || matchesQuery(task.origemNome!, p.nome))
    if (batchRow) return { kind: 'projeto', batchRow }
    const result = matchProject(existing.projects, task.origemNome)
    return { kind: 'projeto', match: result.match }
  }

  const batchRow = batch.incidentes.find((i) => matchesQuery(i.titulo, task.origemNome!) || matchesQuery(task.origemNome!, i.titulo))
  if (batchRow) return { kind: 'incidente', batchRow }
  const result = matchIncident(existing.incidents, task.origemNome)
  return { kind: 'incidente', match: result.match }
}
