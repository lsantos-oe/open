import { parseISO } from 'date-fns'
import { Project, Entry } from '@/types'
import { workdaysBetween, parseHolidays } from './businessDays'

function allEntryDates(project: Project): { starts: Date[]; ends: Date[]; blEnds: Date[] } {
  const starts: Date[] = []
  const ends: Date[] = []
  const blEnds: Date[] = []

  for (const phase of project.phases) {
    for (const entry of phase.entries) {
      const items = [entry, ...entry.subtasks]
      for (const e of items) {
        if (e.plannedStart) starts.push(parseISO(e.plannedStart))
        if (e.plannedEnd) ends.push(parseISO(e.plannedEnd))
        if (e.plannedDate) { starts.push(parseISO(e.plannedDate)); ends.push(parseISO(e.plannedDate)) }
        if (e.baselineEnd) blEnds.push(parseISO(e.baselineEnd))
        if (e.baselineDate) blEnds.push(parseISO(e.baselineDate))
      }
    }
  }
  return { starts, ends, blEnds }
}

export function projectDurationDays(project: Project, holidays: string[]): number | undefined {
  const { starts, ends } = allEntryDates(project)
  if (starts.length === 0 || ends.length === 0) return undefined
  const hdates = parseHolidays(holidays)
  const minStart = starts.reduce((a, b) => (a < b ? a : b))
  const maxEnd = ends.reduce((a, b) => (a > b ? a : b))
  if (maxEnd <= minStart) return 1
  return workdaysBetween(minStart, maxEnd, hdates) + 1
}

/** Returns project-level end variance in business days. Positive = delayed. */
export function projectEndVariance(project: Project, holidays: string[]): number | undefined {
  if (!project.baselineSetAt) return undefined
  const { ends, blEnds } = allEntryDates(project)
  if (ends.length === 0 || blEnds.length === 0) return undefined
  const hdates = parseHolidays(holidays)
  const maxEnd = ends.reduce((a, b) => (a > b ? a : b))
  const maxBlEnd = blEnds.reduce((a, b) => (a > b ? a : b))
  return workdaysBetween(maxBlEnd, maxEnd, hdates)
}

/** A project is "Atrasado" when it's in progress and running behind its own
 *  baseline — this is a computed badge, not a Kanban stage: a project can be
 *  delayed while still sitting in the "Em andamento" column. */
export function isProjectDelayed(project: Project, holidays: string[]): boolean {
  if (project.status !== 'in_progress') return false
  const variance = projectEndVariance(project, holidays)
  return variance !== undefined && variance > 0
}

export function projectDateRange(project: Project): { start?: string; end?: string } {
  const { starts, ends } = allEntryDates(project)
  if (starts.length === 0) return {}
  const min = starts.reduce((a, b) => (a < b ? a : b))
  const max = ends.length > 0 ? ends.reduce((a, b) => (a > b ? a : b)) : min
  return {
    start: min.toISOString().split('T')[0],
    end: max.toISOString().split('T')[0],
  }
}

/** Collect unique client names from all projects */
export function uniqueClients(projects: Project[]): string[] {
  return [...new Set(projects.map((p) => p.client).filter(Boolean))].sort()
}

/** Collect unique PM names from all projects */
export function uniquePMs(projects: Project[]): string[] {
  return [...new Set(projects.map((p) => p.pm).filter(Boolean))].sort()
}

/** Collect unique team member names across all projects */
export function uniqueMembers(projects: Project[]): string[] {
  const names = projects.flatMap((p) => [p.pm, p.devLead ?? '', ...p.team.map((m) => m.name)]).filter(Boolean)
  return [...new Set(names)].sort()
}

/** The project's Go-live milestone date, if one exists — looks for a milestone
 *  named "go live"/"go-live", falling back to the last milestone otherwise. */
export function findGoLiveDate(project: Project): string | undefined {
  const milestones = project.phases.flatMap((ph) => ph.entries.filter((e) => e.type === 'milestone'))
  const goLive = milestones.find((e) => e.name.toLowerCase().includes('go live') || e.name.toLowerCase().includes('go-live'))
  const target = goLive ?? milestones[milestones.length - 1]
  return target?.plannedDate
}

function allVisibleEntries(project: Project): Entry[] {
  const result: Entry[] = []
  for (const phase of project.phases) {
    for (const entry of phase.entries) {
      if (entry.hiddenFromPlan) continue
      result.push(entry)
      for (const sub of entry.subtasks) {
        if (!sub.hiddenFromPlan) result.push(sub)
      }
    }
  }
  return result
}

/** % of deliverables (tasks/milestones/meetings, including subtasks, excluding
 *  internal/hidden-from-plan items) marked done. */
export function projectProgress(project: Project): { done: number; total: number; pct: number } | undefined {
  const entries = allVisibleEntries(project)
  if (entries.length === 0) return undefined
  const done = entries.filter((e) => e.status === 'done').length
  return { done, total: entries.length, pct: Math.round((done / entries.length) * 100) }
}

/** Count of entries currently flagged overdue (plannedEnd/plannedDate < today, not yet done). */
export function projectOverdueCount(project: Project): number {
  return allVisibleEntries(project).filter((e) => e.status === 'overdue').length
}

export function projectMilestoneProgress(project: Project): { done: number; total: number } | undefined {
  const milestones = allVisibleEntries(project).filter((e) => e.type === 'milestone')
  if (milestones.length === 0) return undefined
  return { done: milestones.filter((e) => e.status === 'done').length, total: milestones.length }
}

/** Deadline reference for the countdown KPI: go-live milestone if one exists,
 *  otherwise the latest planned end date across the plan. */
export function projectDeadline(project: Project): { date: string; isGoLive: boolean } | undefined {
  const goLive = findGoLiveDate(project)
  if (goLive) return { date: goLive, isGoLive: true }
  const end = projectDateRange(project).end
  return end ? { date: end, isGoLive: false } : undefined
}

/** Calendar days from today to a target ISO date — negative when the date has passed. */
export function daysUntil(targetIso: string): number {
  const today = new Date(new Date().toISOString().split('T')[0])
  const target = new Date(targetIso)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}
