// Edge Function: proxies a single Claude conversation turn to OpenRouter's
// Anthropic-Messages-API-compatible endpoint (POST /api/v1/messages) using
// the workspace's shared key — which lives only here, decrypted server-side
// via the service role. The browser never sees the key, not even encrypted;
// it only ever sends {system, messages, tools} and receives streamed text +
// the final assembled message back as newline-delimited JSON (NDJSON).
//
// The @anthropic-ai/sdk client still works unmodified against OpenRouter:
// pointing `baseURL` at OpenRouter and authenticating with `authToken`
// (Bearer, instead of `apiKey`'s x-api-key header) is enough, because
// OpenRouter's /messages "skin" mirrors Anthropic's request/response/SSE
// shapes 1:1 — streaming, tool_use blocks and stop_reason all behave the
// same, only the model id gets an OpenRouter-style "anthropic/..." prefix.
//
// Tool EXECUTION still happens entirely client-side (src/ai/runConversation.ts)
// against the user's own authenticated Supabase session — this function does
// nothing but the one round-trip to OpenRouter. That keeps the app's existing
// "no backend, RLS does the access control" model intact for everything
// except this one credential.
//
// Deploy with: supabase functions deploy ai-chat
// Requires no new secrets — SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// injected automatically into every Edge Function's environment.

import Anthropic from 'npm:@anthropic-ai/sdk@0.115.0'
import { createClient } from 'npm:@supabase/supabase-js@2.104.1'

const AI_MODEL = 'anthropic/claude-sonnet-5'
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api'
const MAX_TOKENS = 8192

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  let payload: { system?: string; messages?: unknown[]; tools?: unknown[] }
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Corpo da requisição inválido.' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  // Service-role client — the ONLY caller allowed to invoke ai_get_key()
  // (see 20260802_ai_get_key_service_only.sql). Supabase already verified the
  // caller's own JWT before this function ran at all (default behavior for
  // Edge Functions, not disabled here), so reaching this line already means
  // the request came from a logged-in app user.
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const { data: apiKey, error: keyError } = await supabaseAdmin.rpc('ai_get_key')
  if (keyError || !apiKey) {
    return new Response(JSON.stringify({ error: 'Nenhuma chave do OpenRouter configurada.' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  // authToken (not apiKey) sends `Authorization: Bearer <key>` instead of
  // `x-api-key` — the auth scheme OpenRouter's /messages endpoint expects.
  const anthropic = new Anthropic({ authToken: apiKey as string, baseURL: OPENROUTER_BASE_URL })
  const anthropicStream = anthropic.messages.stream({
    model: AI_MODEL,
    max_tokens: MAX_TOKENS,
    system: payload.system,
    // deno-lint-ignore no-explicit-any
    tools: payload.tools as any,
    // deno-lint-ignore no-explicit-any
    messages: payload.messages as any,
  })

  const encoder = new TextEncoder()
  const body = new ReadableStream({
    async start(controller) {
      anthropicStream.on('text', (_delta: string, snapshot: string) => {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'text', snapshot }) + '\n'))
      })
      try {
        const final = await anthropicStream.finalMessage()
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'final', message: final }) + '\n'))
      } catch (err) {
        const status = err && typeof err === 'object' && 'status' in err
          ? (err as { status?: number }).status
          : undefined
        controller.enqueue(encoder.encode(JSON.stringify({
          type: 'error', status, message: err instanceof Error ? err.message : 'Erro desconhecido',
        }) + '\n'))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(body, {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/x-ndjson' },
  })
})
