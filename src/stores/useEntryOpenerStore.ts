import { create } from 'zustand'

/** Abre o modal de uma tarefa de qualquer lugar do app (ex.: Command+K), sem navegar — o GlobalEntryModal (montado
 *  no Layout) descobre a que projeto, incidente ou "tarefa solta" ela pertence. */
interface EntryOpenerState {
  entryId: string | null
  /** Comentário a destacar quando a tarefa abre (link de notificação de comentário). */
  commentId: string | null
  open: (entryId: string, commentId?: string) => void
  clearComment: () => void
  close: () => void
}

export const useEntryOpenerStore = create<EntryOpenerState>((set) => ({
  entryId: null,
  commentId: null,
  open: (entryId, commentId) => set({ entryId, commentId: commentId ?? null }),
  clearComment: () => set({ commentId: null }),
  close: () => set({ entryId: null, commentId: null }),
}))
