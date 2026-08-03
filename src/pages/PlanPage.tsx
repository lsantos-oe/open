import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useSmartPosition } from '@/hooks/useSmartPosition'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  useReactTable, getCoreRowModel, getExpandedRowModel,
  ColumnDef, flexRender, Row, ExpandedState,
} from '@tanstack/react-table'
import {
  DndContext, DragEndEvent, DragOverlay,
  PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
} from '@dnd-kit/core'
import { parseISO } from 'date-fns'
import { useAppStore } from '@/store/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { Entry, Phase, EntryStatus, RiskFlag, EntryType, DelayLogEntry, Project, TeamMember, EntryOwner } from '@/types'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import StatusBadge from '@/components/StatusBadge'
import { Modal } from '@/components/ui/Modal'
import { Textarea, Field } from '@/components/ui/Input'
import CommentsPanel from '@/components/plan/CommentsPanel'
import EntryModal from '@/components/plan/EntryModal'
import OwnersField from '@/components/plan/OwnersField'
import { SelectionBar } from '@/components/ui/SelectionBar'
import { computeVariance } from '@/utils/dateEngine'
import { workdaysBetween, parseHolidays } from '@/utils/businessDays'
import { exportProjectCsv } from '@/utils/exportCsv'
import { computeAutoStatus } from '@/utils/statusCalc'
import { contactsForClients } from '@/utils/contacts'

// ─── types ────────────────────────────────────────────────────────────────────

interface PlanRow extends Entry {
  _phaseId: string
  subRows?: PlanRow[]
}

interface PendingDate {
  entryId: string
  field: 'plannedStart' | 'plannedEnd' | 'plannedDate' | 'actualStart' | 'actualEnd'
  value: string
  diffDays: number
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso?: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const TOGGLEABLE_COLS = [
  { id: 'number',      key: 'plan.colNumber' },
  { id: 'responsible', key: 'entry.responsible' },
  { id: 'deps',      key: 'plan.colDeps' },
  { id: 'dateStart', key: 'plan.colStart' },
  { id: 'dateEnd',   key: 'plan.colEnd' },
  { id: 'blStart',   key: 'entry.baselineStart' },
  { id: 'blEnd',     key: 'entry.baselineEnd' },
  { id: 'variance',  key: 'entry.variance' },
  { id: 'duration',  key: 'plan.colDuration' },
  { id: 'status',    key: 'entry.status' },
] as const

/** For done entries show actual, otherwise planned */
function displayStart(e: Entry): { iso?: string; isActual: boolean; editField: PendingDate['field'] } {
  if (e.type !== 'task') return { iso: undefined, isActual: false, editField: 'plannedStart' }
  if (e.status === 'done' && e.actualStart) return { iso: e.actualStart, isActual: true, editField: 'actualStart' }
  return { iso: e.plannedStart, isActual: false, editField: 'plannedStart' }
}

function displayEnd(e: Entry): { iso?: string; isActual: boolean; editField: PendingDate['field'] } {
  if (e.status === 'done' && e.actualEnd) return { iso: e.actualEnd, isActual: true, editField: 'actualEnd' }
  if (e.type === 'task') return { iso: e.plannedEnd, isActual: false, editField: 'plannedEnd' }
  return { iso: e.plannedDate, isActual: false, editField: 'plannedDate' }
}

/** Duration in workdays for the dates actually shown in the row (real when
 *  present, planned otherwise) — matches displayStart/displayEnd so it never
 *  contradicts what's on screen (e.g. planned start + real end mixed). */
function computeDisplayDuration(e: Entry, holidays: string[]): number | undefined {
  if (e.type !== 'task') return undefined
  const start = displayStart(e).iso
  const end = displayEnd(e).iso
  if (!start || !end) return undefined
  const hdates = parseHolidays(holidays)
  if (end <= start) return 1
  return workdaysBetween(parseISO(start), parseISO(end), hdates) + 1
}

function computeDisplayVariance(e: Entry, holidays: string[]): number | undefined {
  const hdates = parseHolidays(holidays)
  const blEnd = e.type === 'task' ? e.baselineEnd : e.baselineDate
  if (!blEnd) return undefined
  const compareDate =
    e.status === 'done' && e.actualEnd
      ? e.actualEnd
      : e.type === 'task'
      ? e.plannedEnd
      : e.plannedDate
  if (!compareDate) return undefined
  return workdaysBetween(parseISO(blEnd), parseISO(compareDate), hdates)
}

// ─── InlineEditCell ───────────────────────────────────────────────────────────

function InlineEditCell({ value, onSave, placeholder = '—', className = '' }: {
  value: string; onSave: (v: string) => void; placeholder?: string; className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onSave(draft); setEditing(false) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { onSave(draft); setEditing(false) }
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
        className={`w-full bg-transparent border-b-2 border-[var(--oe-primary-mid)] outline-none text-sm py-0.5 ${className}`}
      />
    )
  }

  return (
    <span
      onClick={() => { setDraft(value); setEditing(true) }}
      title="Clique para editar"
      className={`cursor-text hover:bg-[var(--oe-primary-light)] rounded-[var(--radius-sm)] px-0.5 -mx-0.5 ${value ? '' : 'text-[var(--text-disabled)]'} ${className}`}
    >
      {value || placeholder}
    </span>
  )
}

// ─── DateCell ────────────────────────────────────────────────────────────────

interface DateCellProps {
  iso?: string
  isActual?: boolean
  isOverdue?: boolean
  isBaseline?: boolean
  editable?: boolean
  onCommit: (value: string) => void
}

function DateCell({ iso, isActual, isOverdue, isBaseline, editable = true, onCommit }: DateCellProps) {
  const [editing, setEditing] = useState(false)
  const [hovered, setHovered] = useState(false)

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={iso ?? ''}
        className="text-[11px] rounded px-1 py-0.5 w-28 focus:outline-none"
        style={{ border: '1px solid var(--oe-primary)', color: 'var(--text-primary)' }}
        onBlur={(e) => { if (e.target.value) onCommit(e.target.value); setEditing(false) }}
        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false) }}
      />
    )
  }

  if (!iso) {
    if (!editable) return <span style={{ color: 'var(--text-disabled)', fontSize: 11 }}>—</span>
    return (
      <button
        onClick={() => setEditing(true)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="transition-colors"
        style={{ color: hovered ? 'var(--oe-primary)' : 'var(--text-disabled)', fontSize: 11 }}
      >
        {hovered ? '+' : '—'}
      </button>
    )
  }

  const textColor = isActual
    ? 'var(--color-success-text)'
    : isOverdue
      ? 'var(--color-danger-text)'
      : isBaseline
        ? 'var(--text-disabled)'
        : 'var(--text-primary)'

  return (
    <button
      onClick={() => editable && setEditing(true)}
      className="transition-colors"
      style={{ color: textColor, fontSize: 11, cursor: editable ? 'pointer' : 'default' }}
    >
      {fmtDate(iso)}
      {isActual && <span className="ml-1" style={{ fontSize: 9, color: 'var(--color-success-text)' }}>(real)</span>}
    </button>
  )
}

// ─── RiskCell ─────────────────────────────────────────────────────────────────

