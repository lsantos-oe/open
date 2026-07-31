import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { useAppStore } from '@/store/useAppStore'
import { useOverlayStore } from '@/stores/useOverlayStore'
import { Risk, ActionTask, Probability, Impact, Phase } from '@/types'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea, Field } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'

const PROB_VAL: Record<Probability | Impact, number> = { low: 1, medium: 2, high: 3 }

function scoreClass(s: number) {
  if (s >= 6) return 'bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]'
  if (s >= 3) return 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'
  return 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]'
}

function FlagDot({ score }: { score: number }) {
  const cls = score >= 6 ? 'bg-red-500' : score >= 3 ? 'bg-orange-400' : 'bg-green-400'
  return <span className={`inline-block w-2.5 h-2.5 rounded-[var(--radius-pill)] ${cls}`} />
}

function getAllEntries(phases: Phase[]) {
  const result: { id: string; name: string }[] = []
  for (const ph of phases) {
    for (const e of ph.entries) {
      result.push({ id: e.id, name: e.name })
      for (const sub of e.subtasks) {
        result.push({ id: sub.id, name: `${e.name} / ${sub.name}` })
      }
    }
  }
  return result
}

// ─── Risk Panel ───────────────────────────────────────────────────────────────

interface RiskPanelProps {
  projectId: string
  risk: Risk
  riskIndex: number
  allEntries: { id: string; name: string }[]
  onClose: () => void
}

