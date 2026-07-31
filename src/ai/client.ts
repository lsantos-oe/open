import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

export const AI_MODEL = 'claude-sonnet-5'

let cachedKey: string | null = null

/** Fetches the user's own decrypted key via the ai_get_key() RPC (security
 *  definer, checks auth.uid() internally) and holds it in memory only for
 *  the current tab session — never written to localStorage/sessionStorage. */
async function getDecryptedKey(): Promise<string> {
  if (cachedKey) return cachedKey
  const { data, error } = await supabase.rpc('ai_get_key')
  if (error || !data) throw new Error('Nenhuma chave da API do Claude configurada.')
  cachedKey = data as string
  return cachedKey
}

/** Call after removing/rotating the key so a stale one isn't reused mid-session. */
export function clearCachedKey(): void {
  cachedKey = null
}

export async function createAnthropicClient(): Promise<Anthropic> {
  const apiKey = await getDecryptedKey()
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}
