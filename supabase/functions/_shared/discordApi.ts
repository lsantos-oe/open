// Chamadas mínimas à API REST do Discord com o token do bot (secret DISCORD_BOT_TOKEN).

const API = 'https://discord.com/api/v10'

export class DiscordError extends Error {
  constructor(message: string, public status: number, public code?: number) {
    super(message)
  }
}

function botToken(): string {
  const t = Deno.env.get('DISCORD_BOT_TOKEN')
  if (!t) throw new DiscordError('DISCORD_BOT_TOKEN não configurado.', 500)
  return t
}

async function call(method: string, path: string, body?: unknown, retry = true): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bot ${botToken()}`, 'Content-Type': 'application/json', 'User-Agent': 'OpenBot (open, 1.0)' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 429 && retry) {
    const j = await res.json().catch(() => ({}))
    const wait = Math.min(Math.ceil((j.retry_after ?? 1) * 1000), 5000)
    await new Promise((r) => setTimeout(r, wait))
    return call(method, path, body, false)
  }
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new DiscordError(data.message ?? `Discord respondeu ${res.status}`, res.status, data.code)
  return data
}

/** Procura no servidor pelo username (o @, não o apelido). */
export async function findGuildMember(guildId: string, username: string): Promise<{ id: string; username: string } | null> {
  const list = await call('GET', `/guilds/${guildId}/members/search?query=${encodeURIComponent(username)}&limit=10`)
  const hit = (list as any[]).find((m) => m.user?.username?.toLowerCase() === username.toLowerCase())
  return hit ? { id: hit.user.id, username: hit.user.username } : null
}

/** Confere um ID numérico que a própria pessoa informou. */
export async function getGuildMemberById(guildId: string, id: string): Promise<{ id: string; username: string } | null> {
  try {
    const m = await call('GET', `/guilds/${guildId}/members/${id}`)
    return { id: m.user.id, username: m.user.username }
  } catch (e) {
    if (e instanceof DiscordError && e.status === 404) return null
    throw e
  }
}

/** Abre (ou reaproveita) a DM e envia. Lança DiscordError com code 50007 quando a pessoa não aceita DMs. */
export async function sendDm(userId: string, content: string): Promise<void> {
  const ch = await call('POST', '/users/@me/channels', { recipient_id: userId })
  await call('POST', `/channels/${ch.id}/messages`, {
    content,
    flags: 4,                              // SUPPRESS_EMBEDS: sem pré-visualização dos links do app
    allowed_mentions: { parse: [] },
  })
}

export const CANNOT_DM = 50007
