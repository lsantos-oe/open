// Edge Function: o assistente de IA do Open no Discord (comando /open).
//
// O Discord chama esta função (Interactions Endpoint URL) a cada /open, /open-novo e clique nos botões Confirmar/Cancelar.
// Duas regras do Discord moldam o código:
//   1. a assinatura de cada chamada precisa ser conferida (Ed25519, chave pública do app) — senão o Discord nem aceita
//      o endereço;
//   2. a primeira resposta tem de sair em até 3 segundos. Por isso a função responde na hora com "pensando…" e faz o
//      trabalho de verdade em segundo plano (EdgeRuntime.waitUntil), editando a mensagem quando termina.
//
// Quem pediu é identificado pelo ID do Discord ligado ao perfil (botão Conectar, que confirma a conta com uma DM).
// O trabalho em si — dados do Open, ferramentas, confirmação das escritas — roda no runtime.mjs, que é o código do app
// empacotado por `npm run build:discord-ai`.
//
// Secrets: DISCORD_PUBLIC_KEY, APP_URL. SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY vêm do ambiente.
// Deploy: npm run deploy:discord-ai   (gera o runtime.mjs e publica com --no-verify-jwt)

import type * as RuntimeApi from './runtime.d.mts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

/** O runtime (código do app empacotado) só é carregado quando há trabalho a fazer — a resposta dos 3 segundos não espera por ele. */
const loadRuntime = async () => (await import('./runtime.mjs')) as unknown as typeof RuntimeApi

const DISCORD_API = 'https://discord.com/api/v10'
const MAX_MESSAGE = 1900   // limite do Discord é 2000

// Tipos de interação e de resposta do Discord
const PING = 1, COMMAND = 2, COMPONENT = 3
const PONG = 1, CHANNEL_MESSAGE = 4, DEFERRED_CHANNEL_MESSAGE = 5, DEFERRED_UPDATE = 6
const EPHEMERAL = 64

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2))
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}

