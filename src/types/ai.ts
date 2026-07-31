// ─── Chat message shape ─────────────────────────────────────────────────────
// Mirrors Anthropic's Messages API content-block shape closely (1:1 mapping,
// no translation layer) so runConversation.ts can pass `messages` almost
// directly to the SDK.

export type ChatContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: ChatContentBlock[]
  createdAt: string
}

/** A write action the model wants to perform — surfaced to the user as a
 *  confirmation card. Nothing in `execute()` for this tool call has run yet. */
export interface PendingWriteConfirmation {
  toolUseId: string
  toolName: string
  summary: string
  input: Record<string, unknown>
}

/** An image/PDF staged in the composer before being attached to the next
 *  message — base64 only, never uploaded to Supabase Storage (ephemeral). */
export interface PendingAttachment {
  id: string
  kind: 'image' | 'document'
  mediaType: string
  data: string
  name?: string
}

/** A "go to what I just created" shortcut surfaced after a write tool runs —
 *  cleared as soon as the user sends a new message. */
export interface ActionLink {
  label: string
  to: string
}

// ─── Tool (function-calling) definitions ───────────────────────────────────

export interface AiToolContext {
  userId: string
}

export interface AiTool {
  name: string
  description: string
  /** JSON Schema for the tool's input, per Anthropic's `tool.input_schema`. */
  input_schema: Record<string, unknown>
  /** Read tools execute immediately; write tools always go through the
   *  confirmation gate in runConversation.ts — never execute otherwise. */
  isWrite: boolean
  /** Required for write tools: builds the human-readable confirmation summary
   *  ("Estou prestes a ... É basicamente isso?") shown before execute() ever runs. */
  describe?: (input: Record<string, unknown>, ctx: AiToolContext) => string
  execute: (input: Record<string, unknown>, ctx: AiToolContext) => Promise<unknown>
}
