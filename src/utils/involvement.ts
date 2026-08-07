import { Project, Incident, Entry, Client, EntryOwner } from '@/types'

/** Stable identity for an EntryOwner across different entries. `EntryOwner.id`
 *  is a random uuid minted fresh every time an owner is assigned (see
 *  OwnersField), so it's NOT stable — the same person picked on two different
 *  tasks gets two different `id`s. `memberId`/`contactId` are the real stable
 *  keys; free-text owners have no identity beyond their typed name. */
export function ownerKey(o: EntryOwner): string {
  return o.memberId ? `member:${o.memberId}` : o.contactId ? `contact:${o.contactId}` : `text:${o.name}`
}

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

export function isClientMine(client: Client, userId?: string): boolean {
  if (!userId) return false
  return client.owners.some((o) => o.memberId === userId)
}
