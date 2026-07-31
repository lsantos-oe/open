import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ImportJsonModal from '@/components/import/ImportJsonModal'
import { exportAllProjectsToJson } from '@/utils/exportJson'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input, Field, Select } from '@/components/ui/Input'
import { SelectionBar } from '@/components/ui/SelectionBar'
import { StatusDot } from '@/components/ui/StatusDot'
import { AvatarStack } from '@/components/ui/AvatarStack'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { EmptyState } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { isProjectMine } from '@/utils/involvement'
import { Project, ProjectStatus, ProjectType, ProjectTemplate, Client, TeamMember } from '@/types'
import {
  projectDurationDays,
  projectEndVariance,
  isProjectDelayed,
  uniqueClients,
  uniquePMs,
} from '@/utils/projectStats'

// ─── constants ────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<ProjectStatus, string> = {
  backlog: 'var(--text-disabled)',
  planning: 'var(--text-tertiary)',
  in_progress: 'var(--color-info-text)',
  done: 'var(--color-success-text)',
}

const KANBAN_STATUSES: ProjectStatus[] = ['backlog', 'planning', 'in_progress', 'done']

const KANBAN_BG: Record<ProjectStatus, string> = {
  backlog: 'bg-[var(--surface-page)] border-dashed border-[var(--border-default)]',
  planning: 'bg-[var(--surface-subtle)] border-[var(--border-default)]',
  in_progress: 'bg-[var(--color-info-bg)] border-[var(--border-default)]',
  done: 'bg-[var(--color-success-bg)] border-[var(--border-default)]',
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtVariance(v: number | undefined): string {
  if (v === undefined) return '—'
  if (v === 0) return '0'
  return (v > 0 ? '+' : '') + v + 'd'
}

function varianceClass(v: number | undefined): string {
  if (v === undefined || v === 0) return 'text-[var(--text-tertiary)]'
  return v > 0 ? 'text-[var(--color-danger-text)] font-semibold' : 'text-[var(--color-success-text)] font-semibold'
}

// ─── filters ──────────────────────────────────────────────────────────────────

interface Filters {
  client: string
  pm: string
  type: string
  dev: string
}

function applyFilters(projects: Project[], f: Filters): Project[] {
  return projects.filter((p) => {
    if (f.client && p.client !== f.client) return false
    if (f.pm && p.pm !== f.pm) return false
    if (f.type && p.type !== f.type) return false
    if (f.dev === 'with' && !p.devType) return false
    if (f.dev === 'without' && p.devType) return false
    return true
  })
}

// ─── FilterBar ────────────────────────────────────────────────────────────────

interface FilterBarProps {
  filters: Filters
  setFilters: (f: Filters) => void
  clients: string[]
  pms: string[]
}

function FilterBar({ filters, setFilters, clients, pms }: FilterBarProps) {
  const { t } = useTranslation()
  const activeCount = Object.values(filters).filter(Boolean).length

  return (
    <FilterMenu activeCount={activeCount} onClear={() => setFilters({ client: '', pm: '', type: '', dev: '' })}>
      <Field label={t('portfolio.colClient')}>
        <select
          value={filters.client}
          onChange={(e) => setFilters({ ...filters, client: e.target.value })}
          className="block w-full text-sm border border-[var(--border-default)] rounded-[var(--radius-md)] px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--oe-primary)] bg-[var(--surface-card)]"
        >
          <option value="">{t('project.allClients')}</option>
          {clients.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>

      <Field label={t('project.pm')}>
        <select
          value={filters.pm}
          onChange={(e) => setFilters({ ...filters, pm: e.target.value })}
          className="block w-full text-sm border border-[var(--border-default)] rounded-[var(--radius-md)] px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--oe-primary)] bg-[var(--surface-card)]"
        >
          <option value="">{t('project.allPMs')}</option>
          {pms.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </Field>

      <Field label={t('portfolio.colType')}>
        <div className="flex rounded-[var(--radius-md)] border border-[var(--border-default)] overflow-hidden">
          {([['', t('project.filterAll')], ['nova_conta', t('project.nova_conta')], ['novo_projeto', t('project.novo_projeto')]] as [string, string][]).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFilters({ ...filters, type: v })}
              className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                filters.type === v ? 'bg-[var(--oe-primary)] text-white' : 'bg-[var(--surface-card)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </Field>

      <Field label={t('portfolio.colDev')}>
        <div className="flex rounded-[var(--radius-md)] border border-[var(--border-default)] overflow-hidden">
          {([['', t('project.filterAll')], ['with', t('project.filterWithDev')], ['without', t('project.filterWithoutDev')]] as [string, string][]).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFilters({ ...filters, dev: v })}
              className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                filters.dev === v ? 'bg-[var(--oe-primary)] text-white' : 'bg-[var(--surface-card)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </Field>
    </FilterMenu>
  )
}

// ─── ListView ─────────────────────────────────────────────────────────────────

interface ListViewProps {
  projects: Project[]; holidays: string[]; onOpen: (id: string) => void
  selected: Set<string>; onToggle: (id: string) => void
}

function ListView({ projects, holidays, onOpen, selected, onToggle }: ListViewProps) {
  const { t } = useTranslation()

  if (projects.length === 0) return <EmptyFiltered />

  const COLS = [
    '',
    t('portfolio.colProject'),
    t('portfolio.colClient'),
    t('portfolio.colPM'),
    t('portfolio.colType'),
    t('portfolio.colDev'),
    t('portfolio.colDuration'),
    t('portfolio.colStatus'),
    t('portfolio.colVariance'),
  ]

  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border-default)] shadow-sm bg-[var(--surface-card)]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-[var(--surface-subtle)] border-b border-[var(--border-default)]">
          <tr>
            {COLS.map((h) => (
              <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-default)]">
          {projects.map((p) => {
            const dur = projectDurationDays(p, holidays)
            const variance = projectEndVariance(p, holidays)
            const isArchived = !!p.archived
            return (
              <tr
                key={p.id}
                onClick={() => !isArchived && onOpen(p.id)}
                className={`transition-colors ${isArchived ? 'opacity-60 cursor-default' : 'hover:bg-[var(--surface-subtle)] cursor-pointer'}`}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" className="rounded border-[var(--border-default)] accent-[var(--oe-primary)]" checked={selected.has(p.id)} onChange={() => onToggle(p.id)} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-[var(--text-primary)]">{p.name}</p>
                    {isArchived && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-[var(--radius-pill)] font-medium" style={{ background: 'var(--surface-subtle)', color: 'var(--text-tertiary)', border: '0.5px solid var(--border-default)' }}>
                        {t('project.archived')}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">{p.client}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <AvatarStack people={[{ name: p.pm }]} size={20} />
                    <span className="text-[var(--text-secondary)]">{p.pm}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={p.type === 'nova_conta' ? 'blue' : 'purple'}>
                    {t(`project.${p.type}`)}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs text-[var(--text-tertiary)]">
                  {p.devType
                    ? <><span className="font-medium">{t(`project.${p.devType}`)}</span>{p.devIntegration ? ` · ${p.devIntegration}` : ''}</>
                    : <span className="text-[var(--text-disabled)]">—</span>}
                </td>
                <td className="px-4 py-3 text-[var(--text-secondary)] whitespace-nowrap">
                  {dur !== undefined ? `${dur}${t('project.workingDays')}` : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <StatusDot color={STATUS_COLOR[p.status]} label={t(`project.${p.status}`)} />
                    {isProjectDelayed(p, holidays) && <Badge variant="red">{t('project.delayed')}</Badge>}
                  </div>
                </td>
                <td className={`px-4 py-3 whitespace-nowrap ${varianceClass(variance)}`}>
                  {fmtVariance(variance)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── KanbanView ───────────────────────────────────────────────────────────────

interface KanbanViewProps {
  projects: Project[]; holidays: string[]; onOpen: (id: string) => void
  selected: Set<string>; onToggle: (id: string) => void
}

function KanbanView({ projects, holidays, onOpen, selected, onToggle }: KanbanViewProps) {
  const { t } = useTranslation()

  if (projects.length === 0) return <EmptyFiltered />

  return (
    <div className="grid grid-cols-4 gap-4">
      {KANBAN_STATUSES.map((status) => {
        const cards = projects.filter((p) => p.status === status)
        return (
          <div key={status} className={`border ${KANBAN_BG[status]} rounded-[var(--radius-lg)] p-3 min-h-[300px]`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">{t(`project.${status}`)}</span>
              <span className="bg-[var(--surface-card)] text-[var(--text-secondary)] rounded-[var(--radius-pill)] text-xs px-2 py-0.5 font-medium border border-[var(--border-default)]">
                {cards.length}
              </span>
            </div>
            <div className="space-y-2">
              {cards.map((p) => {
                const dur = projectDurationDays(p, holidays)
                const variance = projectEndVariance(p, holidays)
                return (
                  <div
                    key={p.id}
                    onClick={() => onOpen(p.id)}
                    role="button"
                    className="relative w-full text-left bg-[var(--surface-card)] rounded-[var(--radius-lg)] p-3 shadow-sm border border-[var(--border-default)] hover:border-[var(--oe-primary)] hover:shadow transition-all cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => onToggle(p.id)}
                      className="absolute top-2 right-2 rounded border-[var(--border-default)] accent-[var(--oe-primary)]"
                    />
                    <p className="font-medium text-[var(--text-primary)] text-sm mb-1 line-clamp-2 pr-5">{p.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)] mb-2">{p.client}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={p.type === 'nova_conta' ? 'blue' : 'purple'} className="text-[10px]">
                          {p.type === 'nova_conta' ? 'NC' : 'NP'}
                        </Badge>
                        {isProjectDelayed(p, holidays) && (
                          <Badge variant="red" className="text-[10px]">{t('project.delayed')}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                        {dur !== undefined && <span>{dur}d</span>}
                        {variance !== undefined && (
                          <span className={varianceClass(variance)}>{fmtVariance(variance)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <AvatarStack people={[{ name: p.pm }]} size={16} />
                      <span className="text-xs text-[var(--text-tertiary)]">{p.pm}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Empty states ─────────────────────────────────────────────────────────────

function EmptyFiltered() {
  const { t } = useTranslation()
  return <EmptyState icon="📋" title={t('project.filterNoResults')} />
}

// ─── NewProjectModal ──────────────────────────────────────────────────────────

interface NewProjectModalProps {
  open: boolean
  onClose: () => void
  clients: Client[]
  teamMembers: TeamMember[]
  templates: ProjectTemplate[]
  onCreate: (data: {
    name: string; client: string; clientId?: string; pm: string; pmMemberId?: string; type: ProjectType
    language: 'pt' | 'en' | 'es'; devLead?: string; devLeadMemberId?: string
    devType?: 'integration' | 'application'; devIntegration?: string
  }) => void
}

function NewProjectModal({ open, onClose, clients, teamMembers, templates, onCreate }: NewProjectModalProps) {
  const { t, i18n } = useTranslation()
  const { createClient } = useAppStore()
  const [selectedType, setSelectedType] = useState<ProjectType>('nova_conta')
  const [clientId, setClientId] = useState('')
  const [isNewClient, setIsNewClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [name, setName] = useState('')
  const [pmMemberId, setPmMemberId] = useState('')
  const [language, setLanguage] = useState<'pt' | 'en' | 'es'>('pt')
  const [hasDev, setHasDev] = useState(false)
  const [devLeadMemberId, setDevLeadMemberId] = useState('')
  const [devType, setDevType] = useState<'integration' | 'application'>('integration')
  const [devIntegration, setDevIntegration] = useState('')
  const [attempted, setAttempted] = useState(false)

  const selectedClient = clients.find((c) => c.id === clientId)
  const finalClient = isNewClient ? newClientName : (selectedClient?.name ?? '')
  const errors = {
    name: attempted && !name.trim() ? t('errors.nameRequired') : '',
    client: attempted && !finalClient.trim() ? t('errors.clientRequired') : '',
    pm: attempted && !pmMemberId ? t('errors.pmRequired') : '',
  }
  const canCreate = name.trim() && finalClient.trim() && pmMemberId

  function reset() {
    setSelectedType('nova_conta'); setClientId(''); setIsNewClient(false); setNewClientName('')
    setName(''); setPmMemberId(''); setLanguage('pt'); setHasDev(false)
    setDevLeadMemberId(''); setDevType('integration'); setDevIntegration('')
    setAttempted(false)
  }

  function handleCreate() {
    setAttempted(true)
    if (!canCreate) return
    const finalClientId = isNewClient ? createClient({ name: newClientName.trim() }) : (clientId || undefined)
    const pmMember = teamMembers.find((m) => m.userId === pmMemberId)
    const devLeadMember = teamMembers.find((m) => m.userId === devLeadMemberId)
    onCreate({
      name: name.trim(), client: finalClient.trim(), clientId: finalClientId,
      pm: pmMember?.name ?? '', pmMemberId: pmMemberId || undefined, type: selectedType,
      language,
      ...(hasDev && {
        devLead: devLeadMember?.name, devLeadMemberId: devLeadMemberId || undefined,
        devType, devIntegration: devIntegration || undefined,
      }),
    })
    reset()
  }

  function handleClose() { reset(); onClose() }

  return (
    <Modal
      open={open}
      title={t('project.new')}
      onClose={handleClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>{t('actions.cancel')}</Button>
          <Button onClick={handleCreate} disabled={!canCreate}>{t('project.create')} →</Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Template cards */}
        <div>
          <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-3">{t('project.templateStep')}</p>
          <div className="grid grid-cols-2 gap-3">
            {templates.map((tpl: ProjectTemplate) => {
              const entryCount = tpl.phases.reduce((n: number, p) => n + p.entries.length, 0)
              const isActive = selectedType === tpl.type
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => setSelectedType(tpl.type)}
                  className={`text-left p-4 rounded-[var(--radius-lg)] border-2 transition-all ${
                    isActive
                      ? 'border-[var(--oe-primary)] bg-[var(--color-info-bg)]'
                      : 'border-[var(--border-default)] hover:border-[var(--oe-primary)] bg-[var(--surface-card)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-[var(--radius-lg)] flex items-center justify-center text-sm shrink-0 ${isActive ? 'bg-[var(--oe-primary)] text-white' : 'bg-[var(--surface-subtle)] text-[var(--text-tertiary)]'}`}>
                      {tpl.type === 'nova_conta' ? '🏢' : '🔧'}
                    </div>
                    <div>
                      <p className={`font-semibold text-sm ${isActive ? 'text-[var(--oe-primary)]' : 'text-[var(--text-secondary)]'}`}>
                        {t(`project.${tpl.type}`)}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                        {tpl.phases.length} {t('template.phases')} · {entryCount} {t('template.entries')}
                      </p>
                    </div>
                  </div>
                  {isActive && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {tpl.phases.map((ph) => (
                        <span key={ph.id} className="text-[10px] bg-[var(--color-info-bg)] text-[var(--color-info-text)] px-2 py-0.5 rounded-[var(--radius-pill)]">
                          {ph.nameKey ? i18n.t(ph.nameKey) : ph.name}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Details */}
        <div>
          <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-3">{t('project.detailsStep')}</p>
          <div className="grid grid-cols-2 gap-4">
            {/* Client */}
            <Field label={t('project.client')} required>
              {isNewClient ? (
                <div className="flex gap-1">
                  <Input
                    autoFocus
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder={t('project.newClient')}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => setIsNewClient(false)}
                    className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] px-2 text-sm"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <select
                  value={clientId}
                  onChange={(e) => {
                    if (e.target.value === '__new__') { setIsNewClient(true); setClientId('') }
                    else setClientId(e.target.value)
                  }}
                  className={`block w-full rounded-[var(--radius-md)] border px-3 py-2 text-sm focus:border-[var(--oe-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--oe-primary)] ${errors.client ? 'border-red-400' : 'border-[var(--border-default)]'}`}
                >
                  <option value="">{t('project.selectClient')}</option>
                  {[...clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="__new__">{t('project.newClient')}</option>
                </select>
              )}
              {errors.client && <p className="text-xs text-[var(--color-danger-text)] mt-1">{errors.client}</p>}
            </Field>

            {/* Name */}
            <Field label={t('project.name')} required>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={selectedType === 'nova_conta' ? 'Implementação ' + (finalClient || 'Cliente') : 'Projeto ' + (finalClient || 'Cliente')}
                className={errors.name ? 'border-red-400' : ''}
              />
              {errors.name && <p className="text-xs text-[var(--color-danger-text)] mt-1">{errors.name}</p>}
            </Field>

            {/* Líder */}
            <Field label={t('project.pm')} required>
              <select
                value={pmMemberId}
                onChange={(e) => setPmMemberId(e.target.value)}
                className={`block w-full rounded-[var(--radius-md)] border px-3 py-2 text-sm focus:border-[var(--oe-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--oe-primary)] ${errors.pm ? 'border-red-400' : 'border-[var(--border-default)]'}`}
              >
                <option value="">{t('project.pmPlaceholder')}</option>
                {teamMembers.map((m) => <option key={m.id} value={m.userId ?? ''}>{m.name}</option>)}
              </select>
              {errors.pm && <p className="text-xs text-[var(--color-danger-text)] mt-1">{errors.pm}</p>}
            </Field>

            {/* Language */}
            <Field label={t('project.language')}>
              <div className="flex gap-1 mt-0.5">
                {([['pt', '🇧🇷 PT'], ['en', '🇺🇸 EN'], ['es', '🇪🇸 ES']] as const).map(([l, label]) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLanguage(l)}
                    className={`flex-1 py-2 text-xs font-medium rounded-[var(--radius-md)] border transition-colors ${
                      language === l ? 'bg-[var(--oe-primary)] text-white border-[var(--oe-primary)]' : 'bg-[var(--surface-card)] text-[var(--text-secondary)] border-[var(--border-default)] hover:border-[var(--oe-primary)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </div>

        {/* Dev toggle */}
        <div className="border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-secondary)]">{t('project.hasDev')}</p>
              <p className="text-xs text-[var(--text-tertiary)]">{t('project.devSubtitle')}</p>
            </div>
            <button
              type="button"
              onClick={() => setHasDev((v) => !v)}
              className={`relative w-11 h-6 rounded-[var(--radius-pill)] transition-colors ${hasDev ? 'bg-[var(--oe-primary)]' : 'bg-[var(--border-default)]'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-[var(--radius-pill)] shadow transition-transform ${hasDev ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {hasDev && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {/* Dev type */}
              <Field label={t('project.devType')}>
                <div className="flex gap-1 mt-0.5">
                  {(['integration', 'application'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setDevType(v)}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border transition-colors ${
                        devType === v ? 'bg-[var(--oe-primary)] text-white border-[var(--oe-primary)]' : 'bg-[var(--surface-card)] text-[var(--text-secondary)] border-[var(--border-default)] hover:border-[var(--oe-primary)]'
                      }`}
                    >
                      {t(`project.${v}`)}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Dev lead */}
              <Field label={t('project.devLead')}>
                <select
                  value={devLeadMemberId}
                  onChange={(e) => setDevLeadMemberId(e.target.value)}
                  className="block w-full rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 py-2 text-sm focus:border-[var(--oe-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--oe-primary)]"
                >
                  <option value="">{t('project.devLeadPlaceholder')}</option>
                  {teamMembers.map((m) => <option key={m.id} value={m.userId ?? ''}>{m.name}</option>)}
                </select>
              </Field>

              {devType === 'integration' && (
                <Field label={t('project.devIntegration')} className="col-span-2">
                  <Input
                    value={devIntegration}
                    onChange={(e) => setDevIntegration(e.target.value)}
                    placeholder="Ex: SAP, Protheus, Salesforce..."
                  />
                </Field>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ─── ProjectsPage ─────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { projects, projectsLoading, settings, createProject, updateProject, archiveProject, archivedProjects, archivedProjectsLoaded, loadArchivedProjects, clients: storeClients, teamDirectory } = useAppStore()
  const { user } = useAuthStore()

  const [view, setView] = useState<'list' | 'kanban'>(() =>
    (localStorage.getItem('pb-portfolio-view') as 'list' | 'kanban') ?? 'list',
  )
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>({ client: '', pm: '', type: '', dev: '' })
  const [onlyMine, setOnlyMine] = useState(false)
  const [onlyDelayed, setOnlyDelayed] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkPmOpen, setBulkPmOpen] = useState(false)
  const [bulkPm, setBulkPm] = useState('')
  const [bulkClientOpen, setBulkClientOpen] = useState(false)
  const [bulkClientId, setBulkClientId] = useState('')

  useEffect(() => { localStorage.setItem('pb-portfolio-view', view) }, [view])

  const clientNames = useMemo(
    () => [...new Set([...storeClients.map((c) => c.name), ...uniqueClients(projects)])].sort(),
    [projects, storeClients],
  )
  const pms = useMemo(() => uniquePMs(projects), [projects])
  const teamMembers: TeamMember[] = useMemo(
    () => teamDirectory.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name ?? p.email ?? '', role: '', email: p.email ?? undefined, userId: p.id })),
    [teamDirectory],
  )
  const filtered = useMemo(() => {
    const base = onlyMine ? projects.filter((p) => isProjectMine(p, user?.id)) : projects
    const byDelayed = onlyDelayed ? base.filter((p) => isProjectDelayed(p, settings.holidays)) : base
    const bySearch = search.trim()
      ? byDelayed.filter((p) => (p.name + ' ' + p.client).toLowerCase().includes(search.trim().toLowerCase()))
      : byDelayed
    return applyFilters(bySearch, filters)
  }, [projects, filters, onlyMine, onlyDelayed, settings.holidays, user, search])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function applyBulkArchive() {
    for (const id of selected) archiveProject(id)
    setSelected(new Set())
  }

  function applyBulkStatus(status: ProjectStatus) {
    for (const id of selected) updateProject(id, { status })
    setSelected(new Set())
  }

  function applyBulkPm() {
    if (!bulkPm.trim()) return
    for (const id of selected) updateProject(id, { pm: bulkPm.trim() })
    setSelected(new Set())
    setBulkPmOpen(false)
  }

  function applyBulkClient() {
    const client = storeClients.find((c) => c.id === bulkClientId)
    if (!client) return
    for (const id of selected) updateProject(id, { clientId: client.id, client: client.name })
    setSelected(new Set())
    setBulkClientOpen(false)
  }

  function handleToggleArchived() {
    if (!showArchived && !archivedProjectsLoaded) loadArchivedProjects()
    setShowArchived(v => !v)
  }

  function handleCreate(data: Parameters<typeof createProject>[0]) {
    const id = createProject(data)
    setModalOpen(false)
    navigate(`/projects/${id}`)
  }

  async function handleBackup() {
    let archived = archivedProjects
    if (!archivedProjectsLoaded) {
      await loadArchivedProjects()
      archived = useAppStore.getState().archivedProjects
    }
    exportAllProjectsToJson(projects, archived, storeClients, t('portfolio.backupIncludeArchived'))
  }

  return (
    <div className="p-8 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t('nav.portfolio')}</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
            {filtered.length} / {projects.length}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex rounded-[var(--radius-lg)] border border-[var(--border-default)] overflow-hidden">
            <button
              onClick={() => setView('list')}
              className={`px-3 py-2 text-sm transition-colors ${view === 'list' ? 'bg-[var(--text-primary)] text-white' : 'bg-[var(--surface-card)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'}`}
              title={t('project.viewList')}
            >
              <ListIcon />
            </button>
            <button
              onClick={() => setView('kanban')}
              className={`px-3 py-2 text-sm transition-colors ${view === 'kanban' ? 'bg-[var(--text-primary)] text-white' : 'bg-[var(--surface-card)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'}`}
              title={t('project.viewKanban')}
            >
              <KanbanIcon />
            </button>
          </div>
          <button
            onClick={() => setOnlyMine((v) => !v)}
            className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-pill)] border transition-colors"
            style={{
              background: onlyMine ? 'var(--oe-primary)' : 'var(--surface-card)',
              color: onlyMine ? 'white' : 'var(--text-secondary)',
              borderColor: onlyMine ? 'var(--oe-primary)' : 'var(--border-default)',
            }}
          >
            {t('actions.onlyMine')}
          </button>
          <button
            onClick={() => setOnlyDelayed((v) => !v)}
            className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-pill)] border transition-colors"
            style={{
              background: onlyDelayed ? 'var(--color-danger-text)' : 'var(--surface-card)',
              color: onlyDelayed ? 'white' : 'var(--text-secondary)',
              borderColor: onlyDelayed ? 'var(--color-danger-text)' : 'var(--border-default)',
            }}
          >
            {t('project.delayed')}
          </button>
          <Button variant="secondary" onClick={() => setShowImportModal(true)}>
            {t('import.title')}
          </Button>
          <Button onClick={() => setModalOpen(true)}>
            <span className="text-base leading-none font-bold">+</span>
            {t('project.new')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      {!projectsLoading && projects.length > 0 && (
        <div className="mb-5 flex items-center gap-2.5">
          <div className="relative flex-1 max-w-xs">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }}>
              <SearchIcon />
            </span>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar projeto..."
              className="pl-8"
            />
          </div>
          <FilterBar filters={filters} setFilters={setFilters} clients={clientNames} pms={pms} />
        </div>
      )}

      {/* Loading skeleton */}
      {projectsLoading ? (
        <TableSkeleton columns={8} rows={5} />
      ) : projects.length === 0 ? (
        <EmptyState
          icon="🗂️"
          title={t('project.noProjectsTitle')}
          description={t('project.noProjectsDesc')}
          action={{ label: t('project.createFirst'), onClick: () => setModalOpen(true) }}
        />
      ) : view === 'list' ? (
        <>
          <ListView
            projects={showArchived ? [...filtered, ...archivedProjects] : filtered}
            holidays={settings.holidays}
            onOpen={(id) => navigate(`/projects/${id}`)}
            selected={selected}
            onToggle={toggleSelect}
          />
          <div className="mt-3 flex justify-center">
            <button
              onClick={handleToggleArchived}
              className="text-xs transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
            >
              {showArchived
                ? t('project.hideArchived')
                : t('project.showArchived', { n: archivedProjectsLoaded ? archivedProjects.length : '…' })}
            </button>
          </div>
        </>
      ) : (
        <KanbanView projects={filtered} holidays={settings.holidays} onOpen={(id) => navigate(`/projects/${id}`)} selected={selected} onToggle={toggleSelect} />
      )}

      <NewProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        clients={storeClients}
        teamMembers={teamMembers}
        templates={settings.templates}
        onCreate={handleCreate}
      />

      {showImportModal && (
        <ImportJsonModal
          initialTab="new"
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* Backup footer */}
      {!projectsLoading && projects.length > 0 && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={handleBackup}
            className="text-xs transition-colors"
            style={{ color: 'var(--text-disabled)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-disabled)')}
          >
            <span className="mr-1">↓</span>{t('portfolio.backupJson')}
          </button>
        </div>
      )}

      <SelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <button
          onClick={applyBulkArchive}
          className="text-xs px-2 py-1 rounded-[var(--radius-md)]"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          Arquivar
        </button>
        <select
          onChange={(e) => { if (e.target.value) applyBulkStatus(e.target.value as ProjectStatus) }}
          value=""
          className="text-xs rounded-[var(--radius-md)] px-2 py-1"
          style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none' }}
        >
          <option value="" disabled>Alterar status...</option>
          {KANBAN_STATUSES.map((s) => <option key={s} value={s}>{t(`project.${s}`)}</option>)}
        </select>
        <button
          onClick={() => { setBulkPm(''); setBulkPmOpen(true) }}
          className="text-xs px-2 py-1 rounded-[var(--radius-md)]"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          Alterar PM
        </button>
        <button
          onClick={() => { setBulkClientId(''); setBulkClientOpen(true) }}
          className="text-xs px-2 py-1 rounded-[var(--radius-md)]"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          Alterar cliente
        </button>
      </SelectionBar>

      <Modal
        open={bulkPmOpen}
        title={`Alterar PM de ${selected.size} item(ns)`}
        onClose={() => setBulkPmOpen(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkPmOpen(false)}>{t('actions.cancel')}</Button>
            <Button onClick={applyBulkPm} disabled={!bulkPm.trim()}>{t('actions.confirm')}</Button>
          </>
        }
      >
        <Field label={t('project.pm')}>
          <Input autoFocus value={bulkPm} onChange={(e) => setBulkPm(e.target.value)} />
        </Field>
      </Modal>

      <Modal
        open={bulkClientOpen}
        title={`Alterar cliente de ${selected.size} item(ns)`}
        onClose={() => setBulkClientOpen(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkClientOpen(false)}>{t('actions.cancel')}</Button>
            <Button onClick={applyBulkClient} disabled={!bulkClientId}>{t('actions.confirm')}</Button>
          </>
        }
      >
        <Field label={t('project.client')}>
          <Select value={bulkClientId} onChange={(e) => setBulkClientId(e.target.value)}>
            <option value="">—</option>
            {[...storeClients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </Modal>
    </div>
  )
}

// ─── icons ────────────────────────────────────────────────────────────────────

function ListIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  )
}

function KanbanIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m0 0a7.5 7.5 0 10-10.6-10.6 7.5 7.5 0 0010.6 10.6z" />
    </svg>
  )
}
