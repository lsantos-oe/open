import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { Entry, EntryType, EntryStatus, RiskFlag, Phase } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select, Field } from '@/components/ui/Input'

interface Props {
  open: boolean
  projectId: string
  phases: Phase[]
  defaultType: EntryType
  defaultPhaseId?: string
  parentId?: string
  parentEntryId?: string
  entryNameMap: Map<string, string>
  onClose: () => void
}

type Form = {
  name: string
  type: EntryType
  phaseId: string
  responsible: string
  status: EntryStatus
  riskFlag: RiskFlag
  plannedStart: string
  plannedEnd: string
  plannedDate: string
  durationDays: number
  durationHours: number
  dependsOn: string[]
  order: number
  linkedParentId: string
}

const TYPE_ICONS: Record<EntryType, string> = { task: '✅', milestone: '🏁', meeting: '📅' }

export default function AddEntryModal({
  open, projectId, phases, defaultType, defaultPhaseId, parentId, parentEntryId, entryNameMap, onClose,
}: Props) {
  const { t } = useTranslation()
  const { addEntry, addSubtask } = useAppStore()

  const initialPhaseId = defaultPhaseId ?? phases[0]?.id ?? ''

  const [form, setForm] = useState<Form>({
    name: '',
    type: defaultType,
    phaseId: initialPhaseId,
    responsible: '',
    status: 'pending',
    riskFlag: 'none',
    plannedStart: '',
    plannedEnd: '',
    plannedDate: '',
    durationDays: 1,
    durationHours: 1,
    dependsOn: [],
    order: 0,
    linkedParentId: parentEntryId ?? '',
  })

  const stableDefault = defaultType
  useMemo(() => {
    setForm((f) => ({
      ...f,
      type: stableDefault,
      phaseId: defaultPhaseId ?? phases[0]?.id ?? '',
      linkedParentId: parentEntryId ?? '',
    }))
  }, [stableDefault, defaultPhaseId, parentEntryId, open])

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function toggleDep(id: string) {
    setForm((f) => ({
      ...f,
      dependsOn: f.dependsOn.includes(id)
        ? f.dependsOn.filter((d) => d !== id)
        : [...f.dependsOn, id],
    }))
  }

  const [endDateError, setEndDateError] = useState('')

  function handleSave() {
    if (!form.name.trim() || !form.phaseId) return
    if (form.type === 'task' && form.plannedStart && form.plannedEnd && form.plannedEnd < form.plannedStart) {
      setEndDateError(t('errors.endBeforeStart'))
      return
    }
    setEndDateError('')

    const base: Omit<Entry, 'id' | 'isCritical' | 'comments' | 'links' | 'subtasks'> = {
      name: form.name.trim(),
      type: form.type,
      responsible: form.responsible,
      status: form.status,
      riskFlag: form.riskFlag,
      dependsOn: form.dependsOn,
      order: form.order,
      plannedStart: form.type === 'task' ? form.plannedStart || undefined : undefined,
      plannedEnd: form.type === 'task' ? form.plannedEnd || undefined : undefined,
      plannedDate: form.type !== 'task' ? form.plannedDate || undefined : undefined,
      durationDays: form.type === 'task' ? form.durationDays : undefined,
      durationHours: form.type === 'meeting' ? form.durationHours : undefined,
      parentEntryId: form.type === 'meeting' && form.linkedParentId ? form.linkedParentId : undefined,
    }

    if (parentId) {
      addSubtask(projectId, form.phaseId, parentId, base)
    } else {
      addEntry(projectId, form.phaseId, base)
    }

    onClose()
  }

  const availableParentTasks = useMemo(() => {
    const result: { id: string; name: string; phaseId: string }[] = []
    for (const ph of phases) {
      for (const e of ph.entries) {
        if (e.type === 'task') result.push({ id: e.id, name: e.name, phaseId: ph.id })
      }
    }
    return result
  }, [phases])

  // Find parent task for date-range warning
  const parentTask = form.type === 'meeting' && form.linkedParentId
    ? availableParentTasks.find((t) => t.id === form.linkedParentId)
      ? phases.flatMap((ph) => ph.entries).find((e) => e.id === form.linkedParentId)
      : undefined
    : undefined
  const parentEndWarning = parentTask?.plannedEnd && form.plannedDate && form.plannedDate > parentTask.plannedEnd

  const availableDeps = useMemo(() => {
    const result: { id: string; name: string; phaseId: string; phaseName: string }[] = []
    for (const ph of phases) {
      for (const e of ph.entries) {
        result.push({ id: e.id, name: e.name, phaseId: ph.id, phaseName: ph.name })
        for (const sub of e.subtasks) {
          result.push({ id: sub.id, name: `${e.name} / ${sub.name}`, phaseId: ph.id, phaseName: ph.name })
        }
      }
    }
    return result
  }, [phases])

  const isSubtask = !!parentId

  return (
    <Modal
      open={open}
      title={isSubtask ? t('entry.addSubtask') : t('entry.addEntry')}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button onClick={handleSave} disabled={!form.name.trim()}>{t('actions.confirm')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Type selector */}
        {!isSubtask && !parentEntryId && (
          <div className="flex gap-2">
            {(['task', 'milestone', 'meeting'] as EntryType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => set('type', type)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[var(--radius-lg)] border-2 text-sm font-medium transition-colors ${
                  form.type === type
                    ? 'border-[var(--oe-primary)] bg-[var(--color-info-bg)] text-[var(--color-info-text)]'
                    : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--oe-primary)]'
                }`}
              >
                <span>{TYPE_ICONS[type]}</span>
                {t(`entry.${type}` as any)}
              </button>
            ))}
          </div>
        )}

        {/* Main fields */}
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('entry.name')} required className="col-span-2">
            <Input
              autoFocus
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </Field>

          {!isSubtask && (
            <Field label={t('plan.phase')}>
              <Select value={form.phaseId} onChange={(e) => set('phaseId', e.target.value)}>
                {phases.map((ph) => (
                  <option key={ph.id} value={ph.id}>{ph.name}</option>
                ))}
              </Select>
            </Field>
          )}

          <Field label={t('entry.responsible')}>
            <Input value={form.responsible} onChange={(e) => set('responsible', e.target.value)} />
          </Field>

          {form.type === 'task' && (
            <>
              <Field label={t('entry.plannedStart')}>
                <Input type="date" value={form.plannedStart} onChange={(e) => set('plannedStart', e.target.value)} />
              </Field>
              <Field label={t('entry.plannedEnd')}>
                <Input
                  type="date"
                  value={form.plannedEnd}
                  onChange={(e) => { set('plannedEnd', e.target.value); setEndDateError('') }}
                  className={endDateError ? 'border-red-500' : ''}
                />
                {endDateError && <p className="text-xs text-[var(--color-danger-text)] mt-1">{endDateError}</p>}
              </Field>
              <Field label={t('entry.duration')}>
                <Input type="number" min={1} value={form.durationDays} onChange={(e) => set('durationDays', Number(e.target.value))} />
              </Field>
            </>
          )}

          {form.type !== 'task' && (
            <Field label={t('entry.plannedDate')}>
              <Input type="date" value={form.plannedDate} onChange={(e) => set('plannedDate', e.target.value)} />
            </Field>
          )}

          {form.type === 'meeting' && (
            <Field label={t('entry.durationHours')}>
              <Input type="number" min={0.5} step={0.5} value={form.durationHours} onChange={(e) => set('durationHours', Number(e.target.value))} />
            </Field>
          )}

          {form.type === 'meeting' && (
            <Field label={t('plan.linkedTask')} className="col-span-2">
              <Select
                value={form.linkedParentId}
                onChange={(e) => set('linkedParentId', e.target.value)}
                disabled={!!parentEntryId}
              >
                <option value="">— {t('plan.linkedTaskNone')} —</option>
                {availableParentTasks.map((task) => (
                  <option key={task.id} value={task.id}>{task.name}</option>
                ))}
              </Select>
              {parentEndWarning && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠ {t('plan.childMeetingOutOfRange')}
                </p>
              )}
            </Field>
          )}

          <Field label={t('entry.status')}>
            <Select value={form.status} onChange={(e) => set('status', e.target.value as EntryStatus)}>
              <option value="pending">{t('entry.pending')}</option>
              <option value="in_progress">{t('entry.in_progress')}</option>
              <option value="done">{t('entry.done')}</option>
              <option value="blocked">{t('entry.blocked')}</option>
            </Select>
          </Field>
        </div>

        {/* Dependencies */}
        {availableDeps.length > 0 && (
          <div>
            <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">{t('plan.dependencies')}</p>
            <div className="border border-[var(--border-default)] rounded-[var(--radius-lg)] max-h-36 overflow-y-auto p-2 space-y-1">
              {availableDeps.map((dep) => (
                <label key={dep.id} className="flex items-center gap-2.5 p-1.5 rounded hover:bg-[var(--surface-subtle)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.dependsOn.includes(dep.id)}
                    onChange={() => toggleDep(dep.id)}
                    className="rounded border-[var(--border-default)] text-[var(--oe-primary)]"
                  />
                  <span className="text-xs text-[var(--text-tertiary)] shrink-0">{dep.phaseName}</span>
                  <span className="text-sm text-[var(--text-secondary)]">{dep.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
