// Troca de '@/lib/supabase' na versão do assistente que roda no servidor (função discord-ai). No navegador o cliente é
// um só, criado no carregamento do app; aqui cada pedido age como UMA pessoa (sessão dela), então o cliente é trocado
// a cada pedido por `useClient`. As variáveis são `let` exportadas: quem importou `supabase` sempre lê o valor atual.
import type { SupabaseClient } from '@supabase/supabase-js'

export let supabase: SupabaseClient = undefined as unknown as SupabaseClient
export let supabaseUrl: string | undefined
export let supabaseAnonKey: string | undefined

export function useClient(client: SupabaseClient, url: string, anonKey: string): void {
  supabase = client
  supabaseUrl = url
  supabaseAnonKey = anonKey
}
