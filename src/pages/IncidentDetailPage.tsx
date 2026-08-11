import { useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { Entry, EntryOwner, EntryStatus, IncidentStatus, Probability, TeamMember } from '@/types'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input, Select, Field } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import OpenPointsTab from '@/pages/tabs/diary/OpenPointsTab'
import HistoryTab from '@/pages/tabs/diary/HistoryTab'
import EntryBoard, { BoardCard } from '@/components/plan/EntryBoard'
import IncidentEntryModal from '@/components/plan/IncidentEntryModal'
import OwnersField from '@/components/plan/OwnersField'
import { AnchorNav } from '@/components/ui/AnchorNav'
import { StatusDot } from '@/components/ui/StatusDot'
import { AvatarStack } from '@/components/ui/AvatarStack'
import { contactsForClients } from '@/utils/contacts'
import { CopyLinkButton } from '@/components/ui/CopyLinkButton'
import { differenceInCalendarDays } from 'date-fns'

type Tab = 'overview' | 'tasks' | 'openPoints' | 'history'

const STATUS_OPTIONS: IncidentStatus[] = ['open', 'in_progress', 'waiting_on_client', 'resolved', 'closed']
const STATUS_VARIANT: Record<IncidentStatus, 'gray' | 'primary' | 'orange' | 'green' | 'red'> = {
  open: 'gray', in_progress: 'primary', waiting_on_client: 'orange', resolved: 'green', closed: 'red',
}
const ENTRY_STATUS_COLOR: Record<EntryStatus, string> = {
  pending: 'var(--text-tertiary)',
  in_progress: 'var(--color-info-text)',
  validation: 'var(--color-warning-text)',
  done: 'var(--color-success-text)',
  blocked: 'var(--color-danger-text)',
  overdue: 'var(--color-warning-text)',
}

function entryOwners(entry: Entry) {
  if (entry.owners && entry.owners.length > 0) return entry.owners
  if (entry.responsible) return [{ id: entry.responsible, type: 'text' as const, name: entry.responsible }]
  return []
}

function fmtEntryDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function IncidentDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    incidents, clients, projects, teamDirectory, contacts,
    updateIncident, deleteIncident, updateIncidentStatus, renameIncident,
    linkIncidentClient, unlinkIncidentClient, linkIncidentProject, unlinkIncidentProject,
    addIncidentStakeholder, removeIncidentStakeholder, updateIncidentEntryStatus, createContact,
  } = useAppStore()

  const directoryAsTeam: TeamMember[] = useMemo(
    () => teamDirectory.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name ?? p.email ?? '', role: '', email: p.email ?? undefined, userId: p.id })),
    [teamDirectory],
  )

  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showLinkClient, setShowLinkClient] = useState(false)
  const [showLinkProject, setShowLinkProject] = useState(false)
  const [showStakeholder, setShowStakeholder] = useState(false)
  const [stakeholderMode, setStakeholderMode] = useState<'member' | 'contact' | 'text'>('member')
  const [stakeholderUserId, setStakeholderUserId] = useState('')
  const [stakeholderContactKey, setStakeholderContactKey] = useState('')
  const [stakeholderName, setStakeholderName] = useState('')
  const [contactCreateMode, setContactCreateMode] = useState(false)
  const [newContactClientId, setNewContactClientId] = useState('')
  const [newContactForm, setNewContactForm] = useState({ name: '', role: '', email: '', phone: '' })
  const [taskModal, setTaskModal] = useState<{ mode: 'create' | 'edit'; entry?: Entry } | null>(null)
  const [taskView, setTaskView] = useState<'kanban' | 'table'>(() => (localStorage.getItem('pb-incident-tasks-view') as 'kanban' | 'table') ?? 'kanban')
  const [taskFilterStatus, setTaskFilterStatus] = useState('')
  const [taskFilterResponsible, setTaskFilterResponsible] = useState('')

  function changeTaskView(v: 'kanban' | 'table') {
    setTaskView(v)
    localStorage.setItem('pb-incident-tasks-view', v)
  }

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
  const allContacts = contactsForClients(contacts, linkedClients.map((c) => c.id)).map((ct) => ({
    ...ct,
    clientName: linkedClients.find((c) => ct.clientIds.includes(c.id))?.name ?? '',
  }))

  const today = new Date()
  const daysOpen = incident.status === 'resolved' || incident.status === 'closed'
    ? differenceInCalendarDays(new Date(incident.resolvedAt ?? incident.createdAt), new Date(incident.createdAt))
    : differenceInCalendarDays(today, new Date(incident.createdAt))
  const daysInStatus = differenceInCalendarDays(today, new Date(incident.statusChangedAt))

  function startEditTitle() {
    setTitleDraft(incident!.title)
    setEditingTitle(true)
  }

  function saveTitle() {
    renameIncident(incident!.id, titleDraft)
    setEditingTitle(false)
  }

  function openAddStakeholder() {
    setStakeholderMode('member'); setStakeholderUserId(''); setStakeholderContactKey(''); setStakeholderName('')
    setContactCreateMode(false); setNewContactClientId(linkedClients[0]?.id ?? ''); setNewContactForm({ name: '', role: '', email: '', phone: '' })
    setShowStakeholder(true)
  }

  function saveStakeholder() {
    let owner: EntryOwner
    if (stakeholderMode === 'member') {
      const profile = teamDirectory.filter((p) => p.active).find((p) => p.id === stakeholderUserId)
      if (!profile) return
      owner = { id: crypto.randomUUID(), type: 'member', memberId: profile.id, name: profile.name ?? profile.email ?? '' }
    } else if (stakeholderMode === 'contact') {
      if (contactCreateMode) {
        if (!newContactForm.name.trim() || !newContactClientId) return
        const contactId = createContact({
          name: newContactForm.name.trim(),
          role: newContactForm.role.trim() || undefined,
          email: newContactForm.email.trim() || undefined,
          phone: newContactForm.phone.trim() || undefined,
          clientIds: [newContactClientId],
        })
        owner = { id: crypto.randomUUID(), type: 'contact', contactId, name: newContactForm.name.trim(), role: newContactForm.role.trim() || undefined }
      } else {
        const contact = allContacts.find((c) => c.id === stakeholderContactKey)
        if (!contact) return
        owner = { id: crypto.randomUUID(), type: 'contact', contactId: contact.id, name: contact.name, role: contact.role }
      }
    } else {
      if (!stakeholderName.trim()) return
      owner = { id: crypto.randomUUID(), type: 'text', name: stakeholderName.trim() }
    }
    addIncidentStakeholder(incident!.id, owner)
    setShowStakeholder(false)
  }

  function selectTab(id: string) {
    setActiveTab(id as Tab)
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: t('incident.tabOverview') },
    { id: 'tasks', label: `${t('incident.tabTasks')}${incident.entries.length ? ` (${incident.entries.length})` : ''}` },
    { id: 'openPoints', label: `${t('tabs.diary')}${incident.openPoints.length ? ` (${incident.openPoints.length})` : ''}` },
    { id: 'history', label: t('incident.tabHistory') },
  ]

  const boardCards: BoardCard[] = incident.entries.map((e) => ({ ...e }))

  const allTaskResponsibles = Array.from(new Set(boardCards.flatMap((c) => entryOwners(c).map((o) => o.name)))).sort()

  const filteredBoardCards = boardCards.filter((c) => {
    if (taskFilterStatus && c.status !== taskFilterStatus) return false
    if (taskFilterResponsible && !entryOwners(c).some((o) => o.name === taskFilterResponsible)) return false
    return true
  })

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/support" className="text-sm shrink-0" style={{ color: 'var(--text-tertiary)' }}>← {t('incident.title')}</Link>
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setEditingTitle(false)
              }}
              className="text-base font-semibold bg-transparent outline-none border-b min-w-0"
              style={{ color: 'var(--text-primary)', borderColor: 'var(--oe-primary)' }}
            />
          ) : (
            <h1
              onClick={startEditTitle}
              className="text-base font-semibold truncate cursor-text hover:opacity-70 transition-opacity"
              style={{ color: 'var(--text-primary)' }}
            >
              {incident.title}
            </h1>
          )}
          <Badge variant={STATUS_VARIANT[incident.status]}>{t(`incident.status_${incident.status}`)}</Badge>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <CopyLinkButton url={`${window.location.origin}/support/${incident.id}`} size="sm" />
          <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(true)}>{t('incident.delete')}</Button>
        </div>
      </div>

      <div className="px-6 pt-3">
        <AnchorNav items={TABS} onNavigate={selectTab} active={activeTab} />
      </div>

      <div className="p-6">
        {activeTab === 'overview' && (
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

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <Field label={t('entry.responsible')}>
                <OwnersField
                  owners={incident.owner ? [incident.owner] : []}
                  onChange={(owners) => updateIncident(incident.id, { owner: owners[0] })}
                  teamMembers={directoryAsTeam}
                  contacts={allContacts}
                  max={1}
                />
              </Field>
              <Field label={t('incident.colStatus')}>
                <Select value={incident.status} onChange={(e) => updateIncidentStatus(incident.id, e.target.value as IncidentStatus)}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{t(`incident.status_${s}`)}</option>)}
                </Select>
              </Field>
              <Field label={t('incident.priority')} hint="Urgência de resolução: Alta = ação imediata, Média = prazo normal, Baixa = pode aguardar.">
                <Select value={incident.priority} onChange={(e) => updateIncident(incident.id, { priority: e.target.value as Probability })}>
                  <option value="low">{t('risk.low')}</option>
                  <option value="medium">{t('risk.medium')}</option>
                  <option value="high">{t('risk.high')}</option>
                </Select>
              </Field>
              <Field label={t('incident.impact')} hint="Quanto esse incidente afeta a operação do cliente: Alta = trava processos/muitos usuários, Média = afeta parcialmente, Baixa = afeta pouco.">
                <Select value={incident.impact} onChange={(e) => updateIncident(incident.id, { impact: e.target.value as Probability })}>
                  <option value="low">{t('risk.low')}</option>
                  <option value="medium">{t('risk.medium')}</option>
                  <option value="high">{t('risk.high')}</option>
                </Select>
              </Field>
              <Field label={t('incident.deadline')}>
                <Input type="date" value={incident.deadline ?? ''} onChange={(e) => updateIncident(incident.id, { deadline: e.target.value || undefined })} />
              </Field>
            </div>

            <Field label={t('incident.description')}>
              <textarea
                value={incident.description ?? ''}
                onChange={(e) => updateIncident(incident.id, { description: e.target.value || undefined })}
                rows={4}
                className="block w-full rounded-[var(--radius-md)] border px-3 py-2 text-sm focus:outline-none focus:ring-1"
                style={{ borderColor: 'var(--border-default)', background: 'var(--surface-input)', color: 'var(--text-primary)', resize: 'none' }}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
          </div>
        )}

        {activeTab === 'tasks' && (
          <div>
            <div className="flex items-center flex-wrap gap-2 mb-4">
              <Button size="sm" onClick={() => setTaskModal({ mode: 'create' })}>{t('plan.addTask')}</Button>

              {incident.entries.length > 0 && (
                <>
                  <div className="flex rounded-[var(--radius-lg)] border overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
                    <button
                      onClick={() => changeTaskView('kanban')}
                      className="px-3 py-1.5 text-xs font-medium transition-colors"
                      style={{ background: taskView === 'kanban' ? 'var(--oe-primary)' : 'var(--surface-card)', color: taskView === 'kanban' ? 'white' : 'var(--text-secondary)' }}
                    >
                      {t('actions.viewKanban')}
                    </button>
                    <button
                      onClick={() => changeTaskView('table')}
                      className="px-3 py-1.5 text-xs font-medium transition-colors"
                      style={{ background: taskView === 'table' ? 'var(--oe-primary)' : 'var(--surface-card)', color: taskView === 'table' ? 'white' : 'var(--text-secondary)' }}
                    >
                      {t('actions.viewTable')}
                    </button>
                  </div>

                  <select
                    value={taskFilterStatus}
                    onChange={(e) => setTaskFilterStatus(e.target.value)}
                    className="text-xs rounded-[var(--radius-md)] px-2 py-1.5 border"
                    style={{ borderColor: 'var(--border-default)', background: 'var(--surface-card)', color: 'var(--text-secondary)' }}
                  >
                    <option value="">{t('tasks.filterStatus')}</option>
                    <option value="pending">{t('entry.pending')}</option>
                    <option value="in_progress">{t('entry.in_progress')}</option>
                    <option value="validation">{t('entry.validation')}</option>
                    <option value="done">{t('entry.done')}</option>
                    <option value="blocked">{t('entry.blocked')}</option>
                  </select>

                  <select
                    value={taskFilterResponsible}
                    onChange={(e) => setTaskFilterResponsible(e.target.value)}
                    className="text-xs rounded-[var(--radius-md)] px-2 py-1.5 border"
                    style={{ borderColor: 'var(--border-default)', background: 'var(--surface-card)', color: 'var(--text-secondary)' }}
                  >
                    <option value="">{t('tasks.filterMember')}</option>
                    {allTaskResponsibles.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </>
              )}
            </div>
            {incident.entries.length === 0 ? (
              <p className="text-sm text-center py-12" style={{ color: 'var(--text-tertiary)' }}>{t('plan.noEntries')}</p>
            ) : taskView === 'kanban' ? (
              <EntryBoard
                cards={filteredBoardCards}
                onStatusChange={(entryId, status) => updateIncidentEntryStatus(incident.id, entryId, status)}
                onCardClick={(card) => setTaskModal({ mode: 'edit', entry: card })}
                showInternalSection={false}
              />
            ) : (
              <table className="w-full text-sm rounded-[var(--radius-lg)] border overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-subtle)' }}>
                    <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('entry.name')}</th>
                    <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('entry.responsible')}</th>
                    <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('entry.status')}</th>
                    <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('plan.colEnd')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-default)' }}>
                  {filteredBoardCards.map((card) => {
                    const endDate = card.type === 'task' ? card.plannedEnd : card.plannedDate
                    return (
                      <tr key={card.id} className="cursor-pointer transition-colors" onClick={() => setTaskModal({ mode: 'edit', entry: card })}>
                        <td className="px-3 py-2.5" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{card.name}</td>
                        <td className="px-3 py-2.5"><AvatarStack people={entryOwners(card)} size={20} /></td>
                        <td className="px-3 py-2.5"><StatusDot color={ENTRY_STATUS_COLOR[card.status]} label={t(`entry.${card.status}` as any)} /></td>
                        <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>{endDate ? fmtEntryDate(endDate) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'openPoints' && (
          <OpenPointsTab scope={{ type: 'incident', id: incident.id }} openPoints={incident.openPoints} phases={[]} />
        )}

        {activeTab === 'history' && (
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
                {teamDirectory.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name ?? p.email}</option>)}
              </Select>
            </Field>
          )}
          {stakeholderMode === 'contact' && (
            linkedClients.length === 0 ? (
              <Field label={t('incident.fromContact')}>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Vincule um cliente a este incidente primeiro.</p>
              </Field>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setContactCreateMode(false)}
                    className={`flex-1 text-xs font-medium px-2 py-1.5 rounded-[var(--radius-pill)] border transition-colors ${!contactCreateMode ? 'bg-[var(--oe-primary)] text-white border-[var(--oe-primary)]' : 'bg-[var(--surface-card)] text-[var(--text-secondary)] border-[var(--border-default)]'}`}
                  >
                    Contato existente
                  </button>
                  <button
                    type="button"
                    onClick={() => setContactCreateMode(true)}
                    className={`flex-1 text-xs font-medium px-2 py-1.5 rounded-[var(--radius-pill)] border transition-colors ${contactCreateMode ? 'bg-[var(--oe-primary)] text-white border-[var(--oe-primary)]' : 'bg-[var(--surface-card)] text-[var(--text-secondary)] border-[var(--border-default)]'}`}
                  >
                    + Novo contato
                  </button>
                </div>

                {!contactCreateMode ? (
                  <Field label={t('incident.fromContact')}>
                    {allContacts.length === 0 ? (
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Nenhum contato cadastrado nos clientes vinculados — use "+ Novo contato".</p>
                    ) : (
                      <Select value={stakeholderContactKey} onChange={(e) => setStakeholderContactKey(e.target.value)}>
                        <option value="">Selecione...</option>
                        {allContacts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.clientName})</option>)}
                      </Select>
                    )}
                  </Field>
                ) : (
                  <div className="space-y-3">
                    {linkedClients.length > 1 && (
                      <Field label="Cliente" required>
                        <Select value={newContactClientId} onChange={(e) => setNewContactClientId(e.target.value)}>
                          {linkedClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Select>
                      </Field>
                    )}
                    <Field label="Nome" required>
                      <Input autoFocus value={newContactForm.name} onChange={(e) => setNewContactForm((f) => ({ ...f, name: e.target.value }))} />
                    </Field>
                    <Field label="Cargo">
                      <Input value={newContactForm.role} onChange={(e) => setNewContactForm((f) => ({ ...f, role: e.target.value }))} />
                    </Field>
                    <Field label="E-mail">
                      <Input type="email" value={newContactForm.email} onChange={(e) => setNewContactForm((f) => ({ ...f, email: e.target.value }))} />
                    </Field>
                  </div>
                )}
              </div>
            )
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
