import type Anthropic from '@anthropic-ai/sdk'
import { v4 as uuid } from 'uuid'
import { streamChat, ChatApiError } from './client'
import { SYSTEM_PROMPT } from './systemPrompt'
import { ALL_TOOLS, TOOLS_BY_NAME } from './tools'
import type { ExtractedItem } from './tools/extractionTools'
import { useAiChatStore } from '@/stores/useAiChatStore'
import { useToastStore } from '@/stores/useToastStore'
import { useAuthStore } from '@/stores/useAuthStore'
import type { ChatMessage, ChatContentBlock, AiToolContext, ActionLink, PendingWriteConfirmation } from '@/types/ai'

// Hard safety cap on automatic read-tool→read-tool turns per user message, so
// a buggy/looping tool chain can't silently drain the user's API credits.
const MAX_AUTO_TURNS = 8

const anthropicTools: Anthropic.Tool[] = ALL_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.input_schema as Anthropic.Tool.InputSchema,
}))

function blockToParam(block: ChatContentBlock): Anthropic.ContentBlockParam {
  switch (block.type) {
    case 'text': return { type: 'text', text: block.text }
    case 'image': return { type: 'image', source: block.source as Anthropic.Base64ImageSource }
    case 'document': return { type: 'document', source: block.source as Anthropic.Base64PDFSource }
    case 'tool_use': return { type: 'tool_use', id: block.id, name: block.name, input: block.input }
    case 'tool_result': return { type: 'tool_result', tool_use_id: block.tool_use_id, content: block.content, is_error: block.is_error }
  }
}

function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => ({ role: m.role, content: m.content.map(blockToParam) }))
}

function newMessage(role: 'user' | 'assistant', content: ChatContentBlock[]): ChatMessage {
  return { id: uuid(), role, content, createdAt: new Date().toISOString() }
}

function friendlyKeyError(): void {
  useToastStore.getState().addToast('Sua chave do OpenRouter é inválida ou expirou. Verifique suas configurações.')
}

function handleAnthropicError(err: unknown): void {
  if (err instanceof ChatApiError) {
    const billingLike = err.status === 400 && /credit|balance|billing|insufficient|chave/i.test(err.message ?? '')
    if (err.status === 401 || err.status === 403 || billingLike) {
      friendlyKeyError()
      return
    }
  }
  useToastStore.getState().addToast('Não foi possível falar com o assistente agora. Tente novamente.')
}

function currentCtx(): AiToolContext {
  return { userId: useAuthStore.getState().user?.id ?? '' }
}

/** Sends the current message history to Claude, streams the reply, and either
 *  finishes (end_turn) or pauses on a write-tool confirmation card. Read tools
 *  execute inline and the loop continues automatically (bounded by
 *  MAX_AUTO_TURNS); write tools always stop and wait for approveConfirmation()/
 *  rejectConfirmation() below — nothing writes to the database without that. */
export async function runConversation(turnsLeft: number = MAX_AUTO_TURNS): Promise<void> {
  const chat = useAiChatStore.getState()
  chat.setStreaming(true)
  chat.setStreamingText('')

  if (turnsLeft <= 0) {
    useToastStore.getState().addToast('O assistente entrou em um loop de ferramentas maior do que o esperado e foi interrompido.')
    chat.setStreaming(false)
    return
  }

  try {
    const final = await streamChat({
      system: SYSTEM_PROMPT,
      tools: anthropicTools,
      messages: toAnthropicMessages(useAiChatStore.getState().messages),
      onText: (snapshot) => useAiChatStore.getState().setStreamingText(snapshot),
    })

    const assistantBlocks: ChatContentBlock[] = []
    for (const block of final.content) {
      if (block.type === 'text') assistantBlocks.push({ type: 'text', text: block.text })
      else if (block.type === 'tool_use') {
        assistantBlocks.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input as Record<string, unknown> })
      }
      // Other block kinds (thinking, server tool use, etc.) aren't used by this app — skipped.
    }

    useAiChatStore.getState().appendMessage(newMessage('assistant', assistantBlocks))
    useAiChatStore.getState().setStreamingText('')

    if (final.stop_reason !== 'tool_use') {
      useAiChatStore.getState().setStreaming(false)
      return
    }

    const ctx = currentCtx()
    const toolUseBlocks = final.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const resultBlocks: ChatContentBlock[] = []
    const writeConfirmations: PendingWriteConfirmation[] = []

    // Every tool_use block in this turn MUST get a matching tool_result before
    // the next message is sent to Claude (API requirement) — so write tools
    // are only queued here, never executed. Read tools execute immediately.
    for (const block of toolUseBlocks) {
      const tool = TOOLS_BY_NAME[block.name]
      if (!tool) {
        resultBlocks.push({ type: 'tool_result', tool_use_id: block.id, content: `Tool desconhecida: ${block.name}`, is_error: true })
        continue
      }
      if (!tool.isWrite) {
        try {
          const result = await tool.execute(block.input as Record<string, unknown>, ctx)
          resultBlocks.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
        } catch (err) {
          resultBlocks.push({ type: 'tool_result', tool_use_id: block.id, content: err instanceof Error ? err.message : 'Erro ao executar a tool.', is_error: true })
        }
        continue
      }

      writeConfirmations.push({
        toolUseId: block.id,
        toolName: block.name,
        summary: tool.describe?.(block.input as Record<string, unknown>, ctx) ?? `Estou prestes a executar ${block.name}. É basicamente isso?`,
        input: block.input as Record<string, unknown>,
      })
    }

    if (writeConfirmations.length === 0) {
      // Every tool call this turn was read-only — feed the results back and continue.
      useAiChatStore.getState().appendMessage(newMessage('user', resultBlocks))
      await runConversation(turnsLeft - 1)
      return
    }

    // One or more write tools this turn — stash the already-resolved read
    // results and surface the first confirmation card. approveConfirmation()/
    // rejectConfirmation() work through queuedConfirmations one at a time and
    // only flush the combined tool_result message once none remain.
    const [first, ...rest] = writeConfirmations
    useAiChatStore.getState().setPendingToolResults(resultBlocks)
    useAiChatStore.getState().setQueuedConfirmations(rest)
    useAiChatStore.getState().setPendingConfirmation(first)
    useAiChatStore.getState().setStreaming(false)
  } catch (err) {
    handleAnthropicError(err)
    useAiChatStore.getState().setStreaming(false)
  }
}

