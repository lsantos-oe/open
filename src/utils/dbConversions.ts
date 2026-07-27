/**
 * Conversion functions between Supabase DB rows (snake_case) and
 * Zustand store types (camelCase).
 */

import type {
  Project, Phase, Entry, EntryComment, EntryOwner, Link, Risk, ActionTask,
  DelayLogEntry, TeamMember, ProjectCharter, EntryType, EntryStatus,
  RiskFlag, ProjectStatus, ProjectType, AppLanguage,
  DelayResponsibility, DelayType, OpenPoint, OpenPointStatus, OpenPointPriority,
  MeetingLog, MeetingItem, HistoryEntry, HistoryEventType, DiaryComment,
} from '@/types'

import type {
  DbProject, DbPhase, DbEntry, DbComment, DbDelayLog, DbRisk,
  DbCharter, DbLink, DbTeamMember, DbActionTask, DbSubtaskJson,
  DbCommentJson, DbProjectFull, DbProjectFlat, DbOpenPoint,
  DbMeetingLog, DbHistory, DbDiaryComment,
} from '@/types/database'

// ─── DB → Store ───────────────────────────────────────────────────────────────

function dbCommentJsonToStore(c: DbCommentJson): EntryComment {
  return {
    id: c.id,
    author: c.author,
    text: c.text,
    createdAt: c.created_at,
  }
}

function dbLinkToStore(l: DbLink): Link {
  return { id: l.id, label: l.label, url: l.url }
}

function dbTeamMemberToStore(m: DbTeamMember): TeamMember {
  return { id: m.id, name: m.name, role: m.role, email: m.email, userId: m.user_id }
}

function dbActionTaskToStore(t: DbActionTask): ActionTask {
  return {
    id: t.id,
    description: t.description,
    responsible: t.responsible,
    dueDate: t.due_date,
    done: t.done,
  }
}

function dbSubtaskToStore(s: DbSubtaskJson): Entry {
  return {
    id: s.id,
    type: s.type,
    name: s.name,
    responsible: s.responsible,
    dependsOn: s.depends_on ?? [],
    isCritical: s.is_critical ?? false,
    plannedStart: s.planned_start,
    plannedEnd: s.planned_end,
    baselineStart: s.baseline_start,
    baselineEnd: s.baseline_end,
    plannedDate: s.planned_date,
    baselineDate: s.baseline_date,
    actualStart: s.actual_start,
    actualEnd: s.actual_end,
    durationDays: s.duration_days,
    durationHours: s.duration_hours,
    riskFlag: s.risk_flag ?? 'none',
    status: s.status ?? 'pending',
    statusOverride: s.status_override ?? undefined,
    responsibleMemberId: s.responsible_member_id,
    responsibleMode: s.responsible_member_id ? 'member' : 'free',
    order: s.order ?? 0,
    comments: (s.comments ?? []).map(dbCommentJsonToStore),
    links: (s.links ?? []).map(dbLinkToStore),
    subtasks: [],
  }
}

function dbEntryToStore(row: DbEntry, comments: DbComment[]): Entry {
  const entryComments: EntryComment[] = comments
    .filter(c => c.entry_id === row.id)
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    .map(c => ({
      id: c.id,
      author: c.author_name ?? 'Anônimo',
      text: c.text,
      createdAt: c.created_at ?? new Date().toISOString(),
    }))

  // Migrate owners from responsible/responsibleMemberId if not stored
  let owners: EntryOwner[] = []
  if (Array.isArray(row.owners) && row.owners.length > 0) {
    owners = row.owners as EntryOwner[]
  } else if (row.responsible) {
    owners = [{
      id: row.responsible_member_id ?? row.responsible,
      type: row.responsible_member_id ? 'member' : 'text',
      memberId: row.responsible_member_id ?? undefined,
      name: row.responsible,
    }]
  }

  return {
    id: row.id,
    type: row.type,
    name: row.name,
    responsible: row.responsible ?? '',
    dependsOn: (row.depends_on as string[]) ?? [],
    isCritical: row.is_critical ?? false,
    plannedStart: row.planned_start ?? undefined,
    plannedEnd: row.planned_end ?? undefined,
    baselineStart: row.baseline_start ?? undefined,
    baselineEnd: row.baseline_end ?? undefined,
    plannedDate: row.planned_date ?? undefined,
    baselineDate: row.baseline_date ?? undefined,
    actualStart: row.actual_start ?? undefined,
    actualEnd: row.actual_end ?? undefined,
    durationDays: row.duration_days ?? undefined,
    durationHours: row.duration_hours ?? undefined,
    riskFlag: (row.risk_flag as RiskFlag) ?? 'none',
    status: (row.status as EntryStatus) ?? 'pending',
    statusOverride: row.status_override ?? undefined,
    responsibleMemberId: row.responsible_member_id ?? undefined,
    responsibleMode: row.responsible_member_id ? 'member' : 'free',
    owners,
    hiddenFromPlan: row.hidden_from_plan ?? undefined,
    order: row.order ?? 0,
    parentEntryId: row.parent_entry_id ?? undefined,
    comments: entryComments,
    links: ((row.links as DbLink[] | null) ?? []).map(dbLinkToStore),
    subtasks: ((row.subtasks as DbSubtaskJson[] | null) ?? []).map(dbSubtaskToStore),
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    createdById: row.created_by ?? undefined,
    updatedById: row.updated_by ?? undefined,
  }
}

