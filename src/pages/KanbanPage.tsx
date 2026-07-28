import { useMemo, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { Phase } from '@/types'
import EntryModal from '@/components/plan/EntryModal'
import EntryBoard, { BoardCard } from '@/components/plan/EntryBoard'

function buildCards(phases: Phase[]): BoardCard[] {
  const cards: BoardCard[] = []
  for (const ph of phases) {
    for (const e of ph.entries) {
      cards.push({ ...e, _phaseName: ph.name })
      for (const sub of e.subtasks) {
        cards.push({ ...sub, _phaseName: ph.name })
      }
    }
  }
  return cards
}

export default function KanbanPage({ projectId }: { projectId: string }) {
  const { projects, updateEntryStatus } = useAppStore()
  const project = projects.find((p) => p.id === projectId)!

  const [editCard, setEditCard] = useState<BoardCard | null>(null)

  const allCards = useMemo(() => buildCards(project.phases), [project.phases])

  const editPhaseId = editCard ? project.phases.find((ph) => ph.entries.some((e) => e.id === editCard.id || e.subtasks.some((s) => s.id === editCard.id)))?.id : undefined

  return (
    <>
      <div style={{ padding: 24 }}>
        <EntryBoard
          cards={allCards}
          onStatusChange={(entryId, status) => updateEntryStatus(projectId, entryId, status)}
          onCardClick={setEditCard}
        />
      </div>

      {editCard && editPhaseId && (
        <EntryModal
          open
          mode="edit"
          entry={editCard}
          entryProjectId={projectId}
          entryPhaseId={editPhaseId}
          onClose={() => setEditCard(null)}
        />
      )}
    </>
  )
}
