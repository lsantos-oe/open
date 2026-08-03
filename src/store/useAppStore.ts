import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'
import i18n from '@/i18n'
import {
  Project, Phase, Entry, Risk, ActionTask, DelayLogEntry, TeamMember, Link, EntryComment,
  AppSettings, ProjectTemplate, IncidentTemplate, AppLanguage, EntryStatus, RiskFlag, Workdays,
  OpenPoint, MeetingLog, MeetingItem, HistoryEntry, HistoryEventType, DiaryComment, FileAttachment,
  Client, ClientContact, ClientCsAssignment, ClientStatus,
  Incident, IncidentStatus, EntryOwner,
} from '@/types'
import { applyDateChange } from '@/utils/dateEngine'
import { applyIsCritical } from '@/utils/criticalPath'
import { workdaysBetween, parseHolidays } from '@/utils/businessDays'
import { applyAutoStatus, computeBaselineFields } from '@/utils/statusCalc'
import { parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/useAuthStore'
import { useToastStore } from '@/stores/useToastStore'
import {
  dbProjectToStore,
  storeProjectToDb,
  storeEntryToDb,
  storeRiskToDb,
  storeDelayLogToDb,
  dbClientToStore,
  storeClientToDb,
  storeClientContactToDb,
  dbClientContactToStore,
  storeCsAssignmentToDb,
  dbIncidentToStore,
  storeIncidentToDb,
} from '@/utils/dbConversions'
import type { DbProjectFull, DbProfile, DbInvitedUser, DbNotification, UserRole } from '@/types/database'
import type { DbIncidentFull } from '@/utils/dbConversions'

export type DiaryScope = { type: 'project'; id: string } | { type: 'incident'; id: string }

const TEMPLATES_VERSION = 2

// ─── default templates ───────────────────────────────────────────────────────

const DEFAULT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'nova_conta',
    name: 'Nova Conta',
    type: 'nova_conta',
    phases: [
      {
        id: 'p1', nameKey: 'tpl.nc.p1', name: 'Kickoff & Planejamento', order: 0,
        entries: [
          { id: 'e1', type: 'meeting', nameKey: 'tpl.nc.e1', name: 'Reunião de Kickoff', responsible: 'PM', dependsOn: [], order: 0, durationHours: 2, subtasks: [] },
          { id: 'e2', type: 'task', nameKey: 'tpl.nc.e2', name: 'Levantamento de requisitos', responsible: 'PM', dependsOn: ['e1'], durationDays: 5, order: 1, subtasks: [] },
          { id: 'e3', type: 'milestone', nameKey: 'tpl.nc.e3', name: 'Aprovação do escopo', responsible: 'PM', dependsOn: ['e2'], order: 2, subtasks: [] },
        ],
      },
      {
        id: 'p2', nameKey: 'tpl.nc.p2', name: 'Configuração', order: 1,
        entries: [
          { id: 'e4', type: 'task', nameKey: 'tpl.nc.e4', name: 'Configuração base do CRM', responsible: 'Dev', dependsOn: ['e3'], durationDays: 10, order: 0, subtasks: [] },
          { id: 'e5', type: 'task', nameKey: 'tpl.nc.e5', name: 'Importação de dados', responsible: 'Dev', dependsOn: ['e4'], durationDays: 5, order: 1, subtasks: [] },
          { id: 'e6', type: 'task', nameKey: 'tpl.nc.e6', name: 'Parametrização de workflows', responsible: 'Dev', dependsOn: ['e4'], durationDays: 8, order: 2, subtasks: [] },
        ],
      },
      {
        id: 'p3', nameKey: 'tpl.nc.p3', name: 'Treinamento & Homologação', order: 2,
        entries: [
          { id: 'e7', type: 'task', nameKey: 'tpl.nc.e7', name: 'Treinamento da equipe', responsible: 'PM', dependsOn: ['e5', 'e6'], durationDays: 3, order: 0, subtasks: [] },
          { id: 'e8', type: 'task', nameKey: 'tpl.nc.e8', name: 'Homologação pelo cliente', responsible: 'Cliente', dependsOn: ['e7'], durationDays: 5, order: 1, subtasks: [] },
          { id: 'e9', type: 'milestone', nameKey: 'tpl.nc.e9', name: 'Go-live', responsible: 'PM', dependsOn: ['e8'], order: 2, subtasks: [] },
        ],
      },
    ],
  },
  {
    id: 'novo_projeto',
    name: 'Novo Projeto',
    type: 'novo_projeto',
    phases: [
      {
        id: 'pp1', nameKey: 'tpl.np.p1', name: 'Planejamento', order: 0,
        entries: [
          { id: 'pe1', type: 'task', nameKey: 'tpl.np.e1', name: 'Levantamento de requisitos', responsible: 'Cliente', dependsOn: [], durationDays: 5, order: 0, subtasks: [] },
          { id: 'pe2', type: 'task', nameKey: 'tpl.np.e2', name: 'Análise de requisitos e arquitetura', responsible: 'OE', dependsOn: ['pe1'], durationDays: 5, order: 1, subtasks: [] },
          { id: 'pe3', type: 'milestone', nameKey: 'tpl.np.e3', name: 'Aprovação do escopo/arquitetura', responsible: 'Cliente', dependsOn: ['pe2'], order: 2, subtasks: [] },
          { id: 'pe4', type: 'task', nameKey: 'tpl.np.e4', name: 'Elaboração da proposta', responsible: 'OE', dependsOn: ['pe3'], durationDays: 3, order: 3, subtasks: [] },
          { id: 'pe5', type: 'milestone', nameKey: 'tpl.np.e5', name: 'Aprovação da proposta', responsible: 'Cliente', dependsOn: ['pe4'], order: 4, subtasks: [] },
        ],
      },
      {
        id: 'pp2', nameKey: 'tpl.np.p2', name: 'Desenvolvimento', order: 1,
        entries: [
          { id: 'pe6', type: 'task', nameKey: 'tpl.np.e6', name: 'Desenvolvimento/configurações', responsible: 'Dev', dependsOn: ['pe5'], durationDays: 15, order: 0, subtasks: [] },
          { id: 'pe7', type: 'task', nameKey: 'tpl.np.e7', name: 'Testes unitários + ajustes', responsible: 'Dev', dependsOn: ['pe5'], durationDays: 5, order: 1, subtasks: [] },
          { id: 'pe8', type: 'task', nameKey: 'tpl.np.e8', name: 'Testes integrados (UAT) + ajustes', responsible: 'Dev+Cliente', dependsOn: ['pe6', 'pe7'], durationDays: 5, order: 2, subtasks: [] },
        ],
      },
      {
        id: 'pp3', nameKey: 'tpl.np.p3', name: 'Entrega', order: 2,
        entries: [
          { id: 'pe9', type: 'task', nameKey: 'tpl.np.e9', name: 'Treinamento', responsible: 'OE', dependsOn: ['pe5'], durationDays: 3, order: 0, subtasks: [] },
          { id: 'pe10', type: 'task', nameKey: 'tpl.np.e10', name: 'Deploy', responsible: 'Dev', dependsOn: ['pe8'], durationDays: 2, order: 1, subtasks: [] },
          { id: 'pe11', type: 'task', nameKey: 'tpl.np.e11', name: 'Documentação', responsible: 'OE', dependsOn: ['pe5'], durationDays: 3, order: 2, subtasks: [] },
          { id: 'pe12', type: 'milestone', nameKey: 'tpl.np.e12', name: 'Go live', responsible: 'OE', dependsOn: ['pe8', 'pe9', 'pe10', 'pe11'], order: 3, subtasks: [] },
        ],
      },
      {
        id: 'pp4', nameKey: 'tpl.np.p4', name: 'Estabilização', order: 3,
        entries: [
          { id: 'pe13', type: 'task', nameKey: 'tpl.np.e13', name: 'Operação Assistida', responsible: 'OE', dependsOn: ['pe12'], durationDays: 10, order: 0, subtasks: [] },
        ],
      },
    ],
  },
]

// ─── store interface ─────────────────────────────────────────────────────────

interface AppStore {
  projects: Project[]
  projectsLoading: boolean
  projectSaving: boolean
  archivedProjects: Project[]
  archivedProjectsLoaded: boolean
  settings: AppSettings
  teamDirectory: DbProfile[]
  invitedUsers: DbInvitedUser[]
  notifications: DbNotification[]
  clients: Client[]
  clientsLoading: boolean
  archivedClients: Client[]
  archivedClientsLoaded: boolean
  contacts: ClientContact[]
  contactsLoading: boolean
  incidents: Incident[]
  incidentsLoading: boolean

  // Load / archive
  loadProjects: () => Promise<void>
  loadSettings: () => Promise<void>
  loadArchivedProjects: () => Promise<void>
  loadTeamDirectory: () => Promise<void>
  loadInvitedUsers: () => Promise<void>
  loadClients: () => Promise<void>
  loadArchivedClients: () => Promise<void>
  loadContacts: () => Promise<void>
  archiveClient: (id: string) => Promise<void>
  unarchiveClient: (id: string) => Promise<void>
  loadIncidents: () => Promise<void>

  // Users (Base de usuários)
  inviteUser: (data: { email: string; name?: string; role: UserRole }) => Promise<void>
  deleteInvite: (id: string) => Promise<void>
  updateProfileRole: (id: string, role: UserRole) => Promise<void>
  setProfileActive: (id: string, active: boolean) => Promise<void>

  // Notifications
  loadNotifications: () => Promise<void>
  markNotificationRead: (id: string) => Promise<void>
  markAllNotificationsRead: () => Promise<void>

  // Clients (Carteira)
  createClient: (data: { name: string; country?: string; ploomesLink?: string; notes?: string; status?: ClientStatus; owners?: EntryOwner[] }) => string
  updateClient: (id: string, patch: Partial<Client>) => void
  deleteClient: (id: string) => void
  // Contacts (shared base — Fase 8.7)
  createContact: (data: { name: string; role?: string; email?: string; phone?: string; clientIds?: string[] }) => string
  updateContact: (id: string, patch: Partial<Omit<ClientContact, 'id' | 'clientIds'>>) => void
  deleteContact: (id: string) => void
  linkContactToClient: (contactId: string, clientId: string) => void
  unlinkContactFromClient: (contactId: string, clientId: string) => void
  addCsAssignment: (clientId: string, assignment: Omit<ClientCsAssignment, 'id'>) => void
  updateCsAssignment: (clientId: string, assignmentId: string, patch: Partial<ClientCsAssignment>) => void
  removeCsAssignment: (clientId: string, assignmentId: string) => void

  // Incidents (Sustentação)
  createIncident: (data: { title: string; description?: string; owner?: EntryOwner; priority: 'low' | 'medium' | 'high'; impact: 'low' | 'medium' | 'high'; deadline?: string; clientIds?: string[]; projectIds?: string[] }) => string
  updateIncident: (id: string, patch: Partial<Incident>) => void
  deleteIncident: (id: string) => void
  updateIncidentStatus: (id: string, status: IncidentStatus) => void
  linkIncidentClient: (incidentId: string, clientId: string) => void
  unlinkIncidentClient: (incidentId: string, clientId: string) => void
  linkIncidentProject: (incidentId: string, projectId: string) => void
  unlinkIncidentProject: (incidentId: string, projectId: string) => void
  addIncidentStakeholder: (incidentId: string, owner: EntryOwner) => void
  removeIncidentStakeholder: (incidentId: string, ownerId: string) => void

  // Incident entries (Tasks) — flat, no phases/subtasks UI, but reuses the full Entry engine
  addIncidentEntry: (incidentId: string, entryData: Omit<Entry, 'id' | 'isCritical' | 'subtasks' | 'comments' | 'links'>) => void
  updateIncidentEntry: (incidentId: string, entryId: string, patch: Partial<Entry>) => void
  deleteIncidentEntry: (incidentId: string, entryId: string) => void
  updateIncidentEntryStatus: (incidentId: string, entryId: string, status: EntryStatus) => void
  changeIncidentEntryDate: (incidentId: string, entryId: string, field: 'plannedStart' | 'plannedEnd' | 'plannedDate' | 'actualStart' | 'actualEnd', value: string) => void
  archiveProject: (id: string) => Promise<void>
  unarchiveProject: (id: string) => Promise<void>
  hideProject: (id: string) => Promise<void>

  // Projects
  createProject: (data: Omit<Project, 'id' | 'phases' | 'risks' | 'delayLog' | 'team' | 'links' | 'status'>) => string
  duplicateProject: (source: Project, overrides: { name: string; client: string; clientId?: string; pm: string; pmMemberId?: string; language: AppLanguage; devLead?: string; devLeadMemberId?: string; devType?: 'integration' | 'application'; devIntegration?: string }) => string
  updateProject: (id: string, patch: Partial<Project>) => void
  deleteProject: (id: string) => void
  importProject: (project: Project) => void

  // Phases
  addPhase: (projectId: string, name: string) => void
  updatePhase: (projectId: string, phaseId: string, patch: Partial<Phase>) => void
  deletePhase: (projectId: string, phaseId: string) => void
  reorderPhases: (projectId: string, phases: Phase[]) => void

  // Entries
  addEntry: (projectId: string, phaseId: string, entry: Omit<Entry, 'id' | 'isCritical' | 'comments' | 'links' | 'subtasks'>) => void
  /** Like addEntry, but for tasks with no phase (only valid when hiddenFromPlan) —
   *  creates/reuses the project's hidden "Sem fase" bucket phase. */
  addUnassignedEntry: (projectId: string, entry: Omit<Entry, 'id' | 'isCritical' | 'comments' | 'links' | 'subtasks'>) => void
  /** Moves an existing entry into the project's hidden "Sem fase" bucket phase. */
  moveEntryToUnassignedPhase: (projectId: string, fromPhaseId: string, entryId: string) => void
  addSubtask: (projectId: string, phaseId: string, parentId: string, entry: Omit<Entry, 'id' | 'isCritical' | 'comments' | 'links' | 'subtasks'>) => void
  updateEntry: (projectId: string, entryId: string, patch: Partial<Entry>) => void
  deleteEntry: (projectId: string, phaseId: string, entryId: string) => void
  moveEntryToPhase: (projectId: string, fromPhaseId: string, toPhaseId: string, entryId: string) => void
  reorderEntry: (projectId: string, fromPhaseId: string, toPhaseId: string, entryId: string, beforeEntryId: string | null) => void
  convertToSubtask: (projectId: string, phaseId: string, entryId: string, parentEntryId: string) => void
  promoteSubtaskToEntry: (projectId: string, phaseId: string, parentEntryId: string, subtaskId: string) => void
  updateEntryStatus: (projectId: string, entryId: string, status: EntryStatus) => void
  resetStatusOverride: (projectId: string, entryId: string) => void
  recalculateStatuses: (projectId: string) => void
  updateEntryRisk: (projectId: string, entryId: string, flag: RiskFlag) => void

  // Date changes (triggers cascade + delay log)
  changeEntryDate: (
    projectId: string,
    entryId: string,
    field: 'plannedStart' | 'plannedEnd' | 'plannedDate' | 'actualStart' | 'actualEnd',
    value: string,
    justification?: { description: string; responsibility: DelayLogEntry['responsibility']; type: DelayLogEntry['type'] },
  ) => void

  // Baseline
  setBaseline: (projectId: string) => void
  clearBaseline: (projectId: string) => void

  // Risks
  addRisk: (projectId: string, risk: Omit<Risk, 'id'>) => void
  updateRisk: (projectId: string, riskId: string, patch: Partial<Risk>) => void
  deleteRisk: (projectId: string, riskId: string) => void

