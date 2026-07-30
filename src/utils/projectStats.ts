import { parseISO } from 'date-fns'
import { Project } from '@/types'
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
