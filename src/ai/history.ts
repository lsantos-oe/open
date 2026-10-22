import type { AiMemory, AiMemoryKind, ChatContentBlock, ChatMessage } from '@/types/ai'

// Lógica pura do histórico e da memória do assistente (sem rede, sem store): facilita testar.

/** Quantas mensagens recentes seguem para o modelo. O histórico completo continua salvo e visível na tela. */
export const MAX_CONTEXT_MESSAGES = 40

export const MEMORY_MAX_LENGTH = 500
export const MEMORY_LIMIT = 100
/** Teto de caracteres de memória injetados no prompt (as mais recentes entram primeiro). */
const MEMORY_PROMPT_BUDGET = 6000

export const MEMORY_KIND_LABEL: Record<AiMemoryKind, string> = {
  preference: 'Preferência',
  fact: 'Fato',
  correction: 'Correção',
  context: 'Contexto',
}

/** Imagens e PDFs nunca vão para o banco (são grandes e efêmeros): viram um marcador de texto. */
export function sanitizeForStorage(content: ChatContentBlock[]): ChatContentBlock[] {
  return content.map((b) => {
    if (b.type === 'image') return { type: 'text', text: '[imagem anexada]' }
    if (b.type === 'document') return { type: 'text', text: '[PDF anexado]' }
    return b
  })
}

export function titleFromText(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  if (!oneLine) return 'Nova conversa'
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}…` : oneLine
}

/** A API aceita turnos seguidos do mesmo papel, mas só fundidos: junta mensagens consecutivas de mesmo papel
 *  (resultado de ferramenta vem primeiro no bloco do usuário, como a API exige). */
export function mergeSameRole(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = []
  for (const m of messages) {
    const prev = out[out.length - 1]
    if (prev && prev.role === m.role) out[out.length - 1] = { ...prev, content: [...prev.content, ...m.content] }
    else out.push(m)
  }
  return out.map(dedupeToolResults)
}

/** A API exige exatamente UM resultado por tool_use, e os resultados vêm antes de qualquer outro bloco do usuário.
 *  Uma conversa que ficou com dois (ex.: um resultado de "ação não concluída" gravado e, depois, o da confirmação)
 *  é consertada aqui: vale o ÚLTIMO resultado de cada ferramenta. */
function dedupeToolResults(m: ChatMessage): ChatMessage {
  if (m.role !== 'user' || !hasToolResult(m)) return m
  const last = new Map<string, ChatContentBlock>()
  for (const b of m.content) if (b.type === 'tool_result') last.set(b.tool_use_id, b)
  const results = [...last.values()]
  const rest = m.content.filter((b) => b.type !== 'tool_result')
  if (results.length + rest.length === m.content.length && results.every((r, i) => m.content[i] === r)) return m
  return { ...m, content: [...results, ...rest] }
}

const hasToolResult = (m: ChatMessage) => m.content.some((b) => b.type === 'tool_result')
const toolUseIds = (m: ChatMessage) => m.content.filter((b) => b.type === 'tool_use').map((b) => (b as { id: string }).id)

/** Uma conversa fechada no meio de uma ação (a aba foi fechada com um cartão de confirmação aberto) termina num
 *  tool_use sem tool_result — a API recusa isso. Ao retomar, cada tool_use pendente recebe um resultado de erro. */
export function repairDanglingToolUse(messages: ChatMessage[], makeId: (lastId: string) => string = (id) => `repair-${id}`): ChatMessage[] {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant') return messages
  const ids = toolUseIds(last)
  if (ids.length === 0) return messages
  const repair: ChatMessage = {
    id: makeId(last.id),
    role: 'user',
    createdAt: last.createdAt,
    content: ids.map((id) => ({
      type: 'tool_result' as const,
      tool_use_id: id,
      content: 'A ação não foi concluída (a conversa foi interrompida antes da confirmação).',
      is_error: true,
    })),
  }
  return [...messages, repair]
}

/** Recorta as mensagens que seguem para o modelo: as últimas `max`, começando numa mensagem do usuário que não seja
 *  resultado de ferramenta (a API exige que a primeira mensagem seja do usuário e que todo tool_result tenha o
 *  tool_use da mensagem anterior — cortar no meio de um par quebraria a requisição). */
export function windowForApi(messages: ChatMessage[], max: number = MAX_CONTEXT_MESSAGES): ChatMessage[] {
  if (messages.length <= max) return messages
  for (let start = messages.length - max; start < messages.length; start++) {
    const m = messages[start]
    if (m.role === 'user' && !hasToolResult(m)) return messages.slice(start)
  }
  // Nenhum ponto de corte seguro dentro da janela (turno de ferramentas muito longo): procura para trás.
  for (let start = messages.length - max - 1; start >= 0; start--) {
    const m = messages[start]
    if (m.role === 'user' && !hasToolResult(m)) return messages.slice(start)
  }
  return messages
}

export function normalizeMemoryText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Duas memórias são a mesma se o texto normalizado (sem caixa nem pontuação final) coincide. */
export function sameMemory(a: string, b: string): boolean {
  const norm = (s: string) => normalizeMemoryText(s).toLowerCase().replace(/[.!\s]+$/, '')
  return norm(a) === norm(b)
}

/** Prefixo curto do id, que o modelo usa para pedir que uma memória seja esquecida. */
export const shortMemoryId = (id: string) => id.slice(0, 8)

/** Bloco de memórias que entra no prompt do sistema. O conteúdo é texto livre salvo pelo usuário/assistente:
 *  "<" e ">" são neutralizados para que nada nele feche a marcação e vire instrução. */
export function buildMemoryBlock(memories: AiMemory[]): string {
  if (memories.length === 0) return ''
  const sorted = [...memories].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const lines: string[] = []
  let used = 0
  for (const m of sorted) {
    const line = `- [${shortMemoryId(m.id)}] (${MEMORY_KIND_LABEL[m.kind].toLowerCase()}) ${normalizeMemoryText(m.content).replace(/</g, '‹').replace(/>/g, '›')}`
    if (used + line.length > MEMORY_PROMPT_BUDGET) break
    lines.push(line)
    used += line.length + 1
  }
  return `<memorias_do_usuario>\n${lines.join('\n')}\n</memorias_do_usuario>`
}
