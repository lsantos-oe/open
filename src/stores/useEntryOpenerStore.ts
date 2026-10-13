import { create } from 'zustand'

/** Abre o modal de uma tarefa de qualquer lugar do app (ex.: Command+K), sem navegar — o GlobalEntryModal (montado
 *  no Layout) descobre a que projeto, incidente ou "tarefa solta" ela pertence. */
interface EntryOpenerState {
  entryId: string | null
  open: (entryId: string) => void
  close: () => void
}

export const useEntryOpenerStore = create<EntryOpenerState>((set) => ({
  entryId: null,
  open: (entryId) => set({ entryId }),
  close: () => set({ entryId: null }),
}))
