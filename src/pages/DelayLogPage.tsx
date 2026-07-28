import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { DelayLogEntry, DelayResponsibility, DelayType, Phase } from '@/types'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea, Field } from '@/components/ui/Input'

const RESPONSIBILITY_KEYS: DelayResponsibility[] = ['internal', 'client_business', 'client_it', 'client_provider']
const TYPE_KEYS: DelayType[] = ['execution', 'definition', 'planning']

const RESPONSIBILITY_VARIANT: Record<DelayResponsibility, 'blue' | 'orange' | 'purple' | 'yellow'> = {
  internal: 'blue',
  client_business: 'orange',
  client_it: 'purple',
  client_provider: 'yellow',
}

const RESPONSIBILITY_BAR_COLOR: Record<DelayResponsibility, string> = {
  internal: 'bg-blue-400',
  client_business: 'bg-orange-400',
  client_it: 'bg-purple-400',
  client_provider: 'bg-yellow-400',
}

function getAllEntries(phases: Phase[]) {
  const result: { id: string; name: string; rawName: string }[] = []
  for (const ph of phases) {
    for (const e of ph.entries) {
      result.push({ id: e.id, name: `[${ph.name}] ${e.name}`, rawName: e.name })
      for (const sub of e.subtasks) {
        result.push({ id: sub.id, name: `[${ph.name}] ${e.name} / ${sub.name}`, rawName: `${e.name} / ${sub.name}` })
      }
    }
  }
  return result
}

// ─── Shared Delay Modal (add + edit) ─────────────────────────────────────────

interface DelayModalProps {
  projectId: string
  allEntries: { id: string; name: string; rawName: string }[]
  initial?: DelayLogEntry
  onClose: () => void
}

