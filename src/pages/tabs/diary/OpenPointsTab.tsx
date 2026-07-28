import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore, DiaryScope } from '@/store/useAppStore'
import { OpenPoint, OpenPointStatus, OpenPointPriority, Phase } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select, Field } from '@/components/ui/Input'
import DiaryComments from '@/components/diary/DiaryComments'
import FileAttachments from '@/components/diary/FileAttachments'

const PRIORITY_COLORS: Record<OpenPointPriority, string> = {
  low: 'var(--color-info-text)',
  medium: 'var(--color-warning-text, #d97706)',
  high: 'var(--color-danger-text)',
}

const PRIORITY_BG: Record<OpenPointPriority, string> = {
  low: 'var(--color-info-bg)',
  medium: 'var(--color-warning-bg, #fffbeb)',
  high: 'var(--color-danger-bg)',
}

interface Props {
  scope: DiaryScope
  openPoints: OpenPoint[]
  phases: Phase[]
}

interface OpForm {
  title: string
  description: string
  priority: OpenPointPriority
  responsible: string
  dueDate: string
  linkedEntryId: string
}

function emptyForm(): OpForm {
  return { title: '', description: '', priority: 'medium', responsible: '', dueDate: '', linkedEntryId: '' }
}

interface OpFormFieldsProps {
  form: OpForm
  set: <K extends keyof OpForm>(k: K, v: OpForm[K]) => void
  allEntries: { id: string; name: string }[]
}

function OpFormFields({ form, set, allEntries }: OpFormFieldsProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <Field label={t('diary.opTitle')} required>
        <Input autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} />
      </Field>
      <Field label={t('diary.opDescription')}>
        <textarea
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          rows={3}
          className="block w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1"
          style={{ borderColor: 'var(--border-default)', background: 'var(--surface-input)', color: 'var(--text-primary)', resize: 'none' }}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('diary.opPriority')}>
          <Select value={form.priority} onChange={(e) => set('priority', e.target.value as OpenPointPriority)}>
            <option value="low">{t('diary.priorityLow')}</option>
            <option value="medium">{t('diary.priorityMedium')}</option>
            <option value="high">{t('diary.priorityHigh')}</option>
          </Select>
        </Field>
        <Field label={t('diary.opResponsible')}>
          <Input value={form.responsible} onChange={(e) => set('responsible', e.target.value)} />
        </Field>
        <Field label={t('diary.opDueDate')}>
          <Input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
        </Field>
        <Field label={t('diary.opLinkedEntry')}>
          <Select value={form.linkedEntryId} onChange={(e) => set('linkedEntryId', e.target.value)}>
            <option value="">—</option>
            {allEntries.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
      </div>
    </div>
  )
}

