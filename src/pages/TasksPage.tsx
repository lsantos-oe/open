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
import { Entry, EntryOwner, EntryStatus, Project, Incident, Client, TeamMember } from '@/types'
import EntryModal from '@/components/plan/EntryModal'
import IncidentEntryModal from '@/components/plan/IncidentEntryModal'
import StandaloneEntryModal from '@/components/plan/StandaloneEntryModal'
import OwnersField from '@/components/plan/OwnersField'
import { SelectionBar } from '@/components/ui/SelectionBar'
import { StatusDot } from '@/components/ui/StatusDot'
import { AvatarStack } from '@/components/ui/AvatarStack'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { EmptyState as SharedEmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Input'
import { isEntryMine } from '@/utils/involvement'
import { contactsForClients } from '@/utils/contacts'

const ENTRY_STATUS_COLOR: Record<EntryStatus, string> = {
  pending: 'var(--text-tertiary)',
  in_progress: 'var(--color-info-text)',
  validation: 'var(--color-warning-text)',
  done: 'var(--color-success-text)',
  blocked: 'var(--color-danger-text)',
  overdue: 'var(--color-warning-text)',
}

// ─── constants ────────────────────────────────────────────────────────────────

const PALETTE = ['#E8590C', '#7443F6', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4']

const KANBAN_COLS: { status: EntryStatus; labelKey: string }[] = [
  { status: 'pending',     labelKey: 'entry.pending' },
  { status: 'in_progress', labelKey: 'entry.in_progress' },
  { status: 'validation',  labelKey: 'entry.validation' },
  { status: 'done',        labelKey: 'entry.done' },
  { status: 'blocked',     labelKey: 'entry.blocked' },
]

const COL_STYLE: Record<string, { header: string; bg: string }> = {
  pending:     { header: 'var(--text-secondary)',     bg: 'var(--surface-subtle)' },
  in_progress: { header: 'var(--oe-primary)',         bg: 'var(--oe-primary-light)' },
  validation:  { header: 'var(--color-warning-text)', bg: 'var(--color-warning-bg)' },
  done:        { header: 'var(--color-success-text)', bg: 'var(--color-success-bg)' },
  blocked:     { header: 'var(--color-danger-text)',  bg: 'var(--color-danger-bg)' },
}

// ─── types ────────────────────────────────────────────────────────────────────

type GlobalCard = Entry & {
  _scopeType: 'project' | 'incident' | 'standalone'
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

function scopeLabel(card: GlobalCard): string {
  if (card._scopeType === 'incident') return `🛠️ ${card._scopeName}`
  if (card._scopeType === 'standalone') return card._scopeName ? `📌 ${card._scopeName}` : '📌 Tarefa solta'
  return card._scopeName
}

function entryOwners(entry: Entry): EntryOwner[] {
  if (entry.owners && entry.owners.length > 0) return entry.owners
  if (entry.responsible) return [{ id: entry.responsible, type: 'text', name: entry.responsible }]
  return []
}

function buildCards(projects: Project[], incidents: Incident[], standaloneTasks: Entry[], clients: Client[]): GlobalCard[] {
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
  for (let i = 0; i < standaloneTasks.length; i++) {
    const entry = standaloneTasks[i]
    const owners = entryOwners(entry)
    if (owners.length === 0) continue
    const clientName = entry.clientId ? clients.find((c) => c.id === entry.clientId)?.name : undefined
    const color = PALETTE[(projects.length + incidents.length + i) % PALETTE.length]
    cards.push({ ...entry, _scopeType: 'standalone', _scopeId: entry.id, _scopeName: clientName ?? '', _scopeColor: color })
  }
  return cards
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
          {scopeLabel(card)}
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
      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: 10, overflowWrap: 'anywhere' }}>
        {card.name}
      </p>

      {/* Footer: owner avatars + hidden badge + date */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <AvatarStack people={entryOwners(card)} size={22} />
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
        display: 'flex', flexDirection: 'column', minHeight: '60vh', minWidth: 0,
        background: style.bg, borderRadius: 'var(--radius-lg)',
        outline: isOver ? `2px solid ${style.header}` : '2px solid transparent',
        transition: 'outline 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 12px 8px' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: style.header }}>
          {t(labelKey as any)}
        </span>
        <span style={{ minWidth: 20, height: 20, borderRadius: 'var(--radius-pill)', background: 'var(--surface-card)', color: style.header, fontSize: 11, fontWeight: 600, padding: '0 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
      style={{ width: '100%', fontSize: 12, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '5px 8px', background: 'var(--surface-card)', color: 'var(--text-secondary)', outline: 'none' }}
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
    updateEntry, updateIncidentEntry, teamDirectory, contacts, clients,
    standaloneTasks, updateStandaloneTask, updateStandaloneTaskStatus,
  } = useAppStore()
  const { user } = useAuthStore()

  // OwnersField expects TeamMember[] — map the global registered-user directory into that shape
  const directoryAsTeam: TeamMember[] = useMemo(
    () => teamDirectory.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name ?? p.email ?? '', role: '', email: p.email ?? undefined, userId: p.id })),
    [teamDirectory],
  )

  const [view, setView] = useState<'kanban' | 'table'>(() =>
    (localStorage.getItem('pb-tasks-view') as 'kanban' | 'table') ?? 'kanban',
  )
  const [search, setSearch] = useState('')
  const [filterScope, setFilterScope] = useState('')
  const [filterMember, setFilterMember] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [newStandaloneOpen, setNewStandaloneOpen] = useState(false)
  const [editCard, setEditCard] = useState<GlobalCard | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkOwnersOpen, setBulkOwnersOpen] = useState(false)
  const [bulkOwners, setBulkOwners] = useState<EntryOwner[]>([])

  useEffect(() => { localStorage.setItem('pb-tasks-view', view) }, [view])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const allCards = useMemo(
    () => buildCards(projects, incidents, standaloneTasks, clients),
    [projects, incidents, standaloneTasks, clients],
  )

  // Selected cards can span different projects/incidents — union their clients
  // so the bulk owner picker's "Contato" tab covers everyone relevant.
  const bulkOwnerContacts = useMemo(() => {
    const clientIds = new Set<string>()
    for (const card of allCards) {
      if (!selected.has(card.id)) continue
      if (card._scopeType === 'project') {
        const project = projects.find((p) => p.id === card._scopeId)
        project?.clientIds.forEach((id) => clientIds.add(id))
      } else if (card._scopeType === 'incident') {
        const incident = incidents.find((i) => i.id === card._scopeId)
        incident?.clientIds.forEach((id) => clientIds.add(id))
      } else if (card.clientId) {
        clientIds.add(card.clientId)
      }
    }
    return clientIds.size > 0 ? contactsForClients(contacts, [...clientIds]) : []
  }, [allCards, selected, projects, incidents, contacts])

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
      if (search.trim() && !c.name.toLowerCase().includes(search.trim().toLowerCase())) return false
      if (filterScope && c._scopeId !== filterScope) return false
      if (filterMember) {
        const owners = entryOwners(c)
        if (!owners.some(o => o.name === filterMember)) return false
      }
      if (filterStatus && c.status !== filterStatus) return false
      return true
    })
  }, [allCards, onlyMine, user?.id, search, filterScope, filterMember, filterStatus])

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
      else if (card._scopeType === 'standalone') updateStandaloneTaskStatus(id, status)
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
      else if (card._scopeType === 'standalone') updateStandaloneTask(id, patch)
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
      } else if (card._scopeType === 'standalone') {
        updateStandaloneTaskStatus(String(active.id), newStatus)
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

        <button
          onClick={() => setNewStandaloneOpen(true)}
          title={t('tasks.newStandaloneTask' as any)}
          style={{
            fontSize: 13, fontWeight: 500, padding: '5px 12px',
            background: 'var(--surface-card)', color: 'var(--text-secondary)',
            border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
          }}
        >
          + {t('tasks.standaloneTask' as any)}
        </button>

        <div className="flex rounded-[var(--radius-lg)] border overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
          <button
            onClick={() => setView('kanban')}
            className="px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ background: view === 'kanban' ? 'var(--oe-primary)' : 'var(--surface-card)', color: view === 'kanban' ? 'white' : 'var(--text-secondary)' }}
          >
            {t('actions.viewKanban')}
          </button>
          <button
            onClick={() => setView('table')}
            className="px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ background: view === 'table' ? 'var(--oe-primary)' : 'var(--surface-card)', color: view === 'table' ? 'white' : 'var(--text-secondary)' }}
          >
            {t('actions.viewTable')}
          </button>
        </div>

        <button
          onClick={() => setOnlyMine((v) => !v)}
          className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-pill)] border transition-colors"
          style={{
            background: onlyMine ? 'var(--oe-primary)' : 'var(--surface-card)',
            color: onlyMine ? 'white' : 'var(--text-secondary)',
            borderColor: onlyMine ? 'var(--oe-primary)' : 'var(--border-default)',
          }}
        >
          {t('actions.onlyMine')}
        </button>

        <div className="relative" style={{ width: 220 }}>
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }}>
            <SearchIcon />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tarefa..."
            style={{
              width: '100%', fontSize: 12.5, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
              padding: '6px 10px 6px 30px', background: 'var(--surface-subtle)', color: 'var(--text-primary)', outline: 'none',
            }}
          />
        </div>

        <div style={{ flex: 1 }} />

        <FilterMenu
          activeCount={[filterScope, filterMember, filterStatus].filter(Boolean).length}
          onClear={() => { setFilterScope(''); setFilterMember(''); setFilterStatus('') }}
        >
          <Field label={t('tasks.filterProject')}>
            <FilterSelect value={filterScope} onChange={setFilterScope}>
              <option value="">{t('tasks.filterProject')}</option>
              {projects.filter(p => !p.archived).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
              {incidents.map(i => (
                <option key={i.id} value={i.id}>🛠️ {i.title}</option>
              ))}
            </FilterSelect>
          </Field>

          <Field label={t('tasks.filterMember')}>
            <FilterSelect value={filterMember} onChange={setFilterMember}>
              <option value="">{t('tasks.filterMember')}</option>
              {allMembers.map(m => <option key={m} value={m}>{m}</option>)}
            </FilterSelect>
          </Field>

          <Field label={t('tasks.filterStatus')}>
            <FilterSelect value={filterStatus} onChange={setFilterStatus}>
              <option value="">{t('tasks.filterStatus')}</option>
              {KANBAN_COLS.map(col => (
                <option key={col.status} value={col.status}>{t(col.labelKey as any)}</option>
              ))}
            </FilterSelect>
          </Field>
        </FilterMenu>
      </div>

      {/* Content */}
      {allCards.length === 0 ? (
        <SharedEmptyState
          icon="✅"
          title={t('tasks.emptyTitle')}
          description={t('tasks.emptySubtitle')}
          action={{ label: t('tasks.newTask'), onClick: () => setNewTaskOpen(true) }}
        />
      ) : view === 'table' ? (
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          <table className="w-full text-sm rounded-[var(--radius-lg)] border overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
            <thead className="sticky top-0 z-10">
              <tr style={{ background: 'var(--surface-subtle)' }}>
                <th className="w-8 px-3 py-2" />
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Nome</th>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Origem</th>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Responsáveis</th>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Status</th>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Data</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-default)' }}>
              {filteredCards.map((card) => {
                const endDate = card.type === 'task' ? card.plannedEnd : card.plannedDate
                return (
                  <tr key={card.id} className="transition-colors">
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="rounded border-[var(--border-default)] accent-[var(--oe-primary)]" checked={selected.has(card.id)} onChange={() => toggleSelect(card.id)} />
                    </td>
                    <td className="px-3 py-2.5 cursor-pointer" onClick={() => setEditCard(card)}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{card.name}</span>
                    </td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>
                      {scopeLabel(card)}
                    </td>
                    <td className="px-3 py-2.5">
                      <AvatarStack people={entryOwners(card)} size={20} />
                    </td>
                    <td className="px-3 py-2.5"><StatusDot color={ENTRY_STATUS_COLOR[card.status]} label={t(`entry.${card.status}` as any)} /></td>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
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
      <StandaloneEntryModal
        open={newStandaloneOpen}
        mode="create"
        onClose={() => setNewStandaloneOpen(false)}
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
      {editCard && editCard._scopeType === 'standalone' && (
        <StandaloneEntryModal
          open
          mode="edit"
          entry={editCard}
          onClose={() => setEditCard(null)}
        />
      )}

      <SelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <select
          onChange={(e) => { if (e.target.value) applyBulkStatus(e.target.value as EntryStatus) }}
          value=""
          className="text-xs rounded-[var(--radius-md)] px-2 py-1"
          style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none' }}
        >
          <option value="" disabled>Alterar status...</option>
          {KANBAN_COLS.map((col) => <option key={col.status} value={col.status}>{t(col.labelKey as any)}</option>)}
        </select>
        <button
          onClick={() => { setBulkOwners([]); setBulkOwnersOpen(true) }}
          className="text-xs px-2 py-1 rounded-[var(--radius-md)]"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          Alterar responsável
        </button>
      </SelectionBar>

      {bulkOwnersOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setBulkOwnersOpen(false)}>
          <div className="rounded-[var(--radius-lg)] p-5 w-full max-w-sm" style={{ background: 'var(--surface-card)' }} onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Alterar responsável de {selected.size} item(ns)</p>
            <OwnersField owners={bulkOwners} onChange={setBulkOwners} teamMembers={directoryAsTeam} contacts={bulkOwnerContacts} />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setBulkOwnersOpen(false)} className="text-sm px-3 py-1.5 rounded-[var(--radius-md)]" style={{ color: 'var(--text-secondary)' }}>Cancelar</button>
              <button onClick={applyBulkOwners} className="text-sm px-3 py-1.5 rounded-[var(--radius-md)] text-white" style={{ background: 'var(--oe-primary)' }}>É basicamente isso</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SearchIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m0 0a7.5 7.5 0 10-10.6-10.6 7.5 7.5 0 0010.6 10.6z" />
    </svg>
  )
}
