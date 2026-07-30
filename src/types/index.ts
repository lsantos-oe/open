export type EntryType = 'task' | 'milestone' | 'meeting'
export type RiskFlag = 'none' | 'warning' | 'critical'
export type EntryStatus = 'pending' | 'in_progress' | 'done' | 'blocked' | 'overdue'
export type ProjectStatus = 'planning' | 'in_progress' | 'delayed' | 'done'
export type ProjectType = 'nova_conta' | 'novo_projeto'
export type AppLanguage = 'pt' | 'en' | 'es'
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY'
export type Workdays = 'mon-fri' | 'mon-sat'
export type Probability = 'low' | 'medium' | 'high'
export type Impact = 'low' | 'medium' | 'high'
export type DelayResponsibility = 'internal' | 'client_business' | 'client_it' | 'client_provider'
export type DelayType = 'execution' | 'definition' | 'planning'

export interface EntryComment {
  id: string
  author: string
  text: string
  createdAt: string
}

export interface Link {
  id: string
  label: string
  url: string
}

export interface EntryOwner {
  id: string
  type: 'member' | 'text' | 'contact'
  memberId?: string
  contactId?: string
  name: string
  role?: string
}

export interface Entry {
  id: string
  type: EntryType
  name: string
  responsible: string
  dependsOn: string[]
  isCritical: boolean
  plannedStart?: string
  plannedEnd?: string
  baselineStart?: string
  baselineEnd?: string
  plannedDate?: string
  baselineDate?: string
  actualStart?: string
  actualEnd?: string
  durationDays?: number
  durationHours?: number
  riskFlag: RiskFlag
  status: EntryStatus
  statusOverride?: boolean
  responsibleMemberId?: string
  responsibleMode?: 'member' | 'free'
  owners?: EntryOwner[]
  hiddenFromPlan?: boolean
  subtasks: Entry[]
  comments: EntryComment[]
  links: Link[]
  order: number
  parentEntryId?: string
  createdAt?: string
  updatedAt?: string
  createdById?: string
  updatedById?: string
}

export interface Phase {
  id: string
  name: string
  order: number
  entries: Entry[]
}

export interface ActionTask {
  id: string
  description: string
  responsible?: string
  dueDate?: string
  done: boolean
}

export interface Risk {
  id: string
  description: string
  probability: Probability
  impact: Impact
  score: number
  status: string
  owner: string
  dueDate?: string
  linkedEntryIds: string[]
  actionTasks: ActionTask[]
}

export interface DelayLogEntry {
  id: string
  date: string
  entryId: string
  entryName: string
  days: number
  responsibility: DelayResponsibility
  type: DelayType
  description: string
  comments: string
  triggeredBy: 'manual' | 'cascade'
}

export interface TeamMember {
  id: string
  name: string
  role: string
  email?: string
  userId?: string
}

export interface DiaryComment {
  id: string
  author: string
  text: string
  createdAt: string
}

export interface FileAttachment {
  id: string
  name: string
  url: string
  size?: number
  uploadedAt: string
  uploadedBy?: string
}

export type OpenPointStatus = 'open' | 'resolved'
export type OpenPointPriority = 'low' | 'medium' | 'high'

export interface OpenPoint {
  id: string
  title: string
  description?: string
  status: OpenPointStatus
  priority: OpenPointPriority
  responsible?: string
  dueDate?: string
  resolvedAt?: string
  resolvedBy?: string
  resolution?: string
  linkedEntryId?: string
  comments: DiaryComment[]
  attachments: FileAttachment[]
  createdAt: string
  createdBy?: string
}

export interface MeetingItem {
  id: string
  text: string
  done: boolean
  type: 'action' | 'decision' | 'info'
  responsible?: string
  dueDate?: string
  promotedToOpenPointId?: string
  promotedToEntryId?: string
}

export interface MeetingLog {
  id: string
  title: string
  date: string
  participants: EntryOwner[]
  notes?: string
  items: MeetingItem[]
  comments: DiaryComment[]
  attachments: FileAttachment[]
  createdAt: string
  createdBy?: string
}

