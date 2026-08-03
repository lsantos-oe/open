import { useState, useEffect, useMemo, CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { Entry, EntryOwner, EntryStatus, RiskFlag, Link, TeamMember } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import OwnersField from '@/components/plan/OwnersField'
import { contactsForClient } from '@/utils/contacts'

interface Props {
  open: boolean
  mode: 'create' | 'edit'
  entry?: Entry
  onClose: () => void
}

type Form = {
  name: string
  description: string
  clientId: string
  owners: EntryOwner[]
  status: EntryStatus
  riskFlag: RiskFlag
  plannedStart: string
  plannedEnd: string
  durationDays: number
  links: Link[]
}

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
    name: '', description: '', clientId: '', owners: [], status: 'pending', riskFlag: 'none',
    plannedStart: '', plannedEnd: '', durationDays: 1, links: [],
  }
}

function entryToForm(entry: Entry): Form {
  let owners = entry.owners ?? []
  if (owners.length > 0 && !owners.some((o) => o.kind)) {
    owners = owners.map((o, i) => (i === 0 ? { ...o, kind: 'executor' as const } : o))
  }
  return {
    name: entry.name,
    description: entry.description ?? '',
    clientId: entry.clientId ?? '',
    owners,
    status: entry.status,
    riskFlag: entry.riskFlag,
    plannedStart: entry.plannedStart ?? '',
    plannedEnd: entry.plannedEnd ?? '',
    durationDays: entry.durationDays ?? 1,
    links: entry.links.map((l) => ({ ...l })),
  }
}

/** Task creation with no project and no incident — only name, status and
 *  executor are ever required; a client is optional (and there is no
 *  project to derive one from), so this owns its own client picker instead
 *  of scoping contacts from a parent entity like IncidentEntryModal does. */
export default function StandaloneEntryModal({ open, mode, entry, onClose }: Props) {
  const { t } = useTranslation()
  const { clients, teamDirectory, contacts, addStandaloneTask, updateStandaloneTask, deleteStandaloneTask, changeStandaloneTaskDate } = useAppStore()

  const directoryAsTeam: TeamMember[] = useMemo(
    () => teamDirectory.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name ?? p.email ?? '', role: '', email: p.email ?? undefined, userId: p.id })),
    [teamDirectory],
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

  const clientContacts = useMemo(
    () => (form.clientId ? contactsForClient(contacts, form.clientId) : []),
    [contacts, form.clientId],
  )

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
      type: 'task' as const,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      clientId: form.clientId || undefined,
      owners: form.owners,
      responsible: executor?.name ?? '',
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

  function handleSaveCreate() {
    if (!form.name.trim() || !form.owners.some((o) => o.kind === 'executor')) return
    if (form.plannedStart && form.plannedEnd && form.plannedEnd < form.plannedStart) {
      setEndDateError(t('errors.endBeforeStart')); return
    }
    addStandaloneTask(buildEntryBase())
    onClose()
  }

  function handleSaveEdit() {
    if (!entry || !form.name.trim() || !form.owners.some((o) => o.kind === 'executor')) return
    if (form.plannedStart && form.plannedEnd && form.plannedEnd < form.plannedStart) {
      setEndDateError(t('errors.endBeforeStart')); return
    }
    const executor = form.owners.find((o) => o.kind === 'executor')
    updateStandaloneTask(entry.id, {
      name: form.name.trim(), description: form.description.trim() || undefined, clientId: form.clientId || undefined,
      owners: form.owners, responsible: executor?.name ?? '',
      status: form.status, riskFlag: form.riskFlag, durationDays: form.durationDays, links: form.links,
    })
    if (form.plannedStart && form.plannedStart !== (entry.plannedStart ?? '')) changeStandaloneTaskDate(entry.id, 'plannedStart', form.plannedStart)
    if (form.plannedEnd && form.plannedEnd !== (entry.plannedEnd ?? '')) changeStandaloneTaskDate(entry.id, 'plannedEnd', form.plannedEnd)
    onClose()
  }

  function handleDelete() {
    if (!entry) return
    deleteStandaloneTask(entry.id)
    onClose()
  }

  const title = mode === 'create' ? t('tasks.newStandaloneTask' as any) : t('entry.editTask' as any)

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
        <input
          autoFocus
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') mode === 'edit' ? handleSaveEdit() : handleSaveCreate() }}
          placeholder={t('entry.name')}
          style={{ width: '100%', fontSize: 16, fontWeight: 500, border: 'none', borderBottom: '2px solid var(--border-default)', outline: 'none', background: 'transparent', color: 'var(--text-primary)', paddingBottom: 8, boxSizing: 'border-box' }}
        />

        <FieldBox label={t('project.client')}>
          <select value={form.clientId} onChange={(e) => set('clientId', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">{t('tasks.noClient' as any)}</option>
            {[...clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </FieldBox>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <FieldLabel>{t('entry.executor')}</FieldLabel>
            <OwnersField
              owners={form.owners.filter((o) => o.kind === 'executor')}
              onChange={(next) => set('owners', [...next, ...form.owners.filter((o) => o.kind !== 'executor')])}
              teamMembers={directoryAsTeam}
              contacts={clientContacts}
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
              contacts={clientContacts}
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

        <div className="grid grid-cols-2 gap-4">
          <FieldBox label={t('entry.status')}>
            <select value={form.status} onChange={(e) => set('status', e.target.value as EntryStatus)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="pending">{t('entry.pending')}</option>
              <option value="in_progress">{t('entry.in_progress')}</option>
              <option value="validation">{t('entry.validation')}</option>
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
