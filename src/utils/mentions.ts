/** Para onde cada tipo de menção leva (o clique é tratado por quem hospeda o editor, que tem o Router). */
export const MENTION_ROUTE: Record<MentionKind, (id: string) => string> = {
  user: () => '', // pessoas não têm página própria
  project: (id) => `/projects/${id}`,
  incident: (id) => `/support/${id}`,
  client: (id) => `/wallet/${id}`,
}

export type MentionKind = 'user' | 'project' | 'incident' | 'client'

/** Link Markdown de uma menção: [@Nome](open:user/<id>) — é isso que o banco lê para notificar. */
export function mentionHref(kind: MentionKind, id: string): string {
  return `open:${kind}/${id}`
}
