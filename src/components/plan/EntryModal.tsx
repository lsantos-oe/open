import { useState, useMemo, useEffect, CSSProperties, ReactNode } from 'react'
import { TrashButton } from '@/components/ui/TrashButton'
import { Select, Input, Field } from '@/components/ui/Input'
import { EntityCodeLink } from '@/components/ui/CodeBadge'
import RichTextInput from '@/components/editor/RichTextInput'
import EntryComments from './EntryComments'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'
import { useToastStore } from '@/stores/useToastStore'
import { Entry, EntryOwner, EntryType, EntryStatus, RiskFlag, Link, TeamMember } from '@/types'
import { contactsForClients, contactsForClient } from '@/utils/contacts'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { entryClientIds } from '@/utils/entryClients'
import { CopyLinkButton } from '@/components/ui/CopyLinkButton'
import { EntityAttachments } from '@/components/ui/EntityAttachments'
import { CheckCircleIcon, FlagIcon, CalendarIcon, ExternalLinkIcon } from '@/components/ui/icons'
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
  /** Status inicial de uma tarefa nova (ex.: o "+" de uma coluna do Kanban). */
  defaultStatus?: EntryStatus
  lockProject?: boolean
  /** Lets the Project field be cleared to "Nenhum", turning this into a
   *  standalone task. Off by default so PlanPage/KanbanPage — which always
   *  edit within one project's plan — can't accidentally drop a task out of
   *  it; TasksPage's global list opts in. */
  allowStandalone?: boolean
  onClose: () => void
  onRequestDateChange?: (
    entry: Entry,
    field: 'plannedStart' | 'plannedEnd' | 'plannedDate',
    value: string,
  ) => void
}