export default function OpenPointsTab({ scope, openPoints, phases }: Props) {
  const { t } = useTranslation()
  const { addOpenPoint, updateOpenPoint, resolveOpenPoint, deleteOpenPoint, addDiaryAttachment, removeDiaryAttachment } = useAppStore()

  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open')
  const [showAdd, setShowAdd] = useState(false)
  const [editOp, setEditOp] = useState<OpenPoint | null>(null)
  const [resolveOp, setResolveOp] = useState<OpenPoint | null>(null)
  const [resolution, setResolution] = useState('')
  const [drawerOp, setDrawerOp] = useState<OpenPoint | null>(null)
  const [form, setForm] = useState<OpForm>(emptyForm())

  const allEntries = useMemo(() => {
    const result: { id: string; name: string }[] = []
    for (const ph of phases) {
      for (const e of ph.entries) {
        result.push({ id: e.id, name: `${ph.name} / ${e.name}` })
      }
    }
    return result
  }, [phases])

  const filtered = useMemo(() => {
    if (filter === 'all') return openPoints
    return openPoints.filter((op) => op.status === filter)
  }, [openPoints, filter])

  function openAdd() {
    setForm(emptyForm())
    setShowAdd(true)
  }

  function openEdit(op: OpenPoint) {
    setForm({
      title: op.title,
      description: op.description ?? '',
      priority: op.priority,
      responsible: op.responsible ?? '',
      dueDate: op.dueDate ?? '',
      linkedEntryId: op.linkedEntryId ?? '',
    })
    setEditOp(op)
  }

  function handleSaveAdd() {
    if (!form.title.trim()) return
    addOpenPoint(scope, {
      title: form.title.trim(),
      description: form.description || undefined,
      priority: form.priority,
      responsible: form.responsible || undefined,
      dueDate: form.dueDate || undefined,
      linkedEntryId: form.linkedEntryId || undefined,
      status: 'open',
    })
    setShowAdd(false)
  }

  function handleSaveEdit() {
    if (!editOp || !form.title.trim()) return
    updateOpenPoint(scope, editOp.id, {
      title: form.title.trim(),
      description: form.description || undefined,
      priority: form.priority,
      responsible: form.responsible || undefined,
      dueDate: form.dueDate || undefined,
      linkedEntryId: form.linkedEntryId || undefined,
    })
    setEditOp(null)
  }

  function handleResolve() {
    if (!resolveOp || !resolution.trim()) return
    const { profile } = useAppStore.getState() as any
    resolveOpenPoint(scope, resolveOp.id, resolution.trim(), profile?.full_name ?? 'PM')
    setResolveOp(null)
    setResolution('')
  }

  function set<K extends keyof OpForm>(k: K, v: OpForm[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  const counts = useMemo(() => ({
    open: openPoints.filter((op) => op.status === 'open').length,
    resolved: openPoints.filter((op) => op.status === 'resolved').length,
  }), [openPoints])

  const drawerItem = drawerOp ? openPoints.find((op) => op.id === drawerOp.id) ?? drawerOp : null

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex rounded-md overflow-hidden border" style={{ borderColor: 'var(--border-default)' }}>
          {(['all', 'open', 'resolved'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: filter === f ? 'var(--oe-primary)' : 'var(--surface-card)',
                color: filter === f ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {t(`diary.filter${f.charAt(0).toUpperCase() + f.slice(1)}`)}
              {f === 'open' && counts.open > 0 && <span className="ml-1">({counts.open})</span>}
              {f === 'resolved' && counts.resolved > 0 && <span className="ml-1">({counts.resolved})</span>}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <Button onClick={openAdd}>{t('diary.addOpenPoint')}</Button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="text-sm text-center py-12" style={{ color: 'var(--text-tertiary)' }}>{t('diary.noOpenPoints')}</p>
      ) : (
        <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--surface-subtle)', borderBottom: '1px solid var(--border-default)' }}>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('diary.colTitle')}</th>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('diary.colPriority')}</th>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('diary.colResponsible')}</th>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('diary.colDueDate')}</th>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('diary.colStatus')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((op) => (
                <tr
                  key={op.id}
                  className="cursor-pointer transition-colors"
                  style={{ borderBottom: '1px solid var(--border-default)' }}
                  onClick={() => setDrawerOp(op)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-subtle)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td className="px-3 py-2.5">
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{op.title}</span>
                    {op.description && (
                      <p className="text-xs mt-0.5 truncate max-w-xs" style={{ color: 'var(--text-tertiary)' }}>{op.description}</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                      style={{ background: PRIORITY_BG[op.priority], color: PRIORITY_COLORS[op.priority] }}
                    >
                      {t(`diary.priority${op.priority.charAt(0).toUpperCase() + op.priority.slice(1)}`)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{op.responsible ?? '—'}</td>
                  <td className="px-3 py-2.5 text-xs" style={{ color: op.dueDate && op.status === 'open' && op.dueDate < new Date().toISOString().slice(0, 10) ? 'var(--color-danger-text)' : 'var(--text-secondary)' }}>
                    {op.dueDate ?? '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        background: op.status === 'resolved' ? 'var(--color-success-bg, #f0fdf4)' : 'var(--color-info-bg)',
                        color: op.status === 'resolved' ? 'var(--color-success-text, #16a34a)' : 'var(--color-info-text)',
                      }}
                    >
                      {t(`diary.status${op.status.charAt(0).toUpperCase() + op.status.slice(1)}`)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1 justify-end">
                      {op.status === 'open' && (
                        <button
                          onClick={() => { setResolveOp(op); setResolution('') }}
                          className="text-xs px-2 py-1 rounded transition-colors"
                          style={{ color: 'var(--color-success-text, #16a34a)', background: 'var(--color-success-bg, #f0fdf4)' }}
                        >
                          {t('diary.resolveOp')}
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(op)}
                        className="text-xs px-2 py-1 rounded transition-colors"
                        style={{ color: 'var(--text-tertiary)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                      >
                        {t('actions.edit')}
                      </button>
                      <button
                        onClick={() => { if (confirm(t('diary.deleteConfirm'))) deleteOpenPoint(scope, op.id) }}
                        className="text-xs px-2 py-1 rounded transition-colors"
                        style={{ color: 'var(--color-danger-text)' }}
                      >
                        {t('actions.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      <Modal
        open={showAdd}
        title={t('diary.addOpenPoint')}
        onClose={() => setShowAdd(false)}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAdd(false)}>{t('actions.cancel')}</Button>
            <Button onClick={handleSaveAdd} disabled={!form.title.trim()}>{t('actions.confirm')}</Button>
          </>
        }
      >
        <OpFormFields form={form} set={set} allEntries={allEntries} />
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={!!editOp}
        title={t('diary.editOpenPoint')}
        onClose={() => setEditOp(null)}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOp(null)}>{t('actions.cancel')}</Button>
            <Button onClick={handleSaveEdit} disabled={!form.title.trim()}>{t('actions.save')}</Button>
          </>
        }
      >
        <OpFormFields form={form} set={set} allEntries={allEntries} />
      </Modal>

      {/* Resolve Modal */}
      <Modal
        open={!!resolveOp}
        title={t('diary.resolveOpTitle')}
        onClose={() => setResolveOp(null)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResolveOp(null)}>{t('actions.cancel')}</Button>
            <Button onClick={handleResolve} disabled={!resolution.trim()}>{t('diary.resolveOp')}</Button>
          </>
        }
      >
        <Field label={t('diary.opResolution')} required>
          <textarea
            autoFocus
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            rows={3}
            className="block w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1"
            style={{ borderColor: 'var(--border-default)', background: 'var(--surface-input)', color: 'var(--text-primary)', resize: 'none' }}
          />
        </Field>
      </Modal>

      {/* Drawer */}
      {drawerItem && (
        <div
          className="fixed inset-0 z-40 flex justify-end"
          onClick={() => setDrawerOp(null)}
        >
          <div
            className="relative w-full max-w-md h-full overflow-y-auto shadow-xl"
            style={{ background: 'var(--surface-card)', borderLeft: '1px solid var(--border-default)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between px-5 py-3 border-b" style={{ background: 'var(--surface-card)', borderColor: 'var(--border-default)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{drawerItem.title}</h3>
              <button onClick={() => setDrawerOp(null)} style={{ color: 'var(--text-tertiary)', fontSize: 18 }}>×</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-2 flex-wrap">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={{ background: PRIORITY_BG[drawerItem.priority], color: PRIORITY_COLORS[drawerItem.priority] }}>
                  {t(`diary.priority${drawerItem.priority.charAt(0).toUpperCase() + drawerItem.priority.slice(1)}`)}
                </span>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                  style={{
                    background: drawerItem.status === 'resolved' ? 'var(--color-success-bg, #f0fdf4)' : 'var(--color-info-bg)',
                    color: drawerItem.status === 'resolved' ? 'var(--color-success-text, #16a34a)' : 'var(--color-info-text)',
                  }}
                >
                  {t(`diary.status${drawerItem.status.charAt(0).toUpperCase() + drawerItem.status.slice(1)}`)}
                </span>
              </div>
              {drawerItem.description && (
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{drawerItem.description}</p>
              )}
              {drawerItem.responsible && (
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('diary.opResponsible')}: <span style={{ color: 'var(--text-secondary)' }}>{drawerItem.responsible}</span></p>
              )}
              {drawerItem.dueDate && (
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('diary.opDueDate')}: <span style={{ color: 'var(--text-secondary)' }}>{drawerItem.dueDate}</span></p>
              )}
              {drawerItem.status === 'resolved' && drawerItem.resolution && (
                <div className="p-3 rounded-lg" style={{ background: 'var(--color-success-bg, #f0fdf4)' }}>
                  <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-success-text, #16a34a)' }}>{t('diary.opResolution')}</p>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{drawerItem.resolution}</p>
                  {drawerItem.resolvedBy && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{t('diary.resolvedBy')}: {drawerItem.resolvedBy}</p>
                  )}
                </div>
              )}
              <FileAttachments
                scopeId={scope.id}
                parentId={drawerItem.id}
                attachments={drawerItem.attachments}
                onAdd={(att) => addDiaryAttachment(scope, 'open_point', drawerItem.id, att)}
                onRemove={(id) => removeDiaryAttachment(scope, 'open_point', drawerItem.id, id)}
              />
              <DiaryComments
                scope={scope}
                parentType="open_point"
                parentId={drawerItem.id}
                comments={drawerItem.comments}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
