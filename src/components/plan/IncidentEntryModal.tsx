import { useState, useEffect, useMemo, CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { Entry, EntryOwner, EntryType, EntryStatus, RiskFlag, Link, TeamMember } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import OwnersField from '@/components/plan/OwnersField'
import { contactsForClients } from '@/utils/contacts'

interface Props {
  open: boolean
  mode: 'create' | 'edit'
  incidentId: string
  entry?: Entry
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

const TYPE_ICONS: Record<EntryType, string> = { task: '✅', milestone: '🏁', meeting: '📅' }

const inputStyle: CSSProperties = {
  width: '100%', fontSize: 13, border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)', padding: '5px 8px', color: 'var(--text-primary)',
  background: 'var(--surface-input)', outline: 'none', boxSizing: 'border-box',
}

function FieldLabel({ children }: { children: string }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-tertiary)', marginBottom: 5 }}>
      {children}
    </p>
  )
}

function FieldBox({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><FieldLabel>{label}</FieldLabel>{children}</div>
}

function emptyForm(): Form {
  return {
    name: '', description: '', type: 'task', owners: [], status: 'pending', riskFlag: 'none',
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

export default function IncidentEntryModal({ open, mode, incidentId, entry, onClose }: Props) {
  const { t } = useTranslation()
  const { incidents, teamDirectory, contacts, addIncidentEntry, updateIncidentEntry, deleteIncidentEntry, changeIncidentEntryDate } = useAppStore()
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

  const [form, setForm] = useState<Form>(entry ? entryToForm(entry) : emptyForm())
  const [endDateError, setEndDateError] = useState('')
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm'>('idle')
  const [newLinkLabel, setNewLinkLabel] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')

  useEffect(() => {
    if (!open) return
    setForm(entry ? entryToForm(entry) : emptyForm())
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
              <button onClick={handleDelete} style={{ fontSize: 13, padding: '6px 12px', borderRadius: 'var(--radius-md)', color: 'white', background: 'var(--color-danger-text)', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                {t('entry.confirmDelete')}
              </button>
              <button onClick={() => setDeleteStep('idle')} style={{ fontSize: 13, padding: '4px 8px', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                {t('actions.cancel')}
              </button>
            </>
          )}
        </div>
      )}
      {mode === 'create' && <div style={{ flex: 1 }} />}
      <Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button>
      <Button onClick={mode === 'edit' ? handleSaveEdit : handleSaveCreate} disabled={!form.name.trim() || !form.owners.some((o) => o.kind === 'executor')}>
        {mode === 'edit' ? t('entry.saveChanges') : t('actions.confirm')}
      </Button>
    </div>
  )

  return (
    <Modal open={open} title={title} onClose={onClose} size="lg" noPadding footer={footer}>
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {mode === 'create' && (
          <div style={{ display: 'flex', gap: 8 }}>
            {(['task', 'milestone', 'meeting'] as EntryType[]).map((type) => (
              <button
                key={type}
                onClick={() => set('type', type)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0',
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

        <input
          autoFocus
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') mode === 'edit' ? handleSaveEdit() : handleSaveCreate() }}
          placeholder={t('entry.name')}
          style={{ width: '100%', fontSize: 16, fontWeight: 500, border: 'none', borderBottom: '2px solid var(--border-default)', outline: 'none', background: 'transparent', color: 'var(--text-primary)', paddingBottom: 8, boxSizing: 'border-box' }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <FieldLabel>{t('entry.executor')}</FieldLabel>
            <OwnersField
              owners={form.owners.filter((o) => o.kind === 'executor')}
              onChange={(next) => set('owners', [...next, ...form.owners.filter((o) => o.kind !== 'executor')])}
              teamMembers={directoryAsTeam}
              contacts={incidentContacts}
              max={1}
              kind="executor"
            />
          </div>
          <div>
            <FieldLabel>{t('entry.validator')}</FieldLabel>
            <OwnersField
              owners={form.owners.filter((o) => o.kind === 'validator')}
              onChange={(next) => set('owners', [...form.owners.filter((o) => o.kind !== 'validator'), ...next])}
              teamMembers={directoryAsTeam}
              contacts={incidentContacts}
              max={1}
              kind="validator"
            />
          </div>
        </div>

        <div>
          <FieldLabel>{t('entry.description')}</FieldLabel>
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder={t('entry.descriptionPlaceholder')}
            rows={4}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 90 }}
          />
        </div>

        {form.type === 'task' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <FieldBox label={t('entry.plannedStart')}>
              <input type="date" value={form.plannedStart} onChange={(e) => set('plannedStart', e.target.value)} style={inputStyle} />
            </FieldBox>
            <FieldBox label={t('entry.plannedEnd')}>
              <input type="date" value={form.plannedEnd} onChange={(e) => { set('plannedEnd', e.target.value); setEndDateError('') }} style={{ ...inputStyle, ...(endDateError ? { borderColor: 'var(--color-danger-text)' } : {}) }} />
              {endDateError && <p style={{ fontSize: 11, color: 'var(--color-danger-text)', marginTop: 3 }}>{endDateError}</p>}
            </FieldBox>
            <FieldBox label={t('entry.duration')}>
              <input type="number" min={1} value={form.durationDays} onChange={(e) => set('durationDays', Number(e.target.value))} style={inputStyle} />
            </FieldBox>
          </div>
        )}

        {form.type !== 'task' && (
          <div style={{ display: 'grid', gridTemplateColumns: form.type === 'meeting' ? '1fr 1fr' : '1fr', gap: 12 }}>
            <FieldBox label={t('entry.plannedDate')}>
              <input type="date" value={form.plannedDate} onChange={(e) => set('plannedDate', e.target.value)} style={inputStyle} />
            </FieldBox>
            {form.type === 'meeting' && (
              <FieldBox label={t('entry.durationHours')}>
                <input type="number" min={0.5} step={0.5} value={form.durationHours} onChange={(e) => set('durationHours', Number(e.target.value))} style={inputStyle} />
              </FieldBox>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <FieldBox label={t('entry.status')}>
            <select value={form.status} onChange={(e) => set('status', e.target.value as EntryStatus)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="pending">{t('entry.pending')}</option>
              <option value="in_progress">{t('entry.in_progress')}</option>
              <option value="done">{t('entry.done')}</option>
              <option value="blocked">{t('entry.blocked')}</option>
            </select>
          </FieldBox>
          <FieldBox label={t('entry.riskFlag')}>
            <select value={form.riskFlag} onChange={(e) => set('riskFlag', e.target.value as RiskFlag)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="none">{t('entry.none')}</option>
              <option value="warning">{t('entry.warning')}</option>
              <option value="critical">{t('entry.critical')}</option>
            </select>
          </FieldBox>
        </div>

        {availableDeps.length > 0 && (
          <FieldBox label={t('plan.dependencies')}>
            <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', maxHeight: 140, overflowY: 'auto' }}>
              {availableDeps.map((dep) => (
                <label key={dep.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}>
                  <input type="checkbox" checked={form.dependsOn.includes(dep.id)} onChange={() => toggleDep(dep.id)} />
                  <span style={{ color: 'var(--text-secondary)' }}>{dep.name}</span>
                </label>
              ))}
            </div>
          </FieldBox>
        )}

        <div>
          <FieldLabel>Links</FieldLabel>
          {form.links.length > 0 && (
            <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {form.links.map((l) => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontSize: 12, color: 'var(--oe-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.label}</a>
                  <button onClick={() => removeLink(l.id)} style={{ fontSize: 14, color: 'var(--text-disabled)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={newLinkLabel} onChange={(e) => setNewLinkLabel(e.target.value)} placeholder="Label" style={inputStyle} />
            <input value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} placeholder="URL" style={inputStyle} onKeyDown={(e) => e.key === 'Enter' && addLink()} />
            <button onClick={addLink} disabled={!newLinkUrl.trim()} style={{ fontSize: 12, background: 'var(--oe-primary)', color: 'white', borderRadius: 'var(--radius-md)', padding: '5px 10px', border: 'none', cursor: 'pointer', opacity: newLinkUrl.trim() ? 1 : 0.4, whiteSpace: 'nowrap' }}>
              {t('actions.add')}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
