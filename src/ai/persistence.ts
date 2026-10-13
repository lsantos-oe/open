import { supabase } from '@/lib/supabase'
import { v4 as uuid } from 'uuid'
import { useAiChatStore } from '@/stores/useAiChatStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useToastStore } from '@/stores/useToastStore'
import type { ChatContentBlock, ChatMessage, ConversationSummary } from '@/types/ai'
import { repairDanglingToolUse, sanitizeForStorage, titleFromText } from './history'
import { aiQueue } from './queue'

// Histórico do assistente no banco (ai_conversations / ai_messages, por usuário via RLS).
// Toda chamada passa pela fila do assistente (queue.ts): uma de cada vez, na ordem da conversa.

/** Falha de gravação nunca pode ser silenciosa: sem isso a conversa "some" e ninguém sabe por quê. */
function reportFailure(what: string, err: unknown) {
  const message = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err)
  console.error(`[assistente] ${what}:`, err)
  useToastStore.getState().addToast(`Assistente: não foi possível ${what} (${message}).`)
}

const userId = () => useAuthStore.getState().user?.id

function firstText(content: ChatContentBlock[]): string {
  return content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join(' ')
}

/** Acrescenta a mensagem à conversa na tela E a grava. A conversa só passa a existir no banco na primeira mensagem
 *  (abrir o painel ou clicar em "Nova conversa" não cria linhas vazias). Quem chama deve dar `await`: a próxima
 *  chamada ao Supabase só começa depois que esta gravação terminou. */
export async function addMessage(message: ChatMessage): Promise<void> {
  const chat = useAiChatStore.getState()
  chat.appendMessage(message)
  const uid = userId()
  if (!uid) { reportFailure('salvar a conversa', new Error('usuário não identificado')); return }

  let conversationId = chat.conversationId
  const isNew = !conversationId
  if (!conversationId) {
    conversationId = uuid()
    chat.setConversationId(conversationId)
  }
  const position = useAiChatStore.getState().messages.length - 1
  const title = titleFromText(firstText(message.content))
  const convId = conversationId

  try {
    if (isNew) {
      const { error } = await aiQueue(async () => await supabase.from('ai_conversations').insert({ id: convId, user_id: uid, title }))
      if (error) throw error
      const now = new Date().toISOString()
      useAiChatStore.getState().setConversations([{ id: convId, title, updatedAt: now }, ...useAiChatStore.getState().conversations])
    }
    const { error } = await aiQueue(async () => await supabase.from('ai_messages').insert({
      id: message.id,
      conversation_id: convId,
      user_id: uid,
      role: message.role,
      content: sanitizeForStorage(message.content),
      position,
      created_at: message.createdAt,
    }))
    if (error) throw error
    const now = new Date().toISOString()
    // A data de atualização só serve para ordenar a lista: se falhar, não vale interromper a conversa.
    await aiQueue(async () => await supabase.from('ai_conversations').update({ updated_at: now }).eq('id', convId)).catch(() => undefined)
    const list = useAiChatStore.getState().conversations
    useAiChatStore.getState().setConversations([
      ...list.filter((c) => c.id === convId).map((c) => ({ ...c, updatedAt: now })),
      ...list.filter((c) => c.id !== convId),
    ])
  } catch (err) {
    reportFailure('salvar a conversa', err)
  }
}

async function fetchConversations(uid: string): Promise<ConversationSummary[]> {
  const { data, error } = await aiQueue(async () => await supabase
    .from('ai_conversations')
    .select('id, title, updated_at')
    .eq('user_id', uid)
    .order('updated_at', { ascending: false })
    .limit(50))
  if (error) { reportFailure('carregar as conversas', error); return [] }
  return (data ?? []).map((c) => ({ id: c.id as string, title: (c.title as string | null) || 'Conversa', updatedAt: c.updated_at as string }))
}

async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await aiQueue(async () => await supabase
    .from('ai_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('position', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true }))
  if (error) { reportFailure('abrir a conversa', error); return [] }
  const messages = (data ?? []).map((m) => ({
    id: m.id as string,
    role: m.role as 'user' | 'assistant',
    content: m.content as ChatContentBlock[],
    createdAt: m.created_at as string,
  }))
  return messages
}

/** Carrega a lista de conversas e retoma a mais recente. Roda uma vez por usuário. */
export async function hydrateChat(): Promise<void> {
  const uid = userId()
  const chat = useAiChatStore.getState()
  if (!uid || chat.hydratedFor === uid) return
  // Troca de usuário no mesmo navegador: nada da conversa anterior fica na tela.
  chat.reset()
  chat.setConversations([])
  chat.setHydratedFor(uid)

  const conversations = await fetchConversations(uid)
  if (useAiChatStore.getState().hydratedFor !== uid) return
  useAiChatStore.getState().setConversations(conversations)
  const latest = conversations[0]
  // Se a pessoa já começou a escrever enquanto carregava, não atropela.
  if (latest && useAiChatStore.getState().messages.length === 0 && !useAiChatStore.getState().conversationId) {
    await openConversation(latest.id)
  }
}

export async function openConversation(id: string): Promise<void> {
  const chat = useAiChatStore.getState()
  if (chat.isStreaming) return
  const messages = await fetchMessages(id)
  const s = useAiChatStore.getState()
  s.reset()
  s.setConversationId(id)
  s.setMessages(messages)
  s.setView('chat')
  // Fechada no meio de uma ação (cartão de confirmação aberto): o tool_use ficou sem resultado. O resultado de erro é
  // GRAVADO, senão toda volta futura enviaria um tool_use órfão e a API recusaria a conversa.
  const repaired = repairDanglingToolUse(messages, () => uuid())
  if (repaired.length > messages.length) await addMessage(repaired[repaired.length - 1])
}

export function startNewConversation(): void {
  const chat = useAiChatStore.getState()
  if (chat.isStreaming) return
  chat.reset()
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await aiQueue(async () => await supabase.from('ai_conversations').delete().eq('id', id))
  if (error) { reportFailure('apagar a conversa', error); return }
  const chat = useAiChatStore.getState()
  chat.setConversations(chat.conversations.filter((c) => c.id !== id))
  if (chat.conversationId === id) chat.reset()
}