export function dbPhaseToStore(row: DbPhase, entries: DbEntry[], comments: DbComment[]): Phase {
  const phaseEntries = entries
    .filter(e => e.phase_id === row.id)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(e => dbEntryToStore(e, comments))

  return {
    id: row.id,
    name: row.name,
    order: row.order ?? 0,
    entries: phaseEntries,
  }
}

function dbCharterToStore(db: DbCharter): ProjectCharter {
  return {
    sponsor: db.sponsor,
    objectives: db.objectives,
    scope: db.scope,
    outOfScope: db.out_of_scope,
    successCriteria: db.success_criteria,
    constraints: db.constraints,
    assumptions: db.assumptions,
    budget: db.budget,
  }
}

function dbRiskToStore(row: DbRisk): Risk {
  return {
    id: row.id,
    description: row.description,
    probability: row.probability ?? 'low',
    impact: row.impact ?? 'low',
    score: row.score ?? 1,
    status: row.status ?? 'open',
    owner: row.owner ?? '',
    dueDate: row.due_date ?? undefined,
    linkedEntryIds: (row.linked_entry_ids as string[]) ?? [],
    actionTasks: ((row.action_tasks as DbActionTask[] | null) ?? []).map(dbActionTaskToStore),
  }
}

function dbOpenPointToStore(row: DbOpenPoint, comments: DbDiaryComment[]): OpenPoint {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    status: (row.status as OpenPointStatus) ?? 'open',
    priority: (row.priority as OpenPointPriority) ?? 'medium',
    responsible: row.owner ?? undefined,
    dueDate: row.due_date ?? undefined,
    linkedEntryId: row.linked_entry_id ?? undefined,
    resolution: row.resolution_note ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    resolvedBy: row.resolved_by ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
    createdBy: row.created_by ?? undefined,
    comments: comments
      .filter(c => c.parent_type === 'open_point' && c.parent_id === row.id)
      .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
      .map(dbDiaryCommentToStore),
    attachments: [],
  }
}

function dbDiaryCommentToStore(row: DbDiaryComment): DiaryComment {
  return {
    id: row.id,
    author: row.author_name ?? 'Anônimo',
    text: row.text,
    createdAt: row.created_at ?? new Date().toISOString(),
  }
}

function dbMeetingLogToStore(row: DbMeetingLog, comments: DbDiaryComment[]): MeetingLog {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    participants: (row.participants as EntryOwner[] | null) ?? [],
    notes: row.notes ?? undefined,
    items: (row.items as MeetingItem[] | null) ?? [],
    comments: comments
      .filter(c => c.parent_type === 'meeting' && c.parent_id === row.id)
      .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
      .map(dbDiaryCommentToStore),
    attachments: (row.attachments as MeetingLog['attachments']) ?? [],
    createdAt: row.created_at ?? new Date().toISOString(),
    createdBy: row.created_by ?? undefined,
  }
}

function dbHistoryToStore(row: DbHistory, comments: DbDiaryComment[]): HistoryEntry {
  return {
    id: row.id,
    event: row.event as HistoryEventType,
    title: row.title,
    detail: row.detail ?? undefined,
    linkedId: row.linked_id ?? undefined,
    linkedType: (row.linked_type as HistoryEntry['linkedType']) ?? undefined,
    isManualNote: row.type === 'manual',
    createdAt: row.date ?? new Date().toISOString(),
    createdBy: row.author_id ?? undefined,
    comments: comments
      .filter(c => c.parent_type === 'history' && c.parent_id === row.id)
      .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
      .map(dbDiaryCommentToStore),
  }
}

function dbDelayLogToStore(row: DbDelayLog): DelayLogEntry {
  return {
    id: row.id,
    date: (row.created_at ?? new Date().toISOString()).split('T')[0],
    entryId: row.entry_id ?? '',
    entryName: row.entry_name ?? '',
    days: row.days ?? 0,
    responsibility: (row.responsibility as DelayResponsibility) ?? 'internal',
    type: (row.type as DelayType) ?? 'execution',
    description: row.description ?? '',
    comments: '',
    triggeredBy: (row.triggered_by as 'manual' | 'cascade') ?? 'manual',
  }
}

