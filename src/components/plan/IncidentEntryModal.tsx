import { useState, useEffect, useMemo, CSSProperties, ReactNode } from 'react'
import { TrashButton } from '@/components/ui/TrashButton'
import { Select, Input, Field } from '@/components/ui/Input'
import { EntityCodeLink } from '@/components/ui/CodeBadge'
import RichTextInput from '@/components/editor/RichTextInput'
import EntryComments from './EntryComments'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'
import { Entry, EntryOwner, EntryType, EntryStatus, RiskFlag, Link, TeamMember } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CopyLinkButton } from '@/components/ui/CopyLinkButton'
import { EntityAttachments } from '@/components/ui/EntityAttachments'
import { CheckCircleIcon, FlagIcon, CalendarIcon, ExternalLinkIcon } from '@/components/ui/icons'
import OwnersField from '@/components/plan/OwnersField'
import { contactsForClients } from '@/utils/contacts'

interface Props {
  open: boolean
  mode: 'create' | 'edit'
  incidentId: string
  entry?: Entry
  /** Status inicial de uma tarefa nova (ex.: duplo clique numa raia do Kanban). */
  defaultStatus?: EntryStatus
  onClose: () => void
}

type Form = {
  name: string
  description: string
  type: EntryType
  owners: EntryOwner[]
  status: EntryStatus
  riskFlag: RiskFlag
  plannedStart: string
  plannedEnd: string
  plannedDate: string
  durationDays: number
  durationHours: number
  dependsOn: string[]
  links: Link[]
}

const TYPE_ICONS: Record<EntryType, ReactNode> = {
  task: <CheckCircleIcon className="w-4 h-4" />,
  milestone: <FlagIcon className="w-4 h-4" />,
  meeting: <CalendarIcon className="w-4 h-4" />,
}

const inputStyle: CSSProperties = {
  width: '100%', fontSize: 13, border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)', padding: '5px 8px', color: 'var(--text-primary)',
  background: 'var(--surface-input)', outline: 'none', boxSizing: 'border-box',
}

