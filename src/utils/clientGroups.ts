import type { Client, ClientContact, ClientGroup } from '@/types'

// Grupos de clientes: regras puras (sem rede), para as telas e para os testes.

export const MIN_GROUP_CLIENTS = 2

export const normalizeGroupName = (name: string) => name.replace(/\s+/g, ' ').trim()

/** Grupos de que o cliente participa. */
export const groupsOfClient = (groups: ClientGroup[], clientId: string): ClientGroup[] =>
  groups.filter((g) => g.clientIds.includes(clientId))

/** Um grupo precisa de 2 ou mais clientes; abaixo disso só se avisa (nada é apagado). */
export const isUnderMinimum = (group: ClientGroup): boolean => group.clientIds.length < MIN_GROUP_CLIENTS

/** Clientes que podem entrar neste grupo: os que ainda não têm grupo — ou qualquer um, se a configuração permitir vários. */
export function eligibleClients(clients: Client[], groups: ClientGroup[], group: ClientGroup | null, allowMultiple: boolean): Client[] {
  const inGroup = new Set(group?.clientIds ?? [])
  const taken = new Set(groups.flatMap((g) => g.clientIds))
  return clients.filter((c) => !c.archived && !inGroup.has(c.id) && (allowMultiple || !taken.has(c.id)))
}

/** Nome do grupo que já tem esse nome (ignorando caixa, espaços e acentos)? */
export function groupNameTaken(groups: ClientGroup[], name: string, exceptId?: string): boolean {
  const fold = (s: string) => normalizeGroupName(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const n = fold(name)
  return groups.some((g) => g.id !== exceptId && fold(g.name) === n)
}

export interface GroupContactRow {
  contact: ClientContact
  /** Colocado direto no grupo (vale para todos os clientes). */
  direct: boolean
  /** Clientes membros a que esta pessoa está ligada. */
  clientIds: string[]
}

/** Contatos do grupo: os colocados direto e os dos clientes membros, sem repetir, diretos primeiro. */
export function groupContacts(group: ClientGroup, contacts: ClientContact[]): GroupContactRow[] {
  const members = new Set(group.clientIds)
  const direct = new Set(group.contactIds)
  const rows: GroupContactRow[] = []
  for (const c of contacts) {
    const clientIds = c.clientIds.filter((id) => members.has(id))
    const isDirect = direct.has(c.id)
    if (!isDirect && clientIds.length === 0) continue
    rows.push({ contact: c, direct: isDirect, clientIds })
  }
  return rows.sort((a, b) => Number(b.direct) - Number(a.direct) || a.contact.name.localeCompare(b.contact.name, 'pt-BR'))
}