/** Reconstruct a full Project from all fetched DB rows. */
export function dbProjectToStore(data: DbProjectFull): Project {
  const { project, phases, entries, comments, delay_log, risks, open_points, meeting_logs, history, diary_comments } = data

  const sortedPhases = [...phases].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  return {
    id: project.id,
    name: project.name,
    client: project.client ?? '',
    type: (project.type as ProjectType) ?? 'nova_conta',
    pm: project.pm ?? '',
    devLead: project.dev_lead ?? undefined,
    devType: (project.dev_type as 'integration' | 'application') ?? undefined,
    devIntegration: project.dev_integration ?? undefined,
    language: (project.language as AppLanguage) ?? 'pt',
    status: (project.status as ProjectStatus) ?? 'planning',
    baselineSetAt: project.baseline_set_at ?? undefined,
    overview: project.overview ?? undefined,
    charter: project.charter ? dbCharterToStore(project.charter as DbCharter) : undefined,
    team: ((project.team as DbTeamMember[] | null) ?? []).map(dbTeamMemberToStore),
    links: ((project.links as DbLink[] | null) ?? []).map(dbLinkToStore),
    phases: sortedPhases.map(ph => dbPhaseToStore(ph, entries, comments)),
    risks: risks.map(dbRiskToStore),
    delayLog: delay_log.map(dbDelayLogToStore),
    openPoints: open_points.map(op => dbOpenPointToStore(op, diary_comments)),
    meetings: meeting_logs.map(m => dbMeetingLogToStore(m, diary_comments)),
    history: history.map(h => dbHistoryToStore(h, diary_comments)),
    archived: project.archived ?? false,
  }
}

// ─── Store → DB ───────────────────────────────────────────────────────────────

function storeCharterToDb(c: ProjectCharter): DbCharter {
  return {
    sponsor: c.sponsor,
    objectives: c.objectives,
    scope: c.scope,
    out_of_scope: c.outOfScope,
    success_criteria: c.successCriteria,
    constraints: c.constraints,
    assumptions: c.assumptions,
    budget: c.budget,
  }
}

function storeLinkToDb(l: Link): DbLink {
  return { id: l.id, label: l.label, url: l.url }
}

function storeTeamMemberToDb(m: TeamMember): DbTeamMember {
  return { id: m.id, name: m.name, role: m.role, email: m.email, user_id: m.userId }
}

function storeActionTaskToDb(t: ActionTask): DbActionTask {
  return {
    id: t.id,
    description: t.description,
    responsible: t.responsible,
    due_date: t.dueDate,
    done: t.done,
  }
}

function storeSubtaskToDb(e: Entry): DbSubtaskJson {
  return {
    id: e.id,
    type: e.type,
    name: e.name,
    responsible: e.responsible,
    depends_on: e.dependsOn,
    is_critical: e.isCritical,
    planned_start: e.plannedStart,
    planned_end: e.plannedEnd,
    baseline_start: e.baselineStart,
    baseline_end: e.baselineEnd,
    planned_date: e.plannedDate,
    baseline_date: e.baselineDate,
    actual_start: e.actualStart,
    actual_end: e.actualEnd,
    duration_days: e.durationDays,
    duration_hours: e.durationHours,
    risk_flag: e.riskFlag,
    status: e.status,
    status_override: e.statusOverride,
    responsible_member_id: e.responsibleMemberId,
    order: e.order,
    comments: e.comments.map(c => ({
      id: c.id,
      author: c.author,
      text: c.text,
      created_at: c.createdAt,
    })),
    links: e.links.map(storeLinkToDb),
  }
}

