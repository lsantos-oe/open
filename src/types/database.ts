/**
 * Typed interfaces for Supabase tables.
 * Snake_case — distinct from the camelCase store types in src/types/index.ts.
 * Derived from the actual schema in src/types/supabase.ts.
 */

import type {
  EntryType, EntryStatus, RiskFlag, ProjectStatus, ProjectType,
  AppLanguage, DelayResponsibility, DelayType, Probability, Impact,
} from '@/types'

// ─── JSON column shapes ───────────────────────────────────────────────────────
// These define the structure of JSONB columns stored in Postgres.

export interface DbCharter {
  sponsor: string
  objectives: string
  scope: string
  out_of_scope: string
  success_criteria: string
  constraints: string
  assumptions: string
  budget?: string
}

export interface DbLink {
  id: string
  label: string
  url: string
}

export interface DbTeamMember {
  id: string
  name: string
  role: string
  email?: string
  user_id?: string
}

export interface DbActionTask {
  id: string
  description: string
  responsible?: string
  due_date?: string
  done: boolean
}

export interface DbCommentJson {
  id: string
  author: string
  text: string
  created_at: string
}

/** Subtask stored as JSON inside entries.subtasks */
export interface DbSubtaskJson {
  id: string
  type: EntryType
  name: string
  responsible: string
  depends_on: string[]
  is_critical: boolean
  planned_start?: string
  planned_end?: string
  baseline_start?: string
  baseline_end?: string
  planned_date?: string
  baseline_date?: string
  actual_start?: string
  actual_end?: string
  duration_days?: number
  duration_hours?: number
  risk_flag: RiskFlag
  status: EntryStatus
  status_override?: boolean
  responsible_member_id?: string
  order: number
  comments: DbCommentJson[]
  links: DbLink[]
}

// ─── Table row types ──────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'member'

export interface DbProfile {
  id: string
  email: string | null
  name: string | null
  avatar_url: string | null
  role: UserRole
  active: boolean
  created_at: string | null
}

export interface DbInvitedUser {
  id: string
  email: string
  name: string | null
  role: UserRole
  invited_at: string
  invited_by: string | null
}

export interface DbNotification {
  id: string
  user_id: string
  message: string
  link: string | null
  read: boolean
  created_at: string
}

export interface DbProject {
  id: string
  name: string
  client: string | null       // deprecated free-text — see client_id
  client_id: string | null
  type: ProjectType | null
  pm: string | null
  pm_member_id: string | null
  dev_lead: string | null
  dev_lead_member_id: string | null
  dev_type: 'integration' | 'application' | null
  dev_integration: string | null
  language: AppLanguage | null
  status: ProjectStatus | null
  baseline_set_at: string | null
  charter: DbCharter | null          // JSONB
  overview: string | null
  proposal_link: string | null
  deal_link: string | null
  links: DbLink[] | null              // JSONB
  team: DbTeamMember[] | null         // JSONB
  archived: boolean | null
  hidden: boolean | null
  created_at: string | null
  created_by: string | null
  updated_at: string | null
  updated_by: string | null
}

export interface DbPhase {
  id: string
  project_id: string | null
  name: string
  order: number | null
  created_at: string | null
  is_unassigned: boolean | null
}

export interface DbEntry {
  id: string
  project_id: string | null
  phase_id: string | null
  incident_id: string | null
  type: EntryType
  name: string
  description: string | null
  responsible: string | null
  responsible_member_id: string | null
  depends_on: string[] | null         // JSONB stored as string[]
  is_critical: boolean | null
  planned_start: string | null
  planned_end: string | null
  baseline_start: string | null
  baseline_end: string | null
  planned_date: string | null
  baseline_date: string | null
  planned_time: string | null
  actual_start: string | null
  actual_end: string | null
  duration_days: number | null
  duration_hours: number | null
  risk_flag: RiskFlag | null
  status: EntryStatus | null
  status_override: boolean | null
  order: number | null
  parent_entry_id: string | null
  subtasks: DbSubtaskJson[] | null    // JSONB
  links: DbLink[] | null              // JSONB
  owners: any[] | null                // JSONB — EntryOwner[]
  hidden_from_plan: boolean | null
  created_at: string | null
  created_by: string | null
  updated_at: string | null
  updated_by: string | null
}

export interface DbComment {
  id: string
  project_id: string | null
  entry_id: string | null
  author_id: string | null
  author_name: string | null
  author_avatar: string | null
  text: string
  created_at: string | null
}

