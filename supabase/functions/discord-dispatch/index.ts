// Edge Function: esvazia a fila discord_outbox e envia as DMs.
//
// Chamada a cada minuto pelo pg_cron (supabase/discord_cron.sql) com o header x-cron-secret. Não usa JWT de usuário
// (verify_jwt = false no config.toml): quem protege é o segredo compartilhado.
//
// Para cada pessoa com avisos pendentes, junta tudo em uma mensagem (ver _shared/discordFormat.ts). Falha de envio
// não perde nada: a linha continua pendente e é tentada de novo, até 5 vezes. "Não aceita DMs" (50007) não adianta
// tentar de novo, então a linha é encerrada com o motivo.
//
// Secrets: DISCORD_BOT_TOKEN, DISCORD_CRON_SECRET, APP_URL (ex.: https://open.suaempresa.com).
// Deploy: supabase functions deploy discord-dispatch --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2.104.1'
import { CANNOT_DM, DiscordError, sendDm } from '../_shared/discordApi.ts'
import { formatDigest, type OutboxRow } from '../_shared/discordFormat.ts'

const MAX_ATTEMPTS = 5
const BATCH = 500

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('DISCORD_CRON_SECRET') ?? ''
  if (!secret || !safeEqual(req.headers.get('x-cron-secret') ?? '', secret)) {
    return new Response('forbidden', { status: 403 })
  }
  const appUrl = Deno.env.get('APP_URL')
  if (!appUrl) return new Response('APP_URL não configurado', { status: 500 })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data, error } = await db
    .from('discord_outbox')
    .select('id, user_id, kind, task_name, detail, actor_name, link, ref_date, profiles!inner(discord_user_id)')
    .is('sent_at', null)
    .lt('attempts', MAX_ATTEMPTS)
    .order('id')
    .limit(BATCH)
  if (error) return new Response(error.message, { status: 500 })
  if (!data?.length) return Response.json({ sent: 0 })

  const byUser = new Map<string, any[]>()
  for (const row of data) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row])

  let sent = 0
  let failed = 0
  for (const [, rows] of byUser) {
    const ids = rows.map((r) => r.id as number)
    const discordId = rows[0].profiles?.discord_user_id as string | null
    if (!discordId) {
      await db.from('discord_outbox').update({ sent_at: new Date().toISOString(), last_error: 'sem Discord ligado' }).in('id', ids)
      continue
    }
    try {
      for (const message of formatDigest(rows as OutboxRow[], appUrl)) await sendDm(discordId, message)
      await db.from('discord_outbox').update({ sent_at: new Date().toISOString(), last_error: null }).in('id', ids)
      sent += ids.length
    } catch (e) {
      failed += ids.length
      const msg = e instanceof Error ? e.message : String(e)
      if (e instanceof DiscordError && e.code === CANNOT_DM) {
        await db.from('discord_outbox').update({ attempts: MAX_ATTEMPTS, last_error: 'a pessoa não aceita DMs' }).in('id', ids)
      } else {
        // attempts + 1, sem perder o motivo
        await db.rpc('discord_outbox_fail', { p_ids: ids, p_error: msg.slice(0, 300) })
      }
    }
  }
  return Response.json({ sent, failed })
})