type Form = {
  name: string
  description: string
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
  isDocumentation: boolean
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<EntryType, ReactNode> = {
  task: <CheckCircleIcon className="w-4 h-4" />,
  milestone: <FlagIcon className="w-4 h-4" />,
  meeting: <CalendarIcon className="w-4 h-4" />,
}


function emptyForm(
  type: EntryType,
  projectId: string,
  phaseId: string,
  parentEntryId?: string,
  parentId?: string,
  status: EntryStatus = 'pending',
): Form {
  return {
    name: '',
    description: '',
    type,
    projectId,
    phaseId,
    owners: [],
    status,
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
    isDocumentation: false,
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
    description: entry.description ?? '',
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
    isDocumentation: entry.isDocumentation ?? false,
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
    <p style={{ fontSize: 11.5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-tertiary)', marginBottom: 5 }}>
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
  defaultStatus,
  lockProject,
  allowStandalone,
  onClose, onRequestDateChange,
}: EntryModalProps) {
  const { t } = useTranslation()
  const {
    projects, clients, contacts, teamDirectory,
    addEntry, addUnassignedEntry, addSubtask, updateEntry, deleteEntry, moveEntryToPhase, moveEntryToUnassignedPhase,
    addStandaloneTask, updateStandaloneTask, deleteStandaloneTask, changeStandaloneTaskDate,
  } = useAppStore()
  const { addToast } = useToastStore()
  const navigate = useNavigate()

  // ── derive original project/phase ids (stable across re-renders) ──────────

  const origProjectId = useMemo(() => {
    if (entryProjectId) return entryProjectId
    // No project is a real, resolvable state (a standalone task) — it's not a
    // "couldn't figure it out" fallback, so this never defaults to projects[0].
    if (!entry) return defaultProjectId ?? ''
    for (const p of projects) {
      for (const ph of p.phases) {
        if (ph.entries.some((e) => e.id === entry.id)) return p.id
      }
    }
    return defaultProjectId ?? ''
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

  const origClientIds = useMemo((): string[] => {
    if (origProjectId) return projects.find((p) => p.id === origProjectId)?.clientIds ?? []
    // Standalone task: there's no project to derive clients from, so its
    // own clientIds ARE the value.
    return entry ? entryClientIds(entry) : []
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, origProjectId])

  // ── form state ────────────────────────────────────────────────────────────

  const makeForm = (): Form => {
    if (mode === 'edit' && entry) {
      return entryToForm(entry, origProjectId, origPhaseId)
    }
    const projId = defaultProjectId ?? ''
    const proj = projects.find((p) => p.id === projId)
    const phId = defaultPhaseId ?? proj?.phases[0]?.id ?? ''
    return emptyForm(defaultType, projId, phId, defaultParentEntryId, defaultParentId, defaultStatus)
  }

  const [form, setForm] = useState<Form>(makeForm)
  const [clientFilter, setClientFilter] = useState<string[]>(origClientIds)
  const [endDateError, setEndDateError] = useState('')
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm'>('idle')
  const [newLinkLabel, setNewLinkLabel] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [depsOpen, setDepsOpen] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [showDesc, setShowDesc] = useState(false)
  // O editor da descrição só lê o texto inicial ao montar: cada reinício do formulário o remonta (key).
  const [descEpoch, setDescEpoch] = useState(0)

  useEffect(() => {
    if (!open) return
    setDescEpoch((e) => e + 1)
    setEndDateError('')
    setDeleteStep('idle')
    setNewLinkLabel('')
    setNewLinkUrl('')
    setDepsOpen(false)
    setClientFilter(origClientIds)
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
  const visiblePhases = useMemo(() => selectedPhases.filter((ph) => !ph.isUnassigned), [selectedPhases])
  const visibleProjects = useMemo(
    () => projects.filter((p) => !p.archived && (clientFilter.length === 0 || p.clientIds.some((id) => clientFilter.includes(id)))),
    [projects, clientFilter],
  )
  // OwnersField expects TeamMember[] — map the global registered-user directory
  // into that shape (userId = profile.id), same as IncidentEntryModal, so any
  // registered user can be picked as executor/validator, not just people
  // explicitly added to this project's own "Equipe" roster.
  const selectedTeam: TeamMember[] = useMemo(
    () => teamDirectory.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name ?? p.email ?? '', role: '', email: p.email ?? undefined, userId: p.id })),
    [teamDirectory],
  )
  const selectedContacts = useMemo(() => {
    if (selectedProject?.clientIds.length) return contactsForClients(contacts, selectedProject.clientIds)
    if (!form.projectId && clientFilter.length > 0) return contactsForClients(contacts, clientFilter)
    return []
  }, [contacts, selectedProject?.clientIds, form.projectId, clientFilter])

  const origProject = useMemo(
    () => projects.find((p) => p.id === origProjectId),
    [projects, origProjectId],
  )

  const isSubtask = mode === 'create' && !!defaultParentId
  const projectChanged = mode === 'edit' && form.projectId !== origProjectId
  const phaseChanged = mode === 'edit' && !projectChanged && form.phaseId !== origPhaseId

  // ── handlers ──────────────────────────────────────────────────────────────

  function handleProjectChange(newProjectId: string) {
    if (!newProjectId) {
      // Standalone: no phases, no milestone/meeting concept, no plan visibility toggle.
      setForm((f) => ({ ...f, projectId: '', phaseId: '', dependsOn: [], type: 'task', hiddenFromPlan: false }))
      return
    }
    const newProj = projects.find((p) => p.id === newProjectId)
    const newPhaseId = form.hiddenFromPlan ? '' : newProj?.phases.find((ph) => !ph.isUnassigned)?.id ?? ''
    setForm((f) => ({ ...f, projectId: newProjectId, phaseId: newPhaseId, dependsOn: [] }))
  }

  function handleClientFilterChange(newClientIds: string[]) {
    setClientFilter(newClientIds)
    // Standalone: this field IS the task's own clients, not a project-list filter.
    if (!form.projectId) return
    const matches = (p: { clientIds: string[] }) => newClientIds.length === 0 || p.clientIds.some((id) => newClientIds.includes(id))
    const current = projects.find((p) => p.id === form.projectId)
    if (!current || !matches(current)) {
      const candidates = projects.filter((p) => !p.archived && matches(p))
      handleProjectChange(candidates[0]?.id ?? '')
    }
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

  function handleToggleHiddenFromPlan() {
    const next = !form.hiddenFromPlan
    setForm((f) => ({
      ...f,
      hiddenFromPlan: next,
      // Turning on: default to no phase (as requested, "pré-definido não ter
      // fase vinculada"). Turning off: fall back to the first real phase if
      // it was left empty, since a visible task always needs a phase.
      phaseId: next ? '' : (f.phaseId || visiblePhases[0]?.id || ''),
    }))
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
      description: form.description.trim() || undefined,
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
      isDocumentation: (form.type === 'task' && form.isDocumentation) || undefined,
    }
  }

  // A standalone task (no project, no incident) has none of the plan-specific
  // concepts — phases, milestone/meeting type, dependencies — so it gets its
  // own smaller base.
  function buildStandaloneEntryBase() {
    return {
      type: 'task' as const,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      clientIds: clientFilter,
      ...buildOwnerPatch(),
      status: form.status,
      riskFlag: form.riskFlag,
      dependsOn: [],
      order: 0,
      plannedStart: form.plannedStart || undefined,
      plannedEnd: form.plannedEnd || undefined,
      durationDays: form.durationDays,
      links: form.links,
    }
  }

  // ── save / delete ─────────────────────────────────────────────────────────

  const phaseRequired = !!form.projectId && !form.hiddenFromPlan
  const canSave = !!form.name.trim() && (!phaseRequired || !!form.phaseId) && form.owners.some((o) => o.kind === 'executor')

  function handleSaveCreate() {
    if (!canSave) return
    if (form.plannedStart && form.plannedEnd && form.plannedEnd < form.plannedStart) {
      setEndDateError(t('errors.endBeforeStart'))
      return
    }
    setEndDateError('')

    if (!form.projectId) {
      addStandaloneTask(buildStandaloneEntryBase())
      onClose()
      return
    }

    const base = buildEntryBase()
    const parentId = defaultParentId || form.subtaskOf || ''
    if (parentId) {
      // Subtasks always live inside their parent's phase — "no phase" doesn't
      // apply here even if hiddenFromPlan is set; fall back to a real phase.
      const phaseForSubtask = form.phaseId || visiblePhases[0]?.id || selectedPhases[0]?.id || ''
      addSubtask(form.projectId, phaseForSubtask, parentId, base)
    } else if (form.phaseId) {
      addEntry(form.projectId, form.phaseId, base)
    } else {
      addUnassignedEntry(form.projectId, base)
    }
    onClose()
  }

  function handleSaveEdit() {
    if (!entry || !canSave) return
    if (form.plannedStart && form.plannedEnd && form.plannedEnd < form.plannedStart) {
      setEndDateError(t('errors.endBeforeStart'))
      return
    }
    setEndDateError('')

    const wasStandalone = !origProjectId
    const isStandalone = !form.projectId

    if (wasStandalone && isStandalone) {
      // Still standalone: dates go through changeStandaloneTaskDate so the
      // critical-path recompute stays consistent.
      const executor = form.owners.find((o) => o.kind === 'executor')
      updateStandaloneTask(entry.id, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        clientIds: clientFilter,
        owners: form.owners,
        responsible: executor?.name ?? '',
        status: form.status,
        riskFlag: form.riskFlag,
        durationDays: form.durationDays,
        links: form.links,
      })
      if (form.plannedStart && form.plannedStart !== (entry.plannedStart ?? '')) changeStandaloneTaskDate(entry.id, 'plannedStart', form.plannedStart)
      if (form.plannedEnd && form.plannedEnd !== (entry.plannedEnd ?? '')) changeStandaloneTaskDate(entry.id, 'plannedEnd', form.plannedEnd)
    } else if (wasStandalone && !isStandalone) {
      // Moved from standalone into a project.
      deleteStandaloneTask(entry.id)
      if (form.phaseId) addEntry(form.projectId, form.phaseId, buildEntryBase())
      else addUnassignedEntry(form.projectId, buildEntryBase())
    } else if (!wasStandalone && isStandalone) {
      // Moved out of its project into standalone.
      deleteEntry(origProjectId, origPhaseId, entry.id)
      addStandaloneTask(buildStandaloneEntryBase())
    } else if (projectChanged) {
      deleteEntry(origProjectId, origPhaseId, entry.id)
      if (form.phaseId) addEntry(form.projectId, form.phaseId, buildEntryBase())
      else addUnassignedEntry(form.projectId, buildEntryBase())
    } else {
      if (phaseChanged) {
        if (form.phaseId) moveEntryToPhase(origProjectId, origPhaseId, form.phaseId, entry.id)
        else moveEntryToUnassignedPhase(origProjectId, origPhaseId, entry.id)
      }
      updateEntry(origProjectId, entry.id, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        ...buildOwnerPatch(),
        status: form.status,
        riskFlag: form.riskFlag,
        dependsOn: form.dependsOn,
        parentEntryId: form.type === 'meeting' && form.linkedParentId ? form.linkedParentId : undefined,
        durationDays: form.type === 'task' ? form.durationDays : undefined,
        durationHours: form.type === 'meeting' ? form.durationHours : undefined,
        links: form.links,
        hiddenFromPlan: form.hiddenFromPlan || undefined,
        isDocumentation: (form.type === 'task' && form.isDocumentation) || undefined,
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
    if (!origProjectId) deleteStandaloneTask(entry.id)
    else deleteEntry(origProjectId, origPhaseId, entry.id)
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

  // Comentários só existem para tarefas já salvas e que são linhas próprias (as subtarefas ficam dentro da tarefa-mãe).
  const showComments = mode === 'edit' && !!entry && (origProjectId
    ? !!origProject?.phases.some((ph) => ph.entries.some((e) => e.id === entry.id))
    : true)

  const isEdit = mode === 'edit'

  // ── rodapé: excluir à esquerda (só ao editar), cancelar e salvar à direita ──────────────────────

  const footer = (
    <div className="flex items-center w-full gap-2">
      {isEdit && (
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {deleteStep === 'idle' ? (
            <TrashButton label={t('entry.deleteEntry')} onClick={() => setDeleteStep('confirm')} />
          ) : (
            <>
              {dependentCount > 0 && (
                <span className="text-xs" style={{ color: 'var(--color-warning-text)' }}>⚠ {t('entry.hasDependents', { count: dependentCount })}</span>
              )}
              <Button variant="danger" size="sm" onClick={handleDelete}>{t('entry.confirmDelete')}</Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleteStep('idle')}>{t('actions.cancel')}</Button>
            </>
          )}
        </div>
      )}
      {!isEdit && <div className="flex-1" />}
      <Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button>
      <Button onClick={isEdit ? handleSaveEdit : handleSaveCreate} disabled={!canSave}>
        {isEdit ? t('entry.saveChanges') : t('actions.create')}
      </Button>
    </div>
  )

  // ── blocos compartilhados (criar e editar usam os mesmos campos, no mesmo estilo) ────────────────

  const goTo = (path: string) => { onClose(); navigate(path) }
  const canPickType = mode === 'create' && !isSubtask && !defaultParentEntryId && !!form.projectId
  const noProject = !form.projectId
  const projectClients = (selectedProject?.clientIds ?? []).map((id) => clients.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c)
  const contactClientIds = selectedProject?.clientIds.length ? selectedProject.clientIds : noProject ? clientFilter : undefined

  const pill = (on: boolean): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 14px', borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none',
    background: on ? 'var(--text-primary)' : 'var(--surface-subtle)', color: on ? 'var(--surface-page)' : 'var(--text-secondary)',
  })

  /** Botão redondo "ir para" ao lado do seletor. */
  const GoBtn = ({ label, path }: { label: string; path: string }) => (
    <button
      type="button" onClick={() => goTo(path)} title={label} aria-label={label}
      className="shrink-0 flex items-center justify-center h-9 w-9 rounded-full transition-colors hover:opacity-80"
      style={{ background: 'var(--surface-subtle)', color: 'var(--text-secondary)' }}
    >
      <ExternalLinkIcon className="w-3.5 h-3.5" />
    </button>
  )

  const typePills = canPickType && (
    <div className="flex gap-1.5" role="radiogroup" aria-label="Tipo">
      {(['task', 'milestone', 'meeting'] as EntryType[]).map((type) => (
        <button key={type} role="radio" aria-checked={form.type === type} onClick={() => set('type', type)} style={pill(form.type === type)}>
          {TYPE_ICONS[type]} {t(`entry.${type}` as any)}
        </button>
      ))}
    </div>
  )

  const nameInput = (
    <input
      autoFocus={!isEdit}
      value={form.name}
      onChange={(e) => set('name', e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') (isEdit ? handleSaveEdit() : handleSaveCreate()) }}
      placeholder={t('entry.name')}
      aria-label={t('entry.name')}
      style={{ width: '100%', fontSize: 18, fontWeight: 600, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', padding: '4px 0' }}
    />
  )

  const whereFields = (
    <div className="grid grid-cols-2 gap-3">
      <Field label={t('entry.project' as any)}>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <SearchableSelect
              value={form.projectId}
              onChange={handleProjectChange}
              options={[
                ...(allowStandalone ? [{ id: '', label: t('entry.noProject' as any) }] : []),
                ...visibleProjects.map((p) => ({ id: p.id, label: p.name, sublabel: p.client || undefined })),
              ]}
              disabled={lockProject && !isEdit}
            />
          </div>
          {!!form.projectId && <GoBtn label={t('entry.viewProject')} path={`/projects/${form.projectId}`} />}
        </div>
        {projectChanged && <p className="text-xs mt-1" style={{ color: 'var(--color-warning-text)' }}>⚠ {t('entry.moveWarning')}</p>}
      </Field>
      <Field label={t('entry.client' as any)}>
        {noProject ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <MultiSelect
                values={clientFilter}
                onChange={handleClientFilterChange}
                options={clients.map((c) => ({ id: c.id, label: c.name }))}
                placeholder={`— ${t('entry.allClients' as any)} —`}
                disabled={lockProject && !isEdit}
              />
            </div>
            {clientFilter.length === 1 && <GoBtn label={t('entry.viewClient')} path={`/wallet/${clientFilter[0]}`} />}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 min-h-9">
            {projectClients.length === 0 && <span className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>—</span>}
            {projectClients.map((c) => (
              <button
                key={c.id} type="button" onClick={() => goTo(`/wallet/${c.id}`)} title={`${t('entry.viewClient')}: ${c.name}`}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] transition-colors hover:opacity-80 max-w-full"
                style={{ background: 'var(--surface-subtle)', color: 'var(--text-primary)' }}
              >
                <span className="truncate">{c.name}</span>
                <ExternalLinkIcon className="w-3 h-3 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </Field>
    </div>
  )

  const peopleFields = (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Responsável">
        <OwnersField
          owners={form.owners.filter((o) => o.kind === 'executor')}
          onChange={(next) => set('owners', [...next, ...form.owners.filter((o) => o.kind !== 'executor')])}
          teamMembers={selectedTeam}
          contacts={selectedContacts}
          newContactClientIds={contactClientIds}
          kind="executor"
        />
      </Field>
      <Field label={t('entry.validator')}>
        <OwnersField
          owners={form.owners.filter((o) => o.kind === 'validator')}
          onChange={(next) => set('owners', [...form.owners.filter((o) => o.kind !== 'validator'), ...next])}
          teamMembers={selectedTeam}
          contacts={selectedContacts}
          newContactClientIds={contactClientIds}
          max={1}
          kind="validator"
        />
      </Field>
    </div>
  )

  const statusDateFields = (
    <div className="grid grid-cols-2 gap-3">
      <Field label={t('entry.status')}>
        <Select value={form.status} onChange={(e) => set('status', e.target.value as EntryStatus)}>
          <option value="pending">{t('entry.pending')}</option>
          <option value="todo">{t('entry.todo')}</option>
          <option value="in_progress">{t('entry.in_progress')}</option>
          <option value="validation">{t('entry.validation')}</option>
          <option value="done">{t('entry.done')}</option>
          <option value="blocked">{t('entry.blocked')}</option>
        </Select>
      </Field>
      <Field label={form.type === 'task' ? 'Prazo' : 'Data'}>
        {form.type === 'task' ? (
          <>
            <Input type="date" value={form.plannedEnd} onChange={(e) => { set('plannedEnd', e.target.value); setEndDateError('') }} />
            {endDateError && <p className="text-xs mt-1" style={{ color: 'var(--color-danger-text)' }}>{endDateError}</p>}
          </>
        ) : (
          <Input type="date" value={form.plannedDate} onChange={(e) => set('plannedDate', e.target.value)} />
        )}
      </Field>
    </div>
  )

  const descriptionEditor = (
    <RichTextInput key={descEpoch} initialMarkdown={form.description} onChange={(md) => set('description', md)} uploadScope={entry ? `entry_${entry.id}` : 'entry_new'} minHeight={90} />
  )
  const descriptionField = <Field label={t('entry.description')}>{descriptionEditor}</Field>

  // Planejamento: início, duração, fase, risco, subtarefa, tarefa vinculada
  const planningFields = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {form.type === 'task' && (
          <>
            <Field label={t('entry.plannedStart')}><Input type="date" value={form.plannedStart} onChange={(e) => set('plannedStart', e.target.value)} /></Field>
            <Field label={t('entry.duration')}><Input type="number" min={1} value={form.durationDays} onChange={(e) => set('durationDays', Number(e.target.value))} /></Field>
          </>
        )}
        {form.type === 'meeting' && (
          <>
            <Field label={t('entry.durationHours')}><Input type="number" min={0.5} step={0.5} value={form.durationHours} onChange={(e) => set('durationHours', Number(e.target.value))} /></Field>
            <Field label={t('plan.linkedTask')}>
              <Select value={form.linkedParentId} onChange={(e) => set('linkedParentId', e.target.value)} disabled={!!defaultParentEntryId}>
                <option value="">— {t('plan.linkedTaskNone')} —</option>
                {availableParentTasks.map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}
              </Select>
            </Field>
          </>
        )}
        {!!form.projectId && !isSubtask && (
          <Field label={t('plan.phase')}>
            <Select value={selectedProject?.phases.find((ph) => ph.id === form.phaseId)?.isUnassigned ? '' : form.phaseId} onChange={(e) => set('phaseId', e.target.value)}>
              {form.hiddenFromPlan && <option value="">— {t('entry.noPhase' as any)} —</option>}
              {visiblePhases.map((ph) => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
            </Select>
            {phaseChanged && <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>↳ {t('entry.moveToPhase', { phase: visiblePhases.find((p) => p.id === form.phaseId)?.name ?? t('entry.noPhase' as any) })}</p>}
          </Field>
        )}
        <Field label={t('entry.riskFlag')}>
          <Select value={form.riskFlag} onChange={(e) => set('riskFlag', e.target.value as RiskFlag)}>
            <option value="none">{t('entry.none')}</option>
            <option value="warning">{t('entry.warning')}</option>
            <option value="critical">{t('entry.critical')}</option>
          </Select>
        </Field>
        {mode === 'create' && form.type === 'task' && !defaultParentId && availableParentTasks.length > 0 && (
          <Field label={t('entry.subtaskOf')}>
            <Select value={form.subtaskOf} onChange={(e) => set('subtaskOf', e.target.value)}>
              <option value="">— {t('plan.linkedTaskNone')} —</option>
              {availableParentTasks.map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}
            </Select>
          </Field>
        )}
      </div>
      {form.type === 'meeting' && parentEndWarning && <p className="text-xs" style={{ color: 'var(--color-warning-text)' }}>⚠ {t('plan.childMeetingOutOfRange')}</p>}
      {!!form.projectId && (
        <div className="space-y-2 pt-1">
          <label className="flex items-start gap-2 text-[13px] cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" className="mt-0.5 accent-[var(--text-primary)]" checked={!form.hiddenFromPlan} onChange={handleToggleHiddenFromPlan} />
            <span>{t('entry.showInPlan')}{form.hiddenFromPlan && <span className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('entry.hiddenFromPlanHint')}</span>}</span>
          </label>
          {form.type === 'task' && (
            <label className="flex items-start gap-2 text-[13px] cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" className="mt-0.5 accent-[var(--text-primary)]" checked={form.isDocumentation} onChange={(e) => set('isDocumentation', e.target.checked)} />
              <span>Tarefa de documentação<span className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>Os links e arquivos desta tarefa aparecem na aba Documentação do projeto e do cliente.</span></span>
            </label>
          )}
        </div>
      )}
    </div>
  )

  const dependenciesField = availableDeps.length > 0 && (
    <Field label={`${t('plan.dependencies')}${form.dependsOn.length ? ` (${form.dependsOn.length})` : ''}`}>
      <div style={{ maxHeight: 150, overflowY: 'auto', borderRadius: 'var(--radius-lg)', background: 'var(--surface-subtle)', padding: 4 }}>
        {availableDeps.map((dep) => (
          <label key={dep.id} className="flex items-center gap-2 px-2 py-1.5 text-[13px] cursor-pointer rounded-[var(--radius-md)] hover:bg-[var(--surface-card)]" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" className="accent-[var(--text-primary)]" checked={form.dependsOn.includes(dep.id)} onChange={() => toggleDep(dep.id)} />
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{dep.phaseName}</span>{dep.name}
          </label>
        ))}
      </div>
    </Field>
  )

  const linksField = (
    <Field label="Links">
      {form.links.length > 0 && (
        <div className="mb-2 space-y-1">
          {form.links.map((l) => (
            <div key={l.id} className="flex items-center gap-2 text-[13px]">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate hover:underline" style={{ color: 'var(--text-secondary)' }}>{l.label}</a>
              <button onClick={() => removeLink(l.id)} aria-label={`Remover ${l.label}`} className="text-base leading-none hover:opacity-70" style={{ color: 'var(--text-tertiary)' }}>×</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input value={newLinkLabel} onChange={(e) => setNewLinkLabel(e.target.value)} placeholder="Nome (opcional)" className="!w-2/5" />
        <Input value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} placeholder="Cole um link" onKeyDown={(e) => e.key === 'Enter' && addLink()} />
        <Button variant="secondary" size="sm" onClick={addLink} disabled={!newLinkUrl.trim()}>{t('actions.add')}</Button>
      </div>
    </Field>
  )

  const sectionTitle = (text: string) => (
    <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{text}</h3>
  )

  // ── CRIAR: formulário curto. Quem, onde, status e prazo à vista; o resto abre em "Mais opções". ──
  if (!isEdit) {
    return (
      <Modal open={open} title={title} onClose={onClose} size="md" footer={footer}>
        <div className="space-y-5">
          {typePills}
          {nameInput}
          {whereFields}
          {peopleFields}
          {statusDateFields}
          {showDesc || form.description ? descriptionField : (
            <button type="button" onClick={() => setShowDesc(true)} className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>+ {t('entry.description')}</button>
          )}
          <div>
            <button type="button" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore} className="flex items-center gap-1.5 text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>
              <span style={{ display: 'inline-block', transform: showMore ? 'rotate(90deg)' : undefined, transition: 'transform .12s' }}>›</span>
              Mais opções
            </button>
            {showMore && <div className="mt-3 space-y-4">{planningFields}{dependenciesField}{linksField}</div>}
          </div>
        </div>
      </Modal>
    )
  }

  // ── EDITAR: os mesmos campos, no mesmo estilo, com tudo à mostra ──
  return (
    <Modal open={open} title={title} onClose={onClose} size="lg" footer={footer} headerExtra={entry ? <EntityCodeLink table="entries" id={entry.id} /> : undefined}>
      <div className="space-y-6">
        <div className="space-y-5">
          {nameInput}
          {whereFields}
          {peopleFields}
          {statusDateFields}
        </div>

        <section className="space-y-3">{sectionTitle('Descrição')}{descriptionEditor}</section>

        <section className="space-y-3">{sectionTitle('Planejamento')}{planningFields}{dependenciesField}</section>

        <section className="space-y-3">{sectionTitle('Links e anexos')}{linksField}{entry && <EntityAttachments entityType="entry" entityId={entry.id} />}</section>

        {showComments && entry && (
          <section className="space-y-3">
            {sectionTitle('Conversa')}
            <EntryComments entryId={entry.id} scope={origProjectId ? { type: 'project', projectId: origProjectId } : { type: 'standalone' }} maxListHeight={240} />
          </section>
        )}

        {entry && (entry.createdAt || entry.updatedAt) && (
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {entry.createdAt && <>Criado em {new Date(entry.createdAt).toLocaleDateString()}</>}
            {entry.createdAt && entry.updatedAt && ' · '}
            {entry.updatedAt && <>atualizado em {new Date(entry.updatedAt).toLocaleDateString()}</>}
          </p>
        )}
      </div>
    </Modal>
  )
}
