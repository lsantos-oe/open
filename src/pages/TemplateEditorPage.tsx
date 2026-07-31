import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { v4 as uuid } from 'uuid'
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAppStore } from '@/store/useAppStore'
import { TemplatePhase, TemplateEntry, EntryType } from '@/types'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Field } from '@/components/ui/Input'

// ─── helpers ──────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<EntryType, string> = { task: '✅', milestone: '🏁', meeting: '📅' }
const TYPE_LABEL: Record<EntryType, string> = { task: 'Tarefa', milestone: 'Marco', meeting: 'Reunião' }

function allEntries(phases: TemplatePhase[]): { id: string; name: string; phaseId: string; phaseName: string }[] {
  return phases.flatMap((ph) =>
    ph.entries.map((e) => ({ id: e.id, name: e.name, phaseId: ph.id, phaseName: ph.name })),
  )
}

function buildDepGraph(phases: TemplatePhase[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const ph of phases) {
    for (const e of ph.entries) map.set(e.id, e.dependsOn)
  }
  return map
}

function wouldCreateCycle(from: string, target: string, graph: Map<string, string[]>): boolean {
  const queue = [from]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const curr = queue.shift()!
    if (curr === target) return true
    if (visited.has(curr)) continue
    visited.add(curr)
    for (const dep of graph.get(curr) ?? []) queue.push(dep)
  }
  return false
}

// ─── Drag handle icon ─────────────────────────────────────────────────────────

function DragHandle(props: React.HTMLAttributes<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 16 16" fill="currentColor" className={`w-4 h-4 text-[var(--text-tertiary)] cursor-grab active:cursor-grabbing shrink-0 ${(props as any).className ?? ''}`}>
      <circle cx="5" cy="4" r="1.5" /><circle cx="11" cy="4" r="1.5" />
      <circle cx="5" cy="8" r="1.5" /><circle cx="11" cy="8" r="1.5" />
      <circle cx="5" cy="12" r="1.5" /><circle cx="11" cy="12" r="1.5" />
    </svg>
  )
}

// ─── Entry edit modal ─────────────────────────────────────────────────────────

interface EntryModalProps {
  entry: TemplateEntry
  allDeps: { id: string; name: string; phaseName: string }[]
  depGraph: Map<string, string[]>
  onSave: (patch: Partial<TemplateEntry>) => void
  onClose: () => void
}