export interface DbDelayLog {
  id: string
  project_id: string | null
  entry_id: string | null
  entry_name: string | null
  days: number | null
  description: string | null
  responsibility: DelayResponsibility | null
  type: DelayType | null
  triggered_by: 'manual' | 'cascade' | null
  created_at: string | null           // used as the delay date
  created_by: string | null
}

export interface DbReportLink {
  id: string
  project_id: string | null
  storage_path: string
  label: string
  generated_at: string | null
  created_by: string | null
}

export interface DbRisk {
  id: string
  project_id: string | null
  description: string
  probability: Probability | null
  impact: Impact | null
  score: number | null
  status: string | null
  owner: string | null
  due_date: string | null
  linked_entry_ids: string[] | null   // JSONB stored as string[]
  action_tasks: DbActionTask[] | null // JSONB
  created_at: string | null
  created_by: string | null
  updated_at: string | null
}

export interface DbOpenPoint {
  id: string
  project_id: string | null
  incident_id: string | null
  title: string
  description: string | null
  status: string | null
  priority: string | null
  owner: string | null
  owner_user_id: string | null
  due_date: string | null
  linked_entry_id: string | null
  linked_phase_id: string | null
  resolution_note: string | null
  resolved_at: string | null
  resolved_by: string | null
  created_at: string | null
  created_by: string | null
  created_by_name: string | null
  created_by_avatar: string | null
}

export interface DbMeetingLog {
  id: string
  project_id: string | null   // Meetings are project-only — no incident_id column
  title: string
  date: string
  participants: any[] | null   // JSONB — EntryOwner[]
  notes: string | null
  items: any[] | null          // JSONB — MeetingItem[]
  attachments: any[] | null    // JSONB — FileAttachment[]
  created_at: string | null
  created_by: string | null
  created_by_name: string | null
  created_by_avatar: string | null
  updated_at: string | null
  updated_by: string | null
  updated_by_name: string | null
}

export interface DbHistory {
  id: string
  project_id: string | null
  incident_id: string | null
  type: 'auto' | 'manual' | null
  event: string
  title: string
  detail: string | null
  linked_id: string | null
  linked_type: string | null
  attachments: any[] | null    // JSONB — FileAttachment[]
  date: string | null
  author_id: string | null
  author_name: string | null
  author_avatar: string | null
}

export interface DbClient {
  id: string
  name: string
  country: string | null
  ploomes_link: string | null
  notes: string | null
  status: string
  owners: any            // JSONB — EntryOwner[]
  created_at: string | null
  created_by: string | null
  archived: boolean | null
}

export interface DbClientContact {
  id: string
  name: string
  role: string | null
  email: string | null
  phone: string | null
  created_at: string | null
}

export interface DbContactClientLink {
  contact_id: string
  client_id: string
}

export interface DbClientCsAssignment {
  id: string
  client_id: string
  owner: any            // JSONB — EntryOwner
  assigned_at: string
  note: string | null
  created_at: string | null
  created_by: string | null
}

export interface DbDiaryComment {
  id: string
  project_id: string | null
  incident_id: string | null
  parent_type: 'open_point' | 'meeting' | 'history'
  parent_id: string
  text: string
  author_id: string | null
  author_name: string | null
  author_avatar: string | null
  author_role: string | null
  created_at: string | null
}

export interface DbIncident {
  id: string
  title: string
  description: string | null
  owner: any | null          // JSONB — EntryOwner
  status: string
  status_changed_at: string
  resolved_at: string | null
  priority: string
  impact: string
  deadline: string | null
  created_at: string | null
  created_by: string | null
  updated_at: string | null
  updated_by: string | null
}

export interface DbIncidentClient {
  incident_id: string
  client_id: string
}

export interface DbIncidentProject {
  incident_id: string
  project_id: string
}

export interface DbIncidentStakeholder {
  id: string
  incident_id: string
  owner: any          // JSONB — EntryOwner
  created_at: string | null
}

// ─── Fetch / write bundles ────────────────────────────────────────────────────

/** All rows needed to reconstruct a full Project from the DB. */
export interface DbProjectFull {
  project: DbProject
  phases: DbPhase[]
  entries: DbEntry[]
  comments: DbComment[]
  delay_log: DbDelayLog[]
  risks: DbRisk[]
  report_links: DbReportLink[]
  open_points: DbOpenPoint[]
  meeting_logs: DbMeetingLog[]
  history: DbHistory[]
  diary_comments: DbDiaryComment[]
}

/** All rows that need to be upserted when writing a full Project to the DB. */
export interface DbProjectFlat {
  project: DbProject
  phases: DbPhase[]
  entries: DbEntry[]
  comments: DbComment[]
  delay_log: DbDelayLog[]
  risks: DbRisk[]
}
