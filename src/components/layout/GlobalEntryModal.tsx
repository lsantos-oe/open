import { useMemo } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { useEntryOpenerStore } from '@/stores/useEntryOpenerStore'
import EntryModal from '@/components/plan/EntryModal'
import IncidentEntryModal from '@/components/plan/IncidentEntryModal'
import type { Entry } from '@/types'

type Located =
  | { scope: 'project'; projectId: string; phaseId: string; entry: Entry }
  | { scope: 'incident'; incidentId: string; entry: Entry }
  | { scope: 'standalone'; entry: Entry }

/** Procura a tarefa (ou subtarefa) em projetos, incidentes e tarefas soltas. */
export function locateEntry(
  entryId: string,
  data: { projects: ReturnType<typeof useAppStore.getState>['projects']; incidents: ReturnType<typeof useAppStore.getState>['incidents']; standaloneTasks: Entry[] },
): Located | null {
  for (const p of data.projects) {
    for (const ph of p.phases) {
      for (const e of ph.entries) {
        if (e.id === entryId) return { scope: 'project', projectId: p.id, phaseId: ph.id, entry: e }
        const sub = e.subtasks.find((s) => s.id === entryId)
        if (sub) return { scope: 'project', projectId: p.id, phaseId: ph.id, entry: sub }
      }
    }
  }
  for (const i of data.incidents) {
    const e = i.entries.find((x) => x.id === entryId)
    if (e) return { scope: 'incident', incidentId: i.id, entry: e }
  }
  const solta = data.standaloneTasks.find((e) => e.id === entryId)
  return solta ? { scope: 'standalone', entry: solta } : null
}

/** Host do modal de tarefa aberto por fora da tela de tarefas (Command+K). Fica no Layout. */
export function GlobalEntryModal() {
  const entryId = useEntryOpenerStore((s) => s.entryId)
  const close = useEntryOpenerStore((s) => s.close)
  const { projects, incidents, standaloneTasks, changeEntryDate } = useAppStore()

  const located = useMemo(
    () => (entryId ? locateEntry(entryId, { projects, incidents, standaloneTasks }) : null),
    [entryId, projects, incidents, standaloneTasks],
  )
  if (!entryId || !located) return null

  if (located.scope === 'incident') {
    return <IncidentEntryModal open mode="edit" incidentId={located.incidentId} entry={located.entry} onClose={close} />
  }
  if (located.scope === 'project') {
    return (
      <EntryModal
        open
        mode="edit"
        entry={located.entry}
        entryProjectId={located.projectId}
        entryPhaseId={located.phaseId}
        allowStandalone
        onClose={close}
        // Fora do Plano não há o diálogo de justificativa de atraso: a data é aplicada direto.
        onRequestDateChange={(e, field, value) => changeEntryDate(located.projectId, e.id, field, value)}
      />
    )
  }
  return <EntryModal open mode="edit" entry={located.entry} allowStandalone onClose={close} />
}
