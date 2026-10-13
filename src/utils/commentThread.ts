// Lógica pura da conversa de comentários de uma tarefa: cadeia (comentário + respostas) e menções no texto.

export interface MentionRef { id: string; name: string }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** "@Ana Souza" digitado → [@Ana Souza](open:user/<id>). Só vira link o nome escolhido na lista (e ainda intacto no texto). */
export function encodeMentions(text: string, picked: MentionRef[]): string {
  let out = text
  for (const p of [...picked].sort((a, b) => b.name.length - a.name.length)) {
    const re = new RegExp(`(^|[\\s(])@${escapeRe(p.name)}(?=$|[\\s.,;:!?)])`, 'g')
    out = out.replace(re, (_m, pre: string) => `${pre}[@${p.name}](open:user/${p.id})`)
  }
  return out
}

/** Inverso de encodeMentions, para editar um comentário: [@Ana](open:user/<id>) → @Ana (guardando quem foi mencionado). */
export function decodeMentions(markdown: string): { text: string; picked: MentionRef[] } {
  const picked: MentionRef[] = []
  const text = markdown.replace(/\[@([^\]\n]+)\]\(open:user\/([0-9a-fA-F-]{36})\)/g, (_m, name: string, id: string) => {
    if (!picked.some((p) => p.id === id)) picked.push({ id, name })
    return `@${name}`
  })
  return { text, picked }
}

/** O "@algo" que está sendo digitado antes do cursor (para abrir a lista de pessoas), ou null. */
export function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at === -1) return null
  if (at > 0 && !/\s/.test(before[at - 1])) return null // "email@dominio" não é menção
  const query = before.slice(at + 1)
  if (query.length > 28 || /[\n]/.test(query) || /\s{2,}/.test(query)) return null
  if (!/^[\p{L}\p{N}' .-]*$/u.test(query)) return null
  return { start: at, query }
}

export interface ThreadItem { id: string; parentId?: string; createdAt: string }
export interface Thread<T extends ThreadItem> { root: T; replies: T[] }

/** Comentários soltos → cadeias: cada comentário raiz (mais antigo primeiro) com suas respostas (mais antiga primeiro).
 *  Uma resposta cujo pai sumiu (apagado em outra tela) aparece como raiz, em vez de desaparecer. */
export function buildThreads<T extends ThreadItem>(comments: T[]): Thread<T>[] {
  const byTime = (a: T, b: T) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  const ids = new Set(comments.map((c) => c.id))
  const roots = comments.filter((c) => !c.parentId || !ids.has(c.parentId)).sort(byTime)
  return roots.map((root) => ({ root, replies: comments.filter((c) => c.parentId === root.id).sort(byTime) }))
}

/** "há 5 min", "há 3 h", "ontem", ou a data — curto, para o cabeçalho de cada comentário. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime())
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ontem'
  if (d < 7) return `há ${d} dias`
  return new Date(iso).toLocaleDateString()
}
