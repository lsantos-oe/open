import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Field } from '@/components/ui/Input'
import { SelectionBar } from '@/components/ui/SelectionBar'
import { isIncidentMine } from '@/utils/involvement'
import OwnersField from '@/components/plan/OwnersField'
import { IncidentStatus, Probability, EntryOwner, TeamMember } from '@/types'

const STATUS_VARIANT: Record<IncidentStatus, 'gray' | 'primary' | 'orange' | 'green' | 'red'> = {
  open: 'gray',
  in_progress: 'primary',
  waiting_on_client: 'orange',
  resolved: 'green',
  closed: 'red',
}

export default function IncidentsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { incidents, clients, teamDirectory, createIncident, updateIncident, updateIncidentStatus, linkIncidentClient } = useAppStore()
  const { user } = useAuthStore()

  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Probability>('medium')
  const [impact, setImpact] = useState<Probability>('medium')
  const [deadline, setDeadline] = useState('')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkOwnersOpen, setBulkOwnersOpen] = useState(false)
  const [bulkOwners, setBulkOwners] = useState<EntryOwner[]>([])
  const [bulkClientOpen, setBulkClientOpen] = useState(false)
  const [bulkClientId, setBulkClientId] = useState('')

  const directoryAsTeam: TeamMember[] = useMemo(
    () => teamDirectory.map((p) => ({ id: p.id, name: p.name ?? p.email ?? '', role: '', email: p.email ?? undefined, userId: p.id })),
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
    setTitle(''); setPriority('medium'); setImpact('medium'); setDeadline('')
    setShowAdd(true)
  }

  function handleCreate() {
    if (!title.trim()) return
    const id = createIncident({ title: title.trim(), priority, impact, deadline: deadline || undefined })
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
            className="text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
            style={onlyMine
              ? { background: 'var(--oe-primary)', color: 'white' }
              : { border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
          >
            Meus
          </button>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto">
            <option value="">{t('incident.filterAllStatus')}</option>
            {(['open', 'in_progress', 'waiting_on_client', 'resolved', 'closed'] as IncidentStatus[]).map((s) => (
              <option key={s} value={s}>{t(`incident.status_${s}`)}</option>
            ))}
          </Select>
          <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="w-auto">
            <option value="">{t('incident.filterAllPriority')}</option>
            <option value="low">{t('risk.low')}</option>
            <option value="medium">{t('risk.medium')}</option>
            <option value="high">{t('risk.high')}</option>
          </Select>
        </div>
      )}

      {incidents.length === 0 ? (
        <div className="text-center py-24" style={{ color: 'var(--text-tertiary)' }}>
          <div className="text-6xl mb-4">🛠️</div>
          <p className="text-sm mb-6">{t('incident.noIncidents')}</p>
          <Button onClick={openAdd}>{t('incident.createFirst')}</Button>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--surface-subtle)' }}>
                <th className="px-4 py-2" style={{ width: 32 }} />
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('incident.colTitle')}</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('incident.colClients')}</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('incident.colStatus')}</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('incident.colPriority')}</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('incident.colDeadline')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr
                  key={i.id}
                  onClick={() => navigate(`/support/${i.id}`)}
                  className="cursor-pointer transition-colors border-t"
                  style={{ borderColor: 'var(--border-default)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-subtle)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggleSelect(i.id)} />
                  </td>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{i.title}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{clientNames(i.clientIds)}</td>
                  <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[i.status]}>{t(`incident.status_${i.status}`)}</Badge></td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{t(`risk.${i.priority}`)}</td>
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
            <Button onClick={handleCreate} disabled={!title.trim()}>{t('actions.confirm')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('incident.colTitle')} required>
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('incident.priority')}>
              <Select value={priority} onChange={(e) => setPriority(e.target.value as Probability)}>
                <option value="low">{t('risk.low')}</option>
                <option value="medium">{t('risk.medium')}</option>
                <option value="high">{t('risk.high')}</option>
              </Select>
            </Field>
            <Field label={t('incident.impact')}>
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
          className="text-xs rounded-md px-2 py-1"
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
          className="text-xs rounded-md px-2 py-1"
          style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none' }}
        >
          <option value="" disabled>Alterar prioridade...</option>
          <option value="low">{t('risk.low')}</option>
          <option value="medium">{t('risk.medium')}</option>
          <option value="high">{t('risk.high')}</option>
        </select>
        <button
          onClick={() => { setBulkOwners([]); setBulkOwnersOpen(true) }}
          className="text-xs px-2 py-1 rounded-md"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          Alterar responsável
        </button>
        <button
          onClick={() => { setBulkClientId(''); setBulkClientOpen(true) }}
          className="text-xs px-2 py-1 rounded-md"
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
    </div>
  )
}
