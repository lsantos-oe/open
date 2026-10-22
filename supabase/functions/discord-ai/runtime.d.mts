// Tipos do runtime.mjs (gerado por `npm run build:discord-ai` a partir de server/discordAi/runtime.ts).
export interface RuntimeConfig { supabaseUrl: string; anonKey: string; serviceKey: string; appUrl: string }
export interface TurnResult {
  text: string
  confirmation?: { pendingId: string; summary: string }
  link?: { label: string; url: string }
  warnings: string[]
}
export function ask(cfg: RuntimeConfig, userId: string, text: string, opts?: { newConversation?: boolean }): Promise<TurnResult>
export function startNew(cfg: RuntimeConfig, userId: string): Promise<void>
export function decide(cfg: RuntimeConfig, userId: string, pendingId: string, approve: boolean): Promise<TurnResult>
export function findUserByDiscordId(cfg: RuntimeConfig, discordId: string): Promise<{ id: string; name: string | null } | null>
export class RuntimeError extends Error {}
