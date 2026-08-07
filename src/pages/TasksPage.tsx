import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
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
import OwnersField from '@/components/plan/OwnersField'
import { SelectionBar } from '@/components/ui/SelectionBar'
import { StatusDot } from '@/components/ui/StatusDot'
import { AvatarStack } from '@/components/ui/AvatarStack'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { ColumnsMenu } from '@/components/ui/ColumnsMenu'
import { SortableHeader } from '@/components/ui/SortableHeader'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { EmptyState as SharedEmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { MineToggle } from '@/components/ui/MineToggle'
import { ViewToggle } from '@/components/ui/ViewToggle'
import { ListIcon, KanbanIcon, CheckCircleIcon, ChatBubbleIcon, LinkIcon } from '@/components/ui/icons'
import { isEntryMine, ownerKey } from '@/utils/involvement'
import { contactsForClients } from '@/utils/contacts'
import { useSort } from '@/hooks/useSort'
import { useColumnVisibility, ColumnDef } from '@/hooks/useColumnVisibility'

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

const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Nome', locked: true },
  { key: 'scope', label: 'Origem' },
  { key: 'owners', label: 'Responsáveis' },
  { key: 'status', label: 'Status' },
  { key: 'date', label: 'Data' },
]

// ─── types ────────────────────────────────────────────────────────────────────

type GlobalCard = Entry & {
  _scopeType: 'project' | 'incident' | 'standalone'
  _scopeId: string
  _scopeName: string
  _scopeColor: string
  _phaseId?: string
  _clientIds: string[]
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
  if (card._scopeType === 'standalone') return card._scopeName || 'Tarefa solta'
  return card._scopeName
}