async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const signature = req.headers.get('x-signature-ed25519')
  const timestamp = req.headers.get('x-signature-timestamp')
  const publicKey = Deno.env.get('DISCORD_PUBLIC_KEY')
  if (!signature || !timestamp || !publicKey) return false
  try {
    const key = await crypto.subtle.importKey('raw', hexToBytes(publicKey), { name: 'Ed25519' }, false, ['verify'])
    return await crypto.subtle.verify('Ed25519', key, hexToBytes(signature), new TextEncoder().encode(timestamp + rawBody))
  } catch {
    return false
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// ─── Mensagens ──────────────────────────────────────────────────────────────

/** Quebra por linha para nunca cortar um link ao meio. */
function chunk(text: string, max = MAX_MESSAGE): string[] {
  if (!text) return []
  if (text.length <= max) return [text]
  const out: string[] = []
  let cur = ''
  for (const line of text.split('\n')) {
    const piece = line.length > max ? line.slice(0, max) : line
    if (cur && cur.length + 1 + piece.length > max) { out.push(cur); cur = piece } else cur = cur ? `${cur}\n${piece}` : piece
  }
  if (cur) out.push(cur)
  return out
}

interface TurnResult {
  text: string
  confirmation?: { pendingId: string; summary: string }
  link?: { label: string; url: string }
  warnings: string[]
}

function renderAnswer(r: TurnResult): string {
  const parts: string[] = []
  if (r.text) parts.push(r.text)
  if (r.link) parts.push(`[${r.link.label}](${r.link.url})`)
  for (const w of r.warnings) parts.push(`⚠️ ${w}`)
  return parts.join('\n\n')
}

const buttons = (pendingId: string) => [{
  type: 1,
  components: [
    { type: 2, style: 3, label: 'Confirmar', custom_id: `oai:ok:${pendingId}` },
    { type: 2, style: 4, label: 'Cancelar', custom_id: `oai:no:${pendingId}` },
  ],
}]

async function webhook(method: string, appId: string, token: string, path: string, body: unknown): Promise<void> {
  const res = await fetch(`${DISCORD_API}/webhooks/${appId}/${token}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    // flags: 4 = sem pré-visualização dos links; soma com 64 (só a pessoa vê) quando a mensagem é privada
    body: JSON.stringify({ ...(body as object), allowed_mentions: { parse: [] }, flags: 4 | (((body as { flags?: number }).flags ?? 0) & EPHEMERAL) }),
  })
  if (!res.ok) console.error('[discord-ai] webhook', method, path, res.status, await res.text().catch(() => ''))
}

/** Escreve o resultado na mensagem "pensando…" e, se a resposta passar do limite, continua em mensagens seguintes. */
async function deliver(appId: string, token: string, r: TurnResult, opts: { ephemeralFollowups?: boolean } = {}): Promise<void> {
  const answer = chunk(renderAnswer(r))
  const confirmText = r.confirmation ? `**Confirma esta ação?**\n${r.confirmation.summary}` : ''

  if (answer.length === 0 && !r.confirmation) answer.push('Não tenho uma resposta para isso agora.')

  if (answer.length > 0) {
    // Se só há a confirmação, ela ocupa a mensagem original (com os botões).
    await webhook('PATCH', appId, token, '/messages/@original', { content: answer[0], components: [] })
    for (const part of answer.slice(1)) await webhook('POST', appId, token, '', { content: part, ...(opts.ephemeralFollowups ? { flags: EPHEMERAL } : {}) })
    if (r.confirmation) {
      await webhook('POST', appId, token, '', { content: chunk(confirmText)[0], components: buttons(r.confirmation.pendingId), ...(opts.ephemeralFollowups ? { flags: EPHEMERAL } : {}) })
    }
  } else if (r.confirmation) {
    await webhook('PATCH', appId, token, '/messages/@original', { content: chunk(confirmText)[0], components: buttons(r.confirmation.pendingId) })
  }
}

async function fail(appId: string, token: string, message: string): Promise<void> {
  await webhook('PATCH', appId, token, '/messages/@original', { content: `❌ ${message}`, components: [] })
}

// ─── Quem é a pessoa ────────────────────────────────────────────────────────

/** Consulta leve (sem carregar o runtime) para poder responder dentro dos 3 segundos. */
async function linkedUser(discordId: string): Promise<{ id: string } | null> {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const res = await fetch(`${url}/rest/v1/profiles?discord_user_id=eq.${encodeURIComponent(discordId)}&select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) return null
  const rows = await res.json()
  return rows?.[0] ?? null
}

function runtimeConfig() {
  return {
    supabaseUrl: Deno.env.get('SUPABASE_URL')!,
    anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    appUrl: Deno.env.get('APP_URL') ?? '',
  }
}

// ─── Trabalho em segundo plano ──────────────────────────────────────────────

async function handleAsk(appId: string, token: string, userId: string, text: string, newConversation = false) {
  try {
    const runtime = await loadRuntime()
    const result = await runtime.ask(runtimeConfig(), userId, text, { newConversation })
    await deliver(appId, token, result)
  } catch (e) {
    console.error('[discord-ai] ask', e)
    await fail(appId, token, e instanceof Error && e.name === 'RuntimeError' ? e.message : 'Não consegui concluir agora. Tente de novo em instantes.')
  }
}

async function handleNew(appId: string, token: string, userId: string) {
  try {
    const runtime = await loadRuntime()
    await runtime.startNew(runtimeConfig(), userId)
    await webhook('PATCH', appId, token, '/messages/@original', { content: 'Conversa nova começada. O que você precisa?', components: [] })
  } catch (e) {
    console.error('[discord-ai] new', e)
    await fail(appId, token, 'Não consegui começar uma conversa nova agora.')
  }
}

async function handleDecision(appId: string, token: string, userId: string, pendingId: string, approve: boolean) {
  try {
    const runtime = await loadRuntime()
    const result = await runtime.decide(runtimeConfig(), userId, pendingId, approve)
    // O botão deixa de existir: a mensagem da confirmação vira o resultado.
    await deliver(appId, token, { ...result, text: result.text || (approve ? 'Pronto, feito.' : 'Ação cancelada.') })
  } catch (e) {
    console.error('[discord-ai] decide', e)
    const msg = e instanceof Error && e.name === 'RuntimeError' ? e.message : 'Não consegui concluir agora. Tente de novo em instantes.'
    // Só avisa quem clicou, sem apagar a confirmação de quem a pediu.
    await webhook('POST', appId, token, '', { content: `❌ ${msg}`, flags: EPHEMERAL })
  }
}

// ─── Entrada ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('método não permitido', { status: 405 })
  const raw = await req.text()
  if (!(await verifySignature(req, raw))) return new Response('assinatura inválida', { status: 401 })

  const interaction = JSON.parse(raw)
  if (interaction.type === PING) return json({ type: PONG })

  const discordId: string | undefined = interaction.member?.user?.id ?? interaction.user?.id
  const appId: string = interaction.application_id
  const token: string = interaction.token
  if (!discordId) return json({ type: CHANNEL_MESSAGE, data: { content: 'Não consegui identificar você.', flags: EPHEMERAL } })

  const user = await linkedUser(discordId)
  if (!user) {
    return json({
      type: CHANNEL_MESSAGE,
      data: { content: 'Seu Discord ainda não está ligado ao Open. No Open: avatar → Editar perfil → Alertas no Discord → Conectar. Depois é só usar /open de novo.', flags: EPHEMERAL },
    })
  }

  if (interaction.type === COMMAND) {
    const name: string = interaction.data?.name
    if (name === 'open') {
      const text = String(interaction.data?.options?.find((o: { name: string }) => o.name === 'mensagem')?.value ?? '').trim()
      if (!text) return json({ type: CHANNEL_MESSAGE, data: { content: 'Escreva o que você precisa depois de /open.', flags: EPHEMERAL } })
      EdgeRuntime.waitUntil(handleAsk(appId, token, user.id, text))
      return json({ type: DEFERRED_CHANNEL_MESSAGE })
    }
    if (name === 'open-novo') {
      EdgeRuntime.waitUntil(handleNew(appId, token, user.id))
      return json({ type: DEFERRED_CHANNEL_MESSAGE, data: { flags: EPHEMERAL } })
    }
    return json({ type: CHANNEL_MESSAGE, data: { content: 'Comando desconhecido.', flags: EPHEMERAL } })
  }

  if (interaction.type === COMPONENT) {
    const [prefix, action, pendingId] = String(interaction.data?.custom_id ?? '').split(':')
    if (prefix === 'oai' && (action === 'ok' || action === 'no') && pendingId) {
      EdgeRuntime.waitUntil(handleDecision(appId, token, user.id, pendingId, action === 'ok'))
      return json({ type: DEFERRED_UPDATE })
    }
  }

  return json({ type: CHANNEL_MESSAGE, data: { content: 'Não entendi esse pedido.', flags: EPHEMERAL } })
})
