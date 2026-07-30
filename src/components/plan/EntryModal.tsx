import { useState, useMemo, useEffect, CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useToastStore } from '@/stores/useToastStore'
import { Entry, EntryOwner, EntryType, EntryStatus, RiskFlag, Link } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import OwnersField from '@/components/plan/OwnersField'

// ─── types ────────────────────────────────────────────────────────────────────

interface EntryModalProps {
  open: boolean
  mode: 'create' | 'edit'
  entry?: Entry
  entryProjectId?: string
  entryPhaseId?: string
  defaultProjectId?: string
  defaultPhaseId?: string
  defaultParentId?: string
  defaultParentEntryId?: string
  defaultType?: EntryType
  lockProject?: boolean
  onClose: () => void
  onRequestDateChange?: (
    entry: Entry,
    field: 'plannedStart' | 'plannedEnd' | 'plannedDate',
    value: string,
  ) => void
}

type Form = {
  name: string
  type: EntryType
  projectId: string
  phaseId: string
  owners: EntryOwner[]
  status: EntryStatus
  riskFlag: RiskFlag
  plannedStart: string
  plannedEnd: string
  plannedDate: string
  durationDays: number
  durationHours: number
  dependsOn: string[]
  linkedParentId: string
  subtaskOf: string
  links: Link[]
  hiddenFromPlan: boolean
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<EntryType, string> = { task: '✅', milestone: '🏁', meeting: '📅' }

function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

function emptyForm(
  type: EntryType,
  projectId: string,
  phaseId: string,
  parentEntryId?: string,
  parentId?: string,
): Form {
  return {
    name: '',
    type,
    projectId,
    phaseId,
    owners: [],
    status: 'pending',
    riskFlag: 'none',
    plannedStart: '',
    plannedEnd: '',
    plannedDate: '',
    durationDays: 1,
    durationHours: 1,
    dependsOn: [],
    linkedParentId: parentEntryId ?? '',
    subtaskOf: parentId ?? '',
    links: [],
    hiddenFromPlan: false,
  }
}

function entryToForm(entry: Entry, projectId: string, phaseId: string): Form {
  let owners: EntryOwner[] =
    entry.owners && entry.owners.length > 0
      ? entry.owners.map((o) => ({ ...o }))
      : entry.responsible
        ? [{
            id: entry.responsibleMemberId ?? entry.responsible,
            type: (entry.responsibleMemberId ? 'member' : 'text') as 'member' | 'text',
            memberId: entry.responsibleMemberId,
            name: entry.responsible,
          }]
        : []

  // Legacy rows saved before Executor/Validador existed have no `kind` — treat
  // the first owner as the executor so old entries still open with one set.
  if (owners.length > 0 && !owners.some((o) => o.kind)) {
    owners = owners.map((o, i) => (i === 0 ? { ...o, kind: 'executor' as const } : o))
  }

  return {
    name: entry.name,
    type: entry.type,
    projectId,
    phaseId,
    owners,
    status: entry.status,
    riskFlag: entry.riskFlag,
    plannedStart: entry.plannedStart ?? '',
    plannedEnd: entry.plannedEnd ?? '',
    plannedDate: entry.plannedDate ?? '',
    durationDays: entry.durationDays ?? 1,
    durationHours: entry.durationHours ?? 1,
    dependsOn: [...entry.dependsOn],
    linkedParentId: entry.parentEntryId ?? '',
    subtaskOf: '',
    links: entry.links.map((l) => ({ ...l })),
    hiddenFromPlan: entry.hiddenFromPlan ?? false,
  }
}

// ─── small internal components ────────────────────────────────────────────────

const inputStyle: CSSProperties = {
  width: '100%',
  fontSize: 13,
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  padding: '5px 8px',
  color: 'var(--text-primary)',
  background: 'var(--surface-input)',
  outline: 'none',
  boxSizing: 'border-box',
}

function FieldLabel({ children }: { children: string }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-tertiary)', marginBottom: 5 }}>
      {children}
    </p>
  )
}

function FieldBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  )
}

// ─── component ────────────────────────────────────────────────────────────────

