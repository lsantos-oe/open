import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { Entry, EntryOwner, IncidentStatus, Probability } from '@/types'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input, Select, Field } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import OpenPointsTab from '@/pages/tabs/diary/OpenPointsTab'
import HistoryTab from '@/pages/tabs/diary/HistoryTab'
import EntryBoard, { BoardCard } from '@/components/plan/EntryBoard'
import IncidentEntryModal from '@/components/plan/IncidentEntryModal'
import { differenceInCalendarDays } from 'date-fns'

type Tab = 'overview' | 'tasks' | 'openPoints' | 'history'

const STATUS_OPTIONS: IncidentStatus[] = ['open', 'in_progress', 'waiting_on_client', 'resolved', 'closed']
const STATUS_VARIANT: Record<IncidentStatus, 'gray' | 'primary' | 'orange' | 'green' | 'red'> = {
  open: 'gray', in_progress: 'primary', waiting_on_client: 'orange', resolved: 'green', closed: 'red',
}

export default function IncidentDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    incidents, clients, projects, teamDirectory,
    updateIncident, deleteIncident, updateIncidentStatus,
    linkIncidentClient, unlinkIncidentClient, linkIncidentProject, unlinkIncidentProject,
    addIncidentStakeholder, removeIncidentStakeholder, updateIncidentEntryStatus,
  } = useAppStore()

  const [tab, setTab] = useState<Tab>('overview')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showLinkClient, setShowLinkClient] = useState(false)
  const [showLinkProject, setShowLinkProject] = useState(false)
  const [showStakeholder, setShowStakeholder] = useState(false)
  const [stakeholderMode, setStakeholderMode] = useState<'member' | 'contact' | 'text'>('member')
  const [stakeholderUserId, setStakeholderUserId] = useState('')
  const [stakeholderContactKey, setStakeholderContactKey] = useState('')
  const [stakeholderName, setStakeholderName] = useState('')
  const [taskModal, setTaskModal] = useState<{ mode: 'create' | 'edit'; entry?: Entry } | null>(null)

  const incident = incidents.find((i) => i.id === id)

  if (!incident) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{t('incident.notFound')}</p>
        <Link to="/support" className="text-sm" style={{ color: 'var(--oe-primary)' }}>← {t('incident.title')}</Link>
      </div>
    )
  }

  const linkedClients = clients.filter((c) => incident.clientIds.includes(c.id))
  const linkedProjects = projects.filter((p) => incident.projectIds.includes(p.id))
  const availableClients = clients.filter((c) => !incident.clientIds.includes(c.id))
  const availableProjects = projects.filter((p) => !incident.projectIds.includes(p.id))
  const allContacts = linkedClients.flatMap((c) => c.contacts.map((ct) => ({ ...ct, clientName: c.name })))

  const today = new Date()
  const daysOpen = incident.status === 'resolved' || incident.status === 'closed'
    ? differenceInCalendarDays(new Date(incident.resolvedAt ?? incident.createdAt), new Date(incident.createdAt))
    : differenceInCalendarDays(today, new Date(incident.createdAt))
  const daysInStatus = differenceInCalendarDays(today, new Date(incident.statusChangedAt))

  function openAddStakeholder() {
    setStakeholderMode('member'); setStakeholderUserId(''); setStakeholderContactKey(''); setStakeholderName('')
    setShowStakeholder(true)
  }

  function saveStakeholder() {
    let owner: EntryOwner
    if (stakeholderMode === 'member') {
      const profile = teamDirectory.find((p) => p.id === stakeholderUserId)
      if (!profile) return
      owner = { id: crypto.randomUUID(), type: 'member', memberId: profile.id, name: profile.name ?? profile.email ?? '' }
    } else if (stakeholderMode === 'contact') {
      const contact = allContacts.find((c) => c.id === stakeholderContactKey)
      if (!contact) return
      owner = { id: crypto.randomUUID(), type: 'contact', contactId: contact.id, name: contact.name, role: contact.role }
    } else {
      if (!stakeholderName.trim()) return
      owner = { id: crypto.randomUUID(), type: 'text', name: stakeholderName.trim() }
    }
    addIncidentStakeholder(incident!.id, owner)
    setShowStakeholder(false)
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: t('incident.tabOverview') },
    { id: 'tasks', label: `${t('incident.tabTasks')}${incident.entries.length ? ` (${incident.entries.length})` : ''}` },
    { id: 'openPoints', label: `${t('incident.tabOpenPoints')}${incident.openPoints.length ? ` (${incident.openPoints.length})` : ''}` },
    { id: 'history', label: t('incident.tabHistory') },
  ]

  const boardCards: BoardCard[] = incident.entries.map((e) => ({ ...e }))

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/support" className="text-sm shrink-0" style={{ color: 'var(--text-tertiary)' }}>← {t('incident.title')}</Link>
          <h1 className="text-base font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{incident.title}</h1>
          <Badge variant={STATUS_VARIANT[incident.status]}>{t(`incident.status_${incident.status}`)}</Badge>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(true)}>{t('incident.delete')}</Button>
      </div>

      <div className="flex gap-0 px-6 border-b" style={{ borderColor: 'var(--border-default)' }}>
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className="px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
            style={{
              borderBottomColor: tab === tb.id ? 'var(--oe-primary)' : 'transparent',
              color: tab === tb.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
              marginBottom: -1,
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>

      <div className={tab === 'tasks' ? 'p-6' : 'p-6 max-w-3xl'}>
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-[var(--radius-lg)]" style={{ background: 'var(--surface-subtle)' }}>
                <p className="text-[10px] uppercase font-semibold tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>{t('incident.daysOpen')}</p>
                <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{daysOpen}</p>
              </div>
              <div className="p-3 rounded-[var(--radius-lg)]" style={{ background: 'var(--surface-subtle)' }}>
                <p className="text-[10px] uppercase font-semibold tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>{t('incident.daysInStatus')}</p>
                <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{daysInStatus}</p>
              </div>
            </div>

            <Field label={t('incident.colStatus')}>
              <Select value={incident.status} onChange={(e) => updateIncidentStatus(incident.id, e.target.value as IncidentStatus)}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{t(`incident.status_${s}`)}</option>)}
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label={t('incident.priority')}>
                <Select value={incident.priority} onChange={(e) => updateIncident(incident.id, { priority: e.target.value as Probability })}>
                  <option value="low">{t('risk.low')}</option>
                  <option value="medium">{t('risk.medium')}</option>
                  <option value="high">{t('risk.high')}</option>
                </Select>
              </Field>
              <Field label={t('incident.impact')}>
                <Select value={incident.impact} onChange={(e) => updateIncident(incident.id, { impact: e.target.value as Probability })}>
                  <option value="low">{t('risk.low')}</option>
                  <option value="medium">{t('risk.medium')}</option>
                  <option value="high">{t('risk.high')}</option>
                </Select>
              </Field>
            </div>

            <Field label={t('incident.deadline')}>
              <Input type="date" value={incident.deadline ?? ''} onChange={(e) => updateIncident(incident.id, { deadline: e.target.value || undefined })} />
            </Field>

            <Field label={t('incident.description')}>
              <textarea
                value={incident.description ?? ''}
                onChange={(e) => updateIncident(incident.id, { description: e.target.value || undefined })}
                rows={4}
                className="block w-full rounded-[var(--radius-md)] border px-3 py-2 text-sm focus:outline-none focus:ring-1"
                style={{ borderColor: 'var(--border-default)', background: 'var(--surface-input)', color: 'var(--text-primary)', resize: 'none' }}
              />
            </Field>

            <Field label={t('incident.clients')}>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {linkedClients.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-pill)] text-xs font-medium" style={{ background: 'var(--oe-primary-light)', color: 'var(--oe-primary)' }}>
                    <Link to={`/wallet/${c.id}`}>{c.name}</Link>
                    <button onClick={() => unlinkIncidentClient(incident.id, c.id)}>×</button>
                  </span>
                ))}
                <button onClick={() => setShowLinkClient(true)} className="text-xs px-2 py-0.5 rounded-[var(--radius-pill)] border" style={{ borderColor: 'var(--border-default)', color: 'var(--text-tertiary)', borderStyle: 'dashed' }}>+ {t('incident.clients')}</button>
              </div>
            </Field>

            <Field label={t('incident.projects')}>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {linkedProjects.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-pill)] text-xs font-medium" style={{ background: 'var(--oe-primary-light)', color: 'var(--oe-primary)' }}>
                    <Link to={`/projects/${p.id}`}>{p.name}</Link>
                    <button onClick={() => unlinkIncidentProject(incident.id, p.id)}>×</button>
                  </span>
                ))}
                <button onClick={() => setShowLinkProject(true)} className="text-xs px-2 py-0.5 rounded-[var(--radius-pill)] border" style={{ borderColor: 'var(--border-default)', color: 'var(--text-tertiary)', borderStyle: 'dashed' }}>+ {t('incident.projects')}</button>
              </div>
            </Field>

            <Field label={t('incident.stakeholders')}>
              {incident.stakeholders.length === 0 ? (
                <p className="text-sm mb-2" style={{ color: 'var(--text-tertiary)' }}>{t('incident.noStakeholders')}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {incident.stakeholders.map((o) => (
                    <span key={o.id} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-pill)] text-xs font-medium" style={{ background: 'var(--surface-subtle)', color: 'var(--text-secondary)' }}>
                      {o.name}{o.role ? ` · ${o.role}` : ''}
                      <button onClick={() => removeIncidentStakeholder(incident.id, o.id)}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <Button size="sm" variant="secondary" onClick={openAddStakeholder}>{t('incident.addStakeholder')}</Button>
            </Field>
          </div>
        )}

        {tab === 'tasks' && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Button size="sm" onClick={() => setTaskModal({ mode: 'create' })}>{t('plan.addTask')}</Button>
            </div>
            {incident.entries.length === 0 ? (
              <p className="text-sm text-center py-12" style={{ color: 'var(--text-tertiary)' }}>{t('plan.noEntries')}</p>
            ) : (
              <EntryBoard
                cards={boardCards}
                onStatusChange={(entryId, status) => updateIncidentEntryStatus(incident.id, entryId, status)}
                onCardClick={(card) => setTaskModal({ mode: 'edit', entry: card })}
                showInternalSection={false}
              />
            )}
          </div>
        )}

        {tab === 'openPoints' && (
          <OpenPointsTab scope={{ type: 'incident', id: incident.id }} openPoints={incident.openPoints} phases={[]} />
        )}

        {tab === 'history' && (
          <HistoryTab scope={{ type: 'incident', id: incident.id }} history={incident.history} />
        )}
      </div>

      {/* Link client modal */}
      <Modal open={showLinkClient} title={t('incident.clients')} onClose={() => setShowLinkClient(false)} size="sm">
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {availableClients.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>—</p>
          ) : availableClients.map((c) => (
            <button
              key={c.id}
              onClick={() => { linkIncidentClient(incident.id, c.id); setShowLinkClient(false) }}
              className="w-full text-left px-2 py-1.5 rounded text-sm"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-subtle)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              {c.name}
            </button>
          ))}
        </div>
      </Modal>

      {/* Link project modal */}
      <Modal open={showLinkProject} title={t('incident.projects')} onClose={() => setShowLinkProject(false)} size="sm">
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {availableProjects.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>—</p>
          ) : availableProjects.map((p) => (
            <button
              key={p.id}
              onClick={() => { linkIncidentProject(incident.id, p.id); setShowLinkProject(false) }}
              className="w-full text-left px-2 py-1.5 rounded text-sm"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-subtle)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              {p.name}
            </button>
          ))}
        </div>
      </Modal>

      {/* Add stakeholder modal */}
      <Modal
        open={showStakeholder}
        title={t('incident.addStakeholder')}
        onClose={() => setShowStakeholder(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowStakeholder(false)}>{t('actions.cancel')}</Button>
            <Button onClick={saveStakeholder}>{t('actions.save')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <button type="button" onClick={() => setStakeholderMode('member')} className={`flex-1 text-xs font-medium px-2 py-1.5 rounded-[var(--radius-pill)] border transition-colors ${stakeholderMode === 'member' ? 'bg-[var(--oe-primary)] text-white border-[var(--oe-primary)]' : 'bg-[var(--surface-card)] text-[var(--text-secondary)] border-[var(--border-default)]'}`}>{t('entry.fromUser')}</button>
            <button type="button" onClick={() => setStakeholderMode('contact')} className={`flex-1 text-xs font-medium px-2 py-1.5 rounded-[var(--radius-pill)] border transition-colors ${stakeholderMode === 'contact' ? 'bg-[var(--oe-primary)] text-white border-[var(--oe-primary)]' : 'bg-[var(--surface-card)] text-[var(--text-secondary)] border-[var(--border-default)]'}`}>{t('incident.fromContact')}</button>
            <button type="button" onClick={() => setStakeholderMode('text')} className={`flex-1 text-xs font-medium px-2 py-1.5 rounded-[var(--radius-pill)] border transition-colors ${stakeholderMode === 'text' ? 'bg-[var(--oe-primary)] text-white border-[var(--oe-primary)]' : 'bg-[var(--surface-card)] text-[var(--text-secondary)] border-[var(--border-default)]'}`}>{t('entry.freeText')}</button>
          </div>
          {stakeholderMode === 'member' && (
            <Field label={t('entry.fromUser')}>
              <Select value={stakeholderUserId} onChange={(e) => setStakeholderUserId(e.target.value)}>
                <option value="">Selecione...</option>
                {teamDirectory.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.email}</option>)}
              </Select>
            </Field>
          )}
          {stakeholderMode === 'contact' && (
            <Field label={t('incident.fromContact')}>
              {allContacts.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Nenhum contato — vincule um cliente com contatos cadastrados primeiro.</p>
              ) : (
                <Select value={stakeholderContactKey} onChange={(e) => setStakeholderContactKey(e.target.value)}>
                  <option value="">Selecione...</option>
                  {allContacts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.clientName})</option>)}
                </Select>
              )}
            </Field>
          )}
          {stakeholderMode === 'text' && (
            <Field label={t('entry.freeText')}>
              <Input autoFocus value={stakeholderName} onChange={(e) => setStakeholderName(e.target.value)} placeholder="Nome" />
            </Field>
          )}
        </div>
      </Modal>

      {taskModal && (
        <IncidentEntryModal
          open
          mode={taskModal.mode}
          incidentId={incident.id}
          entry={taskModal.entry}
          onClose={() => setTaskModal(null)}
        />
      )}

      {/* Delete confirm */}
      <Modal
        open={showDeleteConfirm}
        title={t('incident.delete')}
        onClose={() => setShowDeleteConfirm(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>{t('actions.cancel')}</Button>
            <Button variant="danger" onClick={() => { deleteIncident(incident.id); navigate('/support') }}>{t('incident.delete')}</Button>
          </>
        }
      >
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('incident.deleteConfirm')}</p>
      </Modal>
    </div>
  )
}