  // Action Tasks (on risks)
  addActionTask: (projectId: string, riskId: string, task: Omit<ActionTask, 'id'>) => void
  updateActionTask: (projectId: string, riskId: string, taskId: string, patch: Partial<ActionTask>) => void
  toggleActionTask: (projectId: string, riskId: string, taskId: string) => void
  deleteActionTask: (projectId: string, riskId: string, taskId: string) => void

  // Manual delay log entry
  addDelayLogEntry: (projectId: string, entry: Omit<DelayLogEntry, 'id'>) => void
  updateDelayLogEntry: (projectId: string, entryId: string, patch: Partial<Omit<DelayLogEntry, 'id'>>) => void
  deleteDelayLogEntry: (projectId: string, entryId: string) => void

  // Column visibility
  setColumnVisibility: (projectId: string, visibility: Record<string, boolean>) => void

  // Team
  addTeamMember: (projectId: string, member: Omit<TeamMember, 'id'>) => void
  updateTeamMember: (projectId: string, memberId: string, patch: Partial<TeamMember>) => void
  removeTeamMember: (projectId: string, memberId: string) => void

  // Project links
  addProjectLink: (projectId: string, link: Omit<Link, 'id'>) => void
  removeProjectLink: (projectId: string, linkId: string) => void

  // Entry links
  addEntryLink: (projectId: string, entryId: string, link: Omit<Link, 'id'>) => void
  removeEntryLink: (projectId: string, entryId: string, linkId: string) => void

  // Comments
  addComment: (projectId: string, entryId: string, comment: Omit<EntryComment, 'id'>) => void
  removeComment: (projectId: string, entryId: string, commentId: string) => void

  // Settings
  updateSettings: (patch: Partial<AppSettings>) => void
  updateTemplate: (template: ProjectTemplate) => void
  createIncidentTemplate: (data: Omit<IncidentTemplate, 'id'>) => string
  updateIncidentTemplate: (template: IncidentTemplate) => void
  deleteIncidentTemplate: (id: string) => void
  addHoliday: (date: string, name?: string) => void
  removeHoliday: (date: string) => void

  // Diary — Open Points
  addOpenPoint: (scope: DiaryScope, op: Omit<OpenPoint, 'id' | 'comments' | 'attachments' | 'createdAt'>) => void
  updateOpenPoint: (scope: DiaryScope, opId: string, patch: Partial<OpenPoint>) => void
  resolveOpenPoint: (scope: DiaryScope, opId: string, resolution: string, resolvedBy: string) => void
  deleteOpenPoint: (scope: DiaryScope, opId: string) => void

  // Diary — Meetings
  addMeetingLog: (projectId: string, meeting: Omit<MeetingLog, 'id' | 'comments' | 'attachments' | 'createdAt'>) => void
  updateMeetingLog: (projectId: string, meetingId: string, patch: Partial<MeetingLog>) => void
  deleteMeetingLog: (projectId: string, meetingId: string) => void
  addMeetingItem: (projectId: string, meetingId: string, item: Omit<MeetingItem, 'id'>) => void
  updateMeetingItem: (projectId: string, meetingId: string, itemId: string, patch: Partial<MeetingItem>) => void
  deleteMeetingItem: (projectId: string, meetingId: string, itemId: string) => void

  // Diary — History
  addHistoryEntry: (scope: DiaryScope, entry: Omit<HistoryEntry, 'id' | 'comments' | 'createdAt'>) => void
  updateHistoryEntry: (scope: DiaryScope, entryId: string, patch: Partial<HistoryEntry>) => void
  deleteHistoryEntry: (scope: DiaryScope, entryId: string) => void

  // Diary — Comments (on open_points, meetings, history)
  addDiaryComment: (scope: DiaryScope, parentType: 'open_point' | 'meeting' | 'history', parentId: string, comment: Omit<DiaryComment, 'id' | 'createdAt'>) => void
  deleteDiaryComment: (scope: DiaryScope, parentType: 'open_point' | 'meeting' | 'history', parentId: string, commentId: string) => void

  // Diary — Attachments (local state only; storage handled by FileAttachments component)
  addDiaryAttachment: (scope: DiaryScope, parentType: 'open_point' | 'meeting', parentId: string, attachment: FileAttachment) => void
  removeDiaryAttachment: (scope: DiaryScope, parentType: 'open_point' | 'meeting', parentId: string, attachmentId: string) => void
}

// ─── local helpers ────────────────────────────────────────────────────────────

function mutateProject(projects: Project[], id: string, fn: (p: Project) => Project): Project[] {
  return projects.map((p) => (p.id === id ? fn(p) : p))
}

function mutateClient(clients: Client[], id: string, fn: (c: Client) => Client): Client[] {
  return clients.map((c) => (c.id === id ? fn(c) : c))
}

function mutateIncident(incidents: Incident[], id: string, fn: (i: Incident) => Incident): Incident[] {
  return incidents.map((i) => (i.id === id ? fn(i) : i))
}

function findEntryDeep(phases: Phase[], entryId: string): Entry | undefined {
  for (const phase of phases) {
    for (const entry of phase.entries) {
      if (entry.id === entryId) return entry
      const sub = entry.subtasks.find((s) => s.id === entryId)
      if (sub) return sub
    }
  }
}

function refreshCriticalPath(project: Project): Project {
  return { ...project, phases: applyIsCritical(project.phases) }
}

// ─── DB sync helpers ──────────────────────────────────────────────────────────

function getUserId(): string {
  const { user } = useAuthStore.getState()
  if (!user?.id) throw new Error('Usuário não autenticado')
  return user.id
}

/** Fire-and-forget: creates a notification row for another user. Never notifies yourself. */
function notifyUser(userId: string, message: string, link?: string): void {
  const { user } = useAuthStore.getState()
  if (!userId || userId === user?.id) return
  supabase.from('notifications').insert({ user_id: userId, message, link: link ?? null }).then(({ error }) => {
    if (error) console.error('Falha ao criar notificação:', error.message)
  })
}

/** Notifies the entry's Validador the moment a task enters the "Validação/Teste" stage —
 *  only fires on the transition into it, not on every subsequent save while it sits there. */
function notifyValidatorOnValidationEntry(
  prevStatus: EntryStatus | undefined, nextStatus: EntryStatus | undefined,
  owners: EntryOwner[] | undefined, entryName: string, link: string,
): void {
  if (nextStatus !== 'validation' || prevStatus === 'validation') return
  const validator = owners?.find((o) => o.kind === 'validator' && o.memberId)
  if (validator?.memberId) notifyUser(validator.memberId, `Tarefa "${entryName}" está pronta para validação`, link)
}

/** Notifies a client's current CS (latest csHistory assignment) and its Owners —
 *  used when a project linked to that client gets a phase created/renamed. */
function notifyClientCsAndOwners(clients: Client[], clientId: string | undefined, message: string, link: string): void {
  if (!clientId) return
  const client = clients.find((c) => c.id === clientId)
  if (!client) return
  const notified = new Set<string>()
  for (const owner of client.owners) {
    if (owner.memberId && !notified.has(owner.memberId)) {
      notified.add(owner.memberId)
      notifyUser(owner.memberId, message, link)
    }
  }
  if (client.csHistory.length > 0) {
    const currentCs = [...client.csHistory].sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))[0]
    if (currentCs.owner.memberId && !notified.has(currentCs.owner.memberId)) {
      notifyUser(currentCs.owner.memberId, message, link)
    }
  }
}

/** Notifies newly-added `type: 'member'` owners that weren't in the previous owner list. */
function notifyNewOwners(prevOwners: EntryOwner[] | undefined, nextOwners: EntryOwner[] | undefined, message: string, link: string): void {
  if (!nextOwners) return
  const prevMemberIds = new Set((prevOwners ?? []).filter((o) => o.type === 'member' && o.memberId).map((o) => o.memberId))
  for (const owner of nextOwners) {
    if (owner.type === 'member' && owner.memberId && !prevMemberIds.has(owner.memberId)) {
      notifyUser(owner.memberId, message, link)
    }
  }
}

/** Raw `history` table insert — split out of addHistoryEntry() so callers that need the
 *  parent row (e.g. a just-created project) to exist first can await it in sequence instead
 *  of racing it, which previously could trip `history_project_id_fkey` if the parent insert
 *  hadn't committed yet. */
async function insertHistoryRow(scope: DiaryScope, entry: HistoryEntry): Promise<void> {
  const authUser = useAuthStore.getState().user
  const { error } = await supabase.from('history').insert({
    id: entry.id,
    project_id: scope.type === 'project' ? scope.id : null,
    incident_id: scope.type === 'incident' ? scope.id : null,
    type: entry.isManualNote ? 'manual' : 'auto',
    event: entry.event,
    title: entry.title,
    detail: entry.detail ?? null,
    linked_id: entry.linkedId ?? null,
    linked_type: entry.linkedType ?? null,
    author_id: authUser?.id ?? null,
    author_name: authUser?.user_metadata?.full_name ?? authUser?.email ?? null,
    author_avatar: authUser?.user_metadata?.avatar_url ?? null,
    date: entry.createdAt,
  })
  if (error) throw new Error(error.message)
}

/**
 * Fire-and-forget async DB call.
 * On error: optionally reverts local state, then shows toast.
 */
function sync(fn: () => Promise<void>, revert?: () => void): void {
  fn().catch((err) => {
    revert?.()
    useToastStore.getState().addToast(
      err instanceof Error ? err.message : 'Erro ao salvar'
    )
  })
}

