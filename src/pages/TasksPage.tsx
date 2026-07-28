import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DndContext, DragEndEvent, DragStartEvent, DragOverlay,
  PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useAppStore } from '@/store/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { Entry, EntryOwner, EntryStatus, Project, Incident, TeamMember } from '@/types'
import EntryModal from '@/components/plan/EntryModal'
import IncidentEntryModal from '@/components/plan/IncidentEntryModal'
import OwnersField from '@/components/plan/OwnersField'
import { SelectionBar } from '@/components/ui/SelectionBar'
import { isEntryMine } from '@/utils/involvement'

// ─── constants ────────────────────────────────────────────────────────────────

const PALETTE = ['#E8590C', '#7443F6', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4']

const KANBAN_COLS: { status: EntryStatus; labelKey: string }[] = [
  { status: 'pending',     labelKey: 'entry.pending' },
  { status: 'in_progress', labelKey: 'entry.in_progress' },
  { status: 'done',        labelKey: 'entry.done' },
  { status: 'blocked',     labelKey: 'entry.blocked' },
]

const COL_STYLE: Record<string, { header: string; bg: string }> = {
  pending:     { header: 'var(--text-secondary)',     bg: 'var(--surface-subtle)' },
  in_progress: { header: 'var(--oe-primary)',         bg: 'var(--oe-primary-light)' },
  done:        { header: 'var(--color-success-text)', bg: 'var(--color-success-bg)' },
  blocked:     { header: 'var(--color-danger-text)',  bg: 'var(--color-danger-bg)' },
}

// ─── types ────────────────────────────────────────────────────────────────────

type GlobalCard = Entry & {
  _scopeType: 'project' | 'incident'
  _scopeId: string
  _scopeName: string
  _scopeColor: string
  _phaseId?: string
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function projectColor(project: Project, index: number): string {
  return (project as any).color ?? PALETTE[index % PALETTE.length]
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

function entryOwners(entry: Entry): EntryOwner[] {
  if (entry.owners && entry.owners.length > 0) return entry.owners
  if (entry.responsible) return [{ id: entry.responsible, type: 'text', name: entry.responsible }]
  return []
}

function buildCards(projects: Project[], incidents: Incident[]): GlobalCard[] {
  const cards: GlobalCard[] = []
  for (let i = 0; i < projects.length; i++) {
    const proj = projects[i]
    if (proj.archived) continue
    const color = projectColor(proj, i)
    for (const ph of proj.phases) {
      for (const entry of ph.entries) {
        // show in /tasks if it has owners (regardless of hiddenFromPlan)
        const owners = entryOwners(entry)
        if ((entry.type === 'task' || entry.type === 'meeting') && owners.length > 0) {
          cards.push({ ...entry, _scopeType: 'project', _scopeId: proj.id, _scopeName: proj.name, _scopeColor: color, _phaseId: ph.id })
        }
        for (const sub of entry.subtasks) {
          const subOwners = entryOwners(sub)
          if ((sub.type === 'task' || sub.type === 'meeting') && subOwners.length > 0) {
            cards.push({ ...sub, _scopeType: 'project', _scopeId: proj.id, _scopeName: proj.name, _scopeColor: color, _phaseId: ph.id })
          }
        }
      }
    }
  }
  for (let i = 0; i < incidents.length; i++) {
    const inc = incidents[i]
    const color = PALETTE[(projects.length + i) % PALETTE.length]
    for (const entry of inc.entries) {
      const owners = entryOwners(entry)
      if ((entry.type === 'task' || entry.type === 'meeting') && owners.length > 0) {
        cards.push({ ...entry, _scopeType: 'incident', _scopeId: inc.id, _scopeName: inc.title, _scopeColor: color })
      }
    }
  }
  return cards
}

// ─── OwnerAvatars ─────────────────────────────────────────────────────────────

function OwnerAvatars({ entry }: { entry: Entry }) {
  const owners = entryOwners(entry)
  if (owners.length === 0) return null
  const MAX = 3
  const visible = owners.slice(0, MAX)
  const overflow = owners.length - MAX
  const tooltip = owners.map(o => o.name).join(', ')

  return (
    <div style={{ display: 'flex', alignItems: 'center' }} title={tooltip}>
      {visible.map((owner, i) => (
        <span
          key={owner.id}
          style={{
            width: 22, height: 22, borderRadius: '50%',
            background: 'var(--oe-primary)', color: 'white',
            fontSize: 9, fontWeight: 600, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            marginLeft: i > 0 ? -7 : 0,
            border: '1.5px solid var(--surface-card)',
            zIndex: MAX - i, position: 'relative', flexShrink: 0,
          }}
        >
          {initials(owner.name)}
        </span>
      ))}
      {overflow > 0 && (
        <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--text-tertiary)' }}>+{overflow}</span>
      )}
    </div>
  )
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────

function TaskCard({ card, onClick, ghost = false }: {
  card: GlobalCard
  onClick?: () => void
  ghost?: boolean
}) {
  const { t } = useTranslation()
  const today = new Date().toISOString().split('T')[0]
  const endDate = card.type === 'task' ? card.plannedEnd : card.plannedDate
  const isOverdue = endDate && endDate < today && card.status !== 'done'
  const hasLinks = card.links.length > 0
  const hasComments = card.comments.length > 0

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface-card)',
        border: '0.5px solid var(--border-default)',
        borderLeft: `3px solid ${card._scopeColor}`,
        borderRadius: 'var(--radius-md)',
        padding: 12,
        boxShadow: ghost ? '0 4px 16px rgba(0,0,0,0.14)' : '0 1px 3px rgba(0,0,0,0.04)',
        cursor: ghost ? 'grabbing' : 'pointer',
        opacity: ghost ? 0.95 : 1,
        userSelect: 'none',
      }}
    >
      {/* Project badge + indicators */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: card._scopeColor, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {card._scopeType === 'incident' ? `🛠️ ${card._scopeName}` : card._scopeName}
        </span>
        {hasComments && (
          <span style={{ fontSize: 10, color: 'var(--text-disabled)' }}>💬{card.comments.length}</span>
        )}
        {hasLinks && (
          <span style={{ fontSize: 10, color: 'var(--text-disabled)' }}>🔗{card.links.length}</span>
        )}
        {card.riskFlag !== 'none' && (
          <span style={{
            display: 'inline-block', width: 7, height: 7, borderRadius: 1, flexShrink: 0,
            background: card.riskFlag === 'critical' ? 'var(--color-danger-text)' : 'var(--color-warning-text)',
          }} />
        )}
      </div>

      {/* Name */}
      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: 10 }}>
        {card.name}
      </p>

      {/* Footer: owner avatars + hidden badge + date */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <OwnerAvatars entry={card} />
          {card.hiddenFromPlan && (
            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 'var(--radius-pill)', background: 'var(--surface-subtle)', color: 'var(--text-disabled)', border: '0.5px solid var(--border-default)', whiteSpace: 'nowrap' }}>
              {t('entry.hiddenBadge')}
            </span>
          )}
        </div>
        {endDate && (
          <span style={{ fontSize: 11, color: isOverdue ? 'var(--color-danger-text)' : 'var(--text-tertiary)', flexShrink: 0 }}>
            {fmtDate(endDate)}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── DraggableCard ────────────────────────────────────────────────────────────

function DraggableCard({ card, onEdit }: { card: GlobalCard; onEdit: (c: GlobalCard) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id })
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab active:cursor-grabbing touch-none ${isDragging ? 'opacity-30' : ''}`}
    >
      <TaskCard card={card} onClick={isDragging ? undefined : () => onEdit(card)} />
    </div>
  )
}

// ─── KanbanColumn ─────────────────────────────────────────────────────────────

function KanbanColumn({ status, labelKey, cards, onEdit }: {
  status: EntryStatus
  labelKey: string
  cards: GlobalCard[]
  onEdit: (c: GlobalCard) => void
}) {
  const { t } = useTranslation()
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const style = COL_STYLE[status]

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', minHeight: '60vh',
        background: style.bg, borderRadius: 'var(--radius-lg)',
        outline: isOver ? `2px solid ${style.header}` : '2px solid transparent',
        transition: 'outline 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 12px 8px' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: style.header }}>
          {t(labelKey as any)}
        </span>
        <span style={{ minWidth: 20, height: 20, borderRadius: 'var(--radius-pill)', background: 'var(--surface-card)', color: 'var(--text-tertiary)', fontSize: 11, fontWeight: 500, padding: '0 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {cards.length}
        </span>
      </div>
      <div ref={setNodeRef} style={{ flex: 1, padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {cards.map(card => (
          <DraggableCard key={card.id} card={card} onEdit={onEdit} />
        ))}
      </div>
    </div>
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '80px 0' }}>
      <svg width={48} height={48} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25} style={{ color: 'var(--border-strong)', marginBottom: 16 }}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
      </svg>
      <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
        {t('tasks.emptyTitle')}
      </p>
      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center', maxWidth: 320 }}>
        {t('tasks.emptySubtitle')}
      </p>
      <button
        onClick={onNew}
        style={{ marginTop: 24, padding: '8px 16px', borderRadius: 'var(--radius-lg)', fontSize: 13, fontWeight: 500, background: 'var(--oe-primary)', color: 'white', border: 'none', cursor: 'pointer' }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        {t('tasks.newTask')}
      </button>
    </div>
  )
}

// ─── FilterSelect ─────────────────────────────────────────────────────────────

function FilterSelect({ value, onChange, children }: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ fontSize: 12, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '4px 8px', background: 'var(--surface-card)', color: 'var(--text-secondary)', outline: 'none' }}
    >
      {children}
    </select>
  )
}

// ─── TasksPage ────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const { t } = useTranslation()
  const {
    projects, incidents, updateEntryStatus, updateIncidentEntryStatus,
    updateEntry, updateIncidentEntry, teamDirectory,
  } = useAppStore()
  const { user } = useAuthStore()

  // OwnersField expects TeamMember[] — map the global registered-user directory into that shape
  const directoryAsTeam: TeamMember[] = useMemo(
    () => teamDirectory.map((p) => ({ id: p.id, name: p.name ?? p.email ?? '', role: '', email: p.email ?? undefined, userId: p.id })),
    [teamDirectory],
  )

  const [view, setView] = useState<'kanban' | 'table'>(() =>
    (localStorage.getItem('pb-tasks-view') as 'kanban' | 'table') ?? 'kanban',
  )
  const [filterScope, setFilterScope] = useState('')
  const [filterMember, setFilterMember] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [editCard, setEditCard] = useState<GlobalCard | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkOwnersOpen, setBulkOwnersOpen] = useState(false)
  const [bulkOwners, setBulkOwners] = useState<EntryOwner[]>([])

  useEffect(() => { localStorage.setItem('pb-tasks-view', view) }, [view])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const allCards = useMemo(() => buildCards(projects, incidents), [projects, incidents])

  const allMembers = useMemo(() => {
    const names = new Set<string>()
    for (const proj of projects) {
      for (const m of proj.team) names.add(m.name)
    }
    return Array.from(names).sort()
  }, [projects])

  const filteredCards = useMemo(() => {
    return allCards.filter(c => {
      if (onlyMine && !isEntryMine(c, user?.id)) return false
      if (filterScope && c._scopeId !== filterScope) return false
      if (filterMember) {
        const owners = entryOwners(c)
        if (!owners.some(o => o.name === filterMember)) return false
      }
      if (filterStatus && c.status !== filterStatus) return false
      return true
    })
  }, [allCards, onlyMine, user?.id, filterScope, filterMember, filterStatus])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function applyBulkStatus(status: EntryStatus) {
    for (const id of selected) {
      const card = allCards.find(c => c.id === id)
      if (!card) continue
      if (card._scopeType === 'incident') updateIncidentEntryStatus(card._scopeId, id, status)
      else updateEntryStatus(card._scopeId, id, status)
    }
    setSelected(new Set())
  }

  function applyBulkOwners() {
    for (const id of selected) {
      const card = allCards.find(c => c.id === id)
      if (!card) continue
      const patch = { owners: bulkOwners, responsible: bulkOwners[0]?.name ?? '' }
      if (card._scopeType === 'incident') updateIncidentEntry(card._scopeId, id, patch)
      else updateEntry(card._scopeId, id, patch)
    }
    setSelected(new Set())
    setBulkOwnersOpen(false)
  }

  const activeCard = activeId ? allCards.find(c => c.id === activeId) : null
  const validStatuses = new Set(KANBAN_COLS.map(c => c.status))

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    const newStatus = String(over.id) as EntryStatus
    if (!validStatuses.has(newStatus)) return
    const card = allCards.find(c => c.id === active.id)
    if (card && card.status !== newStatus) {
      if (card._scopeType === 'incident') {
        updateIncidentEntryStatus(card._scopeId, String(active.id), newStatus)
      } else {
        updateEntryStatus(card._scopeId, String(active.id), newStatus)
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: 'var(--surface-page)' }}>
      {/* Topbar */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px',
          height: 52, background: 'var(--surface-card)', borderBottom: '0.5px solid var(--border-default)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>
          {t('tasks.title')}
        </span>

        <button
          onClick={() => setNewTaskOpen(true)}
          style={{
            fontSize: 13, fontWeight: 500, padding: '5px 12px',
            background: 'var(--oe-primary)', color: 'white',
            border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          + {t('tasks.newTask')}
        </button>

        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
          <button
            onClick={() => setView('kanban')}
            className="px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ background: view === 'kanban' ? 'var(--text-primary)' : 'var(--surface-card)', color: view === 'kanban' ? 'white' : 'var(--text-secondary)' }}
          >
            Kanban
          </button>
          <button
            onClick={() => setView('table')}
            className="px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ background: view === 'table' ? 'var(--text-primary)' : 'var(--surface-card)', color: view === 'table' ? 'white' : 'var(--text-secondary)' }}
          >
            Tabela
          </button>
        </div>

        <button
          onClick={() => setOnlyMine((v) => !v)}
          className="px-3 py-1.5 text-xs font-medium rounded-full border transition-colors"
          style={{
            background: onlyMine ? 'var(--oe-primary)' : 'var(--surface-card)',
            color: onlyMine ? 'white' : 'var(--text-secondary)',
            borderColor: onlyMine ? 'var(--oe-primary)' : 'var(--border-default)',
          }}
        >
          Meus
        </button>

        <div style={{ flex: 1 }} />

        <FilterSelect value={filterScope} onChange={setFilterScope}>
          <option value="">{t('tasks.filterProject')}</option>
          {projects.filter(p => !p.archived).map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
          {incidents.map(i => (
            <option key={i.id} value={i.id}>🛠️ {i.title}</option>
          ))}
        </FilterSelect>

        <FilterSelect value={filterMember} onChange={setFilterMember}>
          <option value="">{t('tasks.filterMember')}</option>
          {allMembers.map(m => <option key={m} value={m}>{m}</option>)}
        </FilterSelect>

        <FilterSelect value={filterStatus} onChange={setFilterStatus}>
          <option value="">{t('tasks.filterStatus')}</option>
          {KANBAN_COLS.map(col => (
            <option key={col.status} value={col.status}>{t(col.labelKey as any)}</option>
          ))}
        </FilterSelect>
      </div>

      {/* Content */}
      {allCards.length === 0 ? (
        <EmptyState onNew={() => setNewTaskOpen(true)} />
      ) : view === 'table' ? (
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          <table className="w-full text-sm rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
            <thead>
              <tr style={{ background: 'var(--surface-subtle)' }}>
                <th className="w-8 px-3 py-2" />
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Nome</th>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Origem</th>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Responsáveis</th>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Status</th>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Data</th>
              </tr>
            </thead>
            <tbody>
              {filteredCards.map((card) => {
                const endDate = card.type === 'task' ? card.plannedEnd : card.plannedDate
                return (
                  <tr key={card.id} className="border-t transition-colors" style={{ borderColor: 'var(--border-default)' }}>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(card.id)} onChange={() => toggleSelect(card.id)} />
                    </td>
                    <td className="px-3 py-2.5 cursor-pointer" onClick={() => setEditCard(card)}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{card.name}</span>
                    </td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>
                      {card._scopeType === 'incident' ? `🛠️ ${card._scopeName}` : card._scopeName}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>
                      {entryOwners(card).map((o) => o.name).join(', ') || '—'}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>{t(`entry.${card.status}` as any)}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>{endDate ? fmtDate(endDate) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {KANBAN_COLS.map(col => (
                <KanbanColumn
                  key={col.status}
                  status={col.status}
                  labelKey={col.labelKey}
                  cards={filteredCards.filter(c => c.status === col.status)}
                  onEdit={setEditCard}
                />
              ))}
            </div>
            <DragOverlay>
              {activeCard && <TaskCard card={activeCard} ghost />}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* New task modal */}
      <EntryModal
        open={newTaskOpen}
        mode="create"
        onClose={() => setNewTaskOpen(false)}
      />

      {/* Edit task modal */}
      {editCard && editCard._scopeType === 'incident' && (
        <IncidentEntryModal
          open
          mode="edit"
          incidentId={editCard._scopeId}
          entry={editCard}
          onClose={() => setEditCard(null)}
        />
      )}
      {editCard && editCard._scopeType === 'project' && editCard._phaseId && (
        <EntryModal
          open
          mode="edit"
          entry={editCard}
          entryProjectId={editCard._scopeId}
          entryPhaseId={editCard._phaseId}
          onClose={() => setEditCard(null)}
        />
      )}

      <SelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <select
          onChange={(e) => { if (e.target.value) applyBulkStatus(e.target.value as EntryStatus) }}
          value=""
          className="text-xs rounded-md px-2 py-1"
          style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none' }}
        >
          <option value="" disabled>Alterar status...</option>
          {KANBAN_COLS.map((col) => <option key={col.status} value={col.status}>{t(col.labelKey as any)}</option>)}
        </select>
        <button
          onClick={() => { setBulkOwners([]); setBulkOwnersOpen(true) }}
          className="text-xs px-2 py-1 rounded-md"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          Alterar responsável
        </button>
      </SelectionBar>

      {bulkOwnersOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setBulkOwnersOpen(false)}>
          <div className="rounded-xl p-5 w-full max-w-sm" style={{ background: 'var(--surface-card)' }} onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Alterar responsável de {selected.size} item(ns)</p>
            <OwnersField owners={bulkOwners} onChange={setBulkOwners} teamMembers={directoryAsTeam} />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setBulkOwnersOpen(false)} className="text-sm px-3 py-1.5 rounded-md" style={{ color: 'var(--text-secondary)' }}>Cancelar</button>
              <button onClick={applyBulkOwners} className="text-sm px-3 py-1.5 rounded-md text-white" style={{ background: 'var(--oe-primary)' }}>Aplicar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
