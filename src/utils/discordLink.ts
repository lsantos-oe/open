import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase'

export interface DiscordLinkResult {
  discord_user_id: string | null
  discord_username: string | null
}

async function call(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sessão expirada. Faça login novamente.')
  const res = await fetch(`${supabaseUrl}/functions/v1/discord-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey ?? '',
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({})) as Record<string, unknown>
  if (!res.ok) {
    // 404 da função = ainda não publicada no Supabase
    const fallback = res.status === 404 ? 'A integração com o Discord ainda não foi publicada no servidor.' : `Erro ao falar com o Discord (status ${res.status}).`
    throw new Error(typeof json.error === 'string' ? json.error : fallback)
  }
  return json
}

/** Procura a pessoa no servidor, envia uma DM de teste e grava a ligação no perfil. */
export async function linkDiscord(username: string): Promise<DiscordLinkResult> {
  const r = await call({ action: 'link', username })
  return { discord_user_id: r.discord_user_id as string, discord_username: r.discord_username as string }
}

export async function unlinkDiscord(): Promise<DiscordLinkResult> {
  await call({ action: 'unlink' })
  return { discord_user_id: null, discord_username: null }
}
