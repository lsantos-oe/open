import type { Entry } from '@/types'

type WithClients = Pick<Entry, 'clientId' | 'clientIds'>

/** Clientes de uma tarefa solta. `clientIds` é a lista; `clientId` (singular) é o legado e espelha o primeiro —
 *  linhas e chamadas antigas que só conhecem `clientId` continuam valendo. */
export function entryClientIds(entry: WithClients): string[] {
  const ids = entry.clientIds?.length ? entry.clientIds : entry.clientId ? [entry.clientId] : []
  return [...new Set(ids)]
}

/** Mantém `clientId` e `clientIds` coerentes depois de um patch: o que o patch trouxe vence, o outro é derivado. */
export function normalizeEntryClients<T extends Partial<WithClients>>(patch: T): T {
  if (patch.clientIds !== undefined) {
    const ids = [...new Set(patch.clientIds)]
    return { ...patch, clientIds: ids, clientId: ids[0] }
  }
  if ('clientId' in patch) {
    return { ...patch, clientIds: patch.clientId ? [patch.clientId] : [], clientId: patch.clientId || undefined }
  }
  return patch
}
