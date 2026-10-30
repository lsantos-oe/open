// Códigos curtos das coisas (C-2026-000123): letra da entidade + ano + sequência de 6 dígitos.
// A letra diz o que é; o banco gera e nunca muda (ver supabase/migrations/20261031_display_codes.sql).

export const CODE_RE = /^[A-Z]-\d{4}-\d{6}$/

export const normalizeCode = (s: string) => s.trim().toUpperCase()
export const isCode = (s: string) => CODE_RE.test(normalizeCode(s))

export type CodeTable = 'clients' | 'projects' | 'incidents' | 'entries' | 'contacts' | 'client_groups' | 'risks' | 'documentation_items'

export const CODE_PREFIX: Record<CodeTable, string> = {
  clients: 'C', projects: 'P', incidents: 'I', entries: 'T', contacts: 'K', client_groups: 'G', risks: 'R', documentation_items: 'D',
}

export const CODE_KIND_LABEL: Record<string, string> = {
  C: 'Cliente', P: 'Projeto', I: 'Incidente', T: 'Tarefa', K: 'Contato', G: 'Grupo', R: 'Risco', D: 'Documentação',
}

/** Link curto e estável: abre o que o código aponta, esteja onde estiver. */
export const codeLink = (code: string, origin: string = typeof window !== 'undefined' ? window.location.origin : '') => `${origin}/r/${normalizeCode(code)}`

/** Resposta de resolve_code(): o que é e onde abrir. */
export interface ResolvedCode {
  kind: 'client' | 'project' | 'incident' | 'group' | 'contact' | 'entry' | 'risk' | 'doc'
  id: string
  projectId?: string | null
  incidentId?: string | null
  clientId?: string | null
  entryId?: string | null
}

/** Rota do app para um código resolvido. `code` entra como ?doc= para itens de documentação (a aba o destaca). */
export function routeForResolved(r: ResolvedCode, code: string): { path: string; openEntryId?: string } {
  switch (r.kind) {
    case 'client': return { path: `/wallet/${r.id}` }
    case 'project': return { path: `/projects/${r.id}` }
    case 'incident': return { path: `/support/${r.id}` }
    case 'group': return { path: `/wallet/groups/${r.id}` }
    case 'contact': return { path: '/contacts' }
    case 'risk': return { path: r.projectId ? `/projects/${r.projectId}?tab=risks` : '/risks' }
    case 'entry':
      if (r.projectId) return { path: `/projects/${r.projectId}`, openEntryId: r.id }
      if (r.incidentId) return { path: `/support/${r.incidentId}`, openEntryId: r.id }
      return { path: '/tasks', openEntryId: r.id }
    case 'doc':
      if (r.projectId) return { path: `/projects/${r.projectId}?tab=docs&doc=${code}` }
      if (r.clientId) return { path: `/wallet/${r.clientId}?tab=docs&doc=${code}` }
      return { path: '/' }
  }
}
