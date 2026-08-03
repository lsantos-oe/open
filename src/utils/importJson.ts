// SCHEMA DE IMPORTAÇÃO v1.0
// Campos obrigatórios: import_version, project.name, project.phases
// Todos os outros campos são opcionais.
//
// tipos de entry: "task" | "milestone" | "meeting"
// task: requer plannedStart e/ou plannedEnd
// milestone: requer plannedDate
// meeting: requer plannedDate, opcional plannedTime e durationHours
//
// dependsOn: array de tempIds de outras entries do mesmo projeto
// riskFlag: "none" | "warning" | "critical"
// status: "pending" | "in_progress" | "done" | "blocked"
// probability/impact: "low" | "medium" | "high"

import { v4 as uuid } from 'uuid'
import {
  Project, Phase, Entry, Risk, TeamMember, ProjectCharter,
  EntryType, RiskFlag, EntryStatus, ProjectStatus, ProjectType, AppLanguage,
} from '@/types'
import { applyIsCritical } from './criticalPath'
import { recalcDuration } from './dateEngine'
import { useAppStore } from '@/store/useAppStore'

// ─── Import schema types ─────────────────────────────────────────────────────

interface ImportSubtask {
  tempId?: string
  type: EntryType
  name: string
  responsible?: string
  dependsOn?: string[]
  plannedStart?: string
  plannedEnd?: string
  plannedDate?: string
  durationDays?: number
  durationHours?: number
  riskFlag?: RiskFlag
  status?: EntryStatus
}

interface ImportEntry extends ImportSubtask {
  subtasks?: ImportSubtask[]
}

interface ImportPhase {
  tempId?: string
  name: string
  entries?: ImportEntry[]
}

interface ImportRisk {
  description: string
  probability?: 'low' | 'medium' | 'high'
  impact?: 'low' | 'medium' | 'high'
  status?: string
  owner?: string
  dueDate?: string
  linkedEntryTempIds?: string[]
  actionTasks?: { description: string; responsible?: string; dueDate?: string; done?: boolean }[]
}

interface ImportTeamMember {
  name: string
  role?: string
  email?: string
}

