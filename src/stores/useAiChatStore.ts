import { create } from 'zustand'
import type { ChatMessage, ChatContentBlock, PendingWriteConfirmation, PendingAttachment, ActionLink, ConversationSummary } from '@/types/ai'

interface AiChatStore {
  open: boolean
  toggle: () => void
  setOpen: (open: boolean) => void

  expanded: boolean
  toggleExpanded: () => void

  conversationId: string | null
  setConversationId: (id: string | null) => void
  /** Conversas do usuário (mais recente primeiro) e de quem é o histórico carregado — trocar de usuário no mesmo
   *  navegador nunca pode mostrar a conversa do anterior. */
  conversations: ConversationSummary[]
  setConversations: (c: ConversationSummary[]) => void
  hydratedFor: string | null
  setHydratedFor: (userId: string | null) => void
  /** 'history' mostra a lista de conversas no lugar do chat. */
  view: 'chat' | 'history'
  setView: (v: 'chat' | 'history') => void
  messages: ChatMessage[]
  setMessages: (messages: ChatMessage[]) => void
  appendMessage: (message: ChatMessage) => void

  isStreaming: boolean
  setStreaming: (v: boolean) => void
  streamingText: string
  setStreamingText: (v: string) => void

  pendingConfirmation: PendingWriteConfirmation | null
  setPendingConfirmation: (p: PendingWriteConfirmation | null) => void

  /** Write confirmations still waiting behind the current one, when a single
   *  model turn requested more than one write tool at once. */
  queuedConfirmations: PendingWriteConfirmation[]
  setQueuedConfirmations: (q: PendingWriteConfirmation[]) => void

  /** tool_result blocks already resolved this turn (read tools + approved/
   *  rejected write tools) but not yet flushed as a message — every tool_use
   *  block from the same assistant turn must get a tool_result before the
   *  combined message is sent back to Claude, so partial resolution is held
   *  here instead of being sent early. */
  pendingToolResults: ChatContentBlock[]
  setPendingToolResults: (r: ChatContentBlock[]) => void

  actionLink: ActionLink | null
  setActionLink: (a: ActionLink | null) => void

  input: string
  setInput: (v: string) => void

  attachments: PendingAttachment[]
  addAttachment: (a: PendingAttachment) => void
  removeAttachment: (id: string) => void
  clearAttachments: () => void

  reset: () => void
}

export const useAiChatStore = create<AiChatStore>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  setOpen: (open) => set({ open }),

  expanded: false,
  toggleExpanded: () => set((s) => ({ expanded: !s.expanded })),

  conversationId: null,
  setConversationId: (id) => set({ conversationId: id }),
  conversations: [],
  setConversations: (conversations) => set({ conversations }),
  hydratedFor: null,
  setHydratedFor: (hydratedFor) => set({ hydratedFor }),
  view: 'chat',
  setView: (view) => set({ view }),
  messages: [],
  setMessages: (messages) => set({ messages }),
  appendMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),

  isStreaming: false,
  setStreaming: (v) => set({ isStreaming: v }),
  streamingText: '',
  setStreamingText: (v) => set({ streamingText: v }),

  pendingConfirmation: null,
  setPendingConfirmation: (p) => set({ pendingConfirmation: p }),

  queuedConfirmations: [],
  setQueuedConfirmations: (q) => set({ queuedConfirmations: q }),

  pendingToolResults: [],
  setPendingToolResults: (r) => set({ pendingToolResults: r }),

  actionLink: null,
  setActionLink: (a) => set({ actionLink: a }),

  input: '',
  setInput: (v) => set({ input: v }),

  attachments: [],
  addAttachment: (a) => set((s) => ({ attachments: [...s.attachments, a] })),
  removeAttachment: (id) => set((s) => ({ attachments: s.attachments.filter((a) => a.id !== id) })),
  clearAttachments: () => set({ attachments: [] }),

  reset: () => set({
    conversationId: null, messages: [], isStreaming: false, streamingText: '',
    pendingConfirmation: null, queuedConfirmations: [], pendingToolResults: [],
    actionLink: null, input: '', attachments: [], view: 'chat',
  }),
}))
