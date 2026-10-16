// Edge Function: liga (ou desliga) o Discord do usuário logado.
//
// POST { action: 'link', username: 'fulano' | '123456789012345678' }  → procura a pessoa no servidor, manda uma DM de
//                                                                       teste e SÓ ENTÃO grava no perfil.
// POST { action: 'unlink' }                                           → remove a ligação.
//
// Quem grava é esta função (service role): o banco bloqueia o cliente de mudar discord_user_id, para ninguém ligar o
// Discord de outra pessoa nem receber avisos sem ter confirmado a conta.
//
// Secrets: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID. SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY já vêm do ambiente.
// Deploy: supabase functions deploy discord-link   (verify_jwt = true, ver config.toml)

import { createClient } from 'npm:@supabase/supabase-js@2.104.1'
import { CANNOT_DM, DiscordError, findGuildMember, getGuildMemberById, sendDm } from '../_shared/discordApi.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const authHeader = req.headers.get('Authorization') ?? ''
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return json({ error: 'Sessão expirada. Faça login novamente.' }, 401)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  let body: { action?: string; username?: string }
  try { body = await req.json() } catch { return json({ error: 'Corpo inválido.' }, 400) }

  if (body.action === 'unlink') {
    const { error } = await admin.from('profiles').update({ discord_user_id: null, discord_username: null }).eq('id', user.id)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  if (body.action !== 'link') return json({ error: 'Ação desconhecida.' }, 400)

  const guildId = Deno.env.get('DISCORD_GUILD_ID')
  if (!guildId || !Deno.env.get('DISCORD_BOT_TOKEN')) return json({ error: 'A integração com o Discord ainda não foi configurada no servidor do Open.' }, 503)

  const raw = (body.username ?? '').trim().replace(/^@/, '')
  if (raw.length < 2 || raw.length > 32) return json({ error: 'Informe seu @ do Discord (ou o ID numérico).' }, 400)

  try {
    const member = /^[0-9]{15,25}$/.test(raw) ? await getGuildMemberById(guildId, raw) : await findGuildMember(guildId, raw)
    if (!member) {
      return json({ error: 'Não encontrei essa pessoa no servidor. Use o @ (não o apelido) e confira se você já entrou no servidor.' }, 404)
    }

    const { data: taken } = await admin.from('profiles').select('id').eq('discord_user_id', member.id).neq('id', user.id).maybeSingle()
    if (taken) return json({ error: 'Esse Discord já está ligado a outro usuário do Open.' }, 409)

    try {
      await sendDm(member.id, 'Conectado ao **Open**. Você vai receber aqui os avisos das suas tarefas. Escolha quais no seu perfil, dentro do Open.')
    } catch (e) {
      if (e instanceof DiscordError && e.code === CANNOT_DM) {
        return json({ error: 'Não consegui te enviar mensagem. No Discord, abra as configurações de privacidade do servidor e ative "Permitir mensagens diretas de membros do servidor". Depois tente de novo.' }, 422)
      }
      throw e
    }

    const { error } = await admin.from('profiles').update({ discord_user_id: member.id, discord_username: member.username }).eq('id', user.id)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true, discord_user_id: member.id, discord_username: member.username })
  } catch (e) {
    const msg = e instanceof DiscordError ? e.message : 'Erro inesperado ao falar com o Discord.'
    console.error('[discord-link]', e)
    return json({ error: msg }, e instanceof DiscordError && e.status < 500 ? 502 : 500)
  }
})
