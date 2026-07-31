import { create } from 'zustand'
import type { ChatMessage, PendingWriteConfirmation, PendingAttachment, ActionLink } from '@/types/ai'

interface AiChatStore {
  open: boolean
  toggle: () => void
  setOpen: (open: boolean) => void

  conversationId: string | null
  messages: ChatMessage[]
  setMessages: (messages: ChatMessage[]) => void
  appendMessage: (message: ChatMessage) => void

  isStreaming: boolean
  setStreaming: (v: boolean) => void
  streamingText: string
  setStreamingText: (v: string) => void

  pendingConfirmation: PendingWriteConfirmation | null
  setPendingConfirmation: (p: PendingWriteConfirmation | null) => void

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

  conversationId: null,
  messages: [],
  setMessages: (messages) => set({ messages }),
  appendMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),

  isStreaming: false,
  setStreaming: (v) => set({ isStreaming: v }),
  streamingText: '',
  setStreamingText: (v) => set({ streamingText: v }),

  pendingConfirmation: null,
  setPendingConfirmation: (p) => set({ pendingConfirmation: p }),

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
    pendingConfirmation: null, actionLink: null, input: '', attachments: [],
  }),
}))
