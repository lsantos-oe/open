import { EntryOwner, TeamMember } from '@/types'
import type { DbProfile } from '@/types/database'

/** Maps the global registered-user directory into the TeamMember shape the
 *  owner-resolution helpers expect — same conversion used throughout the app
 *  (e.g. TasksPage.tsx, IncidentEntryModal.tsx). */
export function teamDirectoryAsTeamMembers(teamDirectory: DbProfile[]): TeamMember[] {
  return teamDirectory
    .filter((p) => p.active)
    .map((p) => ({ id: p.id, name: p.name ?? p.email ?? '', role: '', email: p.email ?? undefined, userId: p.id }))
}

/** Simple case-insensitive substring match — good enough for name lookups
 *  across a workspace this size; avoids pulling in a fuzzy-match dependency. */
export function matchesQuery(name: string, query: string): boolean {
  return name.toLowerCase().includes(query.trim().toLowerCase())
}

export function findByName<T>(items: T[], query: string, getName: (item: T) => string): T[] {
  return items.filter((item) => matchesQuery(getName(item), query))
}

/** Resolves a free-text name into an EntryOwner — matches a registered team
 *  member first (so it carries a real memberId, e.g. for notifications),
 *  falls back to a free-text owner otherwise. Mirrors OwnersField.tsx's
 *  addMember() logic. */
export function resolveOwnerByName(
  name: string,
  teamMembers: TeamMember[],
  kind?: EntryOwner['kind'],
): EntryOwner {
  const member = teamMembers.find((m) => m.name.toLowerCase() === name.trim().toLowerCase())
  if (member?.userId) {
    return { id: crypto.randomUUID(), type: 'member', memberId: member.userId, name: member.name, kind }
  }
  return { id: crypto.randomUUID(), type: 'text', name: name.trim(), kind }
}