function RiskPanel({ projectId, risk, riskIndex, allEntries, onClose }: RiskPanelProps) {
  const { t } = useTranslation()
  const { updateRisk, addActionTask, toggleActionTask, deleteActionTask } = useAppStore()

  const [form, setForm] = useState({
    description: risk.description,
    probability: risk.probability,
    impact: risk.impact,
    status: risk.status,
    owner: risk.owner,
    dueDate: risk.dueDate ?? '',
    linkedEntryIds: risk.linkedEntryIds,
  })

  useEffect(() => {
    useOverlayStore.getState().openSidePanel()
    return () => useOverlayStore.getState().closeSidePanel()
  }, [])

  const [taskForm, setTaskForm] = useState({ description: '', responsible: '', dueDate: '' })
  const score = PROB_VAL[form.probability] * PROB_VAL[form.impact]

  // Sync form when risk prop changes (e.g. external navigation to different risk)
  useEffect(() => {
    setForm({
      description: risk.description,
      probability: risk.probability,
      impact: risk.impact,
      status: risk.status,
      owner: risk.owner,
      dueDate: risk.dueDate ?? '',
      linkedEntryIds: risk.linkedEntryIds,
    })
  }, [risk.id])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  function handleSave() {
    updateRisk(projectId, risk.id, { ...form, score })
  }

  function handleAddTask() {
    if (!taskForm.description.trim()) return
    addActionTask(projectId, risk.id, {
      description: taskForm.description.trim(),
      responsible: taskForm.responsible || undefined,
      dueDate: taskForm.dueDate || undefined,
      done: false,
    })
    setTaskForm({ description: '', responsible: '', dueDate: '' })
  }

  function toggleLinked(entryId: string) {
    setForm((f) => ({
      ...f,
      linkedEntryIds: f.linkedEntryIds.includes(entryId)
        ? f.linkedEntryIds.filter((id) => id !== entryId)
        : [...f.linkedEntryIds, entryId],
    }))
  }

  const panel = (
    <div className="fixed inset-y-0 right-0 w-[440px] bg-[var(--surface-card)] shadow-2xl border-l border-[var(--border-default)] z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-default)]">
        <div className="flex items-center gap-3 min-w-0">
          <FlagDot score={score} />
          <div className="min-w-0">
            <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wide font-semibold mb-0.5">
              Risco R-{String(riskIndex + 1).padStart(2, '0')}
            </p>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${scoreClass(score)}`}>
              Score {score}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="ml-3 shrink-0 w-7 h-7 flex items-center justify-center rounded-[var(--radius-md)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Risk detail form */}
        <div className="px-5 py-4 space-y-4">
          <Field label="Descrição">
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Probabilidade">
              <Select value={form.probability} onChange={(e) => setForm((f) => ({ ...f, probability: e.target.value as Probability }))}>
                <option value="low">{t('risk.low')}</option>
                <option value="medium">{t('risk.medium')}</option>
                <option value="high">{t('risk.high')}</option>
              </Select>
            </Field>
            <Field label="Impacto">
              <Select value={form.impact} onChange={(e) => setForm((f) => ({ ...f, impact: e.target.value as Impact }))}>
                <option value="low">{t('risk.low')}</option>
                <option value="medium">{t('risk.medium')}</option>
                <option value="high">{t('risk.high')}</option>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                {['Identificado', 'Em monitoramento', 'Mitigado', 'Aceito', 'Fechado'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="Responsável">
              <Input value={form.owner} onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))} />
            </Field>
          </div>
          <Field label="Prazo">
            <Input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
          </Field>

          {allEntries.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-2">Tarefas Vinculadas</p>
              <div className="border border-[var(--border-default)] rounded-[var(--radius-lg)] max-h-32 overflow-y-auto p-2 space-y-1">
                {allEntries.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 p-1 rounded hover:bg-[var(--surface-subtle)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.linkedEntryIds.includes(e.id)}
                      onChange={() => toggleLinked(e.id)}
                      className="rounded border-[var(--border-default)] text-[var(--oe-primary)]"
                    />
                    <span className="text-sm text-[var(--text-secondary)]">{e.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave}>É basicamente isso</Button>
          </div>
        </div>

        <div className="border-t border-[var(--border-default)] mx-5" />

        {/* Action tasks */}
        <div className="px-5 py-4">
          <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-3">
            Tarefas de Gestão do Risco
            {risk.actionTasks.length > 0 && (
              <span className="ml-1.5 bg-[var(--surface-subtle)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded-[var(--radius-pill)] normal-case">
                {risk.actionTasks.filter((t) => t.done).length}/{risk.actionTasks.length}
              </span>
            )}
          </p>

          {risk.actionTasks.length === 0 && (
            <p className="text-sm text-[var(--text-tertiary)] mb-4">Nenhuma tarefa de gestão.</p>
          )}

          <div className="space-y-2 mb-4">
            {risk.actionTasks.map((task) => (
              <div key={task.id} className="flex items-start gap-2 p-2.5 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-subtle)] group">
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={() => toggleActionTask(projectId, risk.id, task.id)}
                  className="mt-0.5 rounded border-[var(--border-default)] text-[var(--oe-primary)] shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${task.done ? 'line-through text-[var(--text-tertiary)]' : 'text-[var(--text-secondary)]'}`}>
                    {task.description}
                  </p>
                  <div className="flex gap-2 mt-0.5">
                    {task.responsible && (
                      <span className="text-xs text-[var(--text-tertiary)]">{task.responsible}</span>
                    )}
                    {task.dueDate && (
                      <span className="text-xs text-[var(--text-tertiary)]">· {task.dueDate.split('-').reverse().join('/')}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteActionTask(projectId, risk.id, task.id)}
                  className="opacity-0 group-hover:opacity-100 text-[var(--text-disabled)] hover:text-[var(--color-danger-text)] transition-opacity shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-2 bg-[var(--surface-subtle)] rounded-[var(--radius-lg)] p-3 border border-[var(--border-default)]">
            <p className="text-xs font-medium text-[var(--text-tertiary)]">Nova tarefa</p>
            <Input
              value={taskForm.description}
              onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Descrição da tarefa"
              onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={taskForm.responsible}
                onChange={(e) => setTaskForm((f) => ({ ...f, responsible: e.target.value }))}
                placeholder="Responsável"
              />
              <Input
                type="date"
                value={taskForm.dueDate}
                onChange={(e) => setTaskForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
            <div className="flex justify-end">
              <Button size="sm" variant="secondary" onClick={handleAddTask} disabled={!taskForm.description.trim()}>
                + Adicionar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      {panel}
    </>,
    document.body,
  )
}

// ─── Add Risk Modal ────────────────────────────────────────────────────────────

interface AddRiskModalProps {
  projectId: string
  allEntries: { id: string; name: string }[]
  onClose: () => void
}

function AddRiskModal({ projectId, allEntries, onClose }: AddRiskModalProps) {
  const { t } = useTranslation()
  const { addRisk } = useAppStore()

  const [form, setForm] = useState({
    description: '',
    probability: 'medium' as Probability,
    impact: 'medium' as Impact,
    status: 'Identificado',
    owner: '',
    dueDate: '',
    linkedEntryIds: [] as string[],
  })

  function toggleLinked(id: string) {
    setForm((f) => ({
      ...f,
      linkedEntryIds: f.linkedEntryIds.includes(id)
        ? f.linkedEntryIds.filter((x) => x !== id)
        : [...f.linkedEntryIds, id],
    }))
  }

  function handleSave() {
    if (!form.description.trim()) return
    const score = PROB_VAL[form.probability] * PROB_VAL[form.impact]
    addRisk(projectId, { ...form, score, actionTasks: [] })
    onClose()
  }

  return (
    <Modal
      open
      title="Adicionar Risco"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button onClick={handleSave} disabled={!form.description.trim()}>{t('actions.confirm')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Descrição" required>
          <Textarea
            autoFocus
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Probabilidade">
            <Select value={form.probability} onChange={(e) => setForm((f) => ({ ...f, probability: e.target.value as Probability }))}>
              <option value="low">{t('risk.low')}</option>
              <option value="medium">{t('risk.medium')}</option>
              <option value="high">{t('risk.high')}</option>
            </Select>
          </Field>
          <Field label="Impacto">
            <Select value={form.impact} onChange={(e) => setForm((f) => ({ ...f, impact: e.target.value as Impact }))}>
              <option value="low">{t('risk.low')}</option>
              <option value="medium">{t('risk.medium')}</option>
              <option value="high">{t('risk.high')}</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {['Identificado', 'Em monitoramento', 'Mitigado', 'Aceito', 'Fechado'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável">
            <Input value={form.owner} onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))} />
          </Field>
        </div>
        <Field label="Prazo">
          <Input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
        </Field>
        {allEntries.length > 0 && (
          <div>
            <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">Tarefas Vinculadas</p>
            <div className="border border-[var(--border-default)] rounded-[var(--radius-lg)] max-h-36 overflow-y-auto p-2 space-y-1">
              {allEntries.map((e) => (
                <label key={e.id} className="flex items-center gap-2 p-1 rounded hover:bg-[var(--surface-subtle)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.linkedEntryIds.includes(e.id)}
                    onChange={() => toggleLinked(e.id)}
                    className="rounded border-[var(--border-default)] text-[var(--oe-primary)]"
                  />
                  <span className="text-sm text-[var(--text-secondary)]">{e.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface RisksPageProps {
  projectId: string
  focusRiskId?: string | null
  onFocusConsumed?: () => void
}

export default function RisksPage({ projectId, focusRiskId, onFocusConsumed }: RisksPageProps) {
  const { t } = useTranslation()
  const { projects, deleteRisk } = useAppStore()
  const project = projects.find((p) => p.id === projectId)!
  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    if (focusRiskId) {
      setSelectedRiskId(focusRiskId)
      onFocusConsumed?.()
    }
  }, [focusRiskId])

  const allEntries = getAllEntries(project.phases)
  const selectedRisk = project.risks.find((r) => r.id === selectedRiskId)

  function getLinkedNames(ids: string[]) {
    return ids
      .map((id) => allEntries.find((e) => e.id === id)?.name)
      .filter(Boolean)
      .join(', ')
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-[var(--text-secondary)]">{t('risk.title')}</h2>
        <Button size="sm" onClick={() => setShowAdd(true)}>{t('risk.add')}</Button>
      </div>

      {project.risks.length === 0 ? (
        <EmptyState icon="🛡️" title={t('risk.noRisks')} />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border-default)] shadow-[var(--shadow-sm)] bg-[var(--surface-card)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-subtle)] border-b border-[var(--border-default)]">
              <tr>
                {['ID', 'Tarefa Vinculada', 'Descrição', '', 'Prob.', 'Impacto', 'Score', 'Status', 'Responsável', 'Prazo', ''].map((h, i) => (
                  <th key={i} className="text-left px-3 py-2.5 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {project.risks.map((r, idx) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedRiskId(r.id)}
                  className={`border-b border-[var(--border-default)] cursor-pointer transition-colors ${
                    selectedRiskId === r.id ? 'bg-[var(--color-info-bg)]' : 'hover:bg-[var(--surface-subtle)]'
                  }`}
                >
                  <td className="px-3 py-2.5 text-xs font-mono text-[var(--text-tertiary)] whitespace-nowrap">
                    R-{String(idx + 1).padStart(2, '0')}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--text-tertiary)] max-w-[140px] truncate" title={getLinkedNames(r.linkedEntryIds)}>
                    {getLinkedNames(r.linkedEntryIds) || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text-secondary)] max-w-[200px] truncate" title={r.description}>{r.description}</td>
                  <td className="px-3 py-2.5"><FlagDot score={r.score} /></td>
                  <td className="px-3 py-2.5">
                    <Badge variant={r.probability === 'high' ? 'red' : r.probability === 'medium' ? 'yellow' : 'green'}>
                      {r.probability === 'high' ? 'Alta' : r.probability === 'medium' ? 'Média' : 'Baixa'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={r.impact === 'high' ? 'red' : r.impact === 'medium' ? 'yellow' : 'green'}>
                      {r.impact === 'high' ? 'Alto' : r.impact === 'medium' ? 'Médio' : 'Baixo'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${scoreClass(r.score)}`}>{r.score}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">{r.status}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">{r.owner || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                    {r.dueDate ? r.dueDate.split('-').reverse().join('/') : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteRisk(projectId, r.id) }}
                      className="text-[var(--text-disabled)] hover:text-[var(--color-danger-text)] transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedRisk && (
        <RiskPanel
          projectId={projectId}
          risk={selectedRisk}
          riskIndex={project.risks.findIndex((r) => r.id === selectedRisk.id)}
          allEntries={allEntries}
          onClose={() => setSelectedRiskId(null)}
        />
      )}

      {showAdd && (
        <AddRiskModal
          projectId={projectId}
          allEntries={allEntries}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}