function DelayModal({ projectId, allEntries, initial, onClose }: DelayModalProps) {
  const { t } = useTranslation()
  const { addDelayLogEntry, updateDelayLogEntry } = useAppStore()
  const isCascade = initial?.triggeredBy === 'cascade'
  const isEdit = !!initial

  const [form, setForm] = useState({
    entryId: initial?.entryId ?? allEntries[0]?.id ?? '',
    days: initial?.days ?? 1,
    responsibility: initial?.responsibility ?? ('internal' as DelayResponsibility),
    type: initial?.type ?? ('execution' as DelayType),
    description: initial?.description ?? '',
    comments: initial?.comments ?? '',
    date: initial?.date ?? new Date().toISOString().split('T')[0],
  })

  function handleSave() {
    if (!form.entryId) return
    const entry = allEntries.find((e) => e.id === form.entryId)
    if (isEdit) {
      updateDelayLogEntry(projectId, initial!.id, {
        entryId: form.entryId,
        entryName: entry?.rawName ?? initial!.entryName,
        date: form.date,
        days: form.days,
        responsibility: form.responsibility,
        type: form.type,
        description: form.description,
        comments: form.comments,
      })
    } else {
      addDelayLogEntry(projectId, {
        entryId: form.entryId,
        entryName: entry?.rawName ?? '',
        date: form.date,
        days: form.days,
        responsibility: form.responsibility,
        type: form.type,
        description: form.description,
        comments: form.comments,
        triggeredBy: 'manual',
      })
    }
    onClose()
  }

  return (
    <Modal
      open
      title={isEdit ? t('delay.editModal') : t('delay.registerModal')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button onClick={handleSave} disabled={!form.entryId}>{t('delay.confirm')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {isCascade && (
          <div className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <svg className="w-3.5 h-3.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            {t('delay.autoWarning')}
          </div>
        )}
        <Field label={t('delay.selectEntry')} required>
          <Select value={form.entryId} onChange={(e) => setForm((f) => ({ ...f, entryId: e.target.value }))}>
            {allEntries.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('delay.days')}>
            <Input
              type="number"
              value={form.days}
              onChange={(e) => setForm((f) => ({ ...f, days: Number(e.target.value) }))}
            />
          </Field>
          <Field label={t('delay.date')}>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </Field>
          <Field label={t('delay.responsibility')}>
            <Select
              value={form.responsibility}
              onChange={(e) => setForm((f) => ({ ...f, responsibility: e.target.value as DelayResponsibility }))}
            >
              {RESPONSIBILITY_KEYS.map((k) => (
                <option key={k} value={k}>{t(`delay.${k}` as any)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('delay.type')}>
            <Select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as DelayType }))}
            >
              {TYPE_KEYS.map((k) => (
                <option key={k} value={k}>{t(`delay.${k}` as any)}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t('delay.description')}>
          <Textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
            placeholder="…"
          />
        </Field>
        <Field label={t('delay.comments')}>
          <Textarea
            value={form.comments}
            onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))}
            rows={2}
            placeholder="…"
          />
        </Field>
      </div>
    </Modal>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface DelayLogPageProps { projectId: string }

export default function DelayLogPage({ projectId }: DelayLogPageProps) {
  const { t } = useTranslation()
  const { projects, deleteDelayLogEntry } = useAppStore()
  const project = projects.find((p) => p.id === projectId)!
  const [showAdd, setShowAdd] = useState(false)
  const [editEntry, setEditEntry] = useState<DelayLogEntry | null>(null)

  const hasBaseline = !!project.baselineSetAt

  const log = useMemo(() => [...project.delayLog].sort((a, b) => b.date.localeCompare(a.date)), [project.delayLog])
  const allEntries = useMemo(() => getAllEntries(project.phases), [project.phases])

  const totalDays = log.reduce((s, e) => s + e.days, 0)

  const byResponsibility = useMemo(() => {
    const counts: Record<DelayResponsibility, number> = {
      internal: 0, client_business: 0, client_it: 0, client_provider: 0,
    }
    for (const e of log) {
      if (e.days > 0) counts[e.responsibility] += e.days
    }
    return counts
  }, [log])

  const totalPositiveDays = Object.values(byResponsibility).reduce((s, v) => s + v, 0)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text-secondary)]">{t('delay.logTitle')}</h2>
        <Button
          size="sm"
          onClick={() => setShowAdd(true)}
          disabled={!hasBaseline}
          title={!hasBaseline ? t('delay.noBaseline') : undefined}
        >
          {t('delay.add')}
        </Button>
      </div>

      {/* No-baseline warning */}
      {!hasBaseline && (
        <div className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <svg className="w-4 h-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          {t('delay.noBaseline')}
        </div>
      )}

      {/* Summary cards */}
      {log.length > 0 && (
        <div className="grid grid-cols-5 gap-3">
          <div className={`rounded-[var(--radius-lg)] border p-4 ${totalDays > 0 ? 'border-red-200 bg-red-50' : totalDays < 0 ? 'border-green-200 bg-green-50' : 'border-[var(--border-default)] bg-[var(--surface-card)]'}`}>
            <p className="text-xs text-[var(--text-tertiary)] mb-1">{t('delay.total')}</p>
            <p className={`text-2xl font-bold ${totalDays > 0 ? 'text-red-600' : totalDays < 0 ? 'text-green-600' : 'text-[var(--text-tertiary)]'}`}>
              {totalDays > 0 ? '+' : ''}{totalDays}d
            </p>
          </div>
          {RESPONSIBILITY_KEYS.map((k) => (
            <div key={k} className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-card)] p-4">
              <p className="text-xs text-[var(--text-tertiary)] mb-1 leading-tight">{t(`delay.${k}` as any)}</p>
              <p className={`text-2xl font-bold ${byResponsibility[k] > 0 ? 'text-[var(--text-secondary)]' : 'text-[var(--text-disabled)]'}`}>{byResponsibility[k]}d</p>
            </div>
          ))}
        </div>
      )}

      {/* Distribution bar */}
      {totalPositiveDays > 0 && (
        <div>
          <p className="text-xs text-[var(--text-tertiary)] mb-2 font-medium uppercase tracking-wide">{t('delay.distribution')}</p>
          <div className="flex h-3 rounded-[var(--radius-pill)] overflow-hidden gap-px bg-[var(--surface-subtle)]">
            {RESPONSIBILITY_KEYS
              .filter((k) => byResponsibility[k] > 0)
              .map((k) => (
                <div
                  key={k}
                  title={`${t(`delay.${k}` as any)}: ${byResponsibility[k]}d (${Math.round((byResponsibility[k] / totalPositiveDays) * 100)}%)`}
                  className={`${RESPONSIBILITY_BAR_COLOR[k]} transition-all`}
                  style={{ width: `${(byResponsibility[k] / totalPositiveDays) * 100}%` }}
                />
              ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {RESPONSIBILITY_KEYS
              .filter((k) => byResponsibility[k] > 0)
              .map((k) => (
                <div key={k} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-[var(--radius-pill)] shrink-0 ${RESPONSIBILITY_BAR_COLOR[k]}`} />
                  <span className="text-xs text-[var(--text-tertiary)]">
                    {t(`delay.${k}` as any)} ({Math.round((byResponsibility[k] / totalPositiveDays) * 100)}%)
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Table */}
      {log.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-tertiary)]">
          <div className="text-4xl mb-2">📋</div>
          <p>{t('delay.noEntries')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border-default)] shadow-[var(--shadow-sm)] bg-[var(--surface-card)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-subtle)] border-b border-[var(--border-default)]">
              <tr>
                {[t('delay.date'), t('delay.selectEntry'), t('delay.days'), t('delay.responsibility'), t('delay.type'), t('delay.description'), t('delay.comments'), t('delay.origin'), ''].map((h, i) => (
                  <th key={i} className="text-left px-3 py-2.5 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {log.map((entry) => (
                <tr key={entry.id} className="border-b border-[var(--border-default)] hover:bg-[var(--surface-subtle)] group">
                  <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      {entry.date.split('-').reverse().join('/')}
                      {entry.triggeredBy === 'cascade' && (
                        <span className="bg-[var(--surface-subtle)] text-[var(--text-tertiary)] text-[10px] px-1 rounded">auto</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text-secondary)] max-w-[180px] truncate" title={entry.entryName}>
                    {entry.entryName}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`font-semibold text-sm ${entry.days > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {entry.days > 0 ? '+' : ''}{entry.days}d
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={RESPONSIBILITY_VARIANT[entry.responsibility]}>
                      {t(`delay.${entry.responsibility}` as any)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="gray">{t(`delay.${entry.type}` as any)}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)] max-w-[160px] truncate" title={entry.description}>
                    {entry.description || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)] max-w-[160px] truncate" title={entry.comments}>
                    {entry.comments || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={entry.triggeredBy === 'manual' ? 'blue' : 'gray'}>
                      {entry.triggeredBy === 'manual' ? t('delay.manual') : t('delay.auto')}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditEntry(entry)}
                        className="text-xs text-[var(--text-tertiary)] hover:text-[var(--color-info-text)] px-1.5 py-1 rounded hover:bg-[var(--color-info-bg)]"
                      >
                        {t('actions.edit')}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(t('delay.deleteConfirm'))) {
                            deleteDelayLogEntry(projectId, entry.id)
                          }
                        }}
                        className="text-[var(--text-disabled)] hover:text-[var(--color-danger-text)] p-1 rounded hover:bg-[var(--color-danger-bg)] transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <DelayModal
          projectId={projectId}
          allEntries={allEntries}
          onClose={() => setShowAdd(false)}
        />
      )}

      {editEntry && (
        <DelayModal
          projectId={projectId}
          allEntries={allEntries}
          initial={editEntry}
          onClose={() => setEditEntry(null)}
        />
      )}
    </div>
  )
}