export default function EntryModal({
  open, mode,
  entry, entryProjectId, entryPhaseId,
  defaultProjectId, defaultPhaseId,
  defaultParentId, defaultParentEntryId,
  defaultType = 'task',
  lockProject,
  onClose, onRequestDateChange,
}: EntryModalProps) {
  const { t } = useTranslation()
  const {
    projects,
    addEntry, addSubtask, updateEntry, deleteEntry, moveEntryToPhase,
    addComment, removeComment,
  } = useAppStore()
  const { profile } = useAuthStore()
  const { addToast } = useToastStore()

  // ── derive original project/phase ids (stable across re-renders) ──────────

  const origProjectId = useMemo(() => {
    if (entryProjectId) return entryProjectId
    if (!entry) return defaultProjectId ?? projects[0]?.id ?? ''
    for (const p of projects) {
      for (const ph of p.phases) {
        if (ph.entries.some((e) => e.id === entry.id)) return p.id
      }
    }
    return defaultProjectId ?? projects[0]?.id ?? ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const origPhaseId = useMemo(() => {
    if (entryPhaseId) return entryPhaseId
    if (!entry) return defaultPhaseId ?? ''
    const origProj = projects.find((p) => p.id === origProjectId)
    for (const ph of origProj?.phases ?? []) {
      if (ph.entries.some((e) => e.id === entry.id)) return ph.id
    }
    return defaultPhaseId ?? ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, origProjectId])

  // ── form state ────────────────────────────────────────────────────────────

  const makeForm = (): Form => {
    if (mode === 'edit' && entry) {
      return entryToForm(entry, origProjectId, origPhaseId)
    }
    const projId = defaultProjectId ?? projects[0]?.id ?? ''
    const proj = projects.find((p) => p.id === projId)
    const phId = defaultPhaseId ?? proj?.phases[0]?.id ?? ''
    return emptyForm(defaultType, projId, phId, defaultParentEntryId, defaultParentId)
  }

  const [form, setForm] = useState<Form>(makeForm)
  const [endDateError, setEndDateError] = useState('')
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm'>('idle')
  const [newLinkLabel, setNewLinkLabel] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [commentText, setCommentText] = useState('')
  const [depsOpen, setDepsOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setEndDateError('')
    setDeleteStep('idle')
    setNewLinkLabel('')
    setNewLinkUrl('')
    setCommentText('')
    setDepsOpen(false)
    setForm(makeForm())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  // ── derived ───────────────────────────────────────────────────────────────

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === form.projectId),
    [projects, form.projectId],
  )
  const selectedPhases = selectedProject?.phases ?? []
  const selectedTeam = selectedProject?.team ?? []

  const origProject = useMemo(
    () => projects.find((p) => p.id === origProjectId),
    [projects, origProjectId],
  )

  const isSubtask = mode === 'create' && !!defaultParentId
  const projectChanged = mode === 'edit' && form.projectId !== origProjectId
  const phaseChanged = mode === 'edit' && !projectChanged && form.phaseId !== origPhaseId

  // ── handlers ──────────────────────────────────────────────────────────────

  function handleProjectChange(newProjectId: string) {
    const newProj = projects.find((p) => p.id === newProjectId)
    const newPhaseId = newProj?.phases[0]?.id ?? ''
    setForm((f) => ({ ...f, projectId: newProjectId, phaseId: newPhaseId, dependsOn: [] }))
  }

  function toggleDep(id: string) {
    setForm((f) => ({
      ...f,
      dependsOn: f.dependsOn.includes(id)
        ? f.dependsOn.filter((d) => d !== id)
        : [...f.dependsOn, id],
    }))
  }

  function addLink() {
    if (!newLinkUrl.trim()) return
    const link: Link = {
      id: crypto.randomUUID(),
      label: newLinkLabel.trim() || newLinkUrl.trim(),
      url: newLinkUrl.trim(),
    }
    setForm((f) => ({ ...f, links: [...f.links, link] }))
    setNewLinkLabel('')
    setNewLinkUrl('')
  }

  function removeLink(id: string) {
    setForm((f) => ({ ...f, links: f.links.filter((l) => l.id !== id) }))
  }

  function handleAddComment() {
    if (!commentText.trim() || !entry) return
    addComment(origProjectId, entry.id, {
      author: profile?.name ?? 'Usuário',
      text: commentText.trim(),
      createdAt: new Date().toISOString(),
    })
    setCommentText('')
  }

  function handleToggleHiddenFromPlan() {
    const next = !form.hiddenFromPlan
    set('hiddenFromPlan', next)
    if (mode === 'edit' && entry) {
      updateEntry(origProjectId, entry.id, { hiddenFromPlan: next || undefined })
      addToast(next ? t('entry.hiddenFromPlanToast') : t('entry.showInPlanToast'), 'info')
    }
  }

  // ── available items ───────────────────────────────────────────────────────

  const availableParentTasks = useMemo(() => {
    const result: { id: string; name: string }[] = []
    for (const ph of selectedPhases) {
      for (const e of ph.entries) {
        if (e.type === 'task') result.push({ id: e.id, name: e.name })
      }
    }
    return result
  }, [selectedPhases])

  const availableDeps = useMemo(() => {
    const result: { id: string; name: string; phaseName: string }[] = []
    const excludeId = entry?.id
    for (const ph of selectedPhases) {
      for (const e of ph.entries) {
        if (e.id !== excludeId) {
          result.push({ id: e.id, name: e.name, phaseName: ph.name })
          for (const sub of e.subtasks) {
            if (sub.id !== excludeId)
              result.push({ id: sub.id, name: `${e.name} / ${sub.name}`, phaseName: ph.name })
          }
        }
      }
    }
    return result
  }, [selectedPhases, entry])

  const dependentCount = useMemo(() => {
    if (!entry) return 0
    let count = 0
    for (const ph of origProject?.phases ?? []) {
      for (const e of ph.entries) {
        if (e.dependsOn.includes(entry.id)) count++
        for (const sub of e.subtasks) {
          if (sub.dependsOn.includes(entry.id)) count++
        }
      }
    }
    return count
  }, [origProject, entry])

  const parentTask = form.type === 'meeting' && form.linkedParentId
    ? selectedPhases.flatMap((ph) => ph.entries).find((e) => e.id === form.linkedParentId)
    : undefined
  const parentEndWarning =
    parentTask?.plannedEnd && form.plannedDate && form.plannedDate > parentTask.plannedEnd

  // ── build patch ───────────────────────────────────────────────────────────

  function buildOwnerPatch() {
    const executor = form.owners.find((o) => o.kind === 'executor')
    return {
      owners: form.owners,
      responsible: executor?.name ?? '',
      responsibleMemberId: executor?.type === 'member' ? executor.memberId : undefined,
      responsibleMode: (executor?.type === 'member' ? 'member' : 'free') as 'member' | 'free',
    }
  }

  function buildEntryBase() {
    return {
      name: form.name.trim(),
      type: form.type,
      ...buildOwnerPatch(),
      status: form.status,
      riskFlag: form.riskFlag,
      dependsOn: form.dependsOn,
      order: 0,
      plannedStart: form.type === 'task' ? form.plannedStart || undefined : undefined,
      plannedEnd: form.type === 'task' ? form.plannedEnd || undefined : undefined,
      plannedDate: form.type !== 'task' ? form.plannedDate || undefined : undefined,
      durationDays: form.type === 'task' ? form.durationDays : undefined,
      durationHours: form.type === 'meeting' ? form.durationHours : undefined,
      parentEntryId: form.type === 'meeting' && form.linkedParentId ? form.linkedParentId : undefined,
      links: form.links,
      hiddenFromPlan: form.hiddenFromPlan || undefined,
    }
  }

  // ── save / delete ─────────────────────────────────────────────────────────

  function handleSaveCreate() {
    if (!form.name.trim() || !form.phaseId || !form.owners.some((o) => o.kind === 'executor')) return
    if (form.type === 'task' && form.plannedStart && form.plannedEnd && form.plannedEnd < form.plannedStart) {
      setEndDateError(t('errors.endBeforeStart'))
      return
    }
    setEndDateError('')
    const base = buildEntryBase()
    const parentId = defaultParentId || form.subtaskOf || ''
    if (parentId) {
      addSubtask(form.projectId, form.phaseId, parentId, base)
    } else {
      addEntry(form.projectId, form.phaseId, base)
    }
    onClose()
  }

  function handleSaveEdit() {
    if (!entry || !form.name.trim() || !form.owners.some((o) => o.kind === 'executor')) return
    if (form.type === 'task' && form.plannedStart && form.plannedEnd && form.plannedEnd < form.plannedStart) {
      setEndDateError(t('errors.endBeforeStart'))
      return
    }
    setEndDateError('')

    if (projectChanged) {
      deleteEntry(origProjectId, origPhaseId, entry.id)
      addEntry(form.projectId, form.phaseId, buildEntryBase())
    } else {
      if (phaseChanged) moveEntryToPhase(origProjectId, origPhaseId, form.phaseId, entry.id)
      updateEntry(origProjectId, entry.id, {
        name: form.name.trim(),
        ...buildOwnerPatch(),
        status: form.status,
        riskFlag: form.riskFlag,
        dependsOn: form.dependsOn,
        parentEntryId: form.type === 'meeting' && form.linkedParentId ? form.linkedParentId : undefined,
        durationDays: form.type === 'task' ? form.durationDays : undefined,
        durationHours: form.type === 'meeting' ? form.durationHours : undefined,
        links: form.links,
        hiddenFromPlan: form.hiddenFromPlan || undefined,
      })
      if (form.type === 'task') {
        if (form.plannedStart && form.plannedStart !== (entry.plannedStart ?? ''))
          onRequestDateChange?.(entry, 'plannedStart', form.plannedStart)
        if (form.plannedEnd && form.plannedEnd !== (entry.plannedEnd ?? ''))
          onRequestDateChange?.(entry, 'plannedEnd', form.plannedEnd)
      } else {
        if (form.plannedDate && form.plannedDate !== (entry.plannedDate ?? ''))
          onRequestDateChange?.(entry, 'plannedDate', form.plannedDate)
      }
    }
    onClose()
  }

  function handleDelete() {
    if (!entry) return
    deleteEntry(origProjectId, origPhaseId, entry.id)
    onClose()
  }

  // ── title ─────────────────────────────────────────────────────────────────

  const typeLabel = (type: EntryType) =>
    (type.charAt(0).toUpperCase() + type.slice(1)) as 'Task' | 'Milestone' | 'Meeting'

  const title = mode === 'create'
    ? isSubtask
      ? t('entry.addSubtask')
      : t(`entry.new${typeLabel(form.type)}` as any)
    : t(`entry.edit${typeLabel(entry?.type ?? 'task')}` as any)

  // ── footer ────────────────────────────────────────────────────────────────

  const footer = (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 8 }}>
      {mode === 'edit' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          {deleteStep === 'idle' ? (
            <button
              onClick={() => setDeleteStep('confirm')}
              style={{ fontSize: 13, padding: '6px 12px', borderRadius: 'var(--radius-md)', color: 'var(--color-danger-text)', background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-text)', cursor: 'pointer' }}
            >
              {t('entry.deleteEntry')}
            </button>
          ) : (
            <>
              {dependentCount > 0 && (
                <span style={{ fontSize: 12, color: 'var(--color-warning-text)' }}>
                  ⚠ {t('entry.hasDependents', { count: dependentCount })}
                </span>
              )}
              <button
                onClick={handleDelete}
                style={{ fontSize: 13, padding: '6px 12px', borderRadius: 'var(--radius-md)', color: 'white', background: 'var(--color-danger-text)', border: 'none', cursor: 'pointer', fontWeight: 500 }}
              >
                {t('entry.confirmDelete')}
              </button>
              <button
                onClick={() => setDeleteStep('idle')}
                style={{ fontSize: 13, padding: '4px 8px', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {t('actions.cancel')}
              </button>
            </>
          )}
        </div>
      )}
      {mode === 'create' && <div style={{ flex: 1 }} />}
      <Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button>
      <Button
        onClick={mode === 'edit' ? handleSaveEdit : handleSaveCreate}
        disabled={!form.name.trim() || !form.owners.some((o) => o.kind === 'executor')}
      >
        {mode === 'edit' ? t('entry.saveChanges') : t('actions.confirm')}
      </Button>
    </div>
  )

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <Modal open={open} title={title} onClose={onClose} size="xl" noPadding footer={footer}>
      <div style={{ display: 'flex', height: '100%', minHeight: 480, overflow: 'hidden' }}>

        {/* ── LEFT COLUMN ── */}
        <div style={{ flex: 2, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Type selector (create, not subtask, not forced meeting) */}
          {mode === 'create' && !isSubtask && !defaultParentEntryId && (
            <div style={{ display: 'flex', gap: 8 }}>
              {(['task', 'milestone', 'meeting'] as EntryType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => set('type', type)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 6, padding: '10px 0',
                    borderRadius: 'var(--radius-lg)',
                    border: form.type === type ? '2px solid var(--oe-primary)' : '2px solid var(--border-default)',
                    background: form.type === type ? 'var(--color-info-bg)' : 'transparent',
                    color: form.type === type ? 'var(--color-info-text)' : 'var(--text-secondary)',
                    fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  {TYPE_ICONS[type]} {t(`entry.${type}` as any)}
                </button>
              ))}
            </div>
          )}

          {/* Title */}
          <input
            autoFocus
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') mode === 'edit' ? handleSaveEdit() : handleSaveCreate()
            }}
            placeholder={t('entry.name')}
            style={{
              width: '100%', fontSize: 16, fontWeight: 500,
              border: 'none', borderBottom: '2px solid var(--border-default)',
              outline: 'none', background: 'transparent',
              color: 'var(--text-primary)', paddingBottom: 8, boxSizing: 'border-box',
            }}
            onFocus={e => (e.currentTarget.style.borderBottomColor = 'var(--oe-primary)')}
            onBlur={e => (e.currentTarget.style.borderBottomColor = 'var(--border-default)')}
          />

          {/* Executor / Validador */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <FieldLabel>{t('entry.executor')}</FieldLabel>
              <OwnersField
                owners={form.owners.filter((o) => o.kind === 'executor')}
                onChange={(next) => set('owners', [...form.owners.filter((o) => o.kind !== 'executor'), ...next])}
                teamMembers={selectedTeam}
                max={1}
                kind="executor"
              />
            </div>
            <div>
              <FieldLabel>{t('entry.validator')}</FieldLabel>
              <OwnersField
                owners={form.owners.filter((o) => o.kind === 'validator')}
                onChange={(next) => set('owners', [...form.owners.filter((o) => o.kind !== 'validator'), ...next])}
                teamMembers={selectedTeam}
                max={1}
                kind="validator"
              />
            </div>
          </div>

          {/* Date fields — task */}
          {form.type === 'task' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <FieldBox label={t('entry.plannedStart')}>
                <input
                  type="date"
                  value={form.plannedStart}
                  onChange={e => set('plannedStart', e.target.value)}
                  style={inputStyle}
                />
              </FieldBox>
              <FieldBox label={t('entry.plannedEnd')}>
                <input
                  type="date"
                  value={form.plannedEnd}
                  onChange={e => { set('plannedEnd', e.target.value); setEndDateError('') }}
                  style={{ ...inputStyle, ...(endDateError ? { borderColor: 'var(--color-danger-text)' } : {}) }}
                />
                {endDateError && <p style={{ fontSize: 11, color: 'var(--color-danger-text)', marginTop: 3 }}>{endDateError}</p>}
              </FieldBox>
              <FieldBox label={t('entry.duration')}>
                <input
                  type="number"
                  min={1}
                  value={form.durationDays}
                  onChange={e => set('durationDays', Number(e.target.value))}
                  style={inputStyle}
                />
              </FieldBox>
            </div>
          )}

          {/* Date fields — milestone / meeting */}
          {form.type !== 'task' && (
            <div style={{ display: 'grid', gridTemplateColumns: form.type === 'meeting' ? '1fr 1fr' : '1fr', gap: 12 }}>
              <FieldBox label={t('entry.plannedDate')}>
                <input
                  type="date"
                  value={form.plannedDate}
                  onChange={e => set('plannedDate', e.target.value)}
                  style={inputStyle}
                />
              </FieldBox>
              {form.type === 'meeting' && (
                <FieldBox label={t('entry.durationHours')}>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={form.durationHours}
                    onChange={e => set('durationHours', Number(e.target.value))}
                    style={inputStyle}
                  />
                </FieldBox>
              )}
            </div>
          )}

          {/* Linked parent task (meeting) */}
          {form.type === 'meeting' && (
            <FieldBox label={t('plan.linkedTask')}>
              <select
                value={form.linkedParentId}
                onChange={e => set('linkedParentId', e.target.value)}
                disabled={!!defaultParentEntryId}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">— {t('plan.linkedTaskNone')} —</option>
                {availableParentTasks.map(task => (
                  <option key={task.id} value={task.id}>{task.name}</option>
                ))}
              </select>
              {parentEndWarning && (
                <p style={{ fontSize: 11, color: 'var(--color-warning-text)', marginTop: 3 }}>
                  ⚠ {t('plan.childMeetingOutOfRange')}
                </p>
              )}
            </FieldBox>
          )}

          {/* Subtask of (create, task, no preset parent) */}
          {mode === 'create' && form.type === 'task' && !defaultParentId && availableParentTasks.length > 0 && (
            <FieldBox label={t('entry.subtaskOf')}>
              <select
                value={form.subtaskOf}
                onChange={e => set('subtaskOf', e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">— {t('plan.linkedTaskNone')} —</option>
                {availableParentTasks.map(task => (
                  <option key={task.id} value={task.id}>{task.name}</option>
                ))}
              </select>
            </FieldBox>
          )}

          {/* Dependencies (collapsible) */}
          {availableDeps.length > 0 && (
            <div>
              <button
                onClick={() => setDepsOpen(v => !v)}
                style={{
                  fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em',
                  color: 'var(--text-tertiary)', cursor: 'pointer', background: 'none', border: 'none',
                  padding: 0, display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                {depsOpen ? '▾' : '▸'} {t('plan.dependencies')}
                {form.dependsOn.length > 0 && (
                  <span style={{ fontSize: 10, background: 'var(--oe-primary-light)', color: 'var(--oe-primary)', borderRadius: 'var(--radius-pill)', padding: '1px 6px' }}>
                    {form.dependsOn.length}
                  </span>
                )}
              </button>
              {depsOpen && (
                <div style={{ marginTop: 8, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', maxHeight: 160, overflowY: 'auto' }}>
                  {availableDeps.map(dep => (
                    <label
                      key={dep.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-subtle)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
                    >
                      <input
                        type="checkbox"
                        checked={form.dependsOn.includes(dep.id)}
                        onChange={() => toggleDep(dep.id)}
                      />
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>{dep.phaseName}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{dep.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={{
          flex: 1, padding: 20, overflowY: 'auto',
          background: 'var(--surface-subtle)',
          borderLeft: '1px solid var(--border-default)',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>

          {/* Project */}
          <FieldBox label={t('entry.project' as any)}>
            <select
              value={form.projectId}
              onChange={e => handleProjectChange(e.target.value)}
              disabled={lockProject && mode === 'create'}
              style={{ ...inputStyle, cursor: lockProject && mode === 'create' ? 'default' : 'pointer' }}
            >
              {projects.filter(p => !p.archived).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {projectChanged && (
              <p style={{ fontSize: 11, color: 'var(--color-warning-text)', marginTop: 4 }}>
                ⚠ {t('entry.moveWarning')}
              </p>
            )}
          </FieldBox>

          {/* Phase */}
          {!isSubtask && (
            <FieldBox label={t('plan.phase')}>
              <select
                value={form.phaseId}
                onChange={e => set('phaseId', e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {selectedPhases.map(ph => (
                  <option key={ph.id} value={ph.id}>{ph.name}</option>
                ))}
              </select>
              {phaseChanged && (
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  ↳ {t('entry.moveToPhase', { phase: selectedPhases.find(p => p.id === form.phaseId)?.name ?? '' })}
                </p>
              )}
            </FieldBox>
          )}

          {/* Status */}
          <FieldBox label={t('entry.status')}>
            <select
              value={form.status}
              onChange={e => set('status', e.target.value as EntryStatus)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="pending">{t('entry.pending')}</option>
              <option value="in_progress">{t('entry.in_progress')}</option>
              <option value="done">{t('entry.done')}</option>
              <option value="blocked">{t('entry.blocked')}</option>
            </select>
          </FieldBox>

          {/* Risk flag */}
          <FieldBox label={t('entry.riskFlag')}>
            <select
              value={form.riskFlag}
              onChange={e => set('riskFlag', e.target.value as RiskFlag)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="none">{t('entry.none')}</option>
              <option value="warning">{t('entry.warning')}</option>
              <option value="critical">{t('entry.critical')}</option>
            </select>
          </FieldBox>

          {/* Show in plan toggle — always visible */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!form.hiddenFromPlan}
              onChange={handleToggleHiddenFromPlan}
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <div>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
                {t('entry.showInPlan')}
              </span>
              {form.hiddenFromPlan && (
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {t('entry.hiddenFromPlanHint')}
                </p>
              )}
            </div>
          </label>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--border-default)' }} />

          {/* Links */}
          <div>
            <FieldLabel>Links</FieldLabel>
            {form.links.length > 0 && (
              <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {form.links.map(l => (
                  <div
                    key={l.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    onMouseEnter={e => { (e.currentTarget.querySelector('.rm-link') as HTMLElement | null)?.style.setProperty('opacity', '1') }}
                    onMouseLeave={e => { (e.currentTarget.querySelector('.rm-link') as HTMLElement | null)?.style.setProperty('opacity', '0') }}
                  >
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ flex: 1, fontSize: 12, color: 'var(--oe-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {l.label}
                    </a>
                    <button
                      className="rm-link"
                      onClick={() => removeLink(l.id)}
                      style={{ fontSize: 14, color: 'var(--text-disabled)', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-danger-text)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-disabled)')}
                    >×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                value={newLinkLabel}
                onChange={e => setNewLinkLabel(e.target.value)}
                placeholder="Label (opcional)"
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={newLinkUrl}
                  onChange={e => setNewLinkUrl(e.target.value)}
                  placeholder="URL *"
                  style={{ ...inputStyle, flex: 1 }}
                  onKeyDown={e => e.key === 'Enter' && addLink()}
                />
                <button
                  onClick={addLink}
                  disabled={!newLinkUrl.trim()}
                  style={{
                    fontSize: 12, background: 'var(--oe-primary)', color: 'white',
                    borderRadius: 'var(--radius-md)', padding: '5px 10px',
                    border: 'none', cursor: 'pointer', opacity: newLinkUrl.trim() ? 1 : 0.4,
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >
                  {t('actions.add')}
                </button>
              </div>
            </div>
          </div>

          {/* Comments (edit mode) */}
          {mode === 'edit' && entry && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <FieldLabel>{t('entry.comments')}</FieldLabel>
              {entry.comments.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-disabled)', marginBottom: 8 }}>
                  {t('entry.noComments')}
                </p>
              ) : (
                <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 180, overflowY: 'auto' }}>
                  {entry.comments.map(c => (
                    <div
                      key={c.id}
                      style={{ display: 'flex', gap: 8 }}
                      onMouseEnter={e => { (e.currentTarget.querySelector('.rm-comment') as HTMLElement | null)?.style.setProperty('opacity', '1') }}
                      onMouseLeave={e => { (e.currentTarget.querySelector('.rm-comment') as HTMLElement | null)?.style.setProperty('opacity', '0') }}
                    >
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--oe-primary)', color: 'white', fontSize: 9, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        {avatarInitials(c.author)}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>{c.author}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                            {new Date(c.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text-primary)', marginTop: 2, lineHeight: 1.4 }}>{c.text}</p>
                      </div>
                      <button
                        className="rm-comment"
                        onClick={() => removeComment(origProjectId, entry.id, c.id)}
                        style={{ fontSize: 14, color: 'var(--text-disabled)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, opacity: 0, transition: 'opacity 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-danger-text)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-disabled)')}
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                <textarea
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment() }
                  }}
                  rows={2}
                  placeholder={t('entry.commentPlaceholder')}
                  style={{
                    flex: 1, fontSize: 12,
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)', padding: '6px 8px',
                    color: 'var(--text-primary)', background: 'var(--surface-input)',
                    resize: 'none', outline: 'none',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--oe-primary)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-default)')}
                />
                <button
                  onClick={handleAddComment}
                  disabled={!commentText.trim()}
                  style={{
                    fontSize: 12, background: 'var(--oe-primary)', color: 'white',
                    borderRadius: 'var(--radius-md)', padding: '5px 10px',
                    border: 'none', cursor: 'pointer', alignSelf: 'flex-end',
                    opacity: commentText.trim() ? 1 : 0.4,
                  }}
                >
                  {t('actions.add')}
                </button>
              </div>
            </div>
          )}

          {/* Created / Updated metadata */}
          {mode === 'edit' && entry && (entry.createdAt || entry.updatedAt) && (
            <div style={{ paddingTop: 10, borderTop: '1px solid var(--border-default)', marginTop: 'auto' }}>
              {entry.createdAt && (
                <p style={{ fontSize: 11, color: 'var(--text-disabled)' }}>
                  Criado em {new Date(entry.createdAt).toLocaleDateString()}
                </p>
              )}
              {entry.updatedAt && (
                <p style={{ fontSize: 11, color: 'var(--text-disabled)', marginTop: 2 }}>
                  Atualizado em {new Date(entry.updatedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
