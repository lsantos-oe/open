import { useEffect, useState } from 'react'
import type { Awareness } from 'y-protocols/awareness'

export interface Collaborator { clientId: number; name: string; color: string }

/** Quem mais está com o documento aberto (via awareness), sem contar a própria pessoa. */
export function useCollabPresence(awareness: Awareness | undefined): Collaborator[] {
  const [people, setPeople] = useState<Collaborator[]>([])

  useEffect(() => {
    if (!awareness) return
    const read = () => {
      const list: Collaborator[] = []
      awareness.getStates().forEach((state, clientId) => {
        const user = (state as { user?: { name?: string; color?: string } }).user
        if (clientId !== awareness.clientID && user?.name) list.push({ clientId, name: user.name, color: user.color ?? '#888' })
      })
      setPeople(list)
    }
    read()
    awareness.on('change', read)
    return () => awareness.off('change', read)
  }, [awareness])

  return people
}
