import type Anthropic from '@anthropic-ai/sdk'
import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase'

export const AI_MODEL = 'claude-sonnet-5'

/** Carries Anthropic's original HTTP status (when the Edge Function forwards
 *  one) so callers can still tell an auth/billing failure apart from a
 *  generic network hiccup, same as catching Anthropic.APIError used to. */
export class ChatApiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

interface StreamChatParams {
  system: string
  messages: Anthropic.MessageParam[]
  tools: Anthropic.Tool[]
  onText: (snapshot: string) => void
}

/** Sends one conversation turn to the `ai-chat` Edge Function and streams the
 *  reply back. The Anthropic key never reaches the browser — it's decrypted
 *  and used entirely server-side (see supabase/functions/ai-chat/index.ts and
 *  20260802_ai_get_key_service_only.sql). This function only ever sees
 *  {system, messages, tools} going out and text/final-message events coming
 *  back over a newline-delimited JSON (NDJSON) stream.
 *
 *  Deliberately bypasses supabase-js's `functions.invoke()` — that helper
 *  buffers/parses the whole response, which defeats incremental text
 *  streaming into the chat UI. A raw fetch() gives direct access to the
 *  response body as a ReadableStream. */
export async function streamChat({ system, messages, tools, onText }: StreamChatParams): Promise<Anthropic.Message> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sessão expirada. Faça login novamente.')

  const res = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey ?? '',
    },
    body: JSON.stringify({ system, messages, tools }),
  })

  if (!res.ok || !res.body) {
    let message = `Erro ao chamar o assistente (status ${res.status}).`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch { /* response wasn't JSON — keep the generic message */ }
    throw new ChatApiError(message, res.status)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalMessage: Anthropic.Message | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      const event = JSON.parse(line) as { type: string; snapshot?: string; message?: Anthropic.Message; error?: string; status?: number }
      if (event.type === 'text' && event.snapshot !== undefined) onText(event.snapshot)
      else if (event.type === 'final' && event.message) finalMessage = event.message
      else if (event.type === 'error') throw new ChatApiError(event.error ?? 'Erro ao gerar resposta.', event.status)
    }
  }

  if (!finalMessage) throw new Error('O assistente não retornou uma resposta completa.')
  return finalMessage
}