/** Builds a "go to what was just created" shortcut from a write tool's result,
 *  when that result names something navigable. Returns null for tools whose
 *  result isn't a single created entity (status updates, batch extraction, ...). */
function computeActionLink(toolName: string, result: unknown): ActionLink | null {
  if (!result || typeof result !== 'object') return null
  const r = result as Record<string, unknown>
  switch (toolName) {
    case 'create_project':
      return typeof r.createdProjectId === 'string' ? { label: 'Ver projeto →', to: `/projects/${r.createdProjectId}` } : null
    case 'create_incident':
      return typeof r.createdIncidentId === 'string' ? { label: 'Ver incidente →', to: `/support/${r.createdIncidentId}` } : null
    case 'create_task':
      if (r.scope === 'project' && typeof r.projectId === 'string') return { label: 'Ver projeto →', to: `/projects/${r.projectId}` }
      if (r.scope === 'incident' && typeof r.incidentId === 'string') return { label: 'Ver incidente →', to: `/support/${r.incidentId}` }
      return null
    default:
      return null
  }
}

async function dispatchExtractedItems(input: Record<string, unknown>, ctx: AiToolContext): Promise<string> {
  const items = (Array.isArray(input.items) ? input.items : []) as ExtractedItem[]
  const outcomes: string[] = []
  for (const item of items) {
    const toolName = item.entityType === 'task' ? 'create_task' : 'create_incident'
    const tool = TOOLS_BY_NAME[toolName]
    try {
      await tool.execute(item as unknown as Record<string, unknown>, ctx)
      outcomes.push(`"${item.name}" criado com sucesso`)
    } catch (err) {
      outcomes.push(`Falha ao criar "${item.name}": ${err instanceof Error ? err.message : 'erro desconhecido'}`)
    }
  }
  return outcomes.join('; ')
}

/** After a confirmation (approved or rejected) resolves, either advance to the
 *  next queued write confirmation from the same turn, or — once none remain —
 *  flush every resolved tool_result (reads + writes) as one combined message
 *  and let the model continue. Every tool_use block from that turn must be
 *  accounted for before anything is sent back to Claude. */
async function advanceAfterConfirmation(resolvedResult: ChatContentBlock): Promise<void> {
  const { queuedConfirmations, pendingToolResults } = useAiChatStore.getState()
  const allResults = [...pendingToolResults, resolvedResult]

  if (queuedConfirmations.length > 0) {
    const [next, ...rest] = queuedConfirmations
    useAiChatStore.getState().setPendingToolResults(allResults)
    useAiChatStore.getState().setQueuedConfirmations(rest)
    useAiChatStore.getState().setPendingConfirmation(next)
    return
  }

  useAiChatStore.getState().setPendingToolResults([])
  useAiChatStore.getState().setStreaming(true)
  useAiChatStore.getState().appendMessage(newMessage('user', allResults))
  await runConversation()
}

/** Confirmation card → Aprovar. Executes the real tool (or fans out
 *  propose_extracted_items into individual create_* calls) and resumes. */
export async function approveConfirmation(): Promise<void> {
  const { pendingConfirmation } = useAiChatStore.getState()
  if (!pendingConfirmation) return
  const ctx = currentCtx()
  useAiChatStore.getState().setPendingConfirmation(null)

  let resultContent: string
  try {
    if (pendingConfirmation.toolName === 'propose_extracted_items') {
      resultContent = await dispatchExtractedItems(pendingConfirmation.input, ctx)
    } else {
      const tool = TOOLS_BY_NAME[pendingConfirmation.toolName]
      const result = await tool.execute(pendingConfirmation.input, ctx)
      resultContent = JSON.stringify(result)
      const actionLink = computeActionLink(pendingConfirmation.toolName, result)
      if (actionLink) useAiChatStore.getState().setActionLink(actionLink)
    }
  } catch (err) {
    resultContent = err instanceof Error ? err.message : 'Erro ao executar a ação.'
  }

  await advanceAfterConfirmation({ type: 'tool_result', tool_use_id: pendingConfirmation.toolUseId, content: resultContent })
}

/** Confirmation card → Cancelar. Nothing is executed; Claude is told the user
 *  didn't approve so the conversation can continue coherently. */
export async function rejectConfirmation(): Promise<void> {
  const { pendingConfirmation } = useAiChatStore.getState()
  if (!pendingConfirmation) return
  useAiChatStore.getState().setPendingConfirmation(null)
  await advanceAfterConfirmation({ type: 'tool_result', tool_use_id: pendingConfirmation.toolUseId, content: 'O usuário não aprovou esta ação.', is_error: true })
}