async function dbSyncProjectRow(project: Project, userId: string): Promise<void> {
  const flat = storeProjectToDb(project, userId)
  const { created_at, created_by, ...updateFields } = flat.project
  const { error } = await supabase
    .from('projects')
    .update({ ...updateFields, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', project.id)
  if (error) throw new Error(error.message)
}

async function dbSyncEntry(project: Project, entryId: string, userId: string): Promise<void> {
  for (const phase of project.phases) {
    const entry = phase.entries.find((e) => e.id === entryId)
    if (entry) {
      const row = storeEntryToDb(entry, phase.id, project.id, userId)
      const { created_at, created_by, ...updateFields } = row
      const { error } = await supabase
        .from('entries')
        .update({ ...updateFields, updated_at: new Date().toISOString() })
        .eq('id', entryId)
      if (error) throw new Error(error.message)
      return
    }
    const parentEntry = phase.entries.find((e) => e.subtasks.some((s) => s.id === entryId))
    if (parentEntry) {
      const row = storeEntryToDb(parentEntry, phase.id, project.id, userId)
      const { created_at, created_by, ...updateFields } = row
      const { error } = await supabase
        .from('entries')
        .update({ ...updateFields, updated_at: new Date().toISOString() })
        .eq('id', parentEntry.id)
      if (error) throw new Error(error.message)
      return
    }
  }
}

async function dbSyncAllEntries(project: Project, userId: string): Promise<void> {
  const rows = project.phases.flatMap((ph) =>
    ph.entries.map((e) => storeEntryToDb(e, ph.id, project.id, userId))
  )
  if (!rows.length) return
  const { error } = await supabase.from('entries').upsert(rows)
  if (error) throw new Error(error.message)
}

// ─── Incident entry sync helpers (mirror the project ones above, flat — no phases) ──

function refreshIncidentCriticalPath(incident: Incident): Incident {
  const [wrapped] = applyIsCritical([{ id: '_incident', name: '', order: 0, entries: incident.entries }])
  return { ...incident, entries: wrapped.entries }
}

async function dbSyncIncidentEntry(incident: Incident, entryId: string, userId: string): Promise<void> {
  const entry = incident.entries.find((e) => e.id === entryId)
  if (entry) {
    const row = storeEntryToDb(entry, null, null, userId, incident.id)
    const { created_at, created_by, ...updateFields } = row
    const { error } = await supabase.from('entries').update({ ...updateFields, updated_at: new Date().toISOString() }).eq('id', entryId)
    if (error) throw new Error(error.message)
    return
  }
  const parentEntry = incident.entries.find((e) => e.subtasks.some((s) => s.id === entryId))
  if (parentEntry) {
    const row = storeEntryToDb(parentEntry, null, null, userId, incident.id)
    const { created_at, created_by, ...updateFields } = row
    const { error } = await supabase.from('entries').update({ ...updateFields, updated_at: new Date().toISOString() }).eq('id', parentEntry.id)
    if (error) throw new Error(error.message)
  }
}

async function dbSyncAllIncidentEntries(incident: Incident, userId: string): Promise<void> {
  const rows = incident.entries.map((e) => storeEntryToDb(e, null, null, userId, incident.id))
  if (!rows.length) return
  const { error } = await supabase.from('entries').upsert(rows)
  if (error) throw new Error(error.message)
}

async function dbSyncRisk(projectId: string, risk: Risk, userId: string): Promise<void> {
  const row = storeRiskToDb(risk, projectId, userId)
  const { created_at, created_by, ...updateFields } = row
  const { error } = await supabase
    .from('risks')
    .update({ ...updateFields, updated_at: new Date().toISOString() })
    .eq('id', risk.id)
  if (error) throw new Error(error.message)
}

async function syncGlobalSettings(settings: AppSettings, userId: string): Promise<void> {
  const value = {
    holidays: settings.holidays,
    holidayNames: settings.holidayNames,
    defaultLanguage: settings.defaultLanguage,
    dateFormat: settings.dateFormat,
    workdays: settings.workdays,
  }
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'config', value, updated_at: new Date().toISOString(), updated_by: userId }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}

// ─── store ───────────────────────────────────────────────────────────────────

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      projects: [],
      projectsLoading: false,
      projectSaving: false,
      archivedProjects: [],
      archivedProjectsLoaded: false,
      teamDirectory: [],
      invitedUsers: [],
      notifications: [],
      clients: [],
      clientsLoading: false,
      archivedClients: [],
      archivedClientsLoaded: false,
      contacts: [],
      contactsLoading: false,
      incidents: [],
      incidentsLoading: false,
      settings: {
        holidays: [],
        holidayNames: {},
        templates: DEFAULT_TEMPLATES,
        incidentTemplates: [],
        defaultLanguage: 'pt',
        dateFormat: 'DD/MM/YYYY',
        workdays: 'mon-fri',
      },

      // ── Load / Settings ───────────────────────────────────────────────────

      async loadProjects() {
        set({ projectsLoading: true })
        try {
          const { data: projectRows, error: projError } = await supabase
            .from('projects')
            .select('*')
            .eq('archived', false)
            .order('created_at')

          if (projError) throw new Error(projError.message)
          if (!projectRows?.length) {
            set({ projects: [], projectsLoading: false })
            return
          }

          const ids = projectRows.map((p) => p.id)

          const [phasesRes, entriesRes, commentsRes, risksRes, delayRes, openPointsRes, meetingLogsRes, historyRes, diaryCommentsRes] = await Promise.all([
            supabase.from('phases').select('*').in('project_id', ids),
            supabase.from('entries').select('*').in('project_id', ids),
            supabase.from('comments').select('*').in('project_id', ids),
            supabase.from('risks').select('*').in('project_id', ids),
            supabase.from('delay_log').select('*').in('project_id', ids),
            supabase.from('open_points').select('*').in('project_id', ids).order('created_at', { ascending: false }),
            supabase.from('meeting_logs').select('*').in('project_id', ids).order('date', { ascending: false }),
            supabase.from('history').select('*').in('project_id', ids).order('date', { ascending: false }),
            supabase.from('diary_comments').select('*').in('project_id', ids),
          ])

          const phases = phasesRes.data ?? []
          const entries = entriesRes.data ?? []
          const comments = commentsRes.data ?? []
          const risks = risksRes.data ?? []
          const delay_log = delayRes.data ?? []
          const open_points = openPointsRes.data ?? []
          const meeting_logs = meetingLogsRes.data ?? []
          const history = historyRes.data ?? []
          const diary_comments = diaryCommentsRes.data ?? []

          const projects = projectRows.map((project) =>
            dbProjectToStore({
              project,
              phases: phases.filter((ph) => ph.project_id === project.id),
              entries: entries.filter((e) => e.project_id === project.id),
              comments: comments.filter((c) => c.project_id === project.id),
              delay_log: delay_log.filter((d) => d.project_id === project.id),
              risks: risks.filter((r) => r.project_id === project.id),
              open_points: open_points.filter((op) => op.project_id === project.id),
              meeting_logs: meeting_logs.filter((m) => m.project_id === project.id),
              history: history.filter((h) => h.project_id === project.id),
              diary_comments: diary_comments.filter((c) => c.project_id === project.id),
            } as DbProjectFull)
          )

          set({ projects, projectsLoading: false })
        } catch (err) {
          useToastStore.getState().addToast(
            err instanceof Error ? err.message : 'Erro ao carregar projetos'
          )
          set({ projectsLoading: false })
        }
      },

      async loadSettings() {
        try {
          const { data } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'config')
            .single()
          if (!data?.value) return
          const v = data.value as Partial<AppSettings>
          set((s) => ({
            settings: {
              ...s.settings,
              ...(v.holidays !== undefined && { holidays: v.holidays }),
              ...(v.holidayNames !== undefined && { holidayNames: v.holidayNames }),
              ...(v.defaultLanguage !== undefined && { defaultLanguage: v.defaultLanguage }),
              ...(v.dateFormat !== undefined && { dateFormat: v.dateFormat }),
              ...(v.workdays !== undefined && { workdays: v.workdays }),
            },
          }))
        } catch {
          // silently fail — settings will use defaults
        }
      },

      async loadTeamDirectory() {
        try {
          const { data } = await supabase.from('profiles').select('*').order('name')
          set({ teamDirectory: data ?? [] })
        } catch {
          // silently fail — directory picker just won't offer any registered users
        }
      },

      async loadInvitedUsers() {
        try {
          const { data } = await supabase.from('invited_users').select('*').order('invited_at', { ascending: false })
          set({ invitedUsers: data ?? [] })
        } catch {
          // silently fail — non-admins get a permission error from RLS, that's expected
        }
      },

      async inviteUser(data) {
        const userId = getUserId()
        const { data: row, error } = await supabase
          .from('invited_users')
          .insert({ email: data.email.trim().toLowerCase(), name: data.name?.trim() || null, role: data.role, invited_by: userId })
          .select()
          .single()
        if (error) {
          useToastStore.getState().addToast(error.message)
          return
        }
        set((s) => ({ invitedUsers: [row as DbInvitedUser, ...s.invitedUsers] }))
      },

      async deleteInvite(id) {
        const prev = get().invitedUsers
        set((s) => ({ invitedUsers: s.invitedUsers.filter((i) => i.id !== id) }))
        const { error } = await supabase.from('invited_users').delete().eq('id', id)
        if (error) {
          set({ invitedUsers: prev })
          useToastStore.getState().addToast(error.message)
        }
      },

      async updateProfileRole(id, role) {
        const prev = get().teamDirectory
        set((s) => ({ teamDirectory: s.teamDirectory.map((p) => p.id === id ? { ...p, role } : p) }))
        const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
        if (error) {
          set({ teamDirectory: prev })
          useToastStore.getState().addToast(error.message)
        }
      },

      async setProfileActive(id, active) {
        const prev = get().teamDirectory
        set((s) => ({ teamDirectory: s.teamDirectory.map((p) => p.id === id ? { ...p, active } : p) }))
        const { error } = await supabase.from('profiles').update({ active }).eq('id', id)
        if (error) {
          set({ teamDirectory: prev })
          useToastStore.getState().addToast(error.message)
        }
      },

      async loadNotifications() {
        try {
          const userId = getUserId()
          const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(30)
          if (error) throw new Error(error.message)
          set({ notifications: data ?? [] })
        } catch {
          // silently fail — not signed in yet, or table not migrated
        }
      },

      async markNotificationRead(id) {
        const prev = get().notifications
        set((s) => ({ notifications: s.notifications.map((n) => n.id === id ? { ...n, read: true } : n) }))
        const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id)
        if (error) set({ notifications: prev })
      },

      async markAllNotificationsRead() {
        const prev = get().notifications
        const unreadIds = prev.filter((n) => !n.read).map((n) => n.id)
        if (unreadIds.length === 0) return
        set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) }))
        const { error } = await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
        if (error) set({ notifications: prev })
      },

      async loadClients() {
        set({ clientsLoading: true })
        try {
          const { data: clientRows, error } = await supabase.from('clients').select('*').eq('archived', false).order('name')
          if (error) throw new Error(error.message)
          if (!clientRows?.length) {
            set({ clients: [], clientsLoading: false })
            return
          }
          const ids = clientRows.map((c) => c.id)
          const { data: csHistoryRows, error: csError } = await supabase.from('client_cs_history').select('*').in('client_id', ids)
          if (csError) throw new Error(csError.message)
          const clients = clientRows.map((row) => dbClientToStore(row, csHistoryRows ?? []))
          set({ clients, clientsLoading: false })
        } catch (err) {
          useToastStore.getState().addToast(err instanceof Error ? err.message : 'Erro ao carregar clientes')
          set({ clientsLoading: false })
        }
      },

      async loadContacts() {
        set({ contactsLoading: true })
        try {
          const [contactsRes, linksRes] = await Promise.all([
            supabase.from('contacts').select('*').order('name'),
            supabase.from('contact_clients').select('*'),
          ])
          if (contactsRes.error) throw new Error(contactsRes.error.message)
          if (linksRes.error) throw new Error(linksRes.error.message)
          const links = linksRes.data ?? []
          const contacts = (contactsRes.data ?? []).map((row) => dbClientContactToStore(row, links))
          set({ contacts, contactsLoading: false })
        } catch (err) {
          useToastStore.getState().addToast(err instanceof Error ? err.message : 'Erro ao carregar contatos')
          set({ contactsLoading: false })
        }
      },

      async loadArchivedClients() {
        set({ archivedClientsLoaded: false })
        try {
          const { data, error } = await supabase.from('clients').select('*').eq('archived', true).order('name')
          if (error) throw new Error(error.message)
          const archivedClients = (data ?? []).map((row) => dbClientToStore(row, []))
          set({ archivedClients, archivedClientsLoaded: true })
        } catch (err) {
          useToastStore.getState().addToast(err instanceof Error ? err.message : 'Erro ao carregar clientes arquivados')
          set({ archivedClientsLoaded: true })
        }
      },

      async archiveClient(id) {
        const prev = get().clients
        const client = prev.find((c) => c.id === id)
        set((s) => ({
          clients: s.clients.filter((c) => c.id !== id),
          archivedClients: client ? [...s.archivedClients, { ...client, archived: true }] : s.archivedClients,
        }))
        const { error } = await supabase.from('clients').update({ archived: true }).eq('id', id)
        if (error) {
          set((s) => ({ clients: prev, archivedClients: s.archivedClients.filter((c) => c.id !== id) }))
          useToastStore.getState().addToast(error.message)
        }
      },

      async unarchiveClient(id) {
        const client = get().archivedClients.find((c) => c.id === id)
        if (!client) return
        const prevArchived = get().archivedClients
        set((s) => ({
          archivedClients: s.archivedClients.filter((c) => c.id !== id),
          clients: [...s.clients, { ...client, archived: false }],
        }))
        const { error } = await supabase.from('clients').update({ archived: false }).eq('id', id)
        if (error) {
          set((s) => ({ archivedClients: prevArchived, clients: s.clients.filter((c) => c.id !== id) }))
          useToastStore.getState().addToast(error.message)
        }
      },

      async loadIncidents() {
        set({ incidentsLoading: true })
        try {
          const { data: incidentRows, error } = await supabase.from('incidents').select('*').order('created_at', { ascending: false })
          if (error) throw new Error(error.message)
          if (!incidentRows?.length) {
            set({ incidents: [], incidentsLoading: false })
            return
          }
          const ids = incidentRows.map((i) => i.id)
          const [clientLinksRes, projectLinksRes, stakeholdersRes, entriesRes, openPointsRes, historyRes, diaryCommentsRes] = await Promise.all([
            supabase.from('incident_clients').select('*').in('incident_id', ids),
            supabase.from('incident_projects').select('*').in('incident_id', ids),
            supabase.from('incident_stakeholders').select('*').in('incident_id', ids),
            supabase.from('entries').select('*').in('incident_id', ids),
            supabase.from('open_points').select('*').in('incident_id', ids),
            supabase.from('history').select('*').in('incident_id', ids),
            supabase.from('diary_comments').select('*').in('incident_id', ids),
          ])
          const clientLinks = clientLinksRes.data ?? []
          const projectLinks = projectLinksRes.data ?? []
          const stakeholders = stakeholdersRes.data ?? []
          const entries = entriesRes.data ?? []
          const entryIds = entries.map((e) => e.id)
          const commentsRes = entryIds.length > 0
            ? await supabase.from('comments').select('*').in('entry_id', entryIds)
            : { data: [] }
          const comments = commentsRes.data ?? []
          const openPoints = openPointsRes.data ?? []
          const history = historyRes.data ?? []
          const diaryComments = diaryCommentsRes.data ?? []
          const incidents = incidentRows.map((incident) =>
            dbIncidentToStore({ incident, clientLinks, projectLinks, stakeholders, entries, comments, openPoints, history, diaryComments } as DbIncidentFull)
          )
          set({ incidents, incidentsLoading: false })
        } catch (err) {
          useToastStore.getState().addToast(err instanceof Error ? err.message : 'Erro ao carregar incidentes')
          set({ incidentsLoading: false })
        }
      },

      async archiveProject(id) {
        const prev = get().projects
        const project = prev.find((p) => p.id === id)
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
          archivedProjects: project
            ? [...s.archivedProjects, { ...project, archived: true }]
            : s.archivedProjects,
        }))
        const { error } = await supabase
          .from('projects')
          .update({ archived: true, updated_at: new Date().toISOString() })
          .eq('id', id)
        if (error) {
          set((s) => ({
            projects: prev,
            archivedProjects: s.archivedProjects.filter((p) => p.id !== id),
          }))
          useToastStore.getState().addToast(error.message)
        }
      },

      async loadArchivedProjects() {
        set({ archivedProjectsLoaded: false })
        try {
          const { data: projectRows, error } = await supabase
            .from('projects')
            .select('*')
            .eq('archived', true)
            .eq('hidden', false)
            .order('updated_at', { ascending: false })
          if (error) throw new Error(error.message)
          if (!projectRows?.length) {
            set({ archivedProjects: [], archivedProjectsLoaded: true })
            return
          }
          const ids = projectRows.map((p) => p.id)
          const [phasesRes, entriesRes, commentsRes, risksRes, delayRes, openPointsRes, meetingLogsRes, historyRes, diaryCommentsRes] = await Promise.all([
            supabase.from('phases').select('*').in('project_id', ids),
            supabase.from('entries').select('*').in('project_id', ids),
            supabase.from('comments').select('*').in('project_id', ids),
            supabase.from('risks').select('*').in('project_id', ids),
            supabase.from('delay_log').select('*').in('project_id', ids),
            supabase.from('open_points').select('*').in('project_id', ids).order('created_at', { ascending: false }),
            supabase.from('meeting_logs').select('*').in('project_id', ids).order('date', { ascending: false }),
            supabase.from('history').select('*').in('project_id', ids).order('date', { ascending: false }),
            supabase.from('diary_comments').select('*').in('project_id', ids),
          ])
          const archivedProjects = projectRows.map((project) =>
            dbProjectToStore({
              project,
              phases: (phasesRes.data ?? []).filter((ph) => ph.project_id === project.id),
              entries: (entriesRes.data ?? []).filter((e) => e.project_id === project.id),
              comments: (commentsRes.data ?? []).filter((c) => c.project_id === project.id),
              delay_log: (delayRes.data ?? []).filter((d) => d.project_id === project.id),
              risks: (risksRes.data ?? []).filter((r) => r.project_id === project.id),
              open_points: (openPointsRes.data ?? []).filter((op) => op.project_id === project.id),
              meeting_logs: (meetingLogsRes.data ?? []).filter((m) => m.project_id === project.id),
              history: (historyRes.data ?? []).filter((h) => h.project_id === project.id),
              diary_comments: (diaryCommentsRes.data ?? []).filter((c) => c.project_id === project.id),
            } as DbProjectFull)
          )
          set({ archivedProjects, archivedProjectsLoaded: true })
        } catch (err) {
          useToastStore.getState().addToast(err instanceof Error ? err.message : 'Erro ao carregar projetos arquivados')
          set({ archivedProjectsLoaded: true })
        }
      },

      async unarchiveProject(id) {
        const project = get().archivedProjects.find((p) => p.id === id)
        if (!project) return
        const palette = ['#F59E0B','#10B981','#3B82F6','#8B5CF6','#EC4899','#EF4444','#06B6D4','#84CC16']
        const color = palette[get().projects.length % palette.length]
        const prevArchived = get().archivedProjects
        set((s) => ({
          archivedProjects: s.archivedProjects.filter((p) => p.id !== id),
          projects: [...s.projects, { ...project, archived: false, color }],
        }))
        const { error } = await supabase
          .from('projects')
          .update({ archived: false, updated_at: new Date().toISOString() })
          .eq('id', id)
        if (error) {
          set((s) => ({
            archivedProjects: prevArchived,
            projects: s.projects.filter((p) => p.id !== id),
          }))
          useToastStore.getState().addToast(error.message)
        }
      },

      async hideProject(id) {
        const prevArchived = get().archivedProjects
        set((s) => ({ archivedProjects: s.archivedProjects.filter((p) => p.id !== id) }))
        const { error } = await supabase
          .from('projects')
          .update({ hidden: true, updated_at: new Date().toISOString() })
          .eq('id', id)
        if (error) {
          set({ archivedProjects: prevArchived })
          useToastStore.getState().addToast(error.message)
        }
      },

      // ── Projects ──────────────────────────────────────────────────────────

      createProject(data) {
        const id = uuid()
        const { settings } = get()
        const template = settings.templates.find((t) => t.type === data.type)
        const today = new Date().toISOString().split('T')[0]

        let phases: Phase[] = []

        if (template) {
          const idMap = new Map<string, string>()

          phases = template.phases.map((tp) => {
            const entries: Entry[] = tp.entries.map((te) => {
              const newId = uuid()
              idMap.set(te.id, newId)
              return {
                id: newId,
                type: te.type,
                name: te.nameKey ? i18n.t(te.nameKey, { lng: data.language }) : te.name,
                responsible: te.responsible,
                dependsOn: [],
                isCritical: false,
                plannedStart: te.type === 'task' ? today : undefined,
                plannedEnd: te.type === 'task' ? today : undefined,
                plannedDate: te.type !== 'task' ? today : undefined,
                durationDays: te.durationDays,
                durationHours: te.durationHours,
                riskFlag: 'none',
                status: 'pending',
                subtasks: [],
                comments: [],
                links: [],
                order: te.order,
              }
            })
            return { id: uuid(), name: tp.nameKey ? i18n.t(tp.nameKey, { lng: data.language }) : tp.name, order: tp.order, entries }
          })

          const allTemplateEntries = template.phases.flatMap((p) => p.entries)
          for (const phase of phases) {
            for (const entry of phase.entries) {
              const templateEntryId = [...idMap.entries()].find(([, newId]) => newId === entry.id)?.[0]
              const te = allTemplateEntries.find((e) => e.id === templateEntryId)
              if (te) {
                entry.dependsOn = te.dependsOn.map((oldId) => idMap.get(oldId) ?? oldId).filter(Boolean)
              }
            }
          }

          phases = applyIsCritical(phases)
        }

        const palette = ['#F59E0B','#10B981','#3B82F6','#8B5CF6','#EC4899','#EF4444','#06B6D4','#84CC16']
        const color = palette[get().projects.length % palette.length]

        const project: Project = {
          ...data,
          id,
          color,
          phases,
          risks: [],
          delayLog: [],
          team: [],
          links: [],
          status: 'planning',
        }

        const prevProjects = get().projects
        const historyEntry: HistoryEntry = {
          id: uuid(), event: 'project_created', title: data.name, comments: [], createdAt: new Date().toISOString(),
        }
        set((s) => ({
          projects: [...s.projects, { ...project, history: [historyEntry] }],
          projectSaving: true,
        }))

        ;(async () => {
          try {
            const userId = getUserId()
            const flat = storeProjectToDb(project, userId)
            const { error: pe } = await supabase.from('projects').insert(flat.project)
            if (pe) throw new Error(pe.message)
            if (flat.phases.length) {
              const { error: phe } = await supabase.from('phases').insert(flat.phases)
              if (phe) throw new Error(phe.message)
            }
            if (flat.entries.length) {
              const { error: ee } = await supabase.from('entries').insert(flat.entries)
              if (ee) throw new Error(ee.message)
            }
          } catch (err) {
            set({ projects: prevProjects })
            useToastStore.getState().addToast(
              err instanceof Error ? err.message : 'Erro ao criar projeto'
            )
            return
          } finally {
            set({ projectSaving: false })
          }

          // Only insert the "project_created" history row once the project row itself
          // is confirmed in the DB — doing this earlier/concurrently could violate
          // history_project_id_fkey if the project insert above failed or was still in flight.
          insertHistoryRow({ type: 'project', id }, historyEntry).catch((err) => {
            useToastStore.getState().addToast(err instanceof Error ? err.message : 'Erro ao salvar histórico')
          })
        })()

        return id
      },

      updateProject(id, patch) {
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, id, (p) => ({ ...p, ...patch })),
        }))
        sync(async () => {
          const project = get().projects.find((p) => p.id === id)
          if (!project) return
          await dbSyncProjectRow(project, getUserId())
        }, () => set({ projects: prev }))
      },

      deleteProject(id) {
        const prev = get().projects
        set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }))
        sync(async () => {
          const { error } = await supabase.from('projects').delete().eq('id', id)
          if (error) throw new Error(error.message)
        }, () => set({ projects: prev }))
      },

      importProject(project) {
        const prevProjects = get().projects
        set((s) => ({ projects: [...s.projects, project], projectSaving: true }))
        ;(async () => {
          try {
            const userId = getUserId()
            const flat = storeProjectToDb(project, userId)
            await supabase.from('projects').upsert(flat.project)
            if (flat.phases.length) await supabase.from('phases').upsert(flat.phases)
            if (flat.entries.length) await supabase.from('entries').upsert(flat.entries)
            if (flat.risks.length) await supabase.from('risks').upsert(flat.risks)
            if (flat.delay_log.length) await supabase.from('delay_log').upsert(flat.delay_log)
            if (flat.comments.length) await supabase.from('comments').upsert(flat.comments)
          } catch (err) {
            set({ projects: prevProjects })
            useToastStore.getState().addToast(
              err instanceof Error ? err.message : 'Erro ao importar projeto'
            )
          } finally {
            set({ projectSaving: false })
          }
        })()
      },

      duplicateProject(source, overrides) {
        const newId = uuid()

        // Pre-map all top-level entry IDs so dependsOn can be remapped
        const entryIdMap = new Map<string, string>()
        for (const phase of source.phases) {
          for (const entry of phase.entries) {
            entryIdMap.set(entry.id, uuid())
          }
        }

        const resetEntry = (entry: Entry): Entry => ({
          ...entry,
          id: entryIdMap.get(entry.id) ?? uuid(),
          dependsOn: entry.dependsOn.map((oldId) => entryIdMap.get(oldId) ?? oldId),
          actualStart: undefined,
          actualEnd: undefined,
          status: 'pending' as EntryStatus,
          statusOverride: false,
          riskFlag: 'none' as RiskFlag,
          comments: [],
          baselineStart: undefined,
          baselineEnd: undefined,
          baselineDate: undefined,
          subtasks: entry.subtasks.map((sub) => ({
            ...sub,
            id: uuid(),
            actualStart: undefined,
            actualEnd: undefined,
            status: 'pending' as EntryStatus,
            statusOverride: false,
            riskFlag: 'none' as RiskFlag,
            comments: [],
            baselineStart: undefined,
            baselineEnd: undefined,
            baselineDate: undefined,
          })),
        })

        const phases = applyIsCritical(
          source.phases.map((ph) => ({
            id: uuid(),
            name: ph.name,
            order: ph.order,
            entries: ph.entries.map(resetEntry),
          }))
        )

        const palette = ['#F59E0B','#10B981','#3B82F6','#8B5CF6','#EC4899','#EF4444','#06B6D4','#84CC16']
        const color = palette[get().projects.length % palette.length]

        const newProject: Project = {
          ...overrides,
          id: newId,
          color,
          type: source.type,
          phases,
          risks: source.risks.map((r) => ({
            ...r,
            id: uuid(),
            actionTasks: r.actionTasks
              .filter((t) => !t.done)
              .map((t) => ({ ...t, id: uuid() })),
          })),
          delayLog: [],
          team: source.team.map((m) => ({ ...m, id: uuid() })),
          links: source.links.map((l) => ({ ...l, id: uuid() })),
          charter: source.charter ? { ...source.charter } : undefined,
          overview: source.overview,
          status: 'planning',
          archived: false,
          baselineSetAt: undefined,
        }

        const prevProjects = get().projects
        set((s) => ({ projects: [...s.projects, newProject], projectSaving: true }))

        ;(async () => {
          try {
            const userId = getUserId()
            const flat = storeProjectToDb(newProject, userId)
            const { error: pe } = await supabase.from('projects').insert(flat.project)
            if (pe) throw new Error(pe.message)
            if (flat.phases.length) {
              const { error: phe } = await supabase.from('phases').insert(flat.phases)
              if (phe) throw new Error(phe.message)
            }
            if (flat.entries.length) {
              const { error: ee } = await supabase.from('entries').insert(flat.entries)
              if (ee) throw new Error(ee.message)
            }
            if (flat.risks.length) {
              const { error: re } = await supabase.from('risks').insert(flat.risks)
              if (re) throw new Error(re.message)
            }
          } catch (err) {
            set({ projects: prevProjects })
            useToastStore.getState().addToast(
              err instanceof Error ? err.message : 'Erro ao duplicar projeto'
            )
          } finally {
            set({ projectSaving: false })
          }
        })()

        return newId
      },

      // ── Phases ────────────────────────────────────────────────────────────

      addPhase(projectId, name) {
        const phaseId = uuid()
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            phases: [
              ...p.phases,
              { id: phaseId, name, order: p.phases.length, entries: [] },
            ],
          })),
        }))
        const project = get().projects.find((p) => p.id === projectId)
        if (project) {
          notifyClientCsAndOwners(get().clients, project.clientId, `Nova fase "${name}" criada em "${project.name}"`, `/projects/${projectId}`)
        }
        sync(async () => {
          const { error } = await supabase.from('phases').insert({
            id: phaseId,
            project_id: projectId,
            name,
            order: get().projects.find((p) => p.id === projectId)?.phases.length ?? 0,
            created_at: new Date().toISOString(),
          })
          if (error) throw new Error(error.message)
        }, () => set({ projects: prev }))
      },

      updatePhase(projectId, phaseId, patch) {
        const prev = get().projects
        const prevPhase = prev.find((p) => p.id === projectId)?.phases.find((ph) => ph.id === phaseId)
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            phases: p.phases.map((ph) => (ph.id === phaseId ? { ...ph, ...patch } : ph)),
          })),
        }))
        if (patch.name && patch.name !== prevPhase?.name) {
          const project = get().projects.find((p) => p.id === projectId)
          if (project) {
            notifyClientCsAndOwners(get().clients, project.clientId, `Fase "${prevPhase?.name ?? ''}" renomeada para "${patch.name}" em "${project.name}"`, `/projects/${projectId}`)
          }
        }
        sync(async () => {
          const phase = get().projects.find((p) => p.id === projectId)?.phases.find((ph) => ph.id === phaseId)
          if (!phase) return
          const { error } = await supabase
            .from('phases')
            .update({ name: phase.name, order: phase.order })
            .eq('id', phaseId)
          if (error) throw new Error(error.message)
        }, () => set({ projects: prev }))
      },

      deletePhase(projectId, phaseId) {
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            phases: p.phases.filter((ph) => ph.id !== phaseId),
          })),
        }))
        sync(async () => {
          await supabase.from('entries').delete().eq('phase_id', phaseId)
          const { error } = await supabase.from('phases').delete().eq('id', phaseId)
          if (error) throw new Error(error.message)
        }, () => set({ projects: prev }))
      },

      reorderPhases(projectId, phases) {
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({ ...p, phases })),
        }))
        sync(async () => {
          await Promise.all(
            phases.map((ph) =>
              supabase.from('phases').update({ order: ph.order }).eq('id', ph.id)
            )
          )
        }, () => set({ projects: prev }))
      },

      // ── Entries ───────────────────────────────────────────────────────────

      addEntry(projectId, phaseId, entryData) {
        const entryId = uuid()
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) =>
            refreshCriticalPath({
              ...p,
              phases: p.phases.map((ph) =>
                ph.id !== phaseId
                  ? ph
                  : {
                      ...ph,
                      entries: [
                        ...ph.entries,
                        {
                          ...entryData,
                          id: entryId,
                          isCritical: false,
                          subtasks: [],
                          comments: [],
                          links: [],
                        },
                      ],
                    },
              ),
            }),
          ),
        }))
        sync(async () => {
          const userId = getUserId()
          const project = get().projects.find((p) => p.id === projectId)
          const phase = project?.phases.find((ph) => ph.id === phaseId)
          const entry = phase?.entries.find((e) => e.id === entryId)
          if (!entry || !phase || !project) return
          const { error } = await supabase.from('entries').insert(storeEntryToDb(entry, phaseId, projectId, userId))
          if (error) throw new Error(error.message)
        }, () => set({ projects: prev }))
      },

      addUnassignedEntry(projectId, entryData) {
        const existingBucket = get().projects.find((p) => p.id === projectId)?.phases.find((ph) => ph.isUnassigned)
        const phaseId = existingBucket?.id ?? uuid()
        const bucketIsNew = !existingBucket
        const entryId = uuid()
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => {
            const phases = bucketIsNew
              ? [...p.phases, { id: phaseId, name: 'Sem fase', order: p.phases.length, entries: [], isUnassigned: true }]
              : p.phases
            return refreshCriticalPath({
              ...p,
              phases: phases.map((ph) =>
                ph.id !== phaseId
                  ? ph
                  : { ...ph, entries: [...ph.entries, { ...entryData, id: entryId, isCritical: false, subtasks: [], comments: [], links: [] }] },
              ),
            })
          }),
        }))
        sync(async () => {
          // The bucket phase must exist in the DB before the entry insert below
          // (entries.phase_id FK) — awaiting this first avoids the race that
          // once broke createProject (Fase 8.11 fix).
          if (bucketIsNew) {
            const order = get().projects.find((p) => p.id === projectId)?.phases.findIndex((ph) => ph.id === phaseId) ?? 0
            const { error: phaseError } = await supabase.from('phases').insert({
              id: phaseId, project_id: projectId, name: 'Sem fase', order,
              created_at: new Date().toISOString(), is_unassigned: true,
            })
            if (phaseError) throw new Error(phaseError.message)
          }
          const userId = getUserId()
          const project = get().projects.find((p) => p.id === projectId)
          const phase = project?.phases.find((ph) => ph.id === phaseId)
          const entry = phase?.entries.find((e) => e.id === entryId)
          if (!entry || !phase || !project) return
          const { error } = await supabase.from('entries').insert(storeEntryToDb(entry, phaseId, projectId, userId))
          if (error) throw new Error(error.message)
        }, () => set({ projects: prev }))
      },

      moveEntryToUnassignedPhase(projectId, fromPhaseId, entryId) {
        const existingBucket = get().projects.find((p) => p.id === projectId)?.phases.find((ph) => ph.isUnassigned)
        const toPhaseId = existingBucket?.id ?? uuid()
        const bucketIsNew = !existingBucket
        if (fromPhaseId === toPhaseId) return
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => {
            const basePhases = bucketIsNew
              ? [...p.phases, { id: toPhaseId, name: 'Sem fase', order: p.phases.length, entries: [], isUnassigned: true }]
              : p.phases
            let movedEntry: Entry | undefined
            const phases = basePhases.map((ph) => {
              if (ph.id !== fromPhaseId) return ph
              const found = ph.entries.find((e) => e.id === entryId)
              if (found) movedEntry = found
              return { ...ph, entries: ph.entries.filter((e) => e.id !== entryId) }
            })
            if (!movedEntry) return p
            const entry = movedEntry
            return refreshCriticalPath({
              ...p,
              phases: phases.map((ph) =>
                ph.id !== toPhaseId ? ph : { ...ph, entries: [...ph.entries, entry] }
              ),
            })
          }),
        }))
        sync(async () => {
          if (bucketIsNew) {
            const order = get().projects.find((p) => p.id === projectId)?.phases.findIndex((ph) => ph.id === toPhaseId) ?? 0
            const { error: phaseError } = await supabase.from('phases').insert({
              id: toPhaseId, project_id: projectId, name: 'Sem fase', order,
              created_at: new Date().toISOString(), is_unassigned: true,
            })
            if (phaseError) throw new Error(phaseError.message)
          }
          const project = get().projects.find((p) => p.id === projectId)
          if (!project) return
          await dbSyncAllEntries(project, getUserId())
        }, () => set({ projects: prev }))
      },

      addSubtask(projectId, phaseId, parentId, entryData) {
        const subtaskId = uuid()
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) =>
            refreshCriticalPath({
              ...p,
              phases: p.phases.map((ph) =>
                ph.id !== phaseId
                  ? ph
                  : {
                      ...ph,
                      entries: ph.entries.map((e) =>
                        e.id !== parentId
                          ? e
                          : {
                              ...e,
                              subtasks: [
                                ...e.subtasks,
                                {
                                  ...entryData,
                                  id: subtaskId,
                                  isCritical: false,
                                  subtasks: [],
                                  comments: [],
                                  links: [],
                                },
                              ],
                            },
                      ),
                    },
              ),
            }),
          ),
        }))
        sync(async () => {
          const userId = getUserId()
          const project = get().projects.find((p) => p.id === projectId)
          const phase = project?.phases.find((ph) => ph.id === phaseId)
          const parentEntry = phase?.entries.find((e) => e.id === parentId)
          if (!parentEntry || !phase || !project) return
          const row = storeEntryToDb(parentEntry, phaseId, projectId, userId)
          const { created_at, created_by, ...updateFields } = row
          const { error } = await supabase
            .from('entries')
            .update({ ...updateFields, updated_at: new Date().toISOString() })
            .eq('id', parentId)
          if (error) throw new Error(error.message)
        }, () => set({ projects: prev }))
      },

      updateEntry(projectId, entryId, patch) {
        const prev = get().projects
        const prevEntry = findEntryDeep(prev.find((p) => p.id === projectId)?.phases ?? [], entryId)
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) =>
            refreshCriticalPath({
              ...p,
              phases: p.phases.map((ph) => ({
                ...ph,
                entries: ph.entries.map((e) => {
                  if (e.id === entryId) return { ...e, ...patch }
                  const hasSub = e.subtasks.some((sub) => sub.id === entryId)
                  if (!hasSub) return e
                  return { ...e, subtasks: e.subtasks.map((sub) => (sub.id === entryId ? { ...sub, ...patch } : sub)) }
                }),
              })),
            }),
          ),
        }))
        sync(async () => {
          const project = get().projects.find((p) => p.id === projectId)
          if (!project) return
          await dbSyncEntry(project, entryId, getUserId())
        }, () => set({ projects: prev }))
        if (patch.owners) {
          const entryName = patch.name ?? prevEntry?.name ?? 'uma tarefa'
          notifyNewOwners(prevEntry?.owners, patch.owners, `Você foi adicionado como responsável em "${entryName}"`, `/projects/${projectId}`)
        }
        if (patch.status) {
          const entryName = patch.name ?? prevEntry?.name ?? 'uma tarefa'
          notifyValidatorOnValidationEntry(prevEntry?.status, patch.status, patch.owners ?? prevEntry?.owners, entryName, `/projects/${projectId}`)
        }
      },

      deleteEntry(projectId, phaseId, entryId) {
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) =>
            refreshCriticalPath({
              ...p,
              phases: p.phases.map((ph) =>
                ph.id !== phaseId
                  ? {
                      ...ph,
                      // Unlink child meetings whose parent is the deleted entry
                      entries: ph.entries.map((e) =>
                        e.parentEntryId === entryId ? { ...e, parentEntryId: undefined } : e,
                      ),
                    }
                  : {
                      ...ph,
                      entries: ph.entries
                        .filter((e) => e.id !== entryId)
                        .map((e) => ({
                          ...e,
                          subtasks: e.subtasks.filter((sub) => sub.id !== entryId),
                        })),
                    },
              ),
            }),
          ),
        }))
        sync(async () => {
          const { error: delErr } = await supabase.from('entries').delete().eq('id', entryId)
          if (!delErr) {
            const project = get().projects.find((p) => p.id === projectId)
            if (project) {
              const userId = getUserId()
              await dbSyncAllEntries(project, userId)
            }
          }
        }, () => set({ projects: prev }))
      },

      moveEntryToPhase(projectId, fromPhaseId, toPhaseId, entryId) {
        if (fromPhaseId === toPhaseId) return
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => {
            let movedEntry: Entry | undefined
            const phases = p.phases.map((ph) => {
              if (ph.id !== fromPhaseId) return ph
              const found = ph.entries.find((e) => e.id === entryId)
              if (found) movedEntry = found
              return { ...ph, entries: ph.entries.filter((e) => e.id !== entryId) }
            })
            if (!movedEntry) return p
            const entry = movedEntry
            return refreshCriticalPath({
              ...p,
              phases: phases.map((ph) =>
                ph.id !== toPhaseId ? ph : { ...ph, entries: [...ph.entries, entry] }
              ),
            })
          }),
        }))
        sync(async () => {
          const project = get().projects.find((p) => p.id === projectId)
          if (!project) return
          await dbSyncAllEntries(project, getUserId())
        }, () => set({ projects: prev }))
      },

      /** Drag-and-drop reorder: moves entryId to sit right before beforeEntryId
       *  (append to the end if beforeEntryId is null/not found). Works within
       *  the same phase (pure reorder) or across phases (move + position) —
       *  `order` is renumbered by final array position on the target phase. */
      reorderEntry(projectId, fromPhaseId, toPhaseId, entryId, beforeEntryId) {
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => {
            let movedEntry: Entry | undefined
            const phases = p.phases.map((ph) => {
              if (ph.id !== fromPhaseId) return ph
              const found = ph.entries.find((e) => e.id === entryId)
              if (found) movedEntry = found
              return { ...ph, entries: ph.entries.filter((e) => e.id !== entryId) }
            })
            if (!movedEntry) return p
            const entry = movedEntry
            return refreshCriticalPath({
              ...p,
              phases: phases.map((ph) => {
                if (ph.id !== toPhaseId) return ph
                const entries = [...ph.entries]
                const idx = beforeEntryId ? entries.findIndex((e) => e.id === beforeEntryId) : -1
                if (idx === -1) entries.push(entry)
                else entries.splice(idx, 0, entry)
                return { ...ph, entries: entries.map((e, i) => ({ ...e, order: i })) }
              }),
            })
          }),
        }))
        sync(async () => {
          const project = get().projects.find((p) => p.id === projectId)
          if (!project) return
          await dbSyncAllEntries(project, getUserId())
        }, () => set({ projects: prev }))
      },

      convertToSubtask(projectId, phaseId, entryId, parentEntryId) {
        if (entryId === parentEntryId) return
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => {
            let moved: Entry | undefined
            const phases = p.phases.map((ph) => {
              if (ph.id !== phaseId) return ph
              const found = ph.entries.find((e) => e.id === entryId)
              if (found) moved = found
              return { ...ph, entries: ph.entries.filter((e) => e.id !== entryId) }
            })
            if (!moved) return p
            const entry = moved
            return refreshCriticalPath({
              ...p,
              phases: phases.map((ph) =>
                ph.id !== phaseId
                  ? ph
                  : {
                      ...ph,
                      entries: ph.entries.map((e) =>
                        e.id !== parentEntryId ? e : { ...e, subtasks: [...e.subtasks, entry] },
                      ),
                    },
              ),
            })
          }),
        }))
        sync(async () => {
          const project = get().projects.find((p) => p.id === projectId)
          if (!project) return
          await dbSyncAllEntries(project, getUserId())
        }, () => set({ projects: prev }))
      },

      promoteSubtaskToEntry(projectId, phaseId, parentEntryId, subtaskId) {
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => {
            let promoted: Entry | undefined
            const phases = p.phases.map((ph) => {
              if (ph.id !== phaseId) return ph
              return {
                ...ph,
                entries: ph.entries.map((e) => {
                  if (e.id !== parentEntryId) return e
                  const found = e.subtasks.find((sub) => sub.id === subtaskId)
                  if (found) promoted = found
                  return { ...e, subtasks: e.subtasks.filter((sub) => sub.id !== subtaskId) }
                }),
              }
            })
            if (!promoted) return p
            const entry = promoted
            return refreshCriticalPath({
              ...p,
              phases: phases.map((ph) => (ph.id !== phaseId ? ph : { ...ph, entries: [...ph.entries, entry] })),
            })
          }),
        }))
        sync(async () => {
          const project = get().projects.find((p) => p.id === projectId)
          if (!project) return
          await dbSyncAllEntries(project, getUserId())
        }, () => set({ projects: prev }))
      },

      updateEntryStatus(projectId, entryId, status) {
        const now = new Date().toISOString().split('T')[0]
        const prev = get().projects
        const prevEntry = findEntryDeep(prev.find((p) => p.id === projectId)?.phases ?? [], entryId)
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            phases: p.phases.map((ph) => ({
              ...ph,
              entries: ph.entries.map((e) => {
                const update = (entry: Entry): Entry => {
                  const patch: Partial<Entry> = { status, statusOverride: true }
                  if (status === 'in_progress' && !entry.actualStart) patch.actualStart = now
                  if (status === 'done' && !entry.actualEnd) patch.actualEnd = now
                  return { ...entry, ...patch }
                }
                if (e.id === entryId) return update(e)
                return { ...e, subtasks: e.subtasks.map((sub) => (sub.id === entryId ? update(sub) : sub)) }
              }),
            })),
          })),
        }))
        // auto-history: status changed
        const entry = findEntryDeep(get().projects.find((p) => p.id === projectId)?.phases ?? [], entryId)
        if (entry) get().addHistoryEntry({ type: 'project', id: projectId }, { event: 'status_changed', title: entry.name, detail: status, linkedId: entryId, linkedType: 'entry' })
        if (entry) notifyValidatorOnValidationEntry(prevEntry?.status, status, entry.owners, entry.name, `/projects/${projectId}`)

        sync(async () => {
          const project = get().projects.find((p) => p.id === projectId)
          if (!project) return
          await dbSyncEntry(project, entryId, getUserId())
        }, () => set({ projects: prev }))
      },

      resetStatusOverride(projectId, entryId) {
        const today = new Date().toISOString().split('T')[0]
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            phases: p.phases.map((ph) => ({
              ...ph,
              entries: ph.entries.map((e) => {
                const reset = (entry: Entry): Entry => {
                  const updated = { ...entry, statusOverride: false }
                  return applyAutoStatus(updated, today)
                }
                if (e.id === entryId) return reset(e)
                return { ...e, subtasks: e.subtasks.map((sub) => (sub.id === entryId ? reset(sub) : sub)) }
              }),
            })),
          })),
        }))
        sync(async () => {
          const project = get().projects.find((p) => p.id === projectId)
          if (!project) return
          await dbSyncEntry(project, entryId, getUserId())
        }, () => set({ projects: prev }))
      },

      recalculateStatuses(projectId) {
        const today = new Date().toISOString().split('T')[0]
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            phases: p.phases.map((ph) => ({
              ...ph,
              entries: ph.entries.map((e) => ({
                ...applyAutoStatus(e, today),
                subtasks: e.subtasks.map((sub) => applyAutoStatus(sub, today)),
              })),
            })),
          })),
        }))
        sync(async () => {
          const project = get().projects.find((p) => p.id === projectId)
          if (!project) return
          await dbSyncAllEntries(project, getUserId())
        }, () => set({ projects: prev }))
      },

      updateEntryRisk(projectId, entryId, flag) {
        get().updateEntry(projectId, entryId, { riskFlag: flag })
      },

      // ── Date changes ──────────────────────────────────────────────────────

      changeEntryDate(projectId, entryId, field, value, justification) {
        const project = get().projects.find((p) => p.id === projectId)
        if (!project) return

        const { settings } = get()
        const prevEntry = findEntryDeep(project.phases, entryId)
        const prev = get().projects

        const newPhases = applyIsCritical(
          applyDateChange(project, entryId, field, value, settings.holidays),
        )

        const updatedEntry = findEntryDeep(newPhases, entryId)

        let daysDiff = 0
        if (prevEntry && updatedEntry && (field === 'plannedEnd' || field === 'plannedDate')) {
          const prevDate = field === 'plannedEnd' ? prevEntry.plannedEnd : prevEntry.plannedDate
          const newDate = field === 'plannedEnd' ? updatedEntry?.plannedEnd : updatedEntry?.plannedDate
          if (prevDate && newDate) {
            daysDiff = workdaysBetween(parseISO(prevDate), parseISO(newDate), parseHolidays(settings.holidays), settings.workdays)
          }
        }

        const delayLog = [...project.delayLog]
        let newDelayId: string | undefined

        if (justification && prevEntry && daysDiff !== 0 && Math.abs(daysDiff) > 0) {
          newDelayId = uuid()
          delayLog.push({
            id: newDelayId,
            date: new Date().toISOString().split('T')[0],
            entryId,
            entryName: prevEntry.name,
            days: daysDiff,
            responsibility: justification.responsibility,
            type: justification.type,
            description: justification.description,
            comments: '',
            triggeredBy: 'manual',
          })
        }

        const today = new Date().toISOString().split('T')[0]
        const phasesWithAutoStatus = newPhases.map((ph) => ({
          ...ph,
          entries: ph.entries.map((e) => ({
            ...applyAutoStatus(e, today),
            subtasks: e.subtasks.map((sub) => applyAutoStatus(sub, today)),
          })),
        }))

        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            phases: phasesWithAutoStatus,
            delayLog,
          })),
        }))

        sync(async () => {
          const userId = getUserId()
          const updated = get().projects.find((p) => p.id === projectId)
          if (!updated) return
          await dbSyncAllEntries(updated, userId)
          if (newDelayId) {
            const delayEntry = updated.delayLog.find((d) => d.id === newDelayId)
            if (delayEntry) {
              const { error } = await supabase.from('delay_log').insert(storeDelayLogToDb(delayEntry, projectId, userId))
              if (error) throw new Error(error.message)
            }
          }
        }, () => set({ projects: prev }))
      },

      // ── Baseline ──────────────────────────────────────────────────────────

      setBaseline(projectId) {
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            baselineSetAt: new Date().toISOString(),
            phases: p.phases.map((ph) => ({
              ...ph,
              entries: ph.entries.map((e) => ({
                ...e,
                ...computeBaselineFields(e),
                subtasks: e.subtasks.map((sub) => ({
                  ...sub,
                  ...computeBaselineFields(sub),
                })),
              })),
            })),
          })),
        }))
        get().addHistoryEntry({ type: 'project', id: projectId }, { event: 'baseline_set', title: 'Baseline' })

        sync(async () => {
          const userId = getUserId()
          const project = get().projects.find((p) => p.id === projectId)
          if (!project) return
          await dbSyncProjectRow(project, userId)
          await dbSyncAllEntries(project, userId)
        }, () => set({ projects: prev }))
      },

      clearBaseline(projectId) {
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            baselineSetAt: undefined,
            phases: p.phases.map((ph) => ({
              ...ph,
              entries: ph.entries.map((e) => ({
                ...e,
                baselineStart: undefined,
                baselineEnd: undefined,
                baselineDate: undefined,
                subtasks: e.subtasks.map((sub) => ({
                  ...sub,
                  baselineStart: undefined,
                  baselineEnd: undefined,
                  baselineDate: undefined,
                })),
              })),
            })),
          })),
        }))
        sync(async () => {
          const userId = getUserId()
          const project = get().projects.find((p) => p.id === projectId)
          if (!project) return
          await dbSyncProjectRow(project, userId)
          await dbSyncAllEntries(project, userId)
        }, () => set({ projects: prev }))
      },

      // ── Risks ─────────────────────────────────────────────────────────────

      addRisk(projectId, risk) {
        const id = uuid()
        const newRisk: Risk = { ...risk, id }
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            risks: [...p.risks, newRisk],
          })),
        }))
        get().addHistoryEntry({ type: 'project', id: projectId }, { event: 'risk_added', title: risk.description, linkedId: id, linkedType: 'risk' })

        sync(async () => {
          const userId = getUserId()
          const { error } = await supabase.from('risks').insert(storeRiskToDb(newRisk, projectId, userId))
          if (error) throw new Error(error.message)
        }, () => set({ projects: prev }))
      },

      updateRisk(projectId, riskId, patch) {
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            risks: p.risks.map((r) => (r.id === riskId ? { ...r, ...patch } : r)),
          })),
        }))
        sync(async () => {
          const project = get().projects.find((p) => p.id === projectId)
          const risk = project?.risks.find((r) => r.id === riskId)
          if (!risk) return
          await dbSyncRisk(projectId, risk, getUserId())
        }, () => set({ projects: prev }))
      },

      deleteRisk(projectId, riskId) {
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            risks: p.risks.filter((r) => r.id !== riskId),
          })),
        }))
        sync(async () => {
          const { error } = await supabase.from('risks').delete().eq('id', riskId)
          if (error) throw new Error(error.message)
        }, () => set({ projects: prev }))
      },

      addActionTask(projectId, riskId, task) {
        const id = uuid()
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            risks: p.risks.map((r) => r.id === riskId ? { ...r, actionTasks: [...r.actionTasks, { ...task, id }] } : r),
          })),
        }))
        sync(async () => {
          const project = get().projects.find((p) => p.id === projectId)
          const risk = project?.risks.find((r) => r.id === riskId)
          if (!risk) return
          await dbSyncRisk(projectId, risk, getUserId())
        }, () => set({ projects: prev }))
      },

      updateActionTask(projectId, riskId, taskId, patch) {
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            risks: p.risks.map((r) => r.id === riskId ? { ...r, actionTasks: r.actionTasks.map((t) => t.id === taskId ? { ...t, ...patch } : t) } : r),
          })),
        }))
        sync(async () => {
          const project = get().projects.find((p) => p.id === projectId)
          const risk = project?.risks.find((r) => r.id === riskId)
          if (!risk) return
          await dbSyncRisk(projectId, risk, getUserId())
        }, () => set({ projects: prev }))
      },

      toggleActionTask(projectId, riskId, taskId) {
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            risks: p.risks.map((r) => r.id === riskId ? { ...r, actionTasks: r.actionTasks.map((t) => t.id === taskId ? { ...t, done: !t.done } : t) } : r),
          })),
        }))
        sync(async () => {
          const project = get().projects.find((p) => p.id === projectId)
          const risk = project?.risks.find((r) => r.id === riskId)
          if (!risk) return
          await dbSyncRisk(projectId, risk, getUserId())
        }, () => set({ projects: prev }))
      },

      deleteActionTask(projectId, riskId, taskId) {
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            risks: p.risks.map((r) => r.id === riskId ? { ...r, actionTasks: r.actionTasks.filter((t) => t.id !== taskId) } : r),
          })),
        }))
        sync(async () => {
          const project = get().projects.find((p) => p.id === projectId)
          const risk = project?.risks.find((r) => r.id === riskId)
          if (!risk) return
          await dbSyncRisk(projectId, risk, getUserId())
        }, () => set({ projects: prev }))
      },

      addDelayLogEntry(projectId, entry) {
        const id = uuid()
        const newEntry: DelayLogEntry = { ...entry, id }
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            delayLog: [...p.delayLog, newEntry],
          })),
        }))
        get().addHistoryEntry({ type: 'project', id: projectId }, { event: 'delay_logged', title: entry.entryName, detail: `${entry.days > 0 ? '+' : ''}${entry.days}d — ${entry.description}`, linkedType: 'entry' })

        sync(async () => {
          const userId = getUserId()
          const { error } = await supabase.from('delay_log').insert(storeDelayLogToDb(newEntry, projectId, userId))
          if (error) throw new Error(error.message)
        }, () => set({ projects: prev }))
      },

      updateDelayLogEntry(projectId, entryId, patch) {
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            delayLog: p.delayLog.map((e) => e.id === entryId ? { ...e, ...patch } : e),
          })),
        }))
        sync(async () => {
          const project = get().projects.find((p) => p.id === projectId)
          const entry = project?.delayLog.find((d) => d.id === entryId)
          if (!entry) return
          const userId = getUserId()
          const row = storeDelayLogToDb(entry, projectId, userId)
          const { error } = await supabase
            .from('delay_log')
            .update({
              entry_id: row.entry_id,
              entry_name: row.entry_name,
              days: row.days,
              description: row.description,
              responsibility: row.responsibility,
              type: row.type,
              triggered_by: row.triggered_by,
            })
            .eq('id', entryId)
          if (error) throw new Error(error.message)
        }, () => set({ projects: prev }))
      },

      deleteDelayLogEntry(projectId, entryId) {
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            delayLog: p.delayLog.filter((e) => e.id !== entryId),
          })),
        }))
        sync(async () => {
          const { error } = await supabase.from('delay_log').delete().eq('id', entryId)
          if (error) throw new Error(error.message)
        }, () => set({ projects: prev }))
      },

      setColumnVisibility(projectId, visibility) {
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            columnVisibility: visibility,
          })),
        }))
        // columnVisibility is not in DbProject — skip DB sync
      },

      // ── Team ──────────────────────────────────────────────────────────────

      addTeamMember(projectId, member) {
        const id = uuid()
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            team: [...p.team, { ...member, id }],
          })),
        }))
        get().addHistoryEntry({ type: 'project', id: projectId }, { event: 'member_added', title: member.name, detail: member.role })

        sync(async () => {
          const project = get().projects.find((p) => p.id === projectId)
          if (!project) return
          await dbSyncProjectRow(project, getUserId())
        }, () => set({ projects: prev }))
      },

      updateTeamMember(projectId, memberId, patch) {
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            team: p.team.map((m) => (m.id === memberId ? { ...m, ...patch } : m)),
          })),
        }))
        sync(async () => {
          const project = get().projects.find((p) => p.id === projectId)
          if (!project) return
          await dbSyncProjectRow(project, getUserId())
        }, () => set({ projects: prev }))
      },

      removeTeamMember(projectId, memberId) {
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            team: p.team.filter((m) => m.id !== memberId),
          })),
        }))
        sync(async () => {
          const project = get().projects.find((p) => p.id === projectId)
          if (!project) return
          await dbSyncProjectRow(project, getUserId())
        }, () => set({ projects: prev }))
      },

      // ── Project links ─────────────────────────────────────────────────────

      addProjectLink(projectId, link) {
        const id = uuid()
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            links: [...p.links, { ...link, id }],
          })),
        }))
        sync(async () => {
          const project = get().projects.find((p) => p.id === projectId)
          if (!project) return
          await dbSyncProjectRow(project, getUserId())
        }, () => set({ projects: prev }))
      },

      removeProjectLink(projectId, linkId) {
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            links: p.links.filter((l) => l.id !== linkId),
          })),
        }))
        sync(async () => {
          const project = get().projects.find((p) => p.id === projectId)
          if (!project) return
          await dbSyncProjectRow(project, getUserId())
        }, () => set({ projects: prev }))
      },

      // ── Entry links ───────────────────────────────────────────────────────

      addEntryLink(projectId, entryId, link) {
        const linkId = uuid()
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            phases: p.phases.map((ph) => ({
              ...ph,
              entries: ph.entries.map((e) => {
                if (e.id === entryId) return { ...e, links: [...e.links, { ...link, id: linkId }] }
                const hasSub = e.subtasks.some((sub) => sub.id === entryId)
                if (!hasSub) return e
                return { ...e, subtasks: e.subtasks.map((sub) => sub.id === entryId ? { ...sub, links: [...sub.links, { ...link, id: linkId }] } : sub) }
              }),
            })),
          })),
        }))
        sync(async () => {
          const project = get().projects.find((p) => p.id === projectId)
          if (!project) return
          await dbSyncEntry(project, entryId, getUserId())
        }, () => set({ projects: prev }))
      },

      removeEntryLink(projectId, entryId, linkId) {
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            phases: p.phases.map((ph) => ({
              ...ph,
              entries: ph.entries.map((e) => {
                if (e.id === entryId) return { ...e, links: e.links.filter((l) => l.id !== linkId) }
                const hasSub = e.subtasks.some((sub) => sub.id === entryId)
                if (!hasSub) return e
                return { ...e, subtasks: e.subtasks.map((sub) => sub.id === entryId ? { ...sub, links: sub.links.filter((l) => l.id !== linkId) } : sub) }
              }),
            })),
          })),
        }))
        sync(async () => {
          const project = get().projects.find((p) => p.id === projectId)
          if (!project) return
          await dbSyncEntry(project, entryId, getUserId())
        }, () => set({ projects: prev }))
      },

      // ── Comments ──────────────────────────────────────────────────────────

      addComment(projectId, entryId, comment) {
        const id = uuid()
        const newComment: EntryComment = { ...comment, id }
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            phases: p.phases.map((ph) => ({
              ...ph,
              entries: ph.entries.map((e) => {
                if (e.id === entryId) return { ...e, comments: [...e.comments, newComment] }
                const hasSub = e.subtasks.some((sub) => sub.id === entryId)
                if (!hasSub) return e
                return { ...e, subtasks: e.subtasks.map((sub) => sub.id === entryId ? { ...sub, comments: [...sub.comments, newComment] } : sub) }
              }),
            })),
          })),
        }))
        sync(async () => {
          const { error } = await supabase.from('comments').insert({
            id,
            project_id: projectId,
            entry_id: entryId,
            author_id: null,
            author_name: newComment.author,
            author_avatar: null,
            text: newComment.text,
            created_at: newComment.createdAt,
          })
          if (error) throw new Error(error.message)
        }, () => set({ projects: prev }))
      },

      removeComment(projectId, entryId, commentId) {
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            phases: p.phases.map((ph) => ({
              ...ph,
              entries: ph.entries.map((e) => {
                if (e.id === entryId) return { ...e, comments: e.comments.filter((c) => c.id !== commentId) }
                const hasSub = e.subtasks.some((sub) => sub.id === entryId)
                if (!hasSub) return e
                return { ...e, subtasks: e.subtasks.map((sub) => sub.id === entryId ? { ...sub, comments: sub.comments.filter((c) => c.id !== commentId) } : sub) }
              }),
            })),
          })),
        }))
        sync(async () => {
          const { error } = await supabase.from('comments').delete().eq('id', commentId)
          if (error) throw new Error(error.message)
        }, () => set({ projects: prev }))
      },

      // ── Settings ──────────────────────────────────────────────────────────

      updateSettings(patch) {
        const prev = get().settings
        set((s) => ({ settings: { ...s.settings, ...patch } }))
        const globalKeys: (keyof AppSettings)[] = ['holidays', 'holidayNames', 'defaultLanguage', 'dateFormat', 'workdays']
        const hasGlobal = (Object.keys(patch) as (keyof AppSettings)[]).some((k) => globalKeys.includes(k))
        if (hasGlobal) {
          sync(async () => syncGlobalSettings(get().settings, getUserId()), () => set({ settings: prev }))
        }
      },

      updateTemplate(template) {
        set((s) => ({
          settings: {
            ...s.settings,
            templates: s.settings.templates.map((t) => (t.id === template.id ? template : t)),
          },
        }))
      },

      createIncidentTemplate(data) {
        const id = uuid()
        set((s) => ({
          settings: { ...s.settings, incidentTemplates: [...s.settings.incidentTemplates, { ...data, id }] },
        }))
        return id
      },

      updateIncidentTemplate(template) {
        set((s) => ({
          settings: {
            ...s.settings,
            incidentTemplates: s.settings.incidentTemplates.map((t) => (t.id === template.id ? template : t)),
          },
        }))
      },

      deleteIncidentTemplate(id) {
        set((s) => ({
          settings: { ...s.settings, incidentTemplates: s.settings.incidentTemplates.filter((t) => t.id !== id) },
        }))
      },

      addHoliday(date, name) {
        const prev = get().settings
        set((s) => {
          if (s.settings.holidays.includes(date)) return s
          const holidayNames = name
            ? { ...s.settings.holidayNames, [date]: name }
            : s.settings.holidayNames
          return {
            settings: {
              ...s.settings,
              holidays: [...s.settings.holidays, date].sort(),
              holidayNames,
            },
          }
        })
        sync(async () => syncGlobalSettings(get().settings, getUserId()), () => set({ settings: prev }))
      },

      removeHoliday(date) {
        const prev = get().settings
        set((s) => {
          const { [date]: _removed, ...holidayNames } = s.settings.holidayNames
          return {
            settings: {
              ...s.settings,
              holidays: s.settings.holidays.filter((h) => h !== date),
              holidayNames,
            },
          }
        })
        sync(async () => syncGlobalSettings(get().settings, getUserId()), () => set({ settings: prev }))
      },

      // ── Diary — Open Points ───────────────────────────────────────────────

      addOpenPoint(scope, op) {
        const id = uuid()
        const now = new Date().toISOString()
        const newOp: OpenPoint = { ...op, id, comments: [], attachments: [], createdAt: now }
        if (scope.type === 'project') {
          set((s) => ({ projects: mutateProject(s.projects, scope.id, (p) => ({ ...p, openPoints: [...(p.openPoints ?? []), newOp] })) }))
        } else {
          set((s) => ({ incidents: mutateIncident(s.incidents, scope.id, (i) => ({ ...i, openPoints: [...i.openPoints, newOp] })) }))
        }
        sync(async () => {
          const authUser = useAuthStore.getState().user
          const { error } = await supabase.from('open_points').insert({
            id,
            project_id: scope.type === 'project' ? scope.id : null,
            incident_id: scope.type === 'incident' ? scope.id : null,
            title: newOp.title,
            description: newOp.description || newOp.title,
            status: newOp.status,
            priority: newOp.priority,
            owner: newOp.responsible ?? null,
            due_date: newOp.dueDate ?? null,
            linked_entry_id: newOp.linkedEntryId ?? null,
            created_by: authUser?.id ?? null,
            created_by_name: authUser?.user_metadata?.full_name ?? authUser?.email ?? null,
            created_by_avatar: authUser?.user_metadata?.avatar_url ?? null,
            created_at: now,
          })
          if (error) throw new Error(error.message)
        })
      },

      updateOpenPoint(scope, opId, patch) {
        if (scope.type === 'project') {
          set((s) => ({ projects: mutateProject(s.projects, scope.id, (p) => ({ ...p, openPoints: (p.openPoints ?? []).map((op) => op.id === opId ? { ...op, ...patch } : op) })) }))
        } else {
          set((s) => ({ incidents: mutateIncident(s.incidents, scope.id, (i) => ({ ...i, openPoints: i.openPoints.map((op) => op.id === opId ? { ...op, ...patch } : op) })) }))
        }
        sync(async () => {
          const fields: Record<string, unknown> = {}
          if (patch.title !== undefined) fields.title = patch.title
          if (patch.description !== undefined) fields.description = patch.description
          if (patch.status !== undefined) fields.status = patch.status
          if (patch.priority !== undefined) fields.priority = patch.priority
          if (patch.responsible !== undefined) fields.owner = patch.responsible
          if (patch.dueDate !== undefined) fields.due_date = patch.dueDate
          if (patch.linkedEntryId !== undefined) fields.linked_entry_id = patch.linkedEntryId
          if (Object.keys(fields).length === 0) return
          const { error } = await supabase.from('open_points').update(fields).eq('id', opId)
          if (error) throw new Error(error.message)
        })
      },

      resolveOpenPoint(scope, opId, resolution, resolvedBy) {
        const now = new Date().toISOString()
        const patchFn = (op: OpenPoint) => op.id === opId ? { ...op, status: 'resolved' as const, resolution, resolvedAt: now, resolvedBy } : op
        if (scope.type === 'project') {
          set((s) => ({ projects: mutateProject(s.projects, scope.id, (p) => ({ ...p, openPoints: (p.openPoints ?? []).map(patchFn) })) }))
        } else {
          set((s) => ({ incidents: mutateIncident(s.incidents, scope.id, (i) => ({ ...i, openPoints: i.openPoints.map(patchFn) })) }))
        }
        sync(async () => {
          const { error } = await supabase.from('open_points').update({
            status: 'resolved', resolution_note: resolution, resolved_at: now, resolved_by: resolvedBy,
          }).eq('id', opId)
          if (error) throw new Error(error.message)
        })
      },

      deleteOpenPoint(scope, opId) {
        const prevProjects = get().projects
        const prevIncidents = get().incidents
        if (scope.type === 'project') {
          set((s) => ({ projects: mutateProject(s.projects, scope.id, (p) => ({ ...p, openPoints: (p.openPoints ?? []).filter((op) => op.id !== opId) })) }))
        } else {
          set((s) => ({ incidents: mutateIncident(s.incidents, scope.id, (i) => ({ ...i, openPoints: i.openPoints.filter((op) => op.id !== opId) })) }))
        }
        sync(async () => {
          const { error } = await supabase.from('open_points').delete().eq('id', opId)
          if (error) throw new Error(error.message)
        }, () => set({ projects: prevProjects, incidents: prevIncidents }))
      },

      // ── Diary — Meetings ──────────────────────────────────────────────────

      addMeetingLog(projectId, meeting) {
        const id = uuid()
        const now = new Date().toISOString()
        const newMeeting: MeetingLog = { ...meeting, id, comments: [], attachments: [], createdAt: now }
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            meetings: [...(p.meetings ?? []), newMeeting],
          })),
        }))
        sync(async () => {
          const authUser = useAuthStore.getState().user
          const { error } = await supabase.from('meeting_logs').insert({
            id,
            project_id: projectId,
            title: newMeeting.title,
            date: newMeeting.date,
            participants: newMeeting.participants,
            notes: newMeeting.notes ?? null,
            items: newMeeting.items,
            created_by: authUser?.id ?? null,
            created_by_name: authUser?.user_metadata?.full_name ?? authUser?.email ?? null,
            created_by_avatar: authUser?.user_metadata?.avatar_url ?? null,
            created_at: now,
          })
          if (error) throw new Error(error.message)
        })
      },

      updateMeetingLog(projectId, meetingId, patch) {
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            meetings: (p.meetings ?? []).map((m) => m.id === meetingId ? { ...m, ...patch } : m),
          })),
        }))
        sync(async () => {
          const authUser = useAuthStore.getState().user
          const fields: Record<string, unknown> = {}
          if (patch.title !== undefined) fields.title = patch.title
          if (patch.date !== undefined) fields.date = patch.date
          if (patch.participants !== undefined) fields.participants = patch.participants
          if (patch.notes !== undefined) fields.notes = patch.notes
          if (patch.items !== undefined) fields.items = patch.items
          if (Object.keys(fields).length === 0) return
          fields.updated_at = new Date().toISOString()
          fields.updated_by = authUser?.id ?? null
          fields.updated_by_name = authUser?.user_metadata?.full_name ?? authUser?.email ?? null
          const { error } = await supabase.from('meeting_logs').update(fields).eq('id', meetingId)
          if (error) throw new Error(error.message)
        })
      },

      deleteMeetingLog(projectId, meetingId) {
        const prev = get().projects
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            meetings: (p.meetings ?? []).filter((m) => m.id !== meetingId),
          })),
        }))
        sync(async () => {
          const { error } = await supabase.from('meeting_logs').delete().eq('id', meetingId)
          if (error) throw new Error(error.message)
        }, () => set({ projects: prev }))
      },

      addMeetingItem(projectId, meetingId, item) {
        const newItem: MeetingItem = { ...item, id: uuid() }
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            meetings: (p.meetings ?? []).map((m) =>
              m.id === meetingId ? { ...m, items: [...m.items, newItem] } : m,
            ),
          })),
        }))
        sync(async () => {
          const meeting = get().projects.find((p) => p.id === projectId)?.meetings?.find((m) => m.id === meetingId)
          if (!meeting) return
          const { error } = await supabase.from('meeting_logs').update({ items: meeting.items }).eq('id', meetingId)
          if (error) throw new Error(error.message)
        })
      },

      updateMeetingItem(projectId, meetingId, itemId, patch) {
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            meetings: (p.meetings ?? []).map((m) =>
              m.id === meetingId
                ? { ...m, items: m.items.map((i) => i.id === itemId ? { ...i, ...patch } : i) }
                : m,
            ),
          })),
        }))
        sync(async () => {
          const meeting = get().projects.find((p) => p.id === projectId)?.meetings?.find((m) => m.id === meetingId)
          if (!meeting) return
          const { error } = await supabase.from('meeting_logs').update({ items: meeting.items }).eq('id', meetingId)
          if (error) throw new Error(error.message)
        })
      },

      deleteMeetingItem(projectId, meetingId, itemId) {
        set((s) => ({
          projects: mutateProject(s.projects, projectId, (p) => ({
            ...p,
            meetings: (p.meetings ?? []).map((m) =>
              m.id === meetingId ? { ...m, items: m.items.filter((i) => i.id !== itemId) } : m,
            ),
          })),
        }))
        sync(async () => {
          const meeting = get().projects.find((p) => p.id === projectId)?.meetings?.find((m) => m.id === meetingId)
          if (!meeting) return
          const { error } = await supabase.from('meeting_logs').update({ items: meeting.items }).eq('id', meetingId)
          if (error) throw new Error(error.message)
        })
      },

      // ── Diary — History ───────────────────────────────────────────────────

      addHistoryEntry(scope, entry) {
        const id = uuid()
        const now = new Date().toISOString()
        const newEntry: HistoryEntry = { ...entry, id, comments: [], createdAt: now }
        if (scope.type === 'project') {
          set((s) => ({ projects: mutateProject(s.projects, scope.id, (p) => ({ ...p, history: [...(p.history ?? []), newEntry] })) }))
        } else {
          set((s) => ({ incidents: mutateIncident(s.incidents, scope.id, (i) => ({ ...i, history: [...i.history, newEntry] })) }))
        }
        sync(() => insertHistoryRow(scope, newEntry))
      },

      updateHistoryEntry(scope, entryId, patch) {
        if (scope.type === 'project') {
          set((s) => ({ projects: mutateProject(s.projects, scope.id, (p) => ({ ...p, history: (p.history ?? []).map((h) => h.id === entryId ? { ...h, ...patch } : h) })) }))
        } else {
          set((s) => ({ incidents: mutateIncident(s.incidents, scope.id, (i) => ({ ...i, history: i.history.map((h) => h.id === entryId ? { ...h, ...patch } : h) })) }))
        }
        sync(async () => {
          const fields: Record<string, unknown> = {}
          if (patch.title !== undefined) fields.title = patch.title
          if (patch.detail !== undefined) fields.detail = patch.detail
          if (Object.keys(fields).length === 0) return
          const { error } = await supabase.from('history').update(fields).eq('id', entryId)
          if (error) throw new Error(error.message)
        })
      },

      deleteHistoryEntry(scope, entryId) {
        const prevProjects = get().projects
        const prevIncidents = get().incidents
        if (scope.type === 'project') {
          set((s) => ({ projects: mutateProject(s.projects, scope.id, (p) => ({ ...p, history: (p.history ?? []).filter((h) => h.id !== entryId) })) }))
        } else {
          set((s) => ({ incidents: mutateIncident(s.incidents, scope.id, (i) => ({ ...i, history: i.history.filter((h) => h.id !== entryId) })) }))
        }
        sync(async () => {
          const { error } = await supabase.from('history').delete().eq('id', entryId)
          if (error) throw new Error(error.message)
        }, () => set({ projects: prevProjects, incidents: prevIncidents }))
      },

      // ── Diary — Comments ──────────────────────────────────────────────────

      addDiaryComment(scope, parentType, parentId, comment) {
        const id = uuid()
        const now = new Date().toISOString()
        const newComment: DiaryComment = { ...comment, id, createdAt: now }
        if (scope.type === 'project') {
          set((s) => ({
            projects: mutateProject(s.projects, scope.id, (p) => {
              if (parentType === 'open_point') {
                return { ...p, openPoints: (p.openPoints ?? []).map((op) => op.id === parentId ? { ...op, comments: [...op.comments, newComment] } : op) }
              }
              if (parentType === 'meeting') {
                return { ...p, meetings: (p.meetings ?? []).map((m) => m.id === parentId ? { ...m, comments: [...m.comments, newComment] } : m) }
              }
              return { ...p, history: (p.history ?? []).map((h) => h.id === parentId ? { ...h, comments: [...h.comments, newComment] } : h) }
            }),
          }))
        } else {
          set((s) => ({
            incidents: mutateIncident(s.incidents, scope.id, (i) => {
              if (parentType === 'open_point') {
                return { ...i, openPoints: i.openPoints.map((op) => op.id === parentId ? { ...op, comments: [...op.comments, newComment] } : op) }
              }
              return { ...i, history: i.history.map((h) => h.id === parentId ? { ...h, comments: [...h.comments, newComment] } : h) }
            }),
          }))
        }
        sync(async () => {
          const { error } = await supabase.from('diary_comments').insert({
            id,
            project_id: scope.type === 'project' ? scope.id : null,
            incident_id: scope.type === 'incident' ? scope.id : null,
            parent_type: parentType,
            parent_id: parentId,
            author_name: newComment.author,
            text: newComment.text,
            created_at: now,
          })
          if (error) throw new Error(error.message)
        })
      },

      deleteDiaryComment(scope, parentType, parentId, commentId) {
        if (scope.type === 'project') {
          set((s) => ({
            projects: mutateProject(s.projects, scope.id, (p) => {
              if (parentType === 'open_point') {
                return { ...p, openPoints: (p.openPoints ?? []).map((op) => op.id === parentId ? { ...op, comments: op.comments.filter((c) => c.id !== commentId) } : op) }
              }
              if (parentType === 'meeting') {
                return { ...p, meetings: (p.meetings ?? []).map((m) => m.id === parentId ? { ...m, comments: m.comments.filter((c) => c.id !== commentId) } : m) }
              }
              return { ...p, history: (p.history ?? []).map((h) => h.id === parentId ? { ...h, comments: h.comments.filter((c) => c.id !== commentId) } : h) }
            }),
          }))
        } else {
          set((s) => ({
            incidents: mutateIncident(s.incidents, scope.id, (i) => {
              if (parentType === 'open_point') {
                return { ...i, openPoints: i.openPoints.map((op) => op.id === parentId ? { ...op, comments: op.comments.filter((c) => c.id !== commentId) } : op) }
              }
              return { ...i, history: i.history.map((h) => h.id === parentId ? { ...h, comments: h.comments.filter((c) => c.id !== commentId) } : h) }
            }),
          }))
        }
        sync(async () => {
          const { error } = await supabase.from('diary_comments').delete().eq('id', commentId)
          if (error) throw new Error(error.message)
        })
      },

      // ── Diary — Attachments ───────────────────────────────────────────────

      addDiaryAttachment(scope, parentType, parentId, attachment) {
        if (scope.type === 'project') {
          set((s) => ({
            projects: mutateProject(s.projects, scope.id, (p) => {
              if (parentType === 'open_point') {
                return { ...p, openPoints: (p.openPoints ?? []).map((op) => op.id === parentId ? { ...op, attachments: [...op.attachments, attachment] } : op) }
              }
              return { ...p, meetings: (p.meetings ?? []).map((m) => m.id === parentId ? { ...m, attachments: [...m.attachments, attachment] } : m) }
            }),
          }))
        } else {
          set((s) => ({
            incidents: mutateIncident(s.incidents, scope.id, (i) => ({
              ...i, openPoints: i.openPoints.map((op) => op.id === parentId ? { ...op, attachments: [...op.attachments, attachment] } : op),
            })),
          }))
        }
      },

      removeDiaryAttachment(scope, parentType, parentId, attachmentId) {
        if (scope.type === 'project') {
          set((s) => ({
            projects: mutateProject(s.projects, scope.id, (p) => {
              if (parentType === 'open_point') {
                return { ...p, openPoints: (p.openPoints ?? []).map((op) => op.id === parentId ? { ...op, attachments: op.attachments.filter((a) => a.id !== attachmentId) } : op) }
              }
              return { ...p, meetings: (p.meetings ?? []).map((m) => m.id === parentId ? { ...m, attachments: m.attachments.filter((a) => a.id !== attachmentId) } : m) }
            }),
          }))
        } else {
          set((s) => ({
            incidents: mutateIncident(s.incidents, scope.id, (i) => ({
              ...i, openPoints: i.openPoints.map((op) => op.id === parentId ? { ...op, attachments: op.attachments.filter((a) => a.id !== attachmentId) } : op),
            })),
          }))
        }
      },

      // ── Clients (Carteira) ────────────────────────────────────────────────

      createClient(data) {
        const id = uuid()
        const now = new Date().toISOString()
        const newClient: Client = {
          id,
          name: data.name,
          country: data.country,
          ploomesLink: data.ploomesLink,
          notes: data.notes,
          status: data.status ?? 'sustentacao_novos_projetos',
          owners: data.owners ?? [],
          csHistory: [],
          createdAt: now,
        }
        set((s) => ({ clients: [...s.clients, newClient] }))
        sync(async () => {
          const userId = getUserId()
          const { error } = await supabase.from('clients').insert(storeClientToDb(newClient, userId))
          if (error) throw new Error(error.message)
        }, () => set((s) => ({ clients: s.clients.filter((c) => c.id !== id) })))
        return id
      },

      updateClient(id, patch) {
        const prev = get().clients
        set((s) => ({ clients: mutateClient(s.clients, id, (c) => ({ ...c, ...patch })) }))
        sync(async () => {
          const fields: Record<string, unknown> = {}
          if (patch.name !== undefined) fields.name = patch.name
          if (patch.country !== undefined) fields.country = patch.country
          if (patch.ploomesLink !== undefined) fields.ploomes_link = patch.ploomesLink
          if (patch.notes !== undefined) fields.notes = patch.notes
          if (patch.status !== undefined) fields.status = patch.status
          if (patch.owners !== undefined) fields.owners = patch.owners.length > 0 ? patch.owners : null
          if (Object.keys(fields).length === 0) return
          const { error } = await supabase.from('clients').update(fields).eq('id', id)
          if (error) throw new Error(error.message)
        }, () => set({ clients: prev }))
      },

      deleteClient(id) {
        const prev = get().clients
        set((s) => ({ clients: s.clients.filter((c) => c.id !== id) }))
        sync(async () => {
          const { error } = await supabase.from('clients').delete().eq('id', id)
          if (error) throw new Error(error.message)
        }, () => set({ clients: prev }))
      },

      createContact(data) {
        const newContact: ClientContact = {
          id: uuid(),
          name: data.name,
          role: data.role,
          email: data.email,
          phone: data.phone,
          clientIds: data.clientIds ?? [],
          createdAt: new Date().toISOString(),
        }
        set((s) => ({ contacts: [...s.contacts, newContact] }))
        sync(async () => {
          const { error } = await supabase.from('contacts').insert(storeClientContactToDb(newContact))
          if (error) throw new Error(error.message)
          if (newContact.clientIds.length > 0) {
            const links = newContact.clientIds.map((clientId) => ({ contact_id: newContact.id, client_id: clientId }))
            const { error: linkError } = await supabase.from('contact_clients').insert(links)
            if (linkError) throw new Error(linkError.message)
          }
        }, () => set((s) => ({ contacts: s.contacts.filter((c) => c.id !== newContact.id) })))
        return newContact.id
      },

      updateContact(id, patch) {
        const prev = get().contacts
        set((s) => ({ contacts: s.contacts.map((c) => c.id === id ? { ...c, ...patch } : c) }))
        sync(async () => {
          const fields: Record<string, unknown> = {}
          if (patch.name !== undefined) fields.name = patch.name
          if (patch.role !== undefined) fields.role = patch.role
          if (patch.email !== undefined) fields.email = patch.email
          if (patch.phone !== undefined) fields.phone = patch.phone
          if (Object.keys(fields).length === 0) return
          const { error } = await supabase.from('contacts').update(fields).eq('id', id)
          if (error) throw new Error(error.message)
        }, () => set({ contacts: prev }))
      },

      deleteContact(id) {
        const prev = get().contacts
        set((s) => ({ contacts: s.contacts.filter((c) => c.id !== id) }))
        sync(async () => {
          const { error } = await supabase.from('contacts').delete().eq('id', id)
          if (error) throw new Error(error.message)
        }, () => set({ contacts: prev }))
      },

      linkContactToClient(contactId, clientId) {
        const prev = get().contacts
        set((s) => ({
          contacts: s.contacts.map((c) => c.id === contactId && !c.clientIds.includes(clientId)
            ? { ...c, clientIds: [...c.clientIds, clientId] }
            : c),
        }))
        sync(async () => {
          const { error } = await supabase.from('contact_clients').insert({ contact_id: contactId, client_id: clientId })
          if (error) throw new Error(error.message)
        }, () => set({ contacts: prev }))
      },

      unlinkContactFromClient(contactId, clientId) {
        const prev = get().contacts
        set((s) => ({
          contacts: s.contacts.map((c) => c.id === contactId
            ? { ...c, clientIds: c.clientIds.filter((id) => id !== clientId) }
            : c),
        }))
        sync(async () => {
          const { error } = await supabase.from('contact_clients').delete().eq('contact_id', contactId).eq('client_id', clientId)
          if (error) throw new Error(error.message)
        }, () => set({ contacts: prev }))
      },

      addCsAssignment(clientId, assignment) {
        const newAssignment: ClientCsAssignment = { ...assignment, id: uuid() }
        set((s) => ({
          clients: mutateClient(s.clients, clientId, (c) => ({ ...c, csHistory: [...c.csHistory, newAssignment] })),
        }))
        sync(async () => {
          const userId = getUserId()
          const { error } = await supabase.from('client_cs_history').insert(storeCsAssignmentToDb(newAssignment, clientId, userId))
          if (error) throw new Error(error.message)
        })
      },

      updateCsAssignment(clientId, assignmentId, patch) {
        set((s) => ({
          clients: mutateClient(s.clients, clientId, (c) => ({
            ...c,
            csHistory: c.csHistory.map((a) => a.id === assignmentId ? { ...a, ...patch } : a),
          })),
        }))
        sync(async () => {
          const fields: Record<string, unknown> = {}
          if (patch.owner !== undefined) fields.owner = patch.owner
          if (patch.assignedAt !== undefined) fields.assigned_at = patch.assignedAt
          if (patch.note !== undefined) fields.note = patch.note
          if (Object.keys(fields).length === 0) return
          const { error } = await supabase.from('client_cs_history').update(fields).eq('id', assignmentId)
          if (error) throw new Error(error.message)
        })
      },

      removeCsAssignment(clientId, assignmentId) {
        const prev = get().clients
        set((s) => ({
          clients: mutateClient(s.clients, clientId, (c) => ({ ...c, csHistory: c.csHistory.filter((a) => a.id !== assignmentId) })),
        }))
        sync(async () => {
          const { error } = await supabase.from('client_cs_history').delete().eq('id', assignmentId)
          if (error) throw new Error(error.message)
        }, () => set({ clients: prev }))
      },

      // ── Incidents (Sustentação) ────────────────────────────────────────────

      createIncident(data) {
        const id = uuid()
        const now = new Date().toISOString()
        const newIncident: Incident = {
          id,
          title: data.title,
          description: data.description,
          owner: data.owner,
          status: 'open',
          statusChangedAt: now,
          priority: data.priority,
          impact: data.impact,
          deadline: data.deadline,
          clientIds: data.clientIds ?? [],
          projectIds: data.projectIds ?? [],
          stakeholders: [],
          entries: [],
          openPoints: [],
          history: [],
          createdAt: now,
        }
        set((s) => ({ incidents: [...s.incidents, newIncident] }))
        sync(async () => {
          const userId = getUserId()
          const { error } = await supabase.from('incidents').insert(storeIncidentToDb(newIncident, userId))
          if (error) throw new Error(error.message)
          if (newIncident.clientIds.length > 0) {
            await supabase.from('incident_clients').insert(newIncident.clientIds.map((clientId) => ({ incident_id: id, client_id: clientId })))
          }
          if (newIncident.projectIds.length > 0) {
            await supabase.from('incident_projects').insert(newIncident.projectIds.map((projectId) => ({ incident_id: id, project_id: projectId })))
          }
        }, () => set((s) => ({ incidents: s.incidents.filter((i) => i.id !== id) })))
        return id
      },

      updateIncident(id, patch) {
        const prev = get().incidents
        set((s) => ({ incidents: mutateIncident(s.incidents, id, (i) => ({ ...i, ...patch })) }))
        sync(async () => {
          const fields: Record<string, unknown> = {}
          if (patch.title !== undefined) fields.title = patch.title
          if (patch.description !== undefined) fields.description = patch.description
          if (patch.owner !== undefined) fields.owner = patch.owner
          if (patch.priority !== undefined) fields.priority = patch.priority
          if (patch.impact !== undefined) fields.impact = patch.impact
          if (patch.deadline !== undefined) fields.deadline = patch.deadline
          if (Object.keys(fields).length === 0) return
          fields.updated_at = new Date().toISOString()
          fields.updated_by = getUserId()
          const { error } = await supabase.from('incidents').update(fields).eq('id', id)
          if (error) throw new Error(error.message)
        }, () => set({ incidents: prev }))
      },

      deleteIncident(id) {
        const prev = get().incidents
        set((s) => ({ incidents: s.incidents.filter((i) => i.id !== id) }))
        sync(async () => {
          const { error } = await supabase.from('incidents').delete().eq('id', id)
          if (error) throw new Error(error.message)
        }, () => set({ incidents: prev }))
      },

      updateIncidentStatus(id, status) {
        const now = new Date().toISOString()
        const current = get().incidents.find((i) => i.id === id)
        const enteringResolved = (status === 'resolved' || status === 'closed') && !current?.resolvedAt
        set((s) => ({
          incidents: mutateIncident(s.incidents, id, (i) => ({
            ...i,
            status,
            statusChangedAt: now,
            // First time entering resolved/closed: stamp resolvedAt. Never cleared on reopen.
            resolvedAt: enteringResolved ? now : i.resolvedAt,
          })),
        }))
        sync(async () => {
          const fields: Record<string, unknown> = { status, status_changed_at: now }
          if (enteringResolved) fields.resolved_at = now
          const { error } = await supabase.from('incidents').update(fields).eq('id', id)
          if (error) throw new Error(error.message)
        })
        if (current) {
          get().addHistoryEntry({ type: 'incident', id }, { event: 'status_changed', title: current.title, detail: status })
          const statusLabel: Record<IncidentStatus, string> = {
            open: 'Aberto', in_progress: 'Em andamento', waiting_on_client: 'Aguardando cliente', resolved: 'Resolvido', closed: 'Fechado',
          }
          const recipients = new Set<string>()
          if (current.owner?.type === 'member' && current.owner.memberId) recipients.add(current.owner.memberId)
          for (const s of current.stakeholders) if (s.type === 'member' && s.memberId) recipients.add(s.memberId)
          for (const memberId of recipients) {
            notifyUser(memberId, `Incidente "${current.title}" mudou para ${statusLabel[status]}`, `/support/${id}`)
          }
        }
      },

      linkIncidentClient(incidentId, clientId) {
        set((s) => ({
          incidents: mutateIncident(s.incidents, incidentId, (i) =>
            i.clientIds.includes(clientId) ? i : { ...i, clientIds: [...i.clientIds, clientId] }),
        }))
        sync(async () => {
          const { error } = await supabase.from('incident_clients').insert({ incident_id: incidentId, client_id: clientId })
          if (error) throw new Error(error.message)
        })
      },

      unlinkIncidentClient(incidentId, clientId) {
        set((s) => ({
          incidents: mutateIncident(s.incidents, incidentId, (i) => ({ ...i, clientIds: i.clientIds.filter((id) => id !== clientId) })),
        }))
        sync(async () => {
          const { error } = await supabase.from('incident_clients').delete().eq('incident_id', incidentId).eq('client_id', clientId)
          if (error) throw new Error(error.message)
        })
      },

      linkIncidentProject(incidentId, projectId) {
        set((s) => ({
          incidents: mutateIncident(s.incidents, incidentId, (i) =>
            i.projectIds.includes(projectId) ? i : { ...i, projectIds: [...i.projectIds, projectId] }),
        }))
        sync(async () => {
          const { error } = await supabase.from('incident_projects').insert({ incident_id: incidentId, project_id: projectId })
          if (error) throw new Error(error.message)
        })
      },

      unlinkIncidentProject(incidentId, projectId) {
        set((s) => ({
          incidents: mutateIncident(s.incidents, incidentId, (i) => ({ ...i, projectIds: i.projectIds.filter((id) => id !== projectId) })),
        }))
        sync(async () => {
          const { error } = await supabase.from('incident_projects').delete().eq('incident_id', incidentId).eq('project_id', projectId)
          if (error) throw new Error(error.message)
        })
      },

      addIncidentStakeholder(incidentId, owner) {
        set((s) => ({
          incidents: mutateIncident(s.incidents, incidentId, (i) => ({ ...i, stakeholders: [...i.stakeholders, owner] })),
        }))
        sync(async () => {
          const { error } = await supabase.from('incident_stakeholders').insert({ id: owner.id, incident_id: incidentId, owner })
          if (error) throw new Error(error.message)
        })
        if (owner.type === 'member' && owner.memberId) {
          const incident = get().incidents.find((i) => i.id === incidentId)
          notifyUser(owner.memberId, `Você foi adicionado como stakeholder em "${incident?.title ?? 'um incidente'}"`, `/support/${incidentId}`)
        }
      },

      removeIncidentStakeholder(incidentId, ownerId) {
        set((s) => ({
          incidents: mutateIncident(s.incidents, incidentId, (i) => ({ ...i, stakeholders: i.stakeholders.filter((o) => o.id !== ownerId) })),
        }))
        sync(async () => {
          const { error } = await supabase.from('incident_stakeholders').delete().eq('id', ownerId)
          if (error) throw new Error(error.message)
        })
      },

      // ── Incident entries (Tasks) ──────────────────────────────────────────

      addIncidentEntry(incidentId, entryData) {
        const entryId = uuid()
        const prev = get().incidents
        set((s) => ({
          incidents: mutateIncident(s.incidents, incidentId, (i) =>
            refreshIncidentCriticalPath({
              ...i,
              entries: [...i.entries, { ...entryData, id: entryId, isCritical: false, subtasks: [], comments: [], links: [] }],
            }),
          ),
        }))
        sync(async () => {
          const userId = getUserId()
          const incident = get().incidents.find((i) => i.id === incidentId)
          const entry = incident?.entries.find((e) => e.id === entryId)
          if (!entry) return
          const { error } = await supabase.from('entries').insert(storeEntryToDb(entry, null, null, userId, incidentId))
          if (error) throw new Error(error.message)
        }, () => set({ incidents: prev }))
      },

      updateIncidentEntry(incidentId, entryId, patch) {
        const prev = get().incidents
        const prevEntry = prev.find((i) => i.id === incidentId)?.entries.find((e) => e.id === entryId)
        set((s) => ({
          incidents: mutateIncident(s.incidents, incidentId, (i) =>
            refreshIncidentCriticalPath({
              ...i,
              entries: i.entries.map((e) => e.id === entryId ? { ...e, ...patch } : e),
            }),
          ),
        }))
        sync(async () => {
          const incident = get().incidents.find((i) => i.id === incidentId)
          if (!incident) return
          await dbSyncIncidentEntry(incident, entryId, getUserId())
        }, () => set({ incidents: prev }))
        if (patch.owners) {
          const entryName = patch.name ?? prevEntry?.name ?? 'uma tarefa'
          notifyNewOwners(prevEntry?.owners, patch.owners, `Você foi adicionado como responsável em "${entryName}"`, `/support/${incidentId}`)
        }
        if (patch.status) {
          const entryName = patch.name ?? prevEntry?.name ?? 'uma tarefa'
          notifyValidatorOnValidationEntry(prevEntry?.status, patch.status, patch.owners ?? prevEntry?.owners, entryName, `/support/${incidentId}`)
        }
      },

      deleteIncidentEntry(incidentId, entryId) {
        const prev = get().incidents
        set((s) => ({
          incidents: mutateIncident(s.incidents, incidentId, (i) =>
            refreshIncidentCriticalPath({ ...i, entries: i.entries.filter((e) => e.id !== entryId) }),
          ),
        }))
        sync(async () => {
          const { error } = await supabase.from('entries').delete().eq('id', entryId)
          if (error) throw new Error(error.message)
        }, () => set({ incidents: prev }))
      },

      updateIncidentEntryStatus(incidentId, entryId, status) {
        const now = new Date().toISOString().split('T')[0]
        const prev = get().incidents
        const prevEntry = prev.find((i) => i.id === incidentId)?.entries.find((e) => e.id === entryId)
        set((s) => ({
          incidents: mutateIncident(s.incidents, incidentId, (i) => ({
            ...i,
            entries: i.entries.map((e) => {
              if (e.id !== entryId) return e
              const patch: Partial<Entry> = { status, statusOverride: true }
              if (status === 'in_progress' && !e.actualStart) patch.actualStart = now
              if (status === 'done' && !e.actualEnd) patch.actualEnd = now
              return { ...e, ...patch }
            }),
          })),
        }))
        if (prevEntry) notifyValidatorOnValidationEntry(prevEntry.status, status, prevEntry.owners, prevEntry.name, `/support/${incidentId}`)
        sync(async () => {
          const incident = get().incidents.find((i) => i.id === incidentId)
          if (!incident) return
          await dbSyncIncidentEntry(incident, entryId, getUserId())
        }, () => set({ incidents: prev }))
      },

      changeIncidentEntryDate(incidentId, entryId, field, value) {
        const incident = get().incidents.find((i) => i.id === incidentId)
        if (!incident) return
        const { settings } = get()
        const prev = get().incidents

        const newPhases = applyIsCritical(
          applyDateChange({ phases: [{ id: '_incident', name: '', order: 0, entries: incident.entries }] }, entryId, field, value, settings.holidays),
        )
        const today = new Date().toISOString().split('T')[0]
        const updatedEntries = (newPhases[0]?.entries ?? []).map((e) => applyAutoStatus(e, today))

        set((s) => ({
          incidents: mutateIncident(s.incidents, incidentId, (i) => ({ ...i, entries: updatedEntries })),
        }))
        sync(async () => {
          const updated = get().incidents.find((i) => i.id === incidentId)
          if (!updated) return
          await dbSyncAllIncidentEntries(updated, getUserId())
        }, () => set({ incidents: prev }))
      },
    }),
    {
      name: 'open-store',
      // Only persist local preferences — global settings are loaded from Supabase
      partialize: (state) => ({
        settings: {
          templates: state.settings.templates,
          templatesVersion: state.settings.templatesVersion,
          incidentTemplates: state.settings.incidentTemplates,
          sidebarCollapsed: state.settings.sidebarCollapsed,
        },
      }),
      merge: (persisted, current) => {
        const persistedObj = persisted as { settings?: Partial<AppSettings> }
        const persistedSettings = persistedObj.settings ?? {}
        const shouldResetTemplates = (persistedSettings.templatesVersion ?? 0) < TEMPLATES_VERSION
        return {
          ...current,
          settings: {
            ...current.settings,
            sidebarCollapsed: persistedSettings.sidebarCollapsed,
            templatesVersion: TEMPLATES_VERSION,
            templates: shouldResetTemplates ? DEFAULT_TEMPLATES : (persistedSettings.templates ?? DEFAULT_TEMPLATES),
            incidentTemplates: persistedSettings.incidentTemplates ?? [],
          },
        } as AppStore
      },
    },
  ),
)
