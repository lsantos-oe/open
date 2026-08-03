import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Field } from '@/components/ui/Input'
import { SelectionBar } from '@/components/ui/SelectionBar'
import { StatusDot } from '@/components/ui/StatusDot'
import { AvatarStack } from '@/components/ui/AvatarStack'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { EmptyState } from '@/components/ui/EmptyState'
import { SearchInput } from '@/components/ui/SearchInput'
import { MineToggle } from '@/components/ui/MineToggle'
import { ViewToggle } from '@/components/ui/ViewToggle'
import { ListIcon, KanbanIcon } from '@/components/ui/icons'
import { isIncidentMine } from '@/utils/involvement'
import { contactsForClients } from '@/utils/contacts'
import OwnersField from '@/components/plan/OwnersField'
import { IncidentStatus, Probability, EntryOwner, TeamMember } from '@/types'
import { exportIncidentsCsv } from '@/utils/exportListsCsv'

function suggestDeadline(priority: Probability): string {
  const days = priority === 'high' ? 2 : priority === 'medium' ? 5 : 10
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const STATUS_COLOR: Record<IncidentStatus, string> = {
  open: 'var(--text-tertiary)',
  in_progress: 'var(--color-info-text)',
  waiting_on_client: 'var(--color-warning-text)',
  resolved: 'var(--color-success-text)',
  closed: 'var(--text-disabled)',
}

const PRIORITY_COLOR: Record<Probability, string> = {
  low: 'var(--text-tertiary)',
  medium: 'var(--color-warning-text)',
  high: 'var(--color-danger-text)',
}

const KANBAN_STATUSES: IncidentStatus[] = ['open', 'in_progress', 'waiting_on_client', 'resolved', 'closed']

export default function IncidentsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { incidents, clients, projects, contacts, teamDirectory, settings, createIncident, addIncidentEntry, addIncidentStakeholder, updateIncident, updateIncidentStatus, linkIncidentClient } = useAppStore()
  const { user } = useAuthStore()

  const [view, setView] = useState<'list' | 'kanban'>(() =>
    (localStorage.getItem('pb-support-view') as 'list' | 'kanban') ?? 'list',
  )
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)

  useEffect(() => { localStorage.setItem('pb-support-view', view) }, [view])
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [newClientIds, setNewClientIds] = useState<string[]>([])
  const [newProjectIds, setNewProjectIds] = useState<string[]>([])
  const [newStakeholders, setNewStakeholders] = useState<EntryOwner[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [projectSearch, setProjectSearch] = useState('')
  const [newOwners, setNewOwners] = useState<EntryOwner[]>([])
  const [priority, setPriority] = useState<Probability>('medium')
  const [impact, setImpact] = useState<Probability>('medium')
  const [deadline, setDeadline] = useState('')
  const [templateId, setTemplateId] = useState('')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkOwnersOpen, setBulkOwnersOpen] = useState(false)
  const [bulkOwners, setBulkOwners] = useState<EntryOwner[]>([])
  const [bulkClientOpen, setBulkClientOpen] = useState(false)
  const [bulkClientId, setBulkClientId] = useState('')

  const directoryAsTeam: TeamMember[] = useMemo(
    () => teamDirectory.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name ?? p.email ?? '', role: '', email: p.email ?? undefined, userId: p.id })),
    [teamDirectory],
  )

  function clientNames(clientIds: string[]): string {
    return clientIds.map((id) => clients.find((c) => c.id === id)?.name).filter(Boolean).join(', ') || '—'
  }

  const filtered = useMemo(() => {
    return incidents.filter((i) => {
      if (onlyMine && !isIncidentMine(i, user?.id)) return false
      if (search.trim()) {
        const haystack = (i.title + ' ' + clientNames(i.clientIds)).toLowerCase()
        if (!haystack.includes(search.trim().toLowerCase())) return false
      }
      if (statusFilter && i.status !== statusFilter) return false
      if (priorityFilter && i.priority !== priorityFilter) return false
      return true
    })
  }, [incidents, search, statusFilter, priorityFilter, onlyMine, user])

  function openAdd() {
    setTitle(''); setNewClientIds([]); setNewProjectIds([]); setNewStakeholders([]); setClientSearch(''); setProjectSearch('')
    setNewOwners([]); setPriority('medium'); setImpact('medium'); setDeadline(''); setTemplateId('')
    setShowAdd(true)
  }

  function toggleNewClient(clientId: string) {
    setNewClientIds((prev) => {
      const next = prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
      // Drop any picked project that no longer belongs to the (updated) client filter.
      setNewProjectIds((prevProjects) =>
        next.length === 0 ? prevProjects : prevProjects.filter((pid) => {
          const proj = projects.find((p) => p.id === pid)
          return !!proj?.clientIds.some((id) => next.includes(id))
        }),
      )
      return next
    })
  }

  function toggleNewProject(projectId: string) {
    setNewProjectIds((prev) => prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId])
  }

  const filteredNewClients = useMemo(
    () => [...clients].sort((a, b) => a.name.localeCompare(b.name)).filter((c) => c.name.toLowerCase().includes(clientSearch.trim().toLowerCase())),
    [clients, clientSearch],
  )

  const filteredNewProjects = useMemo(
    () => [...projects]
      .filter((p) => !p.archived && (newClientIds.length === 0 || p.clientIds.some((id) => newClientIds.includes(id))))
      .filter((p) => p.name.toLowerCase().includes(projectSearch.trim().toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [projects, newClientIds, projectSearch],
  )

  const stakeholderContacts = useMemo(
    () => newClientIds.length > 0 ? contactsForClients(contacts, newClientIds) : [],
    [contacts, newClientIds],
  )

  const bulkOwnerContacts = useMemo(() => {
    const clientIds = [...new Set(incidents.filter((i) => selected.has(i.id)).flatMap((i) => i.clientIds))]
    return clientIds.length > 0 ? contactsForClients(contacts, clientIds) : []
  }, [contacts, incidents, selected])

  function handlePriorityChange(p: Probability) {
    setPriority(p)
    if (!deadline) setDeadline(suggestDeadline(p))
  }

  function applyTemplate(id: string) {
    setTemplateId(id)
    const tpl = settings.incidentTemplates.find((t) => t.id === id)
    if (!tpl) return
    setPriority(tpl.priority)
    setImpact(tpl.impact)
    if (!deadline) setDeadline(suggestDeadline(tpl.priority))
  }

  function handleCreate() {
    if (!title.trim() || newClientIds.length === 0 || !newOwners[0]) return
    const id = createIncident({
      title: title.trim(),
      priority,
      impact,
      deadline: deadline || undefined,
      clientIds: newClientIds,
      projectIds: newProjectIds,
      owner: newOwners[0],
    })
    for (const stakeholder of newStakeholders) addIncidentStakeholder(id, stakeholder)
    const tpl = settings.incidentTemplates.find((t) => t.id === templateId)
    if (tpl) {
      for (const taskTitle of tpl.taskTitles) {
        addIncidentEntry(id, {
          name: taskTitle, type: 'task', responsible: '', dependsOn: [], riskFlag: 'none', status: 'pending', order: 0,
        })
      }
    }
    setShowAdd(false)
    navigate(`/support/${id}`)
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function applyBulkStatus(status: IncidentStatus) {
    for (const id of selected) updateIncidentStatus(id, status)
    setSelected(new Set())
  }

  function applyBulkPriority(p: Probability) {
    for (const id of selected) updateIncident(id, { priority: p })
    setSelected(new Set())
  }

  function applyBulkOwner() {
    const owner = bulkOwners[0]
    if (!owner) return
    for (const id of selected) updateIncident(id, { owner })
    setSelected(new Set())
    setBulkOwnersOpen(false)
  }

  function applyBulkClient() {
    if (!bulkClientId) return
    for (const id of selected) linkIncidentClient(id, bulkClientId)
    setSelected(new Set())
    setBulkClientOpen(false)
  }

  return (
    <div className="p-8 max-w-screen-xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('incident.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{filtered.length} / {incidents.length}</p>
        </div>
        <Button onClick={openAdd}>{t('incident.new')}</Button>
      </div>

      {incidents.length > 0 && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar incidente..." />
          <ViewToggle
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: t('project.viewList'), icon: <ListIcon className="w-3.5 h-3.5" /> },
              { value: 'kanban', label: t('actions.viewKanban'), icon: <KanbanIcon className="w-3.5 h-3.5" /> },
            ]}
          />
          <MineToggle active={onlyMine} onClick={() => setOnlyMine((v) => !v)} />
          <div className="flex-1" />
          <FilterMenu
            activeCount={[statusFilter, priorityFilter].filter(Boolean).length}
            onClear={() => { setStatusFilter(''); setPriorityFilter('') }}
          >
            <Field label={t('incident.colStatus')}>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">{t('incident.filterAllStatus')}</option>
                {(['open', 'in_progress', 'waiting_on_client', 'resolved', 'closed'] as IncidentStatus[]).map((s) => (
                  <option key={s} value={s}>{t(`incident.status_${s}`)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('incident.colPriority')}>
              <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                <option value="">{t('incident.filterAllPriority')}</option>
                <option value="low">{t('risk.low')}</option>
                <option value="medium">{t('risk.medium')}</option>
                <option value="high">{t('risk.high')}</option>
              </Select>
            </Field>
          </FilterMenu>
        </div>
      )}

      {incidents.length === 0 ? (
        <EmptyState icon="🛠️" title={t('incident.noIncidents')} action={{ label: t('incident.createFirst'), onClick: openAdd }} />
      ) : filtered.length === 0 ? (
        <EmptyState icon="🛠️" title="Nenhum incidente encontrado com esses filtros." />
      ) : view === 'kanban' ? (
        <div className="grid grid-cols-5 gap-4">
          {KANBAN_STATUSES.map((status) => {
            const cards = filtered.filter((i) => i.status === status)
            return (
              <div key={status} className="border rounded-[var(--radius-lg)] p-3 min-h-[300px]" style={{ borderColor: 'var(--border-default)', background: 'var(--surface-subtle)' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{t(`incident.status_${status}`)}</span>
                  <span className="rounded-[var(--radius-pill)] text-xs px-2 py-0.5 font-medium border" style={{ background: 'var(--surface-card)', color: 'var(--text-secondary)', borderColor: 'var(--border-default)' }}>
                    {cards.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {cards.map((i) => (
                    <div
                      key={i.id}
                      onClick={() => navigate(`/support/${i.id}`)}
                      role="button"
                      className="w-full text-left rounded-[var(--radius-lg)] p-3 shadow-sm border hover:border-[var(--oe-primary)] hover:shadow transition-all cursor-pointer"
                      style={{ background: 'var(--surface-card)', borderColor: 'var(--border-default)' }}
                    >
                      <p className="font-medium text-sm mb-1 line-clamp-2" style={{ color: 'var(--text-primary)' }}>{i.title}</p>
                      <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>{clientNames(i.clientIds)}</p>
                      <div className="flex items-center justify-between">
                        <AvatarStack people={i.owner ? [{ name: i.owner.name }] : []} size={18} />
                        <StatusDot color={PRIORITY_COLOR[i.priority]} label={t(`risk.${i.priority}`)} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-[var(--radius-lg)] border overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr style={{ background: 'var(--surface-subtle)' }}>
                <th className="px-4 py-2" style={{ width: 32 }} />
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('incident.colTitle')}</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('incident.colClients')}</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Responsável</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('incident.colStatus')}</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('incident.colPriority')}</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('incident.colDeadline')}</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-default)' }}>
              {filtered.map((i) => (
                <tr
                  key={i.id}
                  onClick={() => navigate(`/support/${i.id}`)}
                  className="cursor-pointer transition-colors"
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-subtle)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="rounded border-[var(--border-default)] accent-[var(--oe-primary)]" checked={selected.has(i.id)} onChange={() => toggleSelect(i.id)} />
                  </td>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{i.title}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{clientNames(i.clientIds)}</td>
                  <td className="px-4 py-3">
                    <AvatarStack people={i.owner ? [{ name: i.owner.name }] : []} size={20} />
                  </td>
                  <td className="px-4 py-3"><StatusDot color={STATUS_COLOR[i.status]} label={t(`incident.status_${i.status}`)} /></td>
                  <td className="px-4 py-3"><StatusDot color={PRIORITY_COLOR[i.priority]} label={t(`risk.${i.priority}`)} /></td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{i.deadline ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={showAdd}
        title={t('incident.new')}
        onClose={() => setShowAdd(false)}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAdd(false)}>{t('actions.cancel')}</Button>
            <Button onClick={handleCreate} disabled={!title.trim() || newClientIds.length === 0 || !newOwners[0]}>{t('actions.confirm')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {settings.incidentTemplates.length > 0 && (
            <Field label="Template (opcional)">
              <Select value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">Nenhum</option>
                {settings.incidentTemplates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label={t('incident.colTitle')} required>
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label={t('incident.colClients')} required>
            {clients.length > 3 && (
              <Input
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Buscar cliente..."
                className="mb-2"
              />
            )}
            <div className="border rounded-[var(--radius-lg)] max-h-40 overflow-y-auto p-2 space-y-1" style={{ borderColor: 'var(--border-default)' }}>
              {filteredNewClients.length === 0 ? (
                <p className="text-xs px-1 py-1" style={{ color: 'var(--text-tertiary)' }}>
                  {clients.length === 0 ? 'Nenhum cliente cadastrado ainda.' : 'Nada encontrado.'}
                </p>
              ) : (
                filteredNewClients.map((c) => (
                  <label key={c.id} className="flex items-center gap-2.5 p-1 rounded hover:bg-[var(--surface-subtle)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newClientIds.includes(c.id)}
                      onChange={() => toggleNewClient(c.id)}
                      className="rounded border-[var(--border-strong)] accent-[var(--oe-primary)]"
                    />
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{c.name}</span>
                  </label>
                ))
              )}
            </div>
          </Field>
          <Field label={t('incident.colProjects' as any)}>
            {projects.length > 3 && (
              <Input
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="Buscar projeto..."
                className="mb-2"
              />
            )}
            <div className="border rounded-[var(--radius-lg)] max-h-40 overflow-y-auto p-2 space-y-1" style={{ borderColor: 'var(--border-default)' }}>
              {filteredNewProjects.length === 0 ? (
                <p className="text-xs px-1 py-1" style={{ color: 'var(--text-tertiary)' }}>Nada encontrado.</p>
              ) : (
                filteredNewProjects.map((p) => (
                  <label key={p.id} className="flex items-center gap-2.5 p-1 rounded hover:bg-[var(--surface-subtle)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newProjectIds.includes(p.id)}
                      onChange={() => toggleNewProject(p.id)}
                      className="rounded border-[var(--border-strong)] accent-[var(--oe-primary)]"
                    />
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{p.name}</span>
                  </label>
                ))
              )}
            </div>
          </Field>
          <Field label="Responsável" required>
            <OwnersField owners={newOwners.slice(0, 1)} onChange={(owners) => setNewOwners(owners.slice(-1))} teamMembers={directoryAsTeam} contacts={stakeholderContacts} />
          </Field>
          <Field label={t('incident.stakeholders' as any)}>
            <OwnersField owners={newStakeholders} onChange={setNewStakeholders} teamMembers={directoryAsTeam} contacts={stakeholderContacts} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('incident.priority')} hint="Urgência de resolução: Alta = ação imediata, Média = prazo normal, Baixa = pode aguardar.">
              <Select value={priority} onChange={(e) => handlePriorityChange(e.target.value as Probability)}>
                <option value="low">{t('risk.low')}</option>
                <option value="medium">{t('risk.medium')}</option>
                <option value="high">{t('risk.high')}</option>
              </Select>
            </Field>
            <Field label={t('incident.impact')} hint="Quanto esse incidente afeta a operação do cliente: Alta = trava processos/muitos usuários, Média = afeta parcialmente, Baixa = afeta pouco.">
              <Select value={impact} onChange={(e) => setImpact(e.target.value as Probability)}>
                <option value="low">{t('risk.low')}</option>
                <option value="medium">{t('risk.medium')}</option>
                <option value="high">{t('risk.high')}</option>
              </Select>
            </Field>
          </div>
          <Field label={t('incident.deadline')}>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <SelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <select
          onChange={(e) => { if (e.target.value) applyBulkStatus(e.target.value as IncidentStatus) }}
          value=""
          className="text-xs rounded-[var(--radius-md)] px-2 py-1"
          style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none' }}
        >
          <option value="" disabled>Alterar status...</option>
          {(['open', 'in_progress', 'waiting_on_client', 'resolved', 'closed'] as IncidentStatus[]).map((s) => (
            <option key={s} value={s}>{t(`incident.status_${s}`)}</option>
          ))}
        </select>
        <select
          onChange={(e) => { if (e.target.value) applyBulkPriority(e.target.value as Probability) }}
          value=""
          className="text-xs rounded-[var(--radius-md)] px-2 py-1"
          style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none' }}
        >
          <option value="" disabled>Alterar prioridade...</option>
          <option value="low">{t('risk.low')}</option>
          <option value="medium">{t('risk.medium')}</option>
          <option value="high">{t('risk.high')}</option>
        </select>
        <button
          onClick={() => { setBulkOwners([]); setBulkOwnersOpen(true) }}
          className="text-xs px-2 py-1 rounded-[var(--radius-md)]"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          Alterar responsável
        </button>
        <button
          onClick={() => { setBulkClientId(''); setBulkClientOpen(true) }}
          className="text-xs px-2 py-1 rounded-[var(--radius-md)]"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          Vincular cliente
        </button>
      </SelectionBar>

      <Modal
        open={bulkOwnersOpen}
        title={`Alterar responsável de ${selected.size} item(ns)`}
        onClose={() => setBulkOwnersOpen(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkOwnersOpen(false)}>{t('actions.cancel')}</Button>
            <Button onClick={applyBulkOwner} disabled={!bulkOwners[0]}>{t('actions.confirm')}</Button>
          </>
        }
      >
        <OwnersField owners={bulkOwners.slice(0, 1)} onChange={(owners) => setBulkOwners(owners.slice(-1))} teamMembers={directoryAsTeam} contacts={bulkOwnerContacts} />
      </Modal>

      <Modal
        open={bulkClientOpen}
        title={`Vincular cliente a ${selected.size} item(ns)`}
        onClose={() => setBulkClientOpen(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkClientOpen(false)}>{t('actions.cancel')}</Button>
            <Button onClick={applyBulkClient} disabled={!bulkClientId}>{t('actions.confirm')}</Button>
          </>
        }
      >
        <Field label={t('incident.colClients')}>
          <Select value={bulkClientId} onChange={(e) => setBulkClientId(e.target.value)}>
            <option value="">—</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </Modal>

      {incidents.length > 0 && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => exportIncidentsCsv(filtered, clients)}
            className="text-xs transition-colors"
            style={{ color: 'var(--text-disabled)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-disabled)')}
          >
            <span className="mr-1">↓</span>Exportar CSV
          </button>
        </div>
      )}
    </div>
  )
}