function FieldLabel({ children }: { children: string }) {
  return (
    <p style={{ fontSize: 11.5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-tertiary)', marginBottom: 5 }}>
      {children}
    </p>
  )
}

function FieldBox({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><FieldLabel>{label}</FieldLabel>{children}</div>
}

function emptyForm(status: EntryStatus = 'pending'): Form {
  return {
    name: '', description: '', type: 'task', owners: [], status, riskFlag: 'none',
    plannedStart: '', plannedEnd: '', plannedDate: '', durationDays: 1, durationHours: 1,
    dependsOn: [], links: [],
  }
}

function entryToForm(entry: Entry): Form {
  let owners = entry.owners ?? []
  // Legacy rows saved before Executor/Validador existed have no `kind` — treat
  // the first owner as the executor so old entries still open with one set.
  if (owners.length > 0 && !owners.some((o) => o.kind)) {
    owners = owners.map((o, i) => (i === 0 ? { ...o, kind: 'executor' as const } : o))
  }
  return {
    name: entry.name,
    description: entry.description ?? '',
    type: entry.type,
    owners,
    status: entry.status,
    riskFlag: entry.riskFlag,
    plannedStart: entry.plannedStart ?? '',
    plannedEnd: entry.plannedEnd ?? '',
    plannedDate: entry.plannedDate ?? '',
    durationDays: entry.durationDays ?? 1,
    durationHours: entry.durationHours ?? 1,
    dependsOn: [...entry.dependsOn],
    links: entry.links.map((l) => ({ ...l })),
  }
}

export default function IncidentEntryModal({ open, mode, incidentId, entry, defaultStatus, onClose }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { incidents, projects, clients, teamDirectory, contacts, addIncidentEntry, updateIncidentEntry, deleteIncidentEntry, changeIncidentEntryDate } = useAppStore()
  const incident = incidents.find((i) => i.id === incidentId)

  // OwnersField expects TeamMember[] — map the global registered-user directory into that shape
  // (userId = profile.id) so picking a "member" owner always satisfies entries.responsible_member_id's FK.
  const directoryAsTeam: TeamMember[] = useMemo(
    () => teamDirectory.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name ?? p.email ?? '', role: '', email: p.email ?? undefined, userId: p.id })),
    [teamDirectory],
  )

  const incidentContacts = useMemo(
    () => incident ? contactsForClients(contacts, incident.clientIds) : [],
    [contacts, incident],
  )

  const [form, setForm] = useState<Form>(entry ? entryToForm(entry) : emptyForm(defaultStatus))
  const [endDateError, setEndDateError] = useState('')
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm'>('idle')
  const [newLinkLabel, setNewLinkLabel] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')

  // O editor da descrição só lê o texto inicial ao montar: cada reinício do formulário o remonta (key).
  const [descEpoch, setDescEpoch] = useState(0)

  useEffect(() => {
    if (!open) return
    setDescEpoch((e) => e + 1)
    setForm(entry ? entryToForm(entry) : emptyForm(defaultStatus))
    setEndDateError(''); setDeleteStep('idle'); setNewLinkLabel(''); setNewLinkUrl('')
  }, [open, entry])

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  const availableDeps = useMemo(() => {
    if (!incident) return []
    return incident.entries.filter((e) => e.id !== entry?.id).map((e) => ({ id: e.id, name: e.name }))
  }, [incident, entry])

  function toggleDep(id: string) {
    setForm((f) => ({ ...f, dependsOn: f.dependsOn.includes(id) ? f.dependsOn.filter((d) => d !== id) : [...f.dependsOn, id] }))
  }

  function addLink() {
    if (!newLinkUrl.trim()) return
    set('links', [...form.links, { id: crypto.randomUUID(), label: newLinkLabel.trim() || newLinkUrl.trim(), url: newLinkUrl.trim() }])
    setNewLinkLabel(''); setNewLinkUrl('')
  }

  function removeLink(id: string) {
    set('links', form.links.filter((l) => l.id !== id))
  }

  function buildEntryBase() {
    const executor = form.owners.find((o) => o.kind === 'executor')
    return {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      type: form.type,
      owners: form.owners,
      responsible: executor?.name ?? '',
      status: form.status,
      riskFlag: form.riskFlag,
      dependsOn: form.dependsOn,
      order: 0,
      plannedStart: form.type === 'task' ? form.plannedStart || undefined : undefined,
      plannedEnd: form.type === 'task' ? form.plannedEnd || undefined : undefined,
      plannedDate: form.type !== 'task' ? form.plannedDate || undefined : undefined,
      durationDays: form.type === 'task' ? form.durationDays : undefined,
      durationHours: form.type === 'meeting' ? form.durationHours : undefined,
      links: form.links,
    }
  }

  function handleSaveCreate() {
    if (!form.name.trim() || !form.owners.some((o) => o.kind === 'executor')) return
    if (form.type === 'task' && form.plannedStart && form.plannedEnd && form.plannedEnd < form.plannedStart) {
      setEndDateError(t('errors.endBeforeStart')); return
    }
    addIncidentEntry(incidentId, buildEntryBase())
    onClose()
  }

  function handleSaveEdit() {
    if (!entry || !form.name.trim() || !form.owners.some((o) => o.kind === 'executor')) return
    if (form.type === 'task' && form.plannedStart && form.plannedEnd && form.plannedEnd < form.plannedStart) {
      setEndDateError(t('errors.endBeforeStart')); return
    }
    const executor = form.owners.find((o) => o.kind === 'executor')
    updateIncidentEntry(incidentId, entry.id, {
      name: form.name.trim(), description: form.description.trim() || undefined, owners: form.owners, responsible: executor?.name ?? '',
      status: form.status, riskFlag: form.riskFlag, dependsOn: form.dependsOn,
      durationDays: form.type === 'task' ? form.durationDays : undefined,
      durationHours: form.type === 'meeting' ? form.durationHours : undefined,
      links: form.links,
    })
    if (form.type === 'task') {
      if (form.plannedStart && form.plannedStart !== (entry.plannedStart ?? '')) changeIncidentEntryDate(incidentId, entry.id, 'plannedStart', form.plannedStart)
      if (form.plannedEnd && form.plannedEnd !== (entry.plannedEnd ?? '')) changeIncidentEntryDate(incidentId, entry.id, 'plannedEnd', form.plannedEnd)
    } else if (form.plannedDate && form.plannedDate !== (entry.plannedDate ?? '')) {
      changeIncidentEntryDate(incidentId, entry.id, 'plannedDate', form.plannedDate)
    }
    onClose()
  }

  function handleDelete() {
    if (!entry) return
    deleteIncidentEntry(incidentId, entry.id)
    onClose()
  }

  const typeLabel = (type: EntryType) => (type.charAt(0).toUpperCase() + type.slice(1)) as 'Task' | 'Milestone' | 'Meeting'
  const title = mode === 'create' ? t(`entry.new${typeLabel(form.type)}` as any) : t(`entry.edit${typeLabel(entry?.type ?? 'task')}` as any)

  const isEdit = mode === 'edit'
  const canSave = !!form.name.trim() && form.owners.some((o) => o.kind === 'executor')
  const [showMore, setShowMore] = useState(false)
  const [showDesc, setShowDesc] = useState(false)

  const footer = (
    <div className="flex items-center w-full gap-2">
      {isEdit && (
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {deleteStep === 'idle' ? (
            <TrashButton label={t('entry.deleteEntry')} onClick={() => setDeleteStep('confirm')} />
          ) : (
            <>
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

  const goTo = (path: string) => { onClose(); navigate(path) }
  const incidentClients = (incident?.clientIds ?? []).map((id) => clients.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c)

  const pill = (on: boolean): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 14px', borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none',
    background: on ? 'var(--text-primary)' : 'var(--surface-subtle)', color: on ? 'var(--surface-page)' : 'var(--text-secondary)',
  })

  const linkChip = (key: string, label: string, path: string, hint: string) => (
    <button
      key={key} type="button" onClick={() => goTo(path)} title={hint}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] transition-colors hover:opacity-80 max-w-full"
      style={{ background: 'var(--surface-subtle)', color: 'var(--text-primary)' }}
    >
      <span className="truncate">{label}</span>
      <ExternalLinkIcon className="w-3 h-3 shrink-0" />
    </button>
  )

  const typePills = !isEdit && (
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
      <Field label={t('entry.incident' as any) === 'entry.incident' ? 'Incidente' : t('entry.incident' as any)}>
        <div className="flex flex-wrap items-center gap-1.5 min-h-9">
          {incident ? linkChip('inc', incident.title, `/support/${incidentId}`, t('entry.viewIncident')) : <span className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>—</span>}
        </div>
      </Field>
      <Field label={t('entry.client' as any)}>
        <div className="flex flex-wrap items-center gap-1.5 min-h-9">
          {incidentClients.length === 0 && <span className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>—</span>}
          {incidentClients.map((c) => linkChip(c.id, c.name, `/wallet/${c.id}`, `${t('entry.viewClient')}: ${c.name}`))}
        </div>
      </Field>
    </div>
  )

  const peopleFields = (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Responsável">
        <OwnersField
          owners={form.owners.filter((o) => o.kind === 'executor')}
          onChange={(next) => set('owners', [...next, ...form.owners.filter((o) => o.kind !== 'executor')])}
          teamMembers={directoryAsTeam}
          contacts={incidentContacts} newContactClientIds={incident?.clientIds}
          max={1}
          kind="executor"
        />
      </Field>
      <Field label={t('entry.validator')}>
        <OwnersField
          owners={form.owners.filter((o) => o.kind === 'validator')}
          onChange={(next) => set('owners', [...form.owners.filter((o) => o.kind !== 'validator'), ...next])}
          teamMembers={directoryAsTeam}
          contacts={incidentContacts} newContactClientIds={incident?.clientIds}
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

  const planningFields = (
    <div className="grid grid-cols-2 gap-3">
      {form.type === 'task' && (
        <>
          <Field label={t('entry.plannedStart')}><Input type="date" value={form.plannedStart} onChange={(e) => set('plannedStart', e.target.value)} /></Field>
          <Field label={t('entry.duration')}><Input type="number" min={1} value={form.durationDays} onChange={(e) => set('durationDays', Number(e.target.value))} /></Field>
        </>
      )}
      {form.type === 'meeting' && (
        <Field label={t('entry.durationHours')}><Input type="number" min={0.5} step={0.5} value={form.durationHours} onChange={(e) => set('durationHours', Number(e.target.value))} /></Field>
      )}
      <Field label={t('entry.riskFlag')}>
        <Select value={form.riskFlag} onChange={(e) => set('riskFlag', e.target.value as RiskFlag)}>
          <option value="none">{t('entry.none')}</option>
          <option value="warning">{t('entry.warning')}</option>
          <option value="critical">{t('entry.critical')}</option>
        </Select>
      </Field>
    </div>
  )

  const dependenciesField = availableDeps.length > 0 && (
    <Field label={`${t('plan.dependencies')}${form.dependsOn.length ? ` (${form.dependsOn.length})` : ''}`}>
      <div style={{ maxHeight: 150, overflowY: 'auto', borderRadius: 'var(--radius-lg)', background: 'var(--surface-subtle)', padding: 4 }}>
        {availableDeps.map((dep) => (
          <label key={dep.id} className="flex items-center gap-2 px-2 py-1.5 text-[13px] cursor-pointer rounded-[var(--radius-md)] hover:bg-[var(--surface-card)]" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" className="accent-[var(--text-primary)]" checked={form.dependsOn.includes(dep.id)} onChange={() => toggleDep(dep.id)} />
            {dep.name}
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

  const sectionTitle = (text: string) => <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{text}</h3>

  if (!isEdit) {
    return (
      <Modal open={open} title={title} onClose={onClose} size="md" footer={footer}>
        <div className="space-y-5">
          {typePills}
          {nameInput}
          {whereFields}
          {peopleFields}
          {statusDateFields}
          {showDesc || form.description ? <Field label={t('entry.description')}>{descriptionEditor}</Field> : (
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
        {entry && incident?.entries.some((e) => e.id === entry.id) && (
          <section className="space-y-3">
            {sectionTitle('Conversa')}
            <EntryComments entryId={entry.id} scope={{ type: 'incident', incidentId }} maxListHeight={260} />
          </section>
        )}
      </div>
    </Modal>
  )
}
