import { Project, Incident, Entry, Client, EntryOwner } from '@/types'

/** Stable identity for an EntryOwner across different entries. `EntryOwner.id`
 *  is a random uuid minted fresh every time an owner is assigned (see
 *  OwnersField), so it's NOT stable — the same person picked on two different
 *  tasks gets two different `id`s. `memberId`/`contactId` are the real stable
 *  keys; free-text owners have no identity beyond their typed name. */
export function ownerKey(o: EntryOwner): string {
  return o.memberId ? `member:${o.memberId}` : o.contactId ? `contact:${o.contactId}` : `text:${o.name}`
}

const foldName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

/** Identidade de um responsável que reconhece o usuário mesmo quando ele foi gravado só pelo nome (texto livre):
 *  "Leonardo Santos" em texto vira o usuário Leonardo Santos, se existir um único usuário ativo com esse nome. Evita a
 *  mesma pessoa aparecer duas vezes (uma como usuário, outra como nome solto). Nomes ambíguos ou de papel
 *  ("Dev", "Cliente") continuam sendo texto. */
export function ownerResolver(directory: { id: string; name: string | null; active: boolean }[]) {
  const byName = new Map<string, string | null>()   // null = mais de um usuário com o mesmo nome
  for (const p of directory) {
    if (!p.active || !p.name) continue
    const k = foldName(p.name)
    byName.set(k, byName.has(k) ? null : p.id)
  }
  /** Id do usuário (perfil) deste responsável, se for um. */
  const userIdOf = (o: EntryOwner): string | undefined => {
    if (o.memberId) return o.memberId
    if (o.contactId || o.type !== 'text') return undefined
    return byName.get(foldName(o.name)) ?? undefined
  }
  const keyOf = (o: EntryOwner): string => {
    const id = userIdOf(o)
    return id ? `member:${id}` : ownerKey(o)
  }
  return { userIdOf, keyOf }
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

/** Responsáveis de uma tarefa. Linhas e subtarefas antigas não têm `owners`: o responsável vem de `responsible`
 *  (nome) e `responsibleMemberId` (perfil). Com o perfil, é o mesmo usuário das demais tarefas — senão cairia como um
 *  "nome solto" e a mesma pessoa apareceria duas vezes em filtros, grupos e na carga. */
export function entryOwnersOf(entry: Entry): EntryOwner[] {
  if (entry.owners && entry.owners.length > 0) return entry.owners
  if (!entry.responsible) return []
  return entry.responsibleMemberId
    ? [{ id: entry.responsibleMemberId, type: 'member', memberId: entry.responsibleMemberId, name: entry.responsible }]
    : [{ id: entry.responsible, type: 'text', name: entry.responsible }]
}

export function isEntryMine(entry: Entry, userId?: string): boolean {
  if (!userId) return false
  return entryOwnersOf(entry).some((o) => o.memberId === userId)
}

/** Papel que a pessoa tem numa tarefa: 'both' no filtro = executor ou validador (qualquer um dos dois). */
export type MyRole = 'executor' | 'validator' | 'both'

/** Minhas tarefas pelo papel. Responsáveis antigos, sem `kind`, contam como executor. */
export function isEntryMineAs(entry: Entry, userId: string | undefined, role: MyRole): boolean {
  if (!userId) return false
  return entryOwnersOf(entry).some((o) => o.memberId === userId && (role === 'both' || (o.kind ?? 'executor') === role))
}

export function isClientMine(client: Client, userId?: string): boolean {
  if (!userId) return false
  return client.owners.some((o) => o.memberId === userId)
}