function EntryModal({ entry, allDeps, depGraph, onSave, onClose }: EntryModalProps) {
  const { t } = useTranslation()
  const [form, setForm] = useState({
    name: entry.name,
    type: entry.type,
    responsible: entry.responsible,
    durationDays: entry.durationDays ?? 1,
    durationHours: entry.durationHours ?? 1,
    dependsOn: entry.dependsOn,
  })
  const [circularError, setCircularError] = useState('')

  function toggleDep(id: string) {
    if (form.dependsOn.includes(id)) {
      setForm((f) => ({ ...f, dependsOn: f.dependsOn.filter((d) => d !== id) }))
      setCircularError('')
      return
    }
    if (wouldCreateCycle(id, entry.id, depGraph)) {
      setCircularError(t('errors.circularDep'))
      return
    }
    setCircularError('')
    setForm((f) => ({ ...f, dependsOn: [...f.dependsOn, id] }))
  }

  function handleSave() {
    if (!form.name.trim()) return
    onSave({
      name: form.name.trim(),
      type: form.type,
      responsible: form.responsible,
      durationDays: form.type === 'task' ? form.durationDays : undefined,
      durationHours: form.type === 'meeting' ? form.durationHours : undefined,
      dependsOn: form.dependsOn,
    })
    onClose()
  }

  return (
    <Modal
      open
      title="Editar Entrada"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!form.name.trim()}>É basicamente isso</Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Type selector */}
        <div className="flex gap-2">
          {(['task', 'milestone', 'meeting'] as EntryType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setForm((f) => ({ ...f, type: t }))}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[var(--radius-lg)] border-2 text-sm font-medium transition-colors ${
                form.type === t
                  ? 'border-[var(--oe-primary)] bg-[var(--oe-primary-light)] text-[var(--oe-primary)]'
                  : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
              }`}
            >
              <span>{TYPE_ICON[t]}</span>{TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome" required className="col-span-2">
            <Input
              autoFocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </Field>
          <Field label="Papel responsável">
            <Input
              value={form.responsible}
              onChange={(e) => setForm((f) => ({ ...f, responsible: e.target.value }))}
              placeholder="Ex: PM, Dev, Cliente"
            />
          </Field>
          {form.type === 'task' && (
            <Field label="Duração estimada (dias)">
              <Input
                type="number" min={1}
                value={form.durationDays}
                onChange={(e) => setForm((f) => ({ ...f, durationDays: Number(e.target.value) }))}
              />
            </Field>
          )}
          {form.type === 'meeting' && (
            <Field label="Duração estimada (horas)">
              <Input
                type="number" min={0.5} step={0.5}
                value={form.durationHours}
                onChange={(e) => setForm((f) => ({ ...f, durationHours: Number(e.target.value) }))}
              />
            </Field>
          )}
        </div>

        {allDeps.length > 0 && (
          <div>
            <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">Depende de</p>
            <div className="border border-[var(--border-default)] rounded-[var(--radius-lg)] max-h-40 overflow-y-auto p-2 space-y-1">
              {allDeps.map((dep) => (
                <label key={dep.id} className="flex items-center gap-2.5 p-1 rounded hover:bg-[var(--surface-subtle)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.dependsOn.includes(dep.id)}
                    onChange={() => toggleDep(dep.id)}
                    className="rounded border-[var(--border-strong)] accent-[var(--oe-primary)]"
                  />
                  <span className="text-xs text-[var(--text-tertiary)] shrink-0">{dep.phaseName}</span>
                  <span className="text-sm text-[var(--text-secondary)]">{dep.name}</span>
                </label>
              ))}
            </div>
            {circularError && <p className="text-xs text-[var(--color-danger-text)] mt-1">{circularError}</p>}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ─── Sortable entry row ───────────────────────────────────────────────────────

interface SortableEntryProps {
  entry: TemplateEntry
  allDeps: { id: string; name: string; phaseName: string }[]
  onEdit: (entry: TemplateEntry) => void
  onDelete: (id: string) => void
}

function SortableEntryRow({ entry, allDeps, onEdit, onDelete }: SortableEntryProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const depCount = entry.dependsOn.length

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-card)] rounded-[var(--radius-lg)] border border-[var(--border-default)] hover:border-[var(--border-strong)] group"
    >
      <span {...attributes} {...listeners}>
        <DragHandle />
      </span>
      <span className="text-base">{TYPE_ICON[entry.type]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">{entry.name}</p>
        <div className="flex gap-2 text-xs text-[var(--text-tertiary)]">
          {entry.responsible && <span>{entry.responsible}</span>}
          {entry.durationDays != null && <span>{entry.durationDays}d</span>}
          {entry.durationHours != null && <span>{entry.durationHours}h</span>}
          {depCount > 0 && <span>{depCount} dep.</span>}
        </div>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(entry)}
          className="text-xs text-[var(--text-tertiary)] hover:text-[var(--oe-primary)] px-1.5 py-1 rounded hover:bg-[var(--oe-primary-light)] transition-colors"
        >
          Editar
        </button>
        <button
          onClick={() => onDelete(entry.id)}
          className="text-[var(--text-tertiary)] hover:text-[var(--color-danger-text)] px-1.5 py-1 rounded hover:bg-red-50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ─── Sortable phase ───────────────────────────────────────────────────────────

interface SortablePhaseProps {
  phase: TemplatePhase
  allDeps: { id: string; name: string; phaseName: string }[]
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onAddEntry: (phaseId: string) => void
  onEditEntry: (phaseId: string, entry: TemplateEntry) => void
  onDeleteEntry: (phaseId: string, entryId: string) => void
  onReorderEntries: (phaseId: string, entries: TemplateEntry[]) => void
}

function SortablePhase({
  phase, allDeps, onRename, onDelete, onAddEntry, onEditEntry, onDeleteEntry, onReorderEntries,
}: SortablePhaseProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: phase.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(phase.name)
  const inputRef = useRef<HTMLInputElement>(null)

  function commitRename() {
    if (name.trim()) onRename(phase.id, name.trim())
    else setName(phase.name)
    setEditing(false)
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleEntryDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = phase.entries.findIndex((en) => en.id === active.id)
    const newIdx = phase.entries.findIndex((en) => en.id === over.id)
    if (oldIdx !== -1 && newIdx !== -1) {
      onReorderEntries(phase.id, arrayMove(phase.entries, oldIdx, newIdx))
    }
  }

  return (
    <div ref={setNodeRef} style={style} className="bg-[var(--surface-subtle)] rounded-[var(--radius-lg)] border border-[var(--border-default)]">
      {/* Phase header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-default)]">
        <span {...attributes} {...listeners}>
          <DragHandle />
        </span>
        {editing ? (
          <input
            ref={inputRef}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setName(phase.name); setEditing(false) } }}
            className="flex-1 text-sm font-semibold text-[var(--text-primary)] bg-transparent border-b border-[var(--oe-primary-mid)] focus:outline-none"
          />
        ) : (
          <button
            onDoubleClick={() => setEditing(true)}
            className="flex-1 text-sm font-semibold text-[var(--text-primary)] text-left hover:text-[var(--oe-primary)] transition-colors"
            title="Duplo clique para renomear"
          >
            {phase.name}
          </button>
        )}
        <span className="text-xs text-[var(--text-tertiary)]">{phase.entries.length} entr.</span>
        <button
          onClick={() => onAddEntry(phase.id)}
          className="text-xs text-[var(--oe-primary)] hover:text-[var(--oe-primary-hover)] font-medium px-2 py-1 rounded hover:bg-[var(--oe-primary-light)] transition-colors"
        >
          + Entrada
        </button>
        <button
          onClick={() => onDelete(phase.id)}
          className="text-[var(--text-tertiary)] hover:text-[var(--color-danger-text)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Entries */}
      <div className="p-3 space-y-1.5">
        {phase.entries.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)] text-center py-3">Nenhuma entrada. Clique em "+ Entrada" para adicionar.</p>
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleEntryDragEnd}>
            <SortableContext items={phase.entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              {phase.entries.map((entry) => (
                <SortableEntryRow
                  key={entry.id}
                  entry={entry}
                  allDeps={allDeps.filter((d) => d.id !== entry.id)}
                  onEdit={(e) => onEditEntry(phase.id, e)}
                  onDelete={(id) => onDeleteEntry(phase.id, id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TemplateEditorPage() {
  const { templateId } = useParams<{ templateId: string }>()
  const navigate = useNavigate()
  const { settings, updateTemplate } = useAppStore()

  const template = settings.templates.find((t) => t.id === templateId)
  const [phases, setPhases] = useState(() => template?.phases ?? [])
  const [templateName, setTemplateName] = useState(() => template?.name ?? '')
  const [editingEntry, setEditingEntry] = useState<{ phaseId: string; entry: TemplateEntry } | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  if (!template) {
    return (
      <div className="p-8 text-center text-[var(--text-tertiary)]">
        <p>Template não encontrado.</p>
        <Button className="mt-4" variant="secondary" onClick={() => navigate('/settings')}>← Voltar</Button>
      </div>
    )
  }

  function save(newPhases: TemplatePhase[], newName = templateName) {
    const updated = { ...template!, name: newName, phases: newPhases }
    updateTemplate(updated)
    setPhases(newPhases)
  }

  function handlePhaseDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = phases.findIndex((p) => p.id === active.id)
    const newIdx = phases.findIndex((p) => p.id === over.id)
    if (oldIdx !== -1 && newIdx !== -1) {
      save(arrayMove(phases, oldIdx, newIdx).map((p, i) => ({ ...p, order: i })))
    }
  }

  function handleRenamePhase(id: string, name: string) {
    save(phases.map((p) => (p.id === id ? { ...p, name } : p)))
  }

  function handleDeletePhase(id: string) {
    if (!confirm('Remover esta fase e todas as suas entradas?')) return
    save(phases.filter((p) => p.id !== id).map((p, i) => ({ ...p, order: i })))
  }

  function handleAddPhase() {
    const newPhase: TemplatePhase = { id: uuid(), name: 'Nova Fase', order: phases.length, entries: [] }
    save([...phases, newPhase])
  }

  function handleAddEntry(phaseId: string) {
    const newEntry: TemplateEntry = {
      id: uuid(), type: 'task', name: 'Nova Entrada', responsible: '', dependsOn: [],
      durationDays: 1, order: phases.find((p) => p.id === phaseId)?.entries.length ?? 0, subtasks: [],
    }
    setEditingEntry({ phaseId, entry: newEntry })
    save(phases.map((p) => p.id === phaseId ? { ...p, entries: [...p.entries, newEntry] } : p))
  }

  function handleEditEntry(phaseId: string, entry: TemplateEntry) {
    setEditingEntry({ phaseId, entry })
  }

  function handleSaveEntry(patch: Partial<TemplateEntry>) {
    if (!editingEntry) return
    save(phases.map((p) =>
      p.id === editingEntry.phaseId
        ? { ...p, entries: p.entries.map((e) => e.id === editingEntry.entry.id ? { ...e, ...patch } : e) }
        : p,
    ))
  }

  function handleDeleteEntry(phaseId: string, entryId: string) {
    save(phases.map((p) =>
      p.id === phaseId
        ? { ...p, entries: p.entries.filter((e) => e.id !== entryId).map((e, i) => ({ ...e, order: i })) }
        : p,
    ))
  }

  function handleReorderEntries(phaseId: string, entries: TemplateEntry[]) {
    save(phases.map((p) => p.id === phaseId ? { ...p, entries: entries.map((e, i) => ({ ...e, order: i })) } : p))
  }

  const deps = allEntries(phases)
  const depGraph = buildDepGraph(phases)

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate('/settings')}
          className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] flex items-center gap-1 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Configurações
        </button>

        <input
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          onBlur={() => save(phases, templateName.trim() || template.name)}
          className="text-2xl font-bold text-[var(--text-primary)] bg-transparent border-b-2 border-transparent hover:border-[var(--border-default)] focus:border-[var(--oe-primary)] focus:outline-none transition-colors"
        />
      </div>

      {/* Template meta */}
      <div className="bg-[var(--surface-card)] rounded-[var(--radius-lg)] border border-[var(--border-default)] p-4 mb-6">
        <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-2">Configurações do template</p>
        <div className="flex items-center gap-6 text-sm text-[var(--text-secondary)]">
          <span>Tipo: <strong>{template.type === 'nova_conta' ? 'Nova Conta' : 'Novo Projeto'}</strong></span>
          <span>{phases.length} fases</span>
          <span>{phases.reduce((n, p) => n + p.entries.length, 0)} entradas</span>
        </div>
      </div>

      {/* Phases */}
      <div className="space-y-4">
        <DndContext sensors={sensors} onDragEnd={handlePhaseDragEnd}>
          <SortableContext items={phases.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            {phases.map((phase) => (
              <SortablePhase
                key={phase.id}
                phase={phase}
                allDeps={deps}
                onRename={handleRenamePhase}
                onDelete={handleDeletePhase}
                onAddEntry={handleAddEntry}
                onEditEntry={handleEditEntry}
                onDeleteEntry={handleDeleteEntry}
                onReorderEntries={handleReorderEntries}
              />
            ))}
          </SortableContext>
        </DndContext>

        <button
          onClick={handleAddPhase}
          className="w-full py-3 rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--border-strong)] text-sm text-[var(--text-tertiary)] hover:border-[var(--oe-primary-mid)] hover:text-[var(--oe-primary)] transition-colors"
        >
          + Fase
        </button>
      </div>

      {editingEntry && (
        <EntryModal
          entry={editingEntry.entry}
          allDeps={deps.filter((d) => d.id !== editingEntry.entry.id)}
          depGraph={depGraph}
          onSave={handleSaveEntry}
          onClose={() => setEditingEntry(null)}
        />
      )}
    </div>
  )
}
