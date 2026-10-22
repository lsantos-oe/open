import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Tarefas de um projeto em Backlog ficam fora do kanban geral (Tarefas) e da lista da página inicial: se o projeto
 *  não começou, a tarefa ainda não importa. Esta preferência (por navegador) as traz de volta nas duas telas. */
interface BacklogTasksPrefState {
  showBacklogProjectTasks: boolean
  setShowBacklogProjectTasks: (value: boolean) => void
}

export const useBacklogTasksPref = create<BacklogTasksPrefState>()(
  persist(
    (set) => ({
      showBacklogProjectTasks: false,
      setShowBacklogProjectTasks: (value) => set({ showBacklogProjectTasks: value }),
    }),
    { name: 'open-show-backlog-project-tasks' },
  ),
)
