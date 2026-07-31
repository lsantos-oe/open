import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { Entry, EntryStatus, Phase } from '@/types'
import EntryModal from '@/components/plan/EntryModal'
import EntryBoard, { BoardCard } from '@/components/plan/EntryBoard'
import { StatusDot } from '@/components/ui/StatusDot'
import { AvatarStack } from '@/components/ui/AvatarStack'

const ENTRY_STATUS_COLOR: Record<EntryStatus, string> = {
  pending: 'var(--text-tertiary)',
  in_progress: 'var(--color-info-text)',
  validation: 'var(--color-warning-text)',
  done: 'var(--color-success-text)',
  blocked: 'var(--color-danger-text)',
  overdue: 'var(--color-warning-text)',
}

function entryOwners(entry: Entry) {
  if (entry.owners && entry.owners.length > 0) return entry.owners
  if (entry.responsible) return [{ id: entry.responsible, type: 'text' as const, name: entry.responsible }]
  return []
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

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
  const { t } = useTranslation()
  const { projects, updateEntryStatus } = useAppStore()
  const project = projects.find((p) => p.id === projectId)!

  const [view, setView] = useState<'kanban' | 'table'>(() => (localStorage.getItem('pb-project-tasks-view') as 'kanban' | 'table') ?? 'kanban')
  const [filterResponsible, setFilterResponsible] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [editCard, setEditCard] = useState<BoardCard | null>(null)

  function changeView(v: 'kanban' | 'table') {
    setView(v)
    localStorage.setItem('pb-project-tasks-view', v)
  }

  const allCards = useMemo(() => buildCards(project.phases), [project.phases])

  const allResponsibles = useMemo(() => {
    const names = new Set<string>()
    for (const c of allCards) for (const o of entryOwners(c)) names.add(o.name)
    return Array.from(names).sort()
  }, [allCards])

  const filteredCards = useMemo(() => {
    return allCards.filter((c) => {
      if (filterResponsible && !entryOwners(c).some((o) => o.name === filterResponsible)) return false
      if (filterStatus && c.status !== filterStatus) return false
      return true
    })
  }, [allCards, filterResponsible, filterStatus])

  const editPhaseId = editCard ? project.phases.find((ph) => ph.entries.some((e) => e.id === editCard.id || e.subtasks.some((s) => s.id === editCard.id)))?.id : undefined

  return (
    <>
      <div className="flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center flex-wrap gap-2 mb-4">
          <div className="flex rounded-[var(--radius-lg)] border overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
            <button
              onClick={() => changeView('kanban')}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ background: view === 'kanban' ? 'var(--text-primary)' : 'var(--surface-card)', color: view === 'kanban' ? 'white' : 'var(--text-secondary)' }}
            >
              {t('actions.viewKanban')}
            </button>
            <button
              onClick={() => changeView('table')}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ background: view === 'table' ? 'var(--text-primary)' : 'var(--surface-card)', color: view === 'table' ? 'white' : 'var(--text-secondary)' }}
            >
              {t('actions.viewTable')}
            </button>
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs rounded-[var(--radius-md)] px-2 py-1.5 border"
            style={{ borderColor: 'var(--border-default)', background: 'var(--surface-card)', color: 'var(--text-secondary)' }}
          >
            <option value="">{t('tasks.filterStatus')}</option>
            <option value="pending">{t('entry.pending')}</option>
            <option value="in_progress">{t('entry.in_progress')}</option>
            <option value="validation">{t('entry.validation')}</option>
            <option value="done">{t('entry.done')}</option>
            <option value="blocked">{t('entry.blocked')}</option>
          </select>

          <select
            value={filterResponsible}
            onChange={(e) => setFilterResponsible(e.target.value)}
            className="text-xs rounded-[var(--radius-md)] px-2 py-1.5 border"
            style={{ borderColor: 'var(--border-default)', background: 'var(--surface-card)', color: 'var(--text-secondary)' }}
          >
            <option value="">{t('tasks.filterMember')}</option>
            {allResponsibles.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>

        {view === 'kanban' ? (
          <EntryBoard
            cards={filteredCards}
            onStatusChange={(entryId, status) => updateEntryStatus(projectId, entryId, status)}
            onCardClick={setEditCard}
          />
        ) : (
          <table className="w-full text-sm rounded-[var(--radius-lg)] border overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
            <thead>
              <tr style={{ background: 'var(--surface-subtle)' }}>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('entry.name')}</th>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('plan.phase')}</th>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('entry.responsible')}</th>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('entry.status')}</th>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('plan.colEnd')}</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-default)' }}>
              {filteredCards.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-sm" style={{ color: 'var(--text-tertiary)' }}>{t('plan.noEntries')}</td>
                </tr>
              ) : filteredCards.map((card) => {
                const endDate = card.type === 'task' ? card.plannedEnd : card.plannedDate
                return (
                  <tr key={card.id} className="cursor-pointer transition-colors" onClick={() => setEditCard(card)}>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{card.name}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>{card._phaseName}</td>
                    <td className="px-3 py-2.5"><AvatarStack people={entryOwners(card)} size={20} /></td>
                    <td className="px-3 py-2.5"><StatusDot color={ENTRY_STATUS_COLOR[card.status]} label={t(`entry.${card.status}` as any)} /></td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>{endDate ? fmtDate(endDate) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
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
