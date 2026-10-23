import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase'

export interface DiscordLinkResult {
  discord_user_id: string | null
  discord_username: string | null
}

const SESSION_EXPIRED = 'Sua sessão no Open expirou. Saia (menu do avatar → Sair), entre de novo e tente conectar outra vez.'

async function call(body: Record<string, unknown>, retried = false): Promise<Record<string, unknown>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error(SESSION_EXPIRED)
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
  if (res.status === 401) {
    // O Supabase recusou o token: vencido (aba aberta há muito tempo, computador dormindo) ou revogado. Renova a sessão
    // e tenta uma vez; se ainda assim recusar, a pessoa precisa entrar de novo.
    if (!retried) {
      const { data } = await supabase.auth.refreshSession()
      if (data.session) return call(body, true)
    }
    throw new Error(SESSION_EXPIRED)
  }
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