export interface ImportJson {
  import_version: string | number
  project: {
    name: string
    client?: string
    type?: ProjectType
    pm?: string
    language?: AppLanguage
    status?: ProjectStatus
    devLead?: string
    devType?: 'integration' | 'application'
    devIntegration?: string
    overview?: string
    charter?: Partial<ProjectCharter>
    phases?: ImportPhase[]
    risks?: ImportRisk[]
    team?: ImportTeamMember[]
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean
  errors: string[]
  preview?: {
    name: string
    client: string
    phases: number
    entries: number
    risks: number
    teamMembers: number
    hasCharter: boolean
  }
}

const VALID_ENTRY_TYPES: EntryType[] = ['task', 'milestone', 'meeting']

export function validateImportJson(raw: string): ValidationResult {
  const errors: string[] = []

  // 1. Parse JSON
  let data: any
  try {
    data = JSON.parse(raw)
  } catch (e) {
    return { valid: false, errors: [`JSON inválido: ${(e as Error).message}`] }
  }

  // 2. Required top-level fields
  if (!data.import_version) {
    errors.push('Campo "import_version" é obrigatório.')
  }
  if (!data.project || typeof data.project !== 'object') {
    errors.push('Campo "project" é obrigatório.')
    return { valid: false, errors }
  }

  const p = data.project

  // 3. project.name
  if (!p.name || typeof p.name !== 'string' || !p.name.trim()) {
    errors.push('Campo "project.name" não pode ser vazio.')
  }

  // 4. phases must be array if present
  if (p.phases !== undefined && !Array.isArray(p.phases)) {
    errors.push('Campo "project.phases" deve ser um array.')
  }

  // 5. Collect tempIds + validate entry types
  const allTempIds = new Set<string>()
  const depRefs: { tempId: string; path: string }[] = []
  const adjMap = new Map<string, string[]>()

  function collectEntry(e: any, path: string) {
    if (e.tempId) allTempIds.add(String(e.tempId))
    if (!VALID_ENTRY_TYPES.includes(e.type)) {
      errors.push(`${path}: tipo inválido "${e.type}". Esperado: task | milestone | meeting.`)
    }
    if (Array.isArray(e.dependsOn)) {
      e.dependsOn.forEach((ref: any) => {
        depRefs.push({ tempId: String(ref), path: `${path}.dependsOn` })
      })
    }
    const deps: string[] = Array.isArray(e.dependsOn) ? e.dependsOn.map(String) : []
    if (e.tempId) adjMap.set(String(e.tempId), deps)
  }

  if (Array.isArray(p.phases)) {
    p.phases.forEach((ph: any, pi: number) => {
      if (!ph.name) errors.push(`phases[${pi}]: campo "name" é obrigatório.`)
      if (Array.isArray(ph.entries)) {
        ph.entries.forEach((e: any, ei: number) => {
          collectEntry(e, `phases[${pi}].entries[${ei}]`)
          if (Array.isArray(e.subtasks)) {
            e.subtasks.forEach((sub: any, si: number) => {
              collectEntry(sub, `phases[${pi}].entries[${ei}].subtasks[${si}]`)
            })
          }
        })
      }
    })
  }

  // 6. Broken references
  for (const ref of depRefs) {
    if (!allTempIds.has(ref.tempId)) {
      errors.push(`${ref.path}: referência quebrada para tempId "${ref.tempId}".`)
    }
  }

  // 7. Circular dependencies (DFS)
  const visited = new Set<string>()
  const stack = new Set<string>()
  const reported = new Set<string>()

  function dfs(id: string): boolean {
    if (stack.has(id)) return true
    if (visited.has(id)) return false
    visited.add(id)
    stack.add(id)
    const deps = adjMap.get(id) ?? []
    for (const dep of deps) {
      if (!allTempIds.has(dep)) continue // broken ref already reported
      if (dfs(dep) && !reported.has(id)) {
        reported.add(id)
        errors.push(`Dependência circular detectada envolvendo tempId "${id}".`)
      }
    }
    stack.delete(id)
    return false
  }

  for (const id of adjMap.keys()) {
    if (!visited.has(id)) dfs(id)
  }

  if (errors.length > 0) return { valid: false, errors }

  // Build preview
  let totalEntries = 0
  if (Array.isArray(p.phases)) {
    for (const ph of p.phases) {
      if (Array.isArray(ph.entries)) {
        totalEntries += ph.entries.length
        for (const e of ph.entries) {
          if (Array.isArray(e.subtasks)) totalEntries += e.subtasks.length
        }
      }
    }
  }

  return {
    valid: true,
    errors: [],
    preview: {
      name: p.name,
      client: p.client ?? '',
      phases: Array.isArray(p.phases) ? p.phases.length : 0,
      entries: totalEntries,
      risks: Array.isArray(p.risks) ? p.risks.length : 0,
      teamMembers: Array.isArray(p.team) ? p.team.length : 0,
      hasCharter: !!p.charter,
    },
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildIdMap(phases: ImportPhase[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const ph of phases) {
    for (const e of (ph.entries ?? [])) {
      if (e.tempId) map.set(e.tempId, uuid())
      for (const sub of (e.subtasks ?? [])) {
        if (sub.tempId) map.set(sub.tempId, uuid())
      }
    }
  }
  return map
}

function resolveIds(deps: string[] | undefined, idMap: Map<string, string>): string[] {
  return (deps ?? []).map(ref => idMap.get(ref) ?? ref).filter(Boolean)
}

function buildEntryFromImport(
  e: ImportEntry | ImportSubtask,
  order: number,
  idMap: Map<string, string>,
): Entry {
  const id = e.tempId ? (idMap.get(e.tempId) ?? uuid()) : uuid()
  const subtasks: Entry[] = 'subtasks' in e
    ? (e.subtasks ?? []).map((sub, si) => buildEntryFromImport(sub, si, idMap))
    : []
  return {
    id,
    type: e.type,
    name: e.name,
    responsible: e.responsible ?? '',
    dependsOn: resolveIds(e.dependsOn, idMap),
    isCritical: false,
    plannedStart: e.plannedStart,
    plannedEnd: e.plannedEnd,
    plannedDate: e.plannedDate,
    durationDays: e.durationDays,
    durationHours: e.durationHours,
    riskFlag: e.riskFlag ?? 'none',
    status: e.status ?? 'pending',
    subtasks,
    comments: [],
    links: [],
    order,
  }
}

function buildRiskFromImport(r: ImportRisk, idMap: Map<string, string>): Risk {
  const probVal = { low: 1, medium: 2, high: 3 }
  const prob = r.probability ?? 'low'
  const imp = r.impact ?? 'low'
  return {
    id: uuid(),
    description: r.description,
    probability: prob,
    impact: imp,
    score: probVal[prob] * probVal[imp],
    status: r.status ?? 'open',
    owner: r.owner ?? '',
    dueDate: r.dueDate,
    linkedEntryIds: (r.linkedEntryTempIds ?? []).map(ref => idMap.get(ref)).filter((id): id is string => !!id),
    actionTasks: (r.actionTasks ?? []).map(at => ({
      id: uuid(),
      description: at.description,
      responsible: at.responsible,
      dueDate: at.dueDate,
      done: at.done ?? false,
    })),
  }
}

function applyDurations(phases: Phase[], holidays: string[]): Phase[] {
  return phases.map(ph => ({
    ...ph,
    entries: ph.entries.map(e => ({
      ...e,
      durationDays: e.type === 'task' ? recalcDuration(e, holidays) : e.durationDays,
      subtasks: e.subtasks.map(sub => ({
        ...sub,
        durationDays: sub.type === 'task' ? recalcDuration(sub, holidays) : sub.durationDays,
      })),
    })),
  }))
}

// ─── Client resolution ─────────────────────────────────────────────────────────

/**
 * Client is imported by NAME (portable across databases — a raw clientId from
 * the export would only be valid in the database it was exported from).
 * Finds an existing Carteira client by exact case-insensitive name match, or
 * creates a new one. Returns undefined if no client name was provided.
 */
function resolveClientId(name: string | undefined): string | undefined {
  const trimmed = name?.trim()
  if (!trimmed) return undefined
  const { clients, createClient } = useAppStore.getState()
  const existing = clients.find((c) => c.name.toLowerCase() === trimmed.toLowerCase())
  if (existing) return existing.id
  return createClient({ name: trimmed })
}

// ─── Import new project ───────────────────────────────────────────────────────

export function importNewProject(raw: string): Project {
  const data: ImportJson = JSON.parse(raw)
  const p = data.project
  const importPhases = p.phases ?? []
  const holidays: string[] = useAppStore.getState().settings.holidays

  const idMap = buildIdMap(importPhases)

  const rawPhases: Phase[] = importPhases.map((ph, pi) => ({
    id: uuid(),
    name: ph.name,
    order: pi,
    entries: (ph.entries ?? []).map((e, ei) => buildEntryFromImport(e, ei, idMap)),
  }))

  const phases = applyDurations(rawPhases, holidays)

  const risks: Risk[] = (p.risks ?? []).map(r => buildRiskFromImport(r, idMap))

  const team: TeamMember[] = (p.team ?? []).map(m => ({
    id: uuid(),
    name: m.name,
    role: m.role ?? '',
    email: m.email,
  }))

  const clientId = resolveClientId(p.client)

  return {
    id: uuid(),
    name: p.name,
    client: p.client ?? '',
    clientId,
    clientIds: clientId ? [clientId] : [],
    type: p.type ?? 'novo_projeto',
    pm: p.pm ?? '',
    language: p.language ?? 'pt',
    status: p.status ?? 'planning',
    devLead: p.devLead,
    devType: p.devType,
    devIntegration: p.devIntegration,
    overview: p.overview,
    charter: p.charter as ProjectCharter | undefined,
    phases: applyIsCritical(phases),
    risks,
    reportLinks: [],
    delayLog: [],
    team,
    links: [],
  }
}

// ─── Import update (merge into existing project) ─────────────────────────────

export function importUpdateProject(
  existing: Project,
  raw: string,
  mode: 'replace' | 'merge',
): Project {
  if (mode === 'replace') {
    const imported = importNewProject(raw)
    return {
      ...existing,
      name: imported.name,
      client: imported.client,
      clientId: imported.clientId,
      clientIds: imported.clientIds,
      type: imported.type,
      pm: imported.pm,
      language: imported.language,
      devLead: imported.devLead,
      devType: imported.devType,
      devIntegration: imported.devIntegration,
      overview: imported.overview,
      charter: imported.charter,
      phases: imported.phases,
      risks: imported.risks,
      team: imported.team,
      status: imported.status,
    }
  }

  // ── Merge mode ────────────────────────────────────────────────────────────

  const data: ImportJson = JSON.parse(raw)
  const p = data.project
  const importPhases = p.phases ?? []
  const holidays: string[] = useAppStore.getState().settings.holidays

  // Build tempId → realId map — map to existing IDs where names match
  const idMap = new Map<string, string>()
  const existingPhasesByName = new Map(existing.phases.map(ph => [ph.name.toLowerCase(), ph]))

  for (const importPh of importPhases) {
    const existingPh = existingPhasesByName.get(importPh.name.toLowerCase())
    const existingEntriesByName = existingPh
      ? new Map(existingPh.entries.map(e => [e.name.toLowerCase(), e]))
      : new Map<string, Entry>()

    for (const e of (importPh.entries ?? [])) {
      if (e.tempId) {
        const match = existingEntriesByName.get(e.name.toLowerCase())
        idMap.set(e.tempId, match ? match.id : uuid())
      }
      for (const sub of (e.subtasks ?? [])) {
        if (sub.tempId) idMap.set(sub.tempId, uuid())
      }
    }
  }

  // Merge phases
  const mergedPhases: Phase[] = [...existing.phases]

  for (const importPh of importPhases) {
    const phaseKey = importPh.name.toLowerCase()
    const existingIdx = mergedPhases.findIndex(ph => ph.name.toLowerCase() === phaseKey)

    if (existingIdx >= 0) {
      const existingPh = mergedPhases[existingIdx]
      const updatedEntries = [...existingPh.entries]

      for (const importEntry of (importPh.entries ?? [])) {
        const entryKey = importEntry.name.toLowerCase()
        const existingEntryIdx = updatedEntries.findIndex(e => e.name.toLowerCase() === entryKey)

        if (existingEntryIdx >= 0) {
          // Update existing: patch dates, responsible, status, riskFlag — keep comments/links/subtasks
          const ex = updatedEntries[existingEntryIdx]
          updatedEntries[existingEntryIdx] = {
            ...ex,
            responsible: importEntry.responsible ?? ex.responsible,
            plannedStart: importEntry.plannedStart ?? ex.plannedStart,
            plannedEnd: importEntry.plannedEnd ?? ex.plannedEnd,
            plannedDate: importEntry.plannedDate ?? ex.plannedDate,
            durationDays: importEntry.durationDays ?? ex.durationDays,
            durationHours: importEntry.durationHours ?? ex.durationHours,
            riskFlag: importEntry.riskFlag ?? ex.riskFlag,
            status: importEntry.status ?? ex.status,
            dependsOn: importEntry.dependsOn ? resolveIds(importEntry.dependsOn, idMap) : ex.dependsOn,
          }
        } else {
          // Add new entry
          updatedEntries.push(buildEntryFromImport(importEntry, updatedEntries.length, idMap))
        }
      }

      mergedPhases[existingIdx] = { ...existingPh, entries: updatedEntries }
    } else {
      // New phase
      mergedPhases.push({
        id: uuid(),
        name: importPh.name,
        order: mergedPhases.length,
        entries: (importPh.entries ?? []).map((e, ei) => buildEntryFromImport(e, ei, idMap)),
      })
    }
  }

  // Merge risks
  const mergedRisks = [...existing.risks]
  for (const importRisk of (p.risks ?? [])) {
    const descKey = importRisk.description.toLowerCase()
    const existingIdx = mergedRisks.findIndex(r => r.description.toLowerCase() === descKey)
    if (existingIdx >= 0) {
      const er = mergedRisks[existingIdx]
      mergedRisks[existingIdx] = {
        ...er,
        probability: importRisk.probability ?? er.probability,
        impact: importRisk.impact ?? er.impact,
        status: importRisk.status ?? er.status,
        owner: importRisk.owner ?? er.owner,
        dueDate: importRisk.dueDate ?? er.dueDate,
        linkedEntryIds: importRisk.linkedEntryTempIds
          ? importRisk.linkedEntryTempIds.map(ref => idMap.get(ref)).filter((id): id is string => !!id)
          : er.linkedEntryIds,
      }
    } else {
      mergedRisks.push(buildRiskFromImport(importRisk, idMap))
    }
  }

  // Merge team (union by name)
  const existingMemberNames = new Set(existing.team.map(m => m.name.toLowerCase()))
  const mergedTeam = [...existing.team]
  for (const m of (p.team ?? [])) {
    if (!existingMemberNames.has(m.name.toLowerCase())) {
      mergedTeam.push({ id: uuid(), name: m.name, role: m.role ?? '', email: m.email })
    }
  }

  // Merge charter (overwrite non-null imported fields)
  let mergedCharter = existing.charter
  if (p.charter) {
    const ec = existing.charter
    mergedCharter = {
      sponsor: p.charter.sponsor ?? ec?.sponsor ?? '',
      objectives: p.charter.objectives ?? ec?.objectives ?? '',
      scope: p.charter.scope ?? ec?.scope ?? '',
      outOfScope: p.charter.outOfScope ?? ec?.outOfScope ?? '',
      successCriteria: p.charter.successCriteria ?? ec?.successCriteria ?? '',
      constraints: p.charter.constraints ?? ec?.constraints ?? '',
      assumptions: p.charter.assumptions ?? ec?.assumptions ?? '',
      budget: p.charter.budget ?? ec?.budget,
    }
  }

  return {
    ...existing,
    overview: p.overview ?? existing.overview,
    charter: mergedCharter,
    phases: applyIsCritical(applyDurations(mergedPhases, holidays)),
    risks: mergedRisks,
    team: mergedTeam,
  }
}
