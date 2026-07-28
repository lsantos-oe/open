import { Project, Incident, Entry } from '@/types'

/** "Meu" = usuário está no time do projeto com uma conta real vinculada (userId).
 *  PM/Dev Lead em texto livre não contam — só time vinculado. */
export function isProjectMine(project: Project, userId?: string): boolean {
  if (!userId) return false
  return project.team.some((m) => m.userId === userId)
}

export function isIncidentMine(incident: Incident, userId?: string): boolean {
  if (!userId) return false
  if (incident.owner?.memberId === userId) return true
  return incident.stakeholders.some((s) => s.memberId === userId)
}

export function isEntryMine(entry: Entry, userId?: string): boolean {
  if (!userId) return false
  return (entry.owners ?? []).some((o) => o.memberId === userId)
}
