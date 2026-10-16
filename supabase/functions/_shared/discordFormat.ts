// Monta as mensagens de DM do Discord a partir das linhas pendentes de discord_outbox.
// Função pura (sem Deno nem rede) para poder ser testada em Node — ver scratchpad/test_discordformat.mts.

export type OutboxKind = 'assigned' | 'changed' | 'due_tomorrow' | 'due_today'

export interface OutboxRow {
  id: number
  kind: OutboxKind
  task_name: string
  detail: string | null
  actor_name: string | null
  link: string | null
  ref_date: string | null
}

export const DISCORD_MAX = 1900     // o limite do Discord é 2000; sobra margem para o cabeçalho
const MAX_LINES_PER_SECTION = 12

/** Tira o que quebraria o link em markdown ou chamaria atenção sem querer. */
export function cleanName(name: string): string {
  return name
    .replace(/[\[\]]/g, '')
    .replace(/@/g, '@​')            // @everyone/@here viram texto
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

function taskLink(row: OutboxRow, appUrl: string): string {
  const name = cleanName(row.task_name) || 'Tarefa'
  if (!row.link) return `**${name}**`
  return `[${name}](${appUrl.replace(/\/+$/, '')}${row.link})`
}

function section(title: string, lines: string[]): string[] {
  if (!lines.length) return []
  const shown = lines.slice(0, MAX_LINES_PER_SECTION)
  const rest = lines.length - shown.length
  return [`**${title}**`, ...shown, ...(rest > 0 ? [`… e mais ${rest}`] : []), '']
}

/** Uma mensagem (ou mais, se passar do limite) com tudo que está pendente para UMA pessoa. */
export function formatDigest(rows: OutboxRow[], appUrl: string): string[] {
  const by = (k: OutboxKind) => rows.filter((r) => r.kind === k)

  // Mesma tarefa alterada várias vezes antes do envio: junta num item só.
  const changedByEntry = new Map<string, OutboxRow[]>()
  for (const r of by('changed')) {
    const key = `${r.link}|${r.actor_name}`
    changedByEntry.set(key, [...(changedByEntry.get(key) ?? []), r])
  }

  const assigned = by('assigned').map((r) => {
    const who = r.actor_name ? `${r.actor_name} atribuiu a você: ` : ''
    return `• ${who}${taskLink(r, appUrl)}${r.detail ? ` (${r.detail})` : ''}`
  })

  const changed = [...changedByEntry.values()].map((group) => {
    const first = group[0]
    const details = [...new Set(group.map((g) => g.detail).filter(Boolean) as string[])].join('; ')
    return `• ${first.actor_name ?? 'Alguém'} alterou ${taskLink(first, appUrl)}${details ? ` — ${details}` : ''}`
  })

  const dueToday = by('due_today').map((r) => `• ${taskLink(r, appUrl)}`)
  const dueTomorrow = by('due_tomorrow').map((r) => `• ${taskLink(r, appUrl)}`)

  const text = [
    ...section('Vence hoje', dueToday),
    ...section('Vence amanhã', dueTomorrow),
    ...section('Atribuídas a você', assigned),
    ...section('Alteradas', changed),
  ].join('\n').trim()

  return chunk(text, DISCORD_MAX)
}

/** Quebra por linha para nunca cortar um link no meio. */
export function chunk(text: string, max: number): string[] {
  if (!text) return []
  if (text.length <= max) return [text]
  const out: string[] = []
  let cur = ''
  for (const line of text.split('\n')) {
    const piece = line.length > max ? line.slice(0, max) : line
    if (cur && cur.length + 1 + piece.length > max) { out.push(cur); cur = piece }
    else cur = cur ? `${cur}\n${piece}` : piece
  }
  if (cur) out.push(cur)
  return out
}