function storeEntryToDb(entry: Entry, phaseId: string, projectId: string, userId: string): DbEntry {
  const now = new Date().toISOString()
  return {
    id: entry.id,
    project_id: projectId,
    phase_id: phaseId,
    type: entry.type,
    name: entry.name,
    responsible: (entry.owners && entry.owners.length > 0 ? entry.owners[0].name : entry.responsible) || null,
    responsible_member_id: (entry.owners && entry.owners.length > 0 ? entry.owners.find(o => o.type === 'member')?.memberId : entry.responsibleMemberId) ?? null,
    depends_on: entry.dependsOn.length > 0 ? entry.dependsOn : null,
    is_critical: entry.isCritical,
    planned_start: entry.plannedStart ?? null,
    planned_end: entry.plannedEnd ?? null,
    baseline_start: entry.baselineStart ?? null,
    baseline_end: entry.baselineEnd ?? null,
    planned_date: entry.plannedDate ?? null,
    baseline_date: entry.baselineDate ?? null,
    planned_time: null,
    actual_start: entry.actualStart ?? null,
    actual_end: entry.actualEnd ?? null,
    duration_days: entry.durationDays ?? null,
    duration_hours: entry.durationHours ?? null,
    risk_flag: entry.riskFlag,
    status: entry.status,
    status_override: entry.statusOverride ?? null,
    parent_entry_id: entry.parentEntryId ?? null,
    order: entry.order,
    subtasks: entry.subtasks.length > 0 ? entry.subtasks.map(storeSubtaskToDb) : null,
    links: entry.links.length > 0 ? entry.links.map(storeLinkToDb) : null,
    owners: entry.owners && entry.owners.length > 0 ? entry.owners : null,
    hidden_from_plan: entry.hiddenFromPlan ?? null,
    created_at: now,
    created_by: userId,
    updated_at: now,
    updated_by: userId,
  }
}

function storePhaseToDb(phase: Phase, projectId: string): DbPhase {
  return {
    id: phase.id,
    project_id: projectId,
    name: phase.name,
    order: phase.order,
    created_at: new Date().toISOString(),
  }
}

function storeRiskToDb(risk: Risk, projectId: string, userId: string): DbRisk {
  const now = new Date().toISOString()
  return {
    id: risk.id,
    project_id: projectId,
    description: risk.description,
    probability: risk.probability,
    impact: risk.impact,
    score: risk.score,
    status: risk.status,
    owner: risk.owner || null,
    due_date: risk.dueDate ?? null,
    linked_entry_ids: risk.linkedEntryIds.length > 0 ? risk.linkedEntryIds : null,
    action_tasks: risk.actionTasks.length > 0 ? risk.actionTasks.map(storeActionTaskToDb) : null,
    created_at: now,
    created_by: userId,
    updated_at: now,
  }
}

function storeDelayLogToDb(entry: DelayLogEntry, projectId: string, userId: string): DbDelayLog {
  return {
    id: entry.id,
    project_id: projectId,
    entry_id: entry.entryId || null,
    entry_name: entry.entryName || null,
    days: entry.days,
    description: entry.description || null,
    responsibility: entry.responsibility,
    type: entry.type,
    triggered_by: entry.triggeredBy,
    created_at: entry.date,
    created_by: userId,
  }
}

/** Extract top-level entry comments as separate DB comment rows. */
function storeEntryCommentsToDb(
  entry: Entry,
  projectId: string,
): DbComment[] {
  return entry.comments.map(c => ({
    id: c.id,
    project_id: projectId,
    entry_id: entry.id,
    author_id: null,
    author_name: c.author,
    author_avatar: null,
    text: c.text,
    created_at: c.createdAt,
  }))
}

/**
 * Flatten a full store Project into all DB rows needed for upsert.
 * `userId` is the authenticated user's id for audit columns.
 */
export function storeProjectToDb(project: Project, userId: string): DbProjectFlat {
  const now = new Date().toISOString()

  const projectRow: DbProject = {
    id: project.id,
    name: project.name,
    client: project.client || null,
    type: project.type,
    pm: project.pm || null,
    dev_lead: project.devLead ?? null,
    dev_type: project.devType ?? null,
    dev_integration: project.devIntegration ?? null,
    language: project.language,
    status: project.status,
    baseline_set_at: project.baselineSetAt ?? null,
    overview: project.overview ?? null,
    charter: project.charter ? storeCharterToDb(project.charter) : null,
    team: project.team.length > 0 ? project.team.map(storeTeamMemberToDb) : null,
    links: project.links.length > 0 ? project.links.map(storeLinkToDb) : null,
    archived: project.archived ?? false,
    created_at: now,
    created_by: userId,
    updated_at: now,
    updated_by: userId,
  }

  const phases: DbPhase[] = project.phases.map(ph => storePhaseToDb(ph, project.id))

  const entries: DbEntry[] = []
  const comments: DbComment[] = []

  for (const phase of project.phases) {
    for (const entry of phase.entries) {
      entries.push(storeEntryToDb(entry, phase.id, project.id, userId))
      comments.push(...storeEntryCommentsToDb(entry, project.id))
    }
  }

  const risks: DbRisk[] = project.risks.map(r => storeRiskToDb(r, project.id, userId))
  const delay_log: DbDelayLog[] = project.delayLog.map(d => storeDelayLogToDb(d, project.id, userId))

  return { project: projectRow, phases, entries, comments, delay_log, risks }
}

export { dbRiskToStore, dbDelayLogToStore, dbEntryToStore as dbEntryToStorePartial, storeRiskToDb, storeEntryToDb, storeDelayLogToDb }