function isCardOverdue(card: GlobalCard): boolean {
  const today = new Date().toISOString().split('T')[0]
  const endDate = card.type === 'task' ? card.plannedEnd : card.plannedDate
  return !!endDate && endDate < today && card.status !== 'done'
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
          cards.push({ ...entry, _scopeType: 'project', _scopeId: proj.id, _scopeName: proj.name, _scopeColor: color, _phaseId: ph.id, _clientIds: proj.clientIds })
        }
        for (const sub of entry.subtasks) {
          const subOwners = entryOwners(sub)
          if ((sub.type === 'task' || sub.type === 'meeting') && subOwners.length > 0) {
            cards.push({ ...sub, _scopeType: 'project', _scopeId: proj.id, _scopeName: proj.name, _scopeColor: color, _phaseId: ph.id, _clientIds: proj.clientIds })
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
        cards.push({ ...entry, _scopeType: 'incident', _scopeId: inc.id, _scopeName: inc.title, _scopeColor: color, _clientIds: inc.clientIds })
      }
    }
  }
  for (let i = 0; i < standaloneTasks.length; i++) {
    const entry = standaloneTasks[i]
    const owners = entryOwners(entry)
    if (owners.length === 0) continue
    const clientName = entry.clientId ? clients.find((c) => c.id === entry.clientId)?.name : undefined
    const color = PALETTE[(projects.length + incidents.length + i) % PALETTE.length]
    cards.push({ ...entry, _scopeType: 'standalone', _scopeId: entry.id, _scopeName: clientName ?? '', _scopeColor: color, _clientIds: entry.clientId ? [entry.clientId] : [] })
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
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--text-disabled)' }}>
            <ChatBubbleIcon className="w-3 h-3" />{card.comments.length}
          </span>
        )}
        {hasLinks && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--text-disabled)' }}>
            <LinkIcon className="w-3 h-3" />{card.links.length}
          </span>
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
  const [filterClientId, setFilterClientId] = useState('')
  const [onlyOverdue, setOnlyOverdue] = useState(false)
  const [onlyMine, setOnlyMine] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [editCard, setEditCard] = useState<GlobalCard | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkOwnersOpen, setBulkOwnersOpen] = useState(false)
  const [bulkOwners, setBulkOwners] = useState<EntryOwner[]>([])

  useEffect(() => { localStorage.setItem('pb-tasks-view', view) }, [view])

  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setNewTaskOpen(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

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

  // Options come from owners actually assigned on cards (project + incident +
  // standalone) — a project's own team roster misses incident/standalone owners.
  const allMemberOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const c of allCards) {
      for (const o of entryOwners(c)) seen.set(ownerKey(o), o.name)
    }
    return [...seen.entries()].map(([id, name]) => ({ id, label: name })).sort((a, b) => a.label.localeCompare(b.label))
  }, [allCards])

  const filteredCards = useMemo(() => {
    return allCards.filter(c => {
      if (onlyMine && !isEntryMine(c, user?.id)) return false
      if (onlyOverdue && !isCardOverdue(c)) return false
      if (search.trim() && !c.name.toLowerCase().includes(search.trim().toLowerCase())) return false
      if (filterScope && c._scopeId !== filterScope) return false
      if (filterClientId && !c._clientIds.includes(filterClientId)) return false
      if (filterMember) {
        const owners = entryOwners(c)
        if (!owners.some(o => ownerKey(o) === filterMember)) return false
      }
      if (filterStatus && c.status !== filterStatus) return false
      return true
    })
  }, [allCards, onlyMine, onlyOverdue, user?.id, search, filterScope, filterClientId, filterMember, filterStatus])

  const { sortField, sortDir, toggleSort, sortItems } = useSort<GlobalCard>({
    name: (c) => c.name,
    scope: (c) => scopeLabel(c),
    owners: (c) => entryOwners(c).map((o) => o.name).join(', '),
    status: (c) => c.status,
    date: (c) => (c.type === 'task' ? c.plannedEnd : c.plannedDate) ?? '',
  }, 'name')
  const { isVisible, toggle: toggleColumn } = useColumnVisibility('tasks.columns', COLUMNS)
  const sortedCards = sortItems(filteredCards)

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
    <div className="p-8 max-w-screen-xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('tasks.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{filteredCards.length} / {allCards.length}</p>
        </div>
        <Button onClick={() => setNewTaskOpen(true)}>
          + {t('tasks.newTask')}
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar tarefa..." />
        <ViewToggle
          value={view}
          onChange={setView}
          options={[
            { value: 'kanban', label: t('actions.viewKanban'), icon: <KanbanIcon className="w-3.5 h-3.5" /> },
            { value: 'table', label: t('actions.viewTable'), icon: <ListIcon className="w-3.5 h-3.5" /> },
          ]}
        />
        <MineToggle active={onlyMine} onClick={() => setOnlyMine((v) => !v)} />
        <div style={{ flex: 1 }} />

        {view === 'table' && <ColumnsMenu columns={COLUMNS} isVisible={isVisible} onToggle={toggleColumn} />}
        <FilterMenu
          activeCount={[filterScope, filterMember, filterStatus, filterClientId].filter(Boolean).length + (onlyOverdue ? 1 : 0)}
          onClear={() => { setFilterScope(''); setFilterMember(''); setFilterStatus(''); setFilterClientId(''); setOnlyOverdue(false) }}
        >
          <Field label={t('tasks.filterProject')}>
            <SearchableSelect
              value={filterScope}
              onChange={setFilterScope}
              emptyOptionLabel={t('tasks.filterProject')}
              options={[
                ...projects.filter(p => !p.archived).map(p => ({ id: p.id, label: p.name })),
                ...incidents.map(i => ({ id: i.id, label: i.title })),
              ]}
            />
          </Field>

          <Field label="Cliente">
            <SearchableSelect
              value={filterClientId}
              onChange={setFilterClientId}
              emptyOptionLabel="Todos os clientes"
              options={[...clients].sort((a, b) => a.name.localeCompare(b.name)).map(c => ({ id: c.id, label: c.name }))}
            />
          </Field>

          <Field label={t('tasks.filterMember')}>
            <SearchableSelect
              value={filterMember}
              onChange={setFilterMember}
              emptyOptionLabel={t('tasks.filterMember')}
              options={allMemberOptions}
            />
          </Field>

          <Field label={t('tasks.filterStatus')}>
            <SearchableSelect
              value={filterStatus}
              onChange={setFilterStatus}
              emptyOptionLabel={t('tasks.filterStatus')}
              options={KANBAN_COLS.map(col => ({ id: col.status, label: t(col.labelKey as any) }))}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              className="rounded border-[var(--border-default)] accent-[var(--oe-primary)]"
              checked={onlyOverdue}
              onChange={(e) => setOnlyOverdue(e.target.checked)}
            />
            Somente atrasadas
          </label>
        </FilterMenu>
      </div>

      {/* Content */}
      {allCards.length === 0 ? (
        <SharedEmptyState
          icon={<CheckCircleIcon className="w-9 h-9" />}
          title={t('tasks.emptyTitle')}
          description={t('tasks.emptySubtitle')}
          action={{ label: t('tasks.newTask'), onClick: () => setNewTaskOpen(true) }}
        />
      ) : view === 'table' ? (
        <div className="rounded-[var(--radius-lg)] border overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr style={{ background: 'var(--surface-subtle)' }}>
                <th className="w-8 px-3 py-2" />
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                  <SortableHeader label="Nome" field="name" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                </th>
                {isVisible('scope') && (
                  <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                    <SortableHeader label="Origem" field="scope" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  </th>
                )}
                {isVisible('owners') && (
                  <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                    <SortableHeader label="Responsáveis" field="owners" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  </th>
                )}
                {isVisible('status') && (
                  <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                    <SortableHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  </th>
                )}
                {isVisible('date') && (
                  <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                    <SortableHeader label="Data" field="date" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-default)' }}>
              {sortedCards.map((card) => {
                const endDate = card.type === 'task' ? card.plannedEnd : card.plannedDate
                return (
                  <tr key={card.id} className="transition-colors">
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="rounded border-[var(--border-default)] accent-[var(--oe-primary)]" checked={selected.has(card.id)} onChange={() => toggleSelect(card.id)} />
                    </td>
                    <td className="px-3 py-2.5 cursor-pointer" onClick={() => setEditCard(card)} style={{ maxWidth: 260 }}>
                      <span className="block truncate" style={{ color: 'var(--text-primary)', fontWeight: 500 }} title={card.name}>{card.name}</span>
                    </td>
                    {isVisible('scope') && (
                      <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)', maxWidth: 180 }}>
                        <span className="block truncate" title={scopeLabel(card)}>{scopeLabel(card)}</span>
                      </td>
                    )}
                    {isVisible('owners') && (
                      <td className="px-3 py-2.5">
                        <AvatarStack people={entryOwners(card)} size={20} />
                      </td>
                    )}
                    {isVisible('status') && (
                      <td className="px-3 py-2.5"><StatusDot color={ENTRY_STATUS_COLOR[card.status]} label={t(`entry.${card.status}` as any)} /></td>
                    )}
                    {isVisible('date') && (
                      <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>{endDate ? fmtDate(endDate) : '—'}</td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
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
                cards={sortedCards.filter(c => c.status === col.status)}
                onEdit={setEditCard}
              />
            ))}
          </div>
          <DragOverlay>
            {activeCard && <TaskCard card={activeCard} ghost />}
          </DragOverlay>
        </DndContext>
      )}

      {/* New task modal — project field starts empty (standalone); pick a project to link it */}
      <EntryModal
        open={newTaskOpen}
        mode="create"
        allowStandalone
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
          allowStandalone
          onClose={() => setEditCard(null)}
        />
      )}
      {editCard && editCard._scopeType === 'standalone' && (
        <EntryModal
          open
          mode="edit"
          entry={editCard}
          allowStandalone
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
