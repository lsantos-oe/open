import { ClientContact } from '@/types'

/** Contacts are a shared base (Fase 8.7) — a client's contact list is always
 *  derived live from the global list, never stored on the Client itself. */
export function contactsForClient(allContacts: ClientContact[], clientId: string): ClientContact[] {
  return allContacts.filter((c) => c.clientIds.includes(clientId))
}

export function contactsForClients(allContacts: ClientContact[], clientIds: string[]): ClientContact[] {
  return allContacts.filter((c) => c.clientIds.some((id) => clientIds.includes(id)))
}