export type HistoryEventType =
  | 'project_created'
  | 'status_changed'
  | 'baseline_set'
  | 'risk_added'
  | 'delay_logged'
  | 'member_added'
  | 'meeting_held'
  | 'open_point_resolved'
  | 'note'

export interface HistoryEntry {
  id: string
  event: HistoryEventType
  title: string
  detail?: string
  linkedId?: string
  linkedType?: 'entry' | 'risk' | 'meeting' | 'open_point'
  isManualNote?: boolean
  comments: DiaryComment[]
  createdAt: string
  createdBy?: string
}

export interface ClientContact {
  id: string
  name: string
  role?: string
  email?: string
  phone?: string
}

export interface ClientCsAssignment {
  id: string
  owner: EntryOwner
  assignedAt: string
  note?: string
}

export type ClientStatus = 'pre_venda' | 'implantacao' | 'sustentacao_novos_projetos'

export interface Client {
  id: string
  name: string
  country?: string
  ploomesLink?: string
  notes?: string
  status: ClientStatus
  owners: EntryOwner[]
  contacts: ClientContact[]
  csHistory: ClientCsAssignment[]
  createdAt: string
  archived?: boolean
}

export type IncidentStatus = 'open' | 'in_progress' | 'waiting_on_client' | 'resolved' | 'closed'

export interface Incident {
  id: string
  title: string
  description?: string
  owner?: EntryOwner
  status: IncidentStatus
  statusChangedAt: string
  resolvedAt?: string
  priority: Probability
  impact: Impact
  deadline?: string
  clientIds: string[]
  projectIds: string[]
  stakeholders: EntryOwner[]
  entries: Entry[]
  openPoints: OpenPoint[]
  history: HistoryEntry[]
  createdAt: string
  createdBy?: string
}

export interface ProjectCharter {
  sponsor: string
  objectives: string
  scope: string
  outOfScope: string
  successCriteria: string
  constraints: string
  assumptions: string
  budget?: string
}

export interface Project {
  id: string
  name: string
  client: string          // deprecated free-text — being replaced by clientId (Carteira)
  clientId?: string
  type: ProjectType
  pm: string
  color?: string
  archived?: boolean
  hidden?: boolean
  devLead?: string
  devType?: 'integration' | 'application'
  devIntegration?: string
  language: AppLanguage
  status: ProjectStatus
  baselineSetAt?: string
  columnVisibility?: Record<string, boolean>
  csvColumnPrefs?: Record<string, boolean>
  reportPrefs?: { sections: Record<string, boolean>; planColumns: Record<string, boolean> }
  phases: Phase[]
  risks: Risk[]
  delayLog: DelayLogEntry[]
  team: TeamMember[]
  links: Link[]
  overview?: string
  charter?: ProjectCharter
  proposalLink?: string
  dealLink?: string
  openPoints?: OpenPoint[]
  meetings?: MeetingLog[]
  history?: HistoryEntry[]
}

// Template structures
export interface TemplateEntry {
  id: string
  type: EntryType
  name: string
  nameKey?: string  // i18n key resolved at project creation using project.language
  responsible: string
  dependsOn: string[]
  durationDays?: number
  durationHours?: number
  order: number
  subtasks: TemplateEntry[]
}

export interface TemplatePhase {
  id: string
  name: string
  nameKey?: string  // i18n key resolved at project creation using project.language
  order: number
  entries: TemplateEntry[]
}

export interface ProjectTemplate {
  id: string
  name: string
  type: ProjectType
  phases: TemplatePhase[]
}

// Settings
export interface IncidentTemplate {
  id: string
  name: string
  priority: Probability
  impact: Probability
  taskTitles: string[]
}

export interface AppSettings {
  holidays: string[]                    // ISO date strings for calculations
  holidayNames: Record<string, string>  // ISO date → display name
  templates: ProjectTemplate[]
  templatesVersion?: number
  incidentTemplates: IncidentTemplate[]
  defaultLanguage: AppLanguage
  dateFormat: DateFormat
  workdays: Workdays
  sidebarCollapsed?: boolean
}
