import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Field } from '@/components/ui/Input'
import { IncidentStatus, Probability } from '@/types'

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
  const { incidents, clients, createIncident } = useAppStore()

  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Probability>('medium')
  const [impact, setImpact] = useState<Probability>('medium')
  const [deadline, setDeadline] = useState('')

  const filtered = useMemo(() => {
    return incidents.filter((i) => {
      if (statusFilter && i.status !== statusFilter) return false
      if (priorityFilter && i.priority !== priorityFilter) return false
      return true
    })
  }, [incidents, statusFilter, priorityFilter])

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
    </div>
  )
}
