import { useMemo, useState } from 'react'
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
import { isIncidentMine } from '@/utils/involvement'
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

export default function IncidentsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { incidents, clients, teamDirectory, settings, createIncident, addIncidentEntry, updateIncident, updateIncidentStatus, linkIncidentClient } = useAppStore()
  const { user } = useAuthStore()

  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [newClientIds, setNewClientIds] = useState<string[]>([])
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

  const filtered = useMemo(() => {
    return incidents.filter((i) => {
      if (onlyMine && !isIncidentMine(i, user?.id)) return false
      if (statusFilter && i.status !== statusFilter) return false
      if (priorityFilter && i.priority !== priorityFilter) return false
      return true
    })
  }, [incidents, statusFilter, priorityFilter, onlyMine, user])

  function clientNames(clientIds: string[]): string {
    return clientIds.map((id) => clients.find((c) => c.id === id)?.name).filter(Boolean).join(', ') || '—'
  }

  function openAdd() {
    setTitle(''); setNewClientIds([]); setNewOwners([]); setPriority('medium'); setImpact('medium'); setDeadline(''); setTemplateId('')
    setShowAdd(true)
  }

  function toggleNewClient(clientId: string) {
    setNewClientIds((prev) => prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId])
  }

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
      owner: newOwners[0],
    })
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
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <button
            onClick={() => setOnlyMine((v) => !v)}
            className="text-xs font-medium px-3 py-1.5 rounded-[var(--radius-pill)] transition-colors"
            style={onlyMine
              ? { background: 'var(--oe-primary)', color: 'white' }
              : { border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
          >
            Meus
          </button>
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
        size="sm"
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
            <div className="border rounded-[var(--radius-lg)] max-h-40 overflow-y-auto p-2 space-y-1" style={{ borderColor: 'var(--border-default)' }}>
              {clients.length === 0 ? (
                <p className="text-xs px-1 py-1" style={{ color: 'var(--text-tertiary)' }}>Nenhum cliente cadastrado ainda.</p>
              ) : (
                [...clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
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
          <Field label="Responsável" required>
            <OwnersField owners={newOwners.slice(0, 1)} onChange={(owners) => setNewOwners(owners.slice(-1))} teamMembers={directoryAsTeam} />
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
        <OwnersField owners={bulkOwners.slice(0, 1)} onChange={(owners) => setBulkOwners(owners.slice(-1))} teamMembers={directoryAsTeam} />
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