function RiskCell({ flag, linkedRiskId, onChange, onNavigateToRisk }: {
  flag: RiskFlag
  linkedRiskId?: string
  onChange: (f: RiskFlag) => void
  onNavigateToRisk?: (riskId: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { triggerRef, popoverRef, position } = useSmartPosition(open)

  function toggle() {
    if (linkedRiskId && onNavigateToRisk) {
      onNavigateToRisk(linkedRiskId)
      return
    }
    setOpen((v) => !v)
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const FlagIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )

  const trigger = (
    <span ref={triggerRef as any}>
      {flag === 'none' ? (
        <button onClick={toggle} className="flex items-center" style={{ color: 'var(--text-disabled)' }} title="Risco">
          <FlagIcon />
        </button>
      ) : flag === 'critical' ? (
        <button onClick={toggle} className="flex items-center" title={t('risk.tooltipCritical')}>
          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 1, background: 'var(--color-danger-text)' }} />
        </button>
      ) : (
        <button onClick={toggle} className="flex items-center" title={t('risk.tooltipWarning')}>
          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 1, background: 'var(--color-warning-text)' }} />
        </button>
      )}
    </span>
  )

  return (
    <>
      {trigger}
      {open && createPortal(
        <div
          ref={popoverRef as any}
          style={{ position: 'fixed', ...position, zIndex: 1000, background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
          className="py-1 w-40"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {(['none', 'warning', 'critical'] as RiskFlag[]).map((f) => (
            <button
              key={f}
              onClick={() => { onChange(f); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 flex items-center gap-2"
              style={{ fontSize: 12, color: flag === f ? 'var(--oe-primary)' : 'var(--text-secondary)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-subtle)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              {f === 'none' && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} style={{ flexShrink: 0, color: 'var(--text-disabled)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                  <line x1="4" y1="22" x2="4" y2="15" />
                </svg>
              )}
              {f === 'warning' && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 1, background: 'var(--color-warning-text)', flexShrink: 0 }} />}
              {f === 'critical' && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 1, background: 'var(--color-danger-text)', flexShrink: 0 }} />}
              <span className="flex-1">{f === 'none' ? 'OK' : t(f === 'warning' ? 'risk.tooltipWarning' : 'risk.tooltipCritical')}</span>
              {flag === f && <span style={{ color: 'var(--oe-primary)', fontSize: 10 }}>✓</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

// ─── LinksCell ────────────────────────────────────────────────────────────────

function LinksCell({ entry, projectId }: { entry: Entry; projectId: string }) {
  const { addEntryLink, removeEntryLink } = useAppStore()
  const [open, setOpen] = useState(false)
  const { triggerRef, popoverRef, position } = useSmartPosition(open)
  const [addLabel, setAddLabel] = useState('')
  const [addUrl, setAddUrl] = useState('')
  const count = entry.links.length

  function toggle() {
    setOpen((v) => !v)
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  function handleAdd() {
    if (!addUrl.trim()) return
    addEntryLink(projectId, entry.id, { label: addLabel.trim() || addUrl.trim(), url: addUrl.trim() })
    setAddLabel(''); setAddUrl('')
  }

  return (
    <>
      <button
        ref={triggerRef as any}
        onClick={toggle}
        title="Links"
        className="relative flex items-center justify-center w-5 h-5 rounded transition-colors"
        style={{ color: count > 0 ? 'var(--text-secondary)' : 'var(--text-disabled)' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        onMouseLeave={e => (e.currentTarget.style.color = count > 0 ? 'var(--text-secondary)' : 'var(--text-disabled)')}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        {count > 0 && (
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center"
            style={{ minWidth: 13, height: 13, background: 'var(--oe-primary-light)', color: 'var(--oe-primary)', fontSize: 9, borderRadius: 'var(--radius-pill)', padding: '0 3px', fontWeight: 500 }}
          >
            {count}
          </span>
        )}
      </button>

      {open && createPortal(
        <div
          ref={popoverRef as any}
          style={{ position: 'fixed', ...position, zIndex: 1000, background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)' }}
          className="p-3 w-72"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="mb-2" style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)' }}>Links</p>
          {entry.links.length === 0 && (
            <p className="mb-2" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Nenhum link adicionado.</p>
          )}
          {entry.links.map((l) => (
            <div key={l.id} className="flex items-center gap-2 group mb-1">
              <a href={l.url} target="_blank" rel="noopener noreferrer"
                className="flex-1 truncate hover:underline" style={{ fontSize: 12, color: 'var(--oe-primary)' }}>{l.label}</a>
              <button onClick={() => removeEntryLink(projectId, entry.id, l.id)}
                className="opacity-0 group-hover:opacity-100 text-xs transition-opacity"
                style={{ color: 'var(--text-disabled)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-danger-text)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-disabled)')}>×</button>
            </div>
          ))}
          <div className="mt-2 pt-2 space-y-1.5" style={{ borderTop: '1px solid var(--border-default)' }}>
            <input value={addLabel} onChange={(e) => setAddLabel(e.target.value)}
              placeholder="Label (opcional)"
              className="w-full focus:outline-none"
              style={{ fontSize: 12, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '4px 8px', color: 'var(--text-primary)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--oe-primary)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-default)')} />
            <input value={addUrl} onChange={(e) => setAddUrl(e.target.value)}
              placeholder="URL *"
              className="w-full focus:outline-none"
              style={{ fontSize: 12, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '4px 8px', color: 'var(--text-primary)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--oe-primary)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-default)')}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
            <button
              onClick={handleAdd}
              disabled={!addUrl.trim()}
              className="w-full disabled:opacity-40 transition-colors"
              style={{ fontSize: 12, background: 'var(--oe-primary)', color: 'white', borderRadius: 'var(--radius-md)', padding: '4px 8px' }}
              onMouseEnter={e => { if (addUrl.trim()) (e.currentTarget.style.background = 'var(--oe-primary-hover)') }}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--oe-primary)')}
            >
              Adicionar
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

// ─── CommentsCell ─────────────────────────────────────────────────────────────

function CommentsCell({ entry, onOpen }: { entry: Entry; onOpen: () => void }) {
  const count = entry.comments.length
  return (
    <button
      onClick={onOpen}
      title="Comentários"
      className="relative flex items-center justify-center w-5 h-5 rounded transition-colors"
      style={{ color: count > 0 ? 'var(--text-secondary)' : 'var(--text-disabled)' }}
      onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
      onMouseLeave={e => (e.currentTarget.style.color = count > 0 ? 'var(--text-secondary)' : 'var(--text-disabled)')}
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      {count > 0 && (
        <span
          className="absolute -top-1 -right-1 flex items-center justify-center"
          style={{ minWidth: 13, height: 13, background: 'var(--oe-primary-light)', color: 'var(--oe-primary)', fontSize: 9, borderRadius: 'var(--radius-pill)', padding: '0 3px', fontWeight: 500 }}
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  )
}

// ─── DepsCell ─────────────────────────────────────────────────────────────────

function DepsCell({ entry, phases, projectId }: {
  entry: Entry
  phases: Phase[]
  projectId: string
}) {
  const { updateEntry } = useAppStore()
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { triggerRef, popoverRef, position } = useSmartPosition(open)

  const allEntriesMap = useMemo(() => {
    const map = new Map<string, Entry>()
    for (const ph of phases) {
      for (const e of ph.entries) {
        map.set(e.id, e as Entry)
        for (const sub of e.subtasks) map.set(sub.id, sub as Entry)
      }
    }
    return map
  }, [phases])

  function wouldCycle(candidateId: string): boolean {
    if (candidateId === entry.id) return true
    const visited = new Set<string>()
    const queue = [candidateId]
    while (queue.length > 0) {
      const cur = queue.shift()!
      if (cur === entry.id) return true
      if (visited.has(cur)) continue
      visited.add(cur)
      const e = allEntriesMap.get(cur)
      if (e) for (const dep of e.dependsOn) queue.push(dep)
    }
    return false
  }

  function toggle() {
    setOpen((v) => !v)
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  function toggleDep(id: string) {
    const next = entry.dependsOn.includes(id)
      ? entry.dependsOn.filter((x) => x !== id)
      : [...entry.dependsOn, id]
    updateEntry(projectId, entry.id, { dependsOn: next })
  }

  const deps = entry.dependsOn

  const trigger = deps.length === 0
    ? (
      <span
        className="opacity-0 group-hover/row:opacity-60 transition-opacity cursor-pointer select-none"
        style={{ fontSize: 11, color: 'var(--text-disabled)' }}
      >+</span>
    )
    : (
      <div className="flex flex-wrap gap-1 cursor-pointer">
        {deps.slice(0, 2).map((id) => {
          const e = allEntriesMap.get(id)
          const name = e?.name
          const prefix = e?.type === 'milestone' ? '◆ ' : ''
          return (
            <span
              key={id}
              className="truncate"
              style={{ fontSize: 10, background: 'var(--surface-subtle)', border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: '1px 6px', maxWidth: 80, color: 'var(--text-secondary)' }}
              title={name ? `${name} (Finish-to-Start)` : id}
            >
              {prefix}{name ?? '?'}
            </span>
          )
        })}
        {deps.length > 2 && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>+{deps.length - 2}</span>}
      </div>
    )

  return (
    <>
      <div ref={triggerRef as any} onClick={toggle}>{trigger}</div>
      {open && createPortal(
        <div
          ref={popoverRef as any}
          style={{ position: 'fixed', ...position, zIndex: 1000, background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)' }}
          className="py-2 w-60 max-h-80 overflow-y-auto"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="px-3 pb-1" style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)' }}>
            {t('plan.dependencies')}
          </p>
          {phases.map((ph) => {
            const candidates = ph.entries.filter((e) => e.id !== entry.id && !e.parentEntryId)
            if (candidates.length === 0) return null
            return (
              <div key={ph.id}>
                <p className="px-3 py-1 mt-1" style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', background: 'var(--surface-subtle)' }}>
                  {ph.name}
                </p>
                {candidates.map((candidate) => {
                  const checked = deps.includes(candidate.id)
                  const circular = !checked && wouldCycle(candidate.id)
                  const prefix = candidate.type === 'milestone' ? '◆ ' : ''
                  return (
                    <label
                      key={candidate.id}
                      className={`flex items-center gap-2 px-3 py-1.5 ${circular ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                      style={{ fontSize: 12, color: 'var(--text-secondary)' }}
                      onMouseEnter={e => { if (!circular) (e.currentTarget.style.background = 'var(--surface-subtle)') }}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                      title={circular ? t('errors.circularDep') : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={circular}
                        onChange={() => !circular && toggleDep(candidate.id)}
                        className="rounded"
                      />
                      <span className="truncate" style={candidate.type === 'milestone' ? { color: 'var(--color-warning-text)' } : {}}>
                        {prefix}{candidate.name}
                      </span>
                    </label>
                  )
                })}
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}

// ─── TypePill ─────────────────────────────────────────────────────────────────

function TypePill({ type }: { type: EntryType }) {
  const { t } = useTranslation()
  const styles: Record<EntryType, { bg: string; color: string }> = {
    task:      { bg: 'var(--color-info-bg)',    color: 'var(--color-info-text)' },
    milestone: { bg: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' },
    meeting:   { bg: 'var(--color-violet-bg)',  color: 'var(--color-violet-text)' },
  }
  const s = styles[type]
  return (
    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-pill)', background: s.bg, color: s.color, fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap', border: '0.5px solid var(--border-default)' }}>
      {t(`entry.${type}`)}
    </span>
  )
}

// ─── NameCell ─────────────────────────────────────────────────────────────────

function NameCell({ entry, depth, projectId, linkedRisk, onOpenComments, onNavigateToRisk, onChangeRisk, onOpenEdit }: {
  entry: Entry
  depth: number
  projectId: string
  linkedRisk?: { id: string }
  onOpenComments: () => void
  onNavigateToRisk?: (riskId: string) => void
  onChangeRisk: (f: RiskFlag) => void
  onOpenEdit: () => void
}) {
  const indent = depth * 16

  return (
    <div className="flex items-center gap-1.5 min-w-0" style={{ paddingLeft: indent }}>
      <TypePill type={entry.type} />
      <span className={entry.riskFlag !== 'none' ? '' : 'opacity-0 group-hover/row:opacity-100 transition-opacity'}>
        <RiskCell flag={entry.riskFlag} linkedRiskId={linkedRisk?.id} onChange={onChangeRisk} onNavigateToRisk={onNavigateToRisk} />
      </span>
      <span className={entry.comments.length > 0 ? '' : 'opacity-0 group-hover/row:opacity-100 transition-opacity'}>
        <CommentsCell entry={entry} onOpen={onOpenComments} />
      </span>
      <span className={entry.links.length > 0 ? '' : 'opacity-0 group-hover/row:opacity-100 transition-opacity'}>
        <LinksCell entry={entry} projectId={projectId} />
      </span>
      <span
        onDoubleClick={onOpenEdit}
        className="flex-1 min-w-0 truncate cursor-default select-none"
        style={{ fontSize: 12, color: 'var(--text-primary)' }}
        title="Duplo clique para editar"
      >
        {entry.name}
      </span>
      <button
        onClick={onOpenEdit}
        className="opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0"
        style={{ color: 'var(--text-tertiary)' }}
        title="Editar"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>
    </div>
  )
}

// ─── ResponsibleCell ─────────────────────────────────────────────────────────

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

function ResponsibleCell({ entry }: { entry: Entry }) {
  const owners = entry.owners && entry.owners.length > 0
    ? entry.owners
    : entry.responsible
      ? [{ id: entry.responsible, type: 'text' as const, name: entry.responsible }]
      : []

  if (owners.length === 0) {
    return <span className="opacity-0 group-hover/row:opacity-60 transition-opacity" style={{ fontSize: 11, color: 'var(--text-disabled)' }}>—</span>
  }

  const MAX = 3
  const visible = owners.slice(0, MAX)
  const overflow = owners.length - MAX
  const tooltip = owners.map((o) => o.name).join(', ')

  return (
    <div className="flex items-center gap-1 min-w-0" title={tooltip}>
      {visible.map((owner, i) => (
        <span
          key={owner.id}
          className="flex items-center justify-center shrink-0"
          style={{
            width: 20, height: 20, borderRadius: '50%',
            background: 'var(--oe-primary)', color: 'white',
            fontSize: 8, fontWeight: 600,
            marginLeft: i > 0 ? -6 : 0,
            border: '1.5px solid var(--surface-card)',
            zIndex: MAX - i,
            position: 'relative',
          }}
        >
          {memberInitials(owner.name)}
        </span>
      ))}
      {overflow > 0 && (
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 2 }}>+{overflow}</span>
      )}
      {owners.length === 1 && (
        <span className="truncate" style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 4 }}>
          {owners[0].name}
        </span>
      )}
    </div>
  )
}

// ─── DelayModal (inline) ──────────────────────────────────────────────────────

function DelayModal({ pending, holidays, onConfirm, onSkip }: {
  pending: PendingDate
  holidays: string[]
  onConfirm: (j: { description: string; responsibility: DelayLogEntry['responsibility']; type: DelayLogEntry['type'] }) => void
  onSkip: () => void
}) {
  const { t } = useTranslation()
  const [description, setDescription] = useState('')
  const [responsibility, setResponsibility] = useState<DelayLogEntry['responsibility']>('internal')
  const [type, setType] = useState<DelayLogEntry['type']>('execution')
  const d = pending.diffDays

  return (
    <Modal open title={t('delay.title')} onClose={onSkip} size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onSkip}>{t('delay.skip')}</Button>
          <Button onClick={() => onConfirm({ description, responsibility, type })}>{t('delay.confirm')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {d !== 0 && (
          <div className={`rounded-[var(--radius-lg)] px-4 py-3 text-sm font-semibold ${d > 0 ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]' : 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]'}`}>
            {d > 0 ? '+' : ''}{d}d
          </div>
        )}
        <Field label={t('delay.responsibility')}>
          <Select value={responsibility} onChange={(e) => setResponsibility(e.target.value as typeof responsibility)}>
            <option value="internal">{t('delay.internal')}</option>
            <option value="client_business">{t('delay.client_business')}</option>
            <option value="client_it">{t('delay.client_it')}</option>
            <option value="client_provider">{t('delay.client_provider')}</option>
          </Select>
        </Field>
        <Field label={t('delay.type')}>
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="execution">{t('delay.execution')}</option>
            <option value="definition">{t('delay.definition')}</option>
            <option value="planning">{t('delay.planning')}</option>
          </Select>
        </Field>
        <Field label={t('delay.description')}>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </Field>
      </div>
    </Modal>
  )
}

// ─── PhaseHeader ──────────────────────────────────────────────────────────────

// ─── DragHandleCell ───────────────────────────────────────────────────────────

function DragHandleCell({ entryId }: { entryId: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: entryId })
  return (
    <span
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="w-4 h-4 flex items-center justify-center touch-none"
      style={{ cursor: isDragging ? 'grabbing' : 'grab', color: 'var(--text-disabled)', opacity: isDragging ? 0.4 : 1 }}
      title="Arrastar pra mover de fase ou reordenar"
    >
      ⠿
    </span>
  )
}

// ─── PlanTableRow ─────────────────────────────────────────────────────────────
// Drop target for reordering: dropping another row's drag handle here moves
// it to sit right before this row (same phase → pure reorder; different
// phase → move + position). Disabled for non-top-level rows (subtasks/child
// meetings), matching the drag handle's own depth restriction.

function PlanTableRow({ entryId, disabled, className, style, onMouseEnter, onMouseLeave, children }: {
  entryId: string
  disabled: boolean
  className?: string
  style?: React.CSSProperties
  onMouseEnter?: React.MouseEventHandler<HTMLTableRowElement>
  onMouseLeave?: React.MouseEventHandler<HTMLTableRowElement>
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `entry-${entryId}`, disabled })
  return (
    <tr
      ref={setNodeRef}
      className={className}
      style={{ ...style, outline: isOver ? '2px solid var(--oe-primary)' : 'none', outlineOffset: -2 }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </tr>
  )
}

// ─── PhaseHeader ──────────────────────────────────────────────────────────────

function PhaseHeader({ phase, phaseNumber, colSpan, collapsed, onToggle, onAdd, onDelete, onRename }: {
  phase: Phase; phaseNumber: number; colSpan: number; collapsed: boolean
  onToggle: () => void; onAdd: () => void; onDelete: () => void; onRename: (name: string) => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(phase.name)
  const entryCount = phase.entries.length + phase.entries.reduce((n, e) => n + e.subtasks.length, 0)
  const { setNodeRef, isOver } = useDroppable({ id: `phase-${phase.id}` })

  return (
    <tr ref={setNodeRef} className="select-none" style={{ background: isOver ? 'var(--oe-primary-light)' : 'var(--surface-subtle)', borderBottom: isOver ? '0.5px solid var(--oe-primary)' : '0.5px solid var(--border-default)', outline: isOver ? '2px solid var(--oe-primary)' : 'none', outlineOffset: -2, transition: 'background 0.1s' }}>
      <td colSpan={colSpan} style={{ padding: '5px 12px' }}>
        <div className="flex items-center gap-3">
          <button onClick={onToggle}
            className="w-4 text-xs transition-colors"
            style={{ color: 'var(--text-tertiary)' }}>
            {collapsed ? '▸' : '▾'}
          </button>

          {editing ? (
            <input
              autoFocus value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => { onRename(draft); setEditing(false) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { onRename(draft); setEditing(false) } if (e.key === 'Escape') { setDraft(phase.name); setEditing(false) } }}
              className="text-[11px] rounded px-2 py-0.5 outline-none min-w-0 flex-1"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--oe-primary)', color: 'var(--text-primary)' }}
            />
          ) : (
            <span
              onDoubleClick={() => { setDraft(phase.name); setEditing(true) }}
              className="flex-1 cursor-default"
              style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}
              title="Clique duplo para renomear"
            >
              {phaseNumber}. {phase.name}
            </span>
          )}

          <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{entryCount} {t('template.entries')}</span>

          <div className="flex items-center gap-1 ml-auto">
            <button onClick={onAdd}
              className="text-[11px] px-2 py-0.5 rounded transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--oe-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}>
              {t('plan.addEntry')}
            </button>
            <button onClick={onDelete}
              className="text-[11px] px-1 py-0.5 rounded transition-colors"
              style={{ color: 'var(--text-disabled)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-danger-text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-disabled)')}
              title={t('actions.delete')}>
              ✕
            </button>
          </div>
        </div>
      </td>
    </tr>
  )
}

// ─── PlanPage ─────────────────────────────────────────────────────────────────

export default function PlanPage({ projectId, onNavigateToRisk }: { projectId: string; onNavigateToRisk?: (riskId: string) => void }) {
  const {
    projects, settings, teamDirectory, contacts,
    updateEntry, deleteEntry, moveEntryToPhase, reorderEntry, updateEntryStatus, resetStatusOverride, updateEntryRisk,
    updatePhase, deletePhase, setBaseline, clearBaseline, changeEntryDate, addDelayLogEntry,
    addPhase, setColumnVisibility, addComment, convertToSubtask,
  } = useAppStore()
  const { profile, user } = useAuthStore()

  const { t } = useTranslation()
  const project = projects.find((p) => p.id === projectId)!

  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())
  const [expandedRows, setExpandedRows] = useState<ExpandedState>(true)
  const [addModal, setAddModal] = useState<{ type: EntryType; phaseId?: string; parentId?: string; parentEntryId?: string } | null>(null)
  const [editEntry, setEditEntry] = useState<{ entry: Entry; phaseId: string } | null>(null)
  const [commentsEntry, setCommentsEntry] = useState<Entry | null>(null)
  const [pendingDate, setPendingDate] = useState<PendingDate | null>(null)
  const [addingPhase, setAddingPhase] = useState(false)
  const [newPhaseName, setNewPhaseName] = useState('')
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const { triggerRef: colMenuTriggerRef, popoverRef: colMenuPopoverRef, position: colMenuPosition } = useSmartPosition(colMenuOpen)
  const [columnVisibility, setColVisLocal] = useState<Record<string, boolean>>(project.columnVisibility ?? {})

  function handleColVisChange(updater: ((prev: Record<string, boolean>) => Record<string, boolean>) | Record<string, boolean>) {
    const next = typeof updater === 'function' ? updater(columnVisibility) : updater
    setColVisLocal(next)
    setColumnVisibility(projectId, next)
  }

  useEffect(() => {
    if (!colMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (
        colMenuPopoverRef.current && !colMenuPopoverRef.current.contains(e.target as Node) &&
        colMenuTriggerRef.current && !colMenuTriggerRef.current.contains(e.target as Node)
      ) setColMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [colMenuOpen])

  useEffect(() => {
    if (!colMenuOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setColMenuOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [colMenuOpen])

  const today = useMemo(() => new Date().toISOString().split('T')[0], [])

  // Build a lookup: entryId → entry name
  const entryNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const ph of project.phases) {
      for (const e of ph.entries) {
        map.set(e.id, e.name)
        for (const sub of e.subtasks) map.set(sub.id, sub.name)
      }
    }
    return map
  }, [project.phases])

  const entryTypeMap = useMemo(() => {
    const map = new Map<string, EntryType>()
    for (const ph of project.phases) {
      for (const e of ph.entries) {
        map.set(e.id, e.type)
        for (const sub of e.subtasks) map.set(sub.id, sub.type)
      }
    }
    return map
  }, [project.phases])

  const entryDependsOnMap = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const ph of project.phases) {
      for (const e of ph.entries) {
        map.set(e.id, e.dependsOn)
        for (const sub of e.subtasks) map.set(sub.id, sub.dependsOn)
      }
    }
    return map
  }, [project.phases])

  // Find which phaseId an entry belongs to
  const entryPhaseMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const ph of project.phases) {
      for (const e of ph.entries) {
        map.set(e.id, ph.id)
        for (const sub of e.subtasks) map.set(sub.id, ph.id)
      }
    }
    return map
  }, [project.phases])

  // Hierarchy numbering (1 / 1.1 / 1.1.1) — purely derived from current array
  // position, never stored, so it's always in sync with drag-and-drop reorders.
  const phaseNumberMap = useMemo(() => {
    const map = new Map<string, number>()
    project.phases.forEach((ph, i) => map.set(ph.id, i + 1))
    return map
  }, [project.phases])

  const hierarchyNumberMap = useMemo(() => {
    const map = new Map<string, string>()
    project.phases.forEach((ph, phaseIdx) => {
      const topEntries = ph.entries.filter((e) => !e.parentEntryId)
      topEntries.forEach((e, entryIdx) => {
        const num = `${phaseIdx + 1}.${entryIdx + 1}`
        map.set(e.id, num)
        e.subtasks.forEach((sub, subIdx) => map.set(sub.id, `${num}.${subIdx + 1}`))
      })
    })
    return map
  }, [project.phases])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function applyBulkStatus(status: EntryStatus) {
    for (const id of selected) updateEntryStatus(projectId, id, status)
    setSelected(new Set())
  }

  function applyBulkMovePhase(toPhaseId: string) {
    for (const id of selected) {
      const fromPhaseId = entryPhaseMap.get(id)
      if (fromPhaseId) moveEntryToPhase(projectId, fromPhaseId, toPhaseId, id)
    }
    setSelected(new Set())
  }

  function applyBulkType(type: EntryType) {
    for (const id of selected) updateEntry(projectId, id, { type })
    setSelected(new Set())
  }

  function applyBulkConvertToSubtask(parentEntryId: string) {
    for (const id of selected) {
      if (id === parentEntryId) continue
      const phaseId = entryPhaseMap.get(id)
      const parentPhaseId = entryPhaseMap.get(parentEntryId)
      if (phaseId && phaseId === parentPhaseId) convertToSubtask(projectId, phaseId, id, parentEntryId)
    }
    setSelected(new Set())
  }

  function applyBulkAddDependency(depId: string) {
    for (const id of selected) {
      if (id === depId) continue
      const current = entryDependsOnMap.get(id) ?? []
      if (current.includes(depId)) continue
      updateEntry(projectId, id, { dependsOn: [...current, depId] })
    }
    setSelected(new Set())
  }

  function applyBulkDelete() {
    if (!confirm(`Excluir ${selected.size} item(ns) selecionado(s)? Esta ação não pode ser desfeita.`)) return
    for (const id of selected) {
      const phaseId = entryPhaseMap.get(id)
      if (phaseId) deleteEntry(projectId, phaseId, id)
    }
    setSelected(new Set())
  }

  const [bulkCommentOpen, setBulkCommentOpen] = useState(false)
  const [bulkCommentText, setBulkCommentText] = useState('')

  function applyBulkComment() {
    if (!bulkCommentText.trim()) return
    const author = profile?.name ?? user?.email ?? 'Anônimo'
    for (const id of selected) {
      addComment(projectId, id, { author, text: bulkCommentText.trim(), createdAt: new Date().toISOString() })
    }
    setSelected(new Set())
    setBulkCommentText('')
    setBulkCommentOpen(false)
  }

  const [bulkOwnersOpen, setBulkOwnersOpen] = useState(false)
  const [bulkOwners, setBulkOwners] = useState<EntryOwner[]>([])
  const directoryAsTeam: TeamMember[] = useMemo(
    () => teamDirectory.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name ?? p.email ?? '', role: '', email: p.email ?? undefined, userId: p.id })),
    [teamDirectory],
  )
  const projectContacts = useMemo(
    () => project.clientIds.length ? contactsForClients(contacts, project.clientIds) : [],
    [contacts, project.clientIds],
  )

  function applyBulkOwners() {
    for (const id of selected) updateEntry(projectId, id, { owners: bulkOwners, responsible: bulkOwners[0]?.name ?? '' })
    setSelected(new Set())
    setBulkOwnersOpen(false)
  }

  const [bulkDateOpen, setBulkDateOpen] = useState(false)
  const [bulkDate, setBulkDate] = useState('')

  function applyBulkDate() {
    if (!bulkDate) return
    for (const id of selected) {
      const type = entryTypeMap.get(id)
      if (!type) continue
      updateEntry(projectId, id, type === 'task' ? { plannedEnd: bulkDate } : { plannedDate: bulkDate })
    }
    setSelected(new Set())
    setBulkDate('')
    setBulkDateOpen(false)
  }

  // ── Drag-and-drop (move a task/milestone to another phase) ────────────────

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  function handleDragEnd(e: DragEndEvent) {
    setDraggingId(null)
    const { active, over } = e
    if (!over) return
    const overId = String(over.id)
    const entryId = String(active.id)
    const fromPhaseId = entryPhaseMap.get(entryId)
    if (!fromPhaseId) return

    if (overId.startsWith('phase-')) {
      const toPhaseId = overId.slice('phase-'.length)
      if (fromPhaseId !== toPhaseId) moveEntryToPhase(projectId, fromPhaseId, toPhaseId, entryId)
      return
    }

    if (overId.startsWith('entry-')) {
      const targetEntryId = overId.slice('entry-'.length)
      if (targetEntryId === entryId) return
      const toPhaseId = entryPhaseMap.get(targetEntryId)
      if (!toPhaseId) return
      reorderEntry(projectId, fromPhaseId, toPhaseId, entryId, targetEntryId)
    }
  }

  // Build flat data for TanStack (entries → subRows for subtasks + child meetings)
  const data = useMemo<PlanRow[]>(() => {
    // Collect child meetings grouped by parentEntryId
    const childMeetingsByParent = new Map<string, PlanRow[]>()
    for (const ph of project.phases) {
      for (const e of ph.entries) {
        if (e.parentEntryId) {
          const list = childMeetingsByParent.get(e.parentEntryId) ?? []
          list.push({ ...e, _phaseId: ph.id })
          childMeetingsByParent.set(e.parentEntryId, list)
        }
      }
    }

    return project.phases.flatMap((ph) =>
      ph.entries
        .filter((e) => !e.parentEntryId && !e.hiddenFromPlan)
        .map((e) => {
          const childMtgs = childMeetingsByParent.get(e.id) ?? []
          const subRows: PlanRow[] | undefined =
            e.subtasks.length > 0 || childMtgs.length > 0
              ? [
                  ...e.subtasks.map((sub) => ({ ...sub, _phaseId: ph.id })),
                  ...childMtgs,
                ]
              : undefined
          return { ...e, _phaseId: ph.id, subRows }
        }),
    )
  }, [project.phases])

  // ── Date change handler ────────────────────────────────────────────────────

  function requestDateChange(
    entry: Entry,
    field: PendingDate['field'],
    value: string,
  ) {
    if (!value) return

    // For actual fields, apply directly — no justification modal needed
    if (field === 'actualStart' || field === 'actualEnd') {
      changeEntryDate(projectId, entry.id, field, value)
      return
    }

    // Calculate diff from previous planned value (for delay log)
    const prevIso =
      field === 'plannedEnd'  ? entry.plannedEnd :
      field === 'plannedDate' ? entry.plannedDate :
                                entry.plannedStart
    let diffDays = 0
    if (prevIso && (field === 'plannedEnd' || field === 'plannedDate')) {
      diffDays = workdaysBetween(
        parseISO(prevIso), parseISO(value),
        parseHolidays(settings.holidays),
      )
    }

    // Apply date change to store immediately so setBaseline always sees current state
    changeEntryDate(projectId, entry.id, field, value)

    // Open justification modal for tracking — only when there is a measurable shift
    if (diffDays !== 0) {
      setPendingDate({ entryId: entry.id, field, value, diffDays })
    }
  }

  function applyPendingDate(justification?: { description: string; responsibility: DelayLogEntry['responsibility']; type: DelayLogEntry['type'] }) {
    if (!pendingDate) return
    // Date is already in the store — just record the justification entry if provided
    if (justification) {
      addDelayLogEntry(projectId, {
        date: new Date().toISOString().split('T')[0],
        entryId: pendingDate.entryId,
        entryName: entryNameMap.get(pendingDate.entryId) ?? '',
        days: pendingDate.diffDays,
        responsibility: justification.responsibility,
        type: justification.type,
        description: justification.description,
        comments: '',
        triggeredBy: 'manual',
      })
    }
    setPendingDate(null)
  }

  // ── Columns ───────────────────────────────────────────────────────────────

  const columns = useMemo<ColumnDef<PlanRow>[]>(() => [
    // Drag handle — top-level rows only; drop on a phase header to move it there
    {
      id: 'drag', size: 20,
      header: () => null,
      cell: ({ row }) => row.depth === 0
        ? <DragHandleCell entryId={row.original.id} />
        : <span className="w-4 inline-block" />,
    },
    // Select (bulk actions) — top-level rows only, mirrors TasksPage/ProjectsPage/IncidentsPage
    {
      id: 'select', size: 28,
      header: () => null,
      cell: ({ row }) => (
        <input
          type="checkbox"
          className="rounded border-[var(--border-default)] accent-[var(--oe-primary)]"
          checked={selected.has(row.original.id)}
          onChange={() => toggleSelect(row.original.id)}
        />
      ),
    },
    // Expand toggle
    {
      id: 'expand', size: 28,
      header: () => null,
      cell: ({ row }) => row.getCanExpand()
        ? <button onClick={row.getToggleExpandedHandler()} className="text-xs w-4 transition-colors" style={{ color: 'var(--text-tertiary)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}>{row.getIsExpanded() ? '▾' : '▸'}</button>
        : <span className="w-4 inline-block" />,
    },
    // Hierarchy number (1 / 1.1 / 1.1.1) — toggleable, purely computed
    {
      id: 'number', size: 60,
      header: () => <span>{t('plan.colNumber')}</span>,
      cell: ({ row }) => (
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
          {hierarchyNumberMap.get(row.original.id) ?? ''}
        </span>
      ),
    },
    // Name (with TypePill + icons inline)
    {
      id: 'name', size: 300,
      header: () => <span>{t('entry.name')}</span>,
      cell: ({ row }) => {
        const e = row.original
        const linkedRisk = project.risks.find((r) => r.linkedEntryIds.includes(e.id))
        return (
          <NameCell
            entry={e}
            depth={row.depth}
            projectId={projectId}
            linkedRisk={linkedRisk}
            onOpenComments={() => setCommentsEntry(e)}
            onNavigateToRisk={onNavigateToRisk}
            onChangeRisk={(f) => updateEntryRisk(projectId, e.id, f)}
            onOpenEdit={() => setEditEntry({ entry: e, phaseId: e._phaseId })}
          />
        )
      },
    },
    // Responsible
    {
      id: 'responsible', size: 120,
      header: () => <span>{t('entry.responsible')}</span>,
      cell: ({ row }) => <ResponsibleCell entry={row.original} />,
    },
    // Dependencies
    {
      id: 'deps', size: 130,
      header: () => <span>{t('plan.colDeps')}</span>,
      cell: ({ row }) => (
        <DepsCell entry={row.original} phases={project.phases} projectId={projectId} />
      ),
    },
    // Planned Start / Date
    {
      id: 'dateStart', size: 98,
      header: () => <span>{t('plan.colStart')}</span>,
      cell: ({ row }) => {
        const e = row.original
        if (e.type !== 'task') {
          const { iso, isActual, editField } = displayEnd(e)
          const isOverdue = !isActual && e.status === 'overdue'
          return <DateCell iso={iso} isActual={isActual} isOverdue={isOverdue} onCommit={(v) => requestDateChange(e, editField, v)} />
        }
        const { iso, isActual, editField } = displayStart(e)
        const isOverdue = !isActual && e.status === 'overdue'
        return <DateCell iso={iso} isActual={isActual} isOverdue={isOverdue} onCommit={(v) => requestDateChange(e, editField, v)} />
      },
    },
    // Planned End (tasks only)
    {
      id: 'dateEnd', size: 98,
      header: () => <span>{t('plan.colEnd')}</span>,
      cell: ({ row }) => {
        const e = row.original
        if (e.type !== 'task') return <span style={{ fontSize: 11, color: 'var(--text-disabled)' }}>—</span>
        const { iso, isActual, editField } = displayEnd(e)
        const isOverdue = !isActual && e.status === 'overdue'
        return <DateCell iso={iso} isActual={isActual} isOverdue={isOverdue} onCommit={(v) => requestDateChange(e, editField, v)} />
      },
    },
    // BL Start
    {
      id: 'blStart', size: 98,
      header: () => <span>{t('entry.baselineStart')}</span>,
      cell: ({ row }) => {
        const e = row.original
        if (!project.baselineSetAt || e.type !== 'task') return <span style={{ fontSize: 11, color: 'var(--text-disabled)' }}>—</span>
        return <DateCell iso={e.baselineStart} isBaseline editable={false} onCommit={() => {}} />
      },
    },
    // BL End / BL Date
    {
      id: 'blEnd', size: 98,
      header: () => <span>{t('entry.baselineEnd')}</span>,
      cell: ({ row }) => {
        const e = row.original
        if (!project.baselineSetAt) return <span style={{ fontSize: 11, color: 'var(--text-disabled)' }}>—</span>
        const blDate = e.type === 'task' ? e.baselineEnd : e.baselineDate
        return <DateCell iso={blDate} isBaseline editable={false} onCommit={() => {}} />
      },
    },
    // Variance
    {
      id: 'variance', size: 72,
      header: () => <span>{t('entry.variance')}</span>,
      cell: ({ row }) => {
        if (!project.baselineSetAt) return <span style={{ fontSize: 11, color: 'var(--text-disabled)' }}>—</span>
        const v = computeDisplayVariance(row.original, settings.holidays)
        if (v === undefined) return <span style={{ fontSize: 11, color: 'var(--text-disabled)' }}>—</span>
        if (v === 0) return <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>0</span>
        return (
          <span style={{ fontSize: 11, fontWeight: 500, color: v > 0 ? 'var(--color-danger-text)' : 'var(--color-success-text)' }}>
            {v > 0 ? '+' : ''}{v}d
          </span>
        )
      },
    },
    // Duration
    {
      id: 'duration', size: 72,
      header: () => <span>{t('plan.colDuration')}</span>,
      cell: ({ row }) => {
        const e = row.original
        if (e.type === 'task') {
          const d = computeDisplayDuration(e, settings.holidays)
          if (d !== undefined) return <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{d}d</span>
        }
        if (e.type === 'meeting' && e.durationHours)
          return <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{e.durationHours}h</span>
        return <span style={{ fontSize: 11, color: 'var(--text-disabled)' }}>—</span>
      },
    },
    // Status
    {
      id: 'status', size: 175,
      header: () => <span>{t('entry.status')}</span>,
      cell: ({ row }) => {
        const e = row.original
        const autoStatus = computeAutoStatus(e, today)
        const showOverridePin = e.statusOverride && autoStatus === 'overdue'
        return (
          <div className="flex items-center gap-1">
            <StatusBadge
              value={e.status}
              onChange={(v) => updateEntryStatus(projectId, e.id, v as EntryStatus)}
              options={[
                { value: 'pending', label: t('status.pending') },
                { value: 'in_progress', label: t('status.in_progress') },
                { value: 'validation', label: t('status.validation') },
                { value: 'done', label: t('status.done') },
                { value: 'blocked', label: t('status.blocked') },
                ...(e.status === 'overdue' ? [{ value: 'overdue', label: t('status.overdue') }] : []),
              ]}
            />
            {showOverridePin && (
              <button
                onClick={() => resetStatusOverride(projectId, e.id)}
                title={t('status.manualOverride')}
                className="text-amber-500 hover:text-amber-700 text-sm shrink-0"
              >
                📌
              </button>
            )}
          </div>
        )
      },
    },
    // Actions
    {
      id: 'actions', size: 60,
      header: () => null,
      cell: ({ row }) => {
        const e = row.original
        const phaseId = entryPhaseMap.get(e.id) ?? e._phaseId
        return (
          <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
            {row.depth === 0 && (
              <button
                onClick={() => setAddModal({ type: 'task', phaseId, parentId: e.id })}
                className="w-5 h-5 flex items-center justify-center rounded transition-colors"
                style={{ fontSize: 12, color: 'var(--text-tertiary)' }}
                onMouseEnter={ev => { ev.currentTarget.style.color = 'var(--oe-primary)'; ev.currentTarget.style.background = 'var(--oe-primary-light)' }}
                onMouseLeave={ev => { ev.currentTarget.style.color = 'var(--text-tertiary)'; ev.currentTarget.style.background = '' }}
                title={t('entry.addSubtask')}
              >+</button>
            )}
            {row.depth === 0 && e.type === 'task' && (
              <button
                onClick={() => setAddModal({ type: 'meeting', phaseId, parentEntryId: e.id })}
                className="w-5 h-5 flex items-center justify-center rounded transition-colors"
                style={{ fontSize: 11, color: 'var(--text-tertiary)' }}
                onMouseEnter={ev => { ev.currentTarget.style.color = '#7C3AED'; ev.currentTarget.style.background = '#EDE9FE' }}
                onMouseLeave={ev => { ev.currentTarget.style.color = 'var(--text-tertiary)'; ev.currentTarget.style.background = '' }}
                title={t('plan.addChildMeeting')}
              >📅</button>
            )}
            <button
              onClick={() => deleteEntry(projectId, phaseId, e.id)}
              className="w-5 h-5 flex items-center justify-center rounded transition-colors"
              style={{ fontSize: 12, color: 'var(--text-disabled)' }}
              onMouseEnter={ev => { ev.currentTarget.style.color = 'var(--color-danger-text)'; ev.currentTarget.style.background = 'var(--color-danger-bg)' }}
              onMouseLeave={ev => { ev.currentTarget.style.color = 'var(--text-disabled)'; ev.currentTarget.style.background = '' }}
              title="Excluir"
            >✕</button>
          </div>
        )
      },
    },
  ], [project, settings.holidays, entryPhaseMap, hierarchyNumberMap, projectId,
    updateEntryStatus, updateEntryRisk, deleteEntry, selected])

  const table = useReactTable<PlanRow>({
    data,
    columns,
    getSubRows: (row) => row.subRows,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    state: { columnVisibility, expanded: expandedRows },
    onColumnVisibilityChange: handleColVisChange as any,
    onExpandedChange: setExpandedRows,
  })

  // Phase map for header rendering
  const phaseMap = useMemo(() => new Map(project.phases.map((ph) => [ph.id, ph])), [project.phases])

  // Render rows with phase header injection
  let renderPhaseId = ''

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Toolbar */}
      <div className="px-4 py-2.5 flex flex-wrap items-center gap-1.5" style={{ background: 'var(--surface-card)', borderBottom: '1px solid var(--border-default)' }}>
        {/* Add buttons */}
        <div className="flex items-center gap-1">
          {([['task', t('plan.addTask')], ['milestone', t('plan.addMilestone')], ['meeting', t('plan.addMeeting')]] as [EntryType, string][]).map(([type, label]) => (
            <Button key={type} size="xs" variant="pill"
              onClick={() => setAddModal({ type, phaseId: project.phases.find((ph) => !ph.isUnassigned)?.id })}>
              {label}
            </Button>
          ))}
          <Button size="xs" variant="pill" onClick={() => setAddingPhase(true)}>
            {t('plan.addPhase')}
          </Button>
        </div>

        <div className="flex-1" />

        {/* Column visibility */}
        <span ref={colMenuTriggerRef as any}>
          <Button size="sm" variant="secondary" onClick={() => setColMenuOpen((v) => !v)}>
            {t('plan.columns')}
          </Button>
        </span>

        {/* Baseline */}
        {project.baselineSetAt ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] px-2 py-1 rounded-[var(--radius-sm)]" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success-text)', border: '1px solid #bbf7d0' }}>
              BL: {fmtDate(project.baselineSetAt.split('T')[0])}
            </span>
            <Button size="sm" variant="secondary"
              onClick={() => { if (confirm(t('plan.confirmRebaseline'))) setBaseline(projectId) }}>
              {t('plan.rebaseline')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => clearBaseline(projectId)}>{t('plan.clearBaseline')}</Button>
          </div>
        ) : (
          <Button size="sm" variant="primary"
            onClick={() => { if (confirm(t('plan.confirmBaseline'))) setBaseline(projectId) }}>
            {t('plan.setBaseline')}
          </Button>
        )}
      </div>

      {/* Add phase inline */}
      {addingPhase && (
        <div className="px-4 py-2 flex items-center gap-2" style={{ background: 'var(--surface-subtle)', borderBottom: '1px solid var(--border-default)' }}>
          <input
            autoFocus value={newPhaseName} onChange={(e) => setNewPhaseName(e.target.value)}
            placeholder="Nome da fase"
            className="text-[13px] px-3 py-1.5 focus:outline-none focus:ring-1 w-64 transition-colors"
            style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newPhaseName.trim()) {
                addPhase(projectId, newPhaseName.trim())
                setNewPhaseName(''); setAddingPhase(false)
              }
              if (e.key === 'Escape') { setNewPhaseName(''); setAddingPhase(false) }
            }}
          />
          <Button size="sm" onClick={() => {
            if (newPhaseName.trim()) { addPhase(projectId, newPhaseName.trim()) }
            setNewPhaseName(''); setAddingPhase(false)
          }} disabled={!newPhaseName.trim()}>{t('actions.add')}</Button>
          <Button size="sm" variant="ghost" onClick={() => { setNewPhaseName(''); setAddingPhase(false) }}>{t('actions.cancel')}</Button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto min-w-0">
        <DndContext
          sensors={dndSensors}
          onDragStart={(e) => setDraggingId(String(e.active.id))}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDraggingId(null)}
        >
        <table className="w-full border-collapse" style={{ minWidth: 1300 }}>
          <thead className="sticky top-0 z-10" style={{ background: 'var(--surface-subtle)' }}>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} style={{ borderBottom: '1px solid var(--border-default)' }}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="text-left px-2 py-2 whitespace-nowrap"
                    style={{ width: header.getSize(), minWidth: header.getSize(), fontSize: 10, fontWeight: 500, letterSpacing: '0.03em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="text-center py-16 text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
                  {t('plan.noEntries')} {t('plan.noEntriesSub')}
                </td>
              </tr>
            )}
            {table.getRowModel().rows.flatMap((row) => {
              const phaseId = row.original._phaseId
              const phase = phaseMap.get(phaseId)
              const isNewPhase = phaseId !== renderPhaseId
              if (isNewPhase) renderPhaseId = phaseId

              const isCollapsed = collapsedPhases.has(phaseId)
              const items: React.ReactNode[] = []

              if (isNewPhase && phase) {
                items.push(
                  <PhaseHeader
                    key={`phase-${phaseId}`}
                    phase={phase}
                    phaseNumber={phaseNumberMap.get(phaseId) ?? 0}
                    colSpan={columns.length}
                    collapsed={isCollapsed}
                    onToggle={() => setCollapsedPhases((s) => {
                      const next = new Set(s)
                      if (next.has(phaseId)) next.delete(phaseId); else next.add(phaseId)
                      return next
                    })}
                    onAdd={() => setAddModal({ type: 'task', phaseId })}
                    onDelete={() => { if (confirm(t('template.confirmDeletePhase'))) deletePhase(projectId, phaseId) }}
                    onRename={(name) => updatePhase(projectId, phaseId, { name })}
                  />,
                )
              }

              if (!isCollapsed) {
                const e = row.original
                const autoStatus = computeAutoStatus(e, today)
                const isSpecialRow = e.status === 'overdue' || (e.statusOverride && autoStatus === 'overdue')
                const rowBg = e.status === 'overdue'
                  ? 'var(--color-danger-bg)'
                  : (e.statusOverride && autoStatus === 'overdue')
                    ? 'var(--color-warning-bg)'
                    : 'var(--surface-card)'
                items.push(
                  <PlanTableRow
                    key={row.id}
                    entryId={row.original.id}
                    disabled={row.depth !== 0}
                    className="group/row transition-colors"
                    style={{ borderBottom: '0.5px solid var(--border-default)', background: rowBg }}
                    onMouseEnter={ev => { if (!isSpecialRow) (ev.currentTarget as HTMLElement).style.background = 'rgba(232,89,12,0.03)' }}
                    onMouseLeave={ev => { if (!isSpecialRow) (ev.currentTarget as HTMLElement).style.background = 'var(--surface-card)' }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        style={{ width: cell.column.getSize(), maxWidth: cell.column.getSize() }}
                        className="px-2 py-1.5 overflow-hidden"
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </PlanTableRow>,
                )
              }

              return items
            })}
          </tbody>
        </table>
        <DragOverlay>
          {draggingId && (
            <div
              className="text-xs font-medium px-3 py-1.5 rounded-[var(--radius-md)]"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--oe-primary)', color: 'var(--text-primary)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
            >
              {entryNameMap.get(draggingId) ?? ''}
            </div>
          )}
        </DragOverlay>
        </DndContext>
      </div>

      {/* Column visibility menu */}
      {colMenuOpen && createPortal(
        <div
          ref={colMenuPopoverRef as any}
          style={{ position: 'fixed', ...colMenuPosition, zIndex: 1000, background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)' }}
          className="py-2 w-48"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {TOGGLEABLE_COLS.map(({ id, key }) => {
            const col = table.getColumn(id)
            if (!col) return null
            return (
              <label key={id} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer text-[12px]" style={{ color: 'var(--text-secondary)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-subtle)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <input type="checkbox" checked={col.getIsVisible()} onChange={col.getToggleVisibilityHandler()} className="rounded" />
                {t(key as any)}
              </label>
            )
          })}
        </div>,
        document.body,
      )}

      {/* Delay modal */}
      {pendingDate && (
        <DelayModal
          pending={pendingDate}
          holidays={settings.holidays}
          onConfirm={(j) => applyPendingDate(j)}
          onSkip={() => applyPendingDate()}
        />
      )}

      {/* Comments panel */}
      {commentsEntry && (
        <CommentsPanel
          projectId={projectId}
          entry={commentsEntry}
          onClose={() => setCommentsEntry(null)}
        />
      )}

      {/* Create entry modal */}
      {addModal && (
        <EntryModal
          open
          mode="create"
          defaultProjectId={projectId}
          defaultPhaseId={addModal.phaseId}
          defaultParentId={addModal.parentId}
          defaultParentEntryId={addModal.parentEntryId}
          defaultType={addModal.type}
          lockProject
          onClose={() => setAddModal(null)}
        />
      )}

      {/* Edit entry modal */}
      {editEntry && (
        <EntryModal
          open
          mode="edit"
          entry={editEntry.entry}
          entryProjectId={projectId}
          entryPhaseId={editEntry.phaseId}
          onClose={() => setEditEntry(null)}
          onRequestDateChange={(originalEntry, field, value) =>
            requestDateChange(originalEntry, field, value)
          }
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
          <option value="pending">{t('status.pending')}</option>
          <option value="in_progress">{t('status.in_progress')}</option>
          <option value="validation">{t('status.validation')}</option>
          <option value="done">{t('status.done')}</option>
          <option value="blocked">{t('status.blocked')}</option>
        </select>
        <select
          onChange={(e) => { if (e.target.value) applyBulkMovePhase(e.target.value) }}
          value=""
          className="text-xs rounded-[var(--radius-md)] px-2 py-1"
          style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none' }}
        >
          <option value="" disabled>Mover para fase...</option>
          {project.phases.filter((ph) => !ph.isUnassigned).map((ph) => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
        </select>
        <select
          onChange={(e) => { if (e.target.value) applyBulkType(e.target.value as EntryType) }}
          value=""
          className="text-xs rounded-[var(--radius-md)] px-2 py-1"
          style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none' }}
        >
          <option value="" disabled>Alterar tipo...</option>
          <option value="task">{t('entry.task')}</option>
          <option value="milestone">{t('entry.milestone')}</option>
          <option value="meeting">{t('entry.meeting')}</option>
        </select>
        <select
          onChange={(e) => { if (e.target.value) applyBulkConvertToSubtask(e.target.value) }}
          value=""
          className="text-xs rounded-[var(--radius-md)] px-2 py-1"
          style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none' }}
        >
          <option value="" disabled>Virar subtarefa de...</option>
          {project.phases.flatMap((ph) => ph.entries
            .filter((e) => !selected.has(e.id))
            .map((e) => <option key={e.id} value={e.id}>{ph.name} · {e.name}</option>))}
        </select>
        <select
          onChange={(e) => { if (e.target.value) applyBulkAddDependency(e.target.value) }}
          value=""
          className="text-xs rounded-[var(--radius-md)] px-2 py-1"
          style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none' }}
        >
          <option value="" disabled>Adicionar dependência...</option>
          {project.phases.flatMap((ph) => ph.entries
            .filter((e) => !selected.has(e.id))
            .map((e) => <option key={e.id} value={e.id}>{ph.name} · {e.name}</option>))}
        </select>
        <button
          onClick={() => { setBulkOwners([]); setBulkOwnersOpen(true) }}
          className="text-xs px-2 py-1 rounded-[var(--radius-md)]"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          Alterar responsável
        </button>
        <button
          onClick={() => { setBulkDate(''); setBulkDateOpen(true) }}
          className="text-xs px-2 py-1 rounded-[var(--radius-md)]"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          Alterar data
        </button>
        <button
          onClick={() => { setBulkCommentText(''); setBulkCommentOpen(true) }}
          className="text-xs px-2 py-1 rounded-[var(--radius-md)]"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          Comentar
        </button>
        <button
          onClick={applyBulkDelete}
          className="text-xs px-2 py-1 rounded-[var(--radius-md)]"
          style={{ background: 'rgba(239,68,68,0.25)', color: '#fca5a5' }}
        >
          Excluir
        </button>
      </SelectionBar>

      {bulkOwnersOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setBulkOwnersOpen(false)}>
          <div className="rounded-[var(--radius-lg)] p-5 w-full max-w-sm" style={{ background: 'var(--surface-card)' }} onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Alterar responsável de {selected.size} item(ns)</p>
            <OwnersField owners={bulkOwners} onChange={setBulkOwners} teamMembers={directoryAsTeam} contacts={projectContacts} />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setBulkOwnersOpen(false)} className="text-sm px-3 py-1.5 rounded-[var(--radius-md)]" style={{ color: 'var(--text-secondary)' }}>Cancelar</button>
              <button onClick={applyBulkOwners} className="text-sm px-3 py-1.5 rounded-[var(--radius-md)] text-white" style={{ background: 'var(--oe-primary)' }}>É basicamente isso</button>
            </div>
          </div>
        </div>
      )}

      {bulkDateOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setBulkDateOpen(false)}>
          <div className="rounded-[var(--radius-lg)] p-5 w-full max-w-sm" style={{ background: 'var(--surface-card)' }} onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Alterar data de {selected.size} item(ns)</p>
            <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>Tarefas usam esta data como fim planejado; marcos e reuniões usam como a própria data.</p>
            <input
              type="date" autoFocus value={bulkDate} onChange={(e) => setBulkDate(e.target.value)}
              className="w-full text-sm rounded-[var(--radius-md)] border px-2 py-1.5"
              style={{ borderColor: 'var(--border-default)', background: 'var(--surface-input)', color: 'var(--text-primary)' }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setBulkDateOpen(false)} className="text-sm px-3 py-1.5 rounded-[var(--radius-md)]" style={{ color: 'var(--text-secondary)' }}>Cancelar</button>
              <button onClick={applyBulkDate} disabled={!bulkDate} className="text-sm px-3 py-1.5 rounded-[var(--radius-md)] text-white disabled:opacity-40" style={{ background: 'var(--oe-primary)' }}>É basicamente isso</button>
            </div>
          </div>
        </div>
      )}

      {bulkCommentOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setBulkCommentOpen(false)}>
          <div className="rounded-[var(--radius-lg)] p-5 w-full max-w-sm" style={{ background: 'var(--surface-card)' }} onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Comentar em {selected.size} item(ns)</p>
            <Textarea autoFocus value={bulkCommentText} onChange={(e) => setBulkCommentText(e.target.value)} rows={3} placeholder="Escreva o comentário..." />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setBulkCommentOpen(false)} className="text-sm px-3 py-1.5 rounded-[var(--radius-md)]" style={{ color: 'var(--text-secondary)' }}>Cancelar</button>
              <button onClick={applyBulkComment} disabled={!bulkCommentText.trim()} className="text-sm px-3 py-1.5 rounded-[var(--radius-md)] text-white disabled:opacity-40" style={{ background: 'var(--oe-primary)' }}>É basicamente isso</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
