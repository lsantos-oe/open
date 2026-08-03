import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { useToastStore } from '@/stores/useToastStore'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Field } from '@/components/ui/Input'
import StatusBadge from '@/components/StatusBadge'
import { ProjectStatus, Project, Entry, AppLanguage, TeamMember } from '@/types'
import { generateStatusReport, ReportConfig } from '@/utils/statusReport'
import { useSmartPosition } from '@/hooks/useSmartPosition'
import ReportConfigModal from '@/components/report/ReportConfigModal'
import ReportLinkModal from '@/components/report/ReportLinkModal'
import ImportJsonModal from '@/components/import/ImportJsonModal'
import { exportProjectCsv } from '@/utils/exportCsv'
import { exportProjectToJson } from '@/utils/exportJson'
import { projectDurationDays, isProjectDelayed, findGoLiveDate } from '@/utils/projectStats'
import { Badge } from '@/components/ui/Badge'
import PlanPage from './PlanPage'
import KanbanPage from './KanbanPage'
import RisksPage from './RisksPage'
import OverviewTab from './tabs/OverviewTab'
import DiaryTab from './tabs/DiaryTab'
import { AnchorNav } from '@/components/ui/AnchorNav'

const TAB_IDS = ['overview', 'plan', 'kanban', 'risks', 'diary'] as const
type TabId = typeof TAB_IDS[number]

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso?: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function findCurrentPhase(project: Project): string | undefined {
  let bestPhase: string | undefined
  let bestCount = 0
  for (const ph of project.phases) {
    const count = ph.entries.filter((e) => e.status === 'in_progress').length
    if (count > bestCount) { bestCount = count; bestPhase = ph.name }
  }
  if (bestPhase) return bestPhase
  for (const ph of project.phases) {
    if (ph.entries.some((e) => e.status === 'pending')) return ph.name
  }
  return undefined
}

// ─── InfoChip ─────────────────────────────────────────────────────────────────

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{label}</span>
      <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500 }}>{value}</span>
    </span>
  )
}

function ChipSep() {
  return <span style={{ color: 'var(--border-strong)', padding: '0 10px', fontSize: 12 }}>·</span>
}

// ─── GhostBtn ─────────────────────────────────────────────────────────────────

function GhostBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 text-[12px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ color: 'var(--text-tertiary)', padding: '4px 8px', borderRadius: 'var(--radius-md)' }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--surface-subtle)' } }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.background = '' }}
    >
      {children}
    </button>
  )
}

// ─── MoreMenu ─────────────────────────────────────────────────────────────────

function MoreMenu({ onImportUpdate, onExportJson, onDuplicate, onArchive }: { onImportUpdate: () => void; onExportJson: () => void; onDuplicate: () => void; onArchive: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { triggerRef, popoverRef, position } = useSmartPosition(open)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const menuItem = (onClick: () => void, danger: boolean, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => { setOpen(false); onClick() }}
      className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors"
      style={{ color: danger ? 'var(--color-danger-text)' : 'var(--text-secondary)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-subtle)')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}
    >
      {icon}
      {label}
    </button>
  )

  const sep = <div style={{ height: '0.5px', background: 'var(--border-default)', margin: '2px 8px' }} />

  return (
    <>
      <button
        ref={triggerRef as any}
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-center transition-colors"
        style={{ width: 28, height: 28, borderRadius: 'var(--radius-md)', color: 'var(--text-tertiary)' }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--surface-subtle)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.background = '' }}
        title="Mais opções"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="10" cy="4" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>
      {open && createPortal(
        <div
          ref={popoverRef as any}
          className="py-1 w-52"
          style={{ position: 'fixed', ...position, zIndex: 1000, background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
        >
          {menuItem(onImportUpdate, false,
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4-4m0 0l4 4m-4-4v12" /></svg>,
            t('import.importUpdate'),
          )}
          {menuItem(onExportJson, false,
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>,
            t('project.exportJson'),
          )}
          {sep}
          {menuItem(onDuplicate, false,
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
            t('project.duplicateCTA'),
          )}
          {sep}
          {menuItem(onArchive, true,
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>,
            t('project.archiveTitle'),
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

// ─── DuplicateModal ───────────────────────────────────────────────────────────

function DuplicateModal({ open, project, onClose }: { open: boolean; project: Project; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { duplicateProject, clients: storeClients, createClient, teamDirectory } = useAppStore()
  const { addToast } = useToastStore()

  const [name, setName] = useState('')
  const [clientId, setClientId] = useState('')
  const [isNewClient, setIsNewClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [pmMemberId, setPmMemberId] = useState('')
  const [language, setLanguage] = useState<AppLanguage>('pt')
  const [hasDev, setHasDev] = useState(false)
  const [devLeadMemberId, setDevLeadMemberId] = useState('')
  const [devType, setDevType] = useState<'integration' | 'application'>('integration')
  const [devIntegration, setDevIntegration] = useState('')
  const [attempted, setAttempted] = useState(false)

  // Pre-fill from source project when modal opens
  useEffect(() => {
    if (!open) return
    setName(`${project.name} — cópia`)
    setClientId(project.clientId ?? '')
    setIsNewClient(false)
    setNewClientName('')
    setPmMemberId(project.pmMemberId ?? '')
    setLanguage(project.language ?? 'pt')
    const hasDev = !!project.devType
    setHasDev(hasDev)
    setDevLeadMemberId(project.devLeadMemberId ?? '')
    setDevType(project.devType ?? 'integration')
    setDevIntegration(project.devIntegration ?? '')
    setAttempted(false)
  }, [open, project])

  const teamMembers: TeamMember[] = useMemo(
    () => teamDirectory.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name ?? p.email ?? '', role: '', email: p.email ?? undefined, userId: p.id })),
    [teamDirectory],
  )

  const selectedClient = storeClients.find((c) => c.id === clientId)
  const finalClient = isNewClient ? newClientName : (selectedClient?.name ?? '')
  const errors = {
    name: attempted && !name.trim() ? t('errors.nameRequired') : '',
    client: attempted && !finalClient.trim() ? t('errors.clientRequired') : '',
    pm: attempted && !pmMemberId ? t('errors.pmRequired') : '',
  }

  function handleDuplicate() {
    setAttempted(true)
    if (!name.trim() || !finalClient.trim() || !pmMemberId) return
    const finalClientId = isNewClient ? createClient({ name: newClientName.trim() }) : (clientId || undefined)
    const pmMember = teamMembers.find((m) => m.userId === pmMemberId)
    const devLeadMember = teamMembers.find((m) => m.userId === devLeadMemberId)
    const newId = duplicateProject(project, {
      name: name.trim(),
      clientIds: finalClientId ? [finalClientId] : [],
      pm: pmMember?.name ?? '',
      pmMemberId: pmMemberId || undefined,
      language,
      ...(hasDev && devType ? {
        devLead: devLeadMember?.name, devLeadMemberId: devLeadMemberId || undefined,
        devType, devIntegration: devIntegration || undefined,
      } : {}),
    })
    onClose()
    navigate(`/projects/${newId}`)
    addToast(t('project.duplicateSuccess'), 'success')
  }

  return (
    <Modal
      open={open}
      title={t('project.duplicateTitle')}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button onClick={handleDuplicate}>{t('project.duplicateCTA')} →</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          {/* Name */}
          <Field label={t('project.name')} required className="col-span-2">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={errors.name ? 'border-red-400' : ''}
            />
            {errors.name && <p className="text-xs text-[var(--color-danger-text)] mt-1">{errors.name}</p>}
          </Field>

          {/* Client */}
          <Field label={t('project.client')} required>
            {isNewClient ? (
              <div className="flex gap-1">
                <Input
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder={t('project.newClient')}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => setIsNewClient(false)}
                  className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] px-2 text-sm"
                >×</button>
              </div>
            ) : (
              <select
                value={clientId}
                onChange={(e) => {
                  if (e.target.value === '__new__') { setIsNewClient(true); setClientId('') }
                  else setClientId(e.target.value)
                }}
                className={`block w-full rounded-[var(--radius-md)] border bg-[var(--surface-input)] text-[var(--text-primary)] px-3 py-2 text-sm focus:border-[var(--oe-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--oe-primary)] ${errors.client ? 'border-red-400' : 'border-[var(--border-default)]'}`}
              >
                <option value="">{t('project.selectClient')}</option>
                {[...storeClients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="__new__">{t('project.newClient')}</option>
              </select>
            )}
            {errors.client && <p className="text-xs text-[var(--color-danger-text)] mt-1">{errors.client}</p>}
          </Field>

          {/* Líder */}
          <Field label={t('project.pm')} required>
            <select
              value={pmMemberId}
              onChange={(e) => setPmMemberId(e.target.value)}
              className={`block w-full rounded-[var(--radius-md)] border bg-[var(--surface-input)] text-[var(--text-primary)] px-3 py-2 text-sm focus:border-[var(--oe-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--oe-primary)] ${errors.pm ? 'border-red-400' : 'border-[var(--border-default)]'}`}
            >
              <option value="">{t('project.pmPlaceholder')}</option>
              {teamMembers.map((m) => <option key={m.id} value={m.userId ?? ''}>{m.name}</option>)}
            </select>
            {errors.pm && <p className="text-xs text-[var(--color-danger-text)] mt-1">{errors.pm}</p>}
          </Field>

          {/* Language */}
          <Field label={t('project.language')} className="col-span-2">
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

              <Field label={t('project.devLead')}>
                <select
                  value={devLeadMemberId}
                  onChange={(e) => setDevLeadMemberId(e.target.value)}
                  className="block w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-input)] text-[var(--text-primary)] px-3 py-2 text-sm focus:border-[var(--oe-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--oe-primary)]"
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

// ─── ProjectDetailPage ────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { projects, settings, updateProject, renameProject, archiveProject, clients: storeClients } = useAppStore()
  const queryTab = searchParams.get('tab')
  const defaultTab = localStorage.getItem('pb-default-project-tab')
  const initialTab = (TAB_IDS as readonly string[]).includes(queryTab ?? '')
    ? (queryTab as TabId)
    : (TAB_IDS as readonly string[]).includes(defaultTab ?? '')
      ? (defaultTab as TabId)
      : 'overview'
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)
  const [focusRiskId, setFocusRiskId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [exportingReport, setExportingReport] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [linkReportConfig, setLinkReportConfig] = useState<ReportConfig | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showArchiveModal, setShowArchiveModal] = useState(false)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)

  const project = projects.find((p) => p.id === id)

  const duration = useMemo(
    () => (project ? projectDurationDays(project, settings.holidays) : undefined),
    [project, settings.holidays],
  )
  const delayed = useMemo(
    () => (project ? isProjectDelayed(project, settings.holidays) : false),
    [project, settings.holidays],
  )
  const goLiveDate = useMemo(() => (project ? findGoLiveDate(project) : undefined), [project])
  const currentPhase = useMemo(() => (project ? findCurrentPhase(project) : undefined), [project])

  function selectTab(id: string) {
    setActiveTab(id as TabId)
  }

  function startEditName() {
    if (!project) return
    setNameDraft(project.name)
    setEditingName(true)
  }

  function saveName() {
    if (project) renameProject(project.id, nameDraft)
    setEditingName(false)
  }

  async function handleGenerateReport(config: ReportConfig) {
    if (!project || exportingReport) return
    setExportingReport(true)
    try { await generateStatusReport(project, settings, config) }
    finally { setExportingReport(false) }
  }

  if (!project) {
    return (
      <div className="p-8 text-center py-24" style={{ color: 'var(--text-tertiary)' }}>
        <div className="text-4xl mb-3">🔍</div>
        <p className="text-[13px]">{t('project.notFound')}</p>
        <Button className="mt-4" variant="secondary" onClick={() => navigate('/portfolio')}>← {t('nav.portfolio')}</Button>
      </div>
    )
  }

  // ── Subheader chips ────────────────────────────────────────────────────────

  const chips: { label: string; value: string }[] = []
  chips.push({ label: t('project.client'), value: project.client })
  chips.push({ label: t('project.pm'), value: project.pm })
  if (project.devLead) chips.push({ label: t('project.devLead'), value: project.devLead })
  if (project.devType) {
    const devVal = t(`project.${project.devType}`) + (project.devIntegration ? ` · ${project.devIntegration}` : '')
    chips.push({ label: 'Dev', value: devVal })
  }
  if (duration !== undefined) chips.push({ label: t('overview.baseline'), value: `${duration} ${t('project.workingDays')}` })
  if (goLiveDate) chips.push({ label: 'Go live', value: fmtDate(goLiveDate) })
  if (currentPhase) chips.push({ label: t('plan.phase'), value: currentPhase })

  return (
    <div className="flex flex-col min-h-full min-w-0">

      {/* ── Topbar ── */}
      <div
        className="flex items-center gap-3 px-5 shrink-0"
        style={{ height: 52, background: 'var(--surface-card)', borderBottom: '0.5px solid var(--border-default)' }}
      >
        {/* Breadcrumb + project name */}
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            onClick={() => navigate('/portfolio')}
            className="text-[11px] transition-colors whitespace-nowrap shrink-0"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
          >
            ← {t('nav.portfolio')}
          </button>
          <span style={{ color: 'var(--border-strong)', fontSize: 11 }}>·</span>
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setEditingName(false)
              }}
              className="text-[15px] font-[500] bg-transparent outline-none border-b"
              style={{ color: 'var(--text-primary)', borderColor: 'var(--oe-primary)', width: `${Math.min(60, Math.max(10, nameDraft.length + 2))}ch` }}
            />
          ) : (
            <span
              onClick={startEditName}
              className="text-[15px] font-[500] truncate cursor-text hover:opacity-70 transition-opacity"
              style={{ color: 'var(--text-primary)' }}
              title={t('project.editNameHint')}
            >
              {project.name}
            </span>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Delayed badge — computed from baseline variance, not a status the user picks */}
        {delayed && <Badge variant="red">{t('project.delayed')}</Badge>}

        {/* Status badge (clickable dropdown) */}
        <StatusBadge
          value={project.status}
          onChange={(s) => updateProject(project.id, { status: s as ProjectStatus })}
          options={[
            { value: 'backlog', label: t('status.backlog') },
            { value: 'planning', label: t('status.planning') },
            { value: 'in_progress', label: t('status.in_progress') },
            { value: 'done', label: t('status.done') },
          ]}
        />

        {/* Export report */}
        <GhostBtn onClick={() => setShowReportModal(true)} disabled={exportingReport}>
          {exportingReport ? (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
          )}
          {exportingReport ? t('report.generating') : t('report.exportBtn')}
        </GhostBtn>

        {/* Export CSV — only while the Plano tab is active */}
        {activeTab === 'plan' && (
          <GhostBtn onClick={() => exportProjectCsv(project, settings.holidays)}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t('plan.exportCsv')}
          </GhostBtn>
        )}

        {/* More options */}
        <MoreMenu
          onImportUpdate={() => setShowImportModal(true)}
          onExportJson={() => exportProjectToJson(project, storeClients)}
          onDuplicate={() => setShowDuplicateModal(true)}
          onArchive={() => setShowArchiveModal(true)}
        />
      </div>

      {/* ── Anchor nav ── */}
      <div className="px-5 pt-3 shrink-0" style={{ background: 'var(--surface-card)' }}>
        <AnchorNav
          items={TAB_IDS.map((tid) => ({
            id: tid,
            label:
              (tid === 'kanban' ? t('tasks.title') : t(`tabs.${tid}`)) +
              (tid === 'risks' && project.risks.length > 0 ? ` (${project.risks.length})` : '') +
              (tid === 'diary' && (project.openPoints?.filter((op) => op.status === 'open').length ?? 0) > 0
                ? ` (${project.openPoints!.filter((op) => op.status === 'open').length})`
                : ''),
          }))}
          onNavigate={selectTab}
          active={activeTab}
          background="var(--surface-card)"
        />
      </div>

      {/* ── Active tab content ── */}
      <div className="flex-1 overflow-auto min-w-0 px-5 pt-5 pb-8" style={{ background: 'var(--surface-page)' }}>
        {activeTab === 'overview' && <OverviewTab project={project} />}
        {activeTab === 'plan' && (
          <PlanPage projectId={project.id} onNavigateToRisk={(riskId) => { setActiveTab('risks'); setFocusRiskId(riskId) }} />
        )}
        {activeTab === 'kanban' && <KanbanPage projectId={project.id} />}
        {activeTab === 'risks' && (
          <RisksPage projectId={project.id} focusRiskId={focusRiskId} onFocusConsumed={() => setFocusRiskId(null)} />
        )}
        {activeTab === 'diary' && <DiaryTab project={project} />}
      </div>

      {/* ── Footer metadata bar ── */}
      <div
        className="flex items-center flex-wrap px-5 shrink-0"
        style={{ background: 'var(--surface-subtle)', borderTop: '0.5px solid var(--border-default)', padding: '8px 20px' }}
      >
        {chips.map((chip, i) => (
          <span key={chip.label} className="flex items-center">
            {i > 0 && <ChipSep />}
            <InfoChip label={chip.label} value={chip.value} />
          </span>
        ))}
      </div>

      {showReportModal && (
        <ReportConfigModal
          projectId={project.id}
          onGenerate={(config) => { setShowReportModal(false); handleGenerateReport(config) }}
          onGenerateLink={(config) => { setShowReportModal(false); setLinkReportConfig(config) }}
          onClose={() => setShowReportModal(false)}
        />
      )}

      {linkReportConfig && (
        <ReportLinkModal
          project={project}
          settings={settings}
          config={linkReportConfig}
          onClose={() => setLinkReportConfig(null)}
        />
      )}

      {showImportModal && (
        <ImportJsonModal
          initialTab="update"
          projectId={project.id}
          onClose={() => setShowImportModal(false)}
        />
      )}

      <DuplicateModal
        open={showDuplicateModal}
        project={project}
        onClose={() => setShowDuplicateModal(false)}
      />

      <Modal
        open={showArchiveModal}
        title={t('project.archiveTitle')}
        onClose={() => setShowArchiveModal(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowArchiveModal(false)}>
              {t('actions.cancel')}
            </Button>
            <Button
              onClick={async () => {
                setShowArchiveModal(false)
                await archiveProject(project.id)
                navigate('/portfolio')
              }}
              style={{ background: 'var(--color-danger-text)', borderColor: 'var(--color-danger-text)' }}
            >
              {t('project.archive')}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {t('project.archiveMessage')}
        </p>
      </Modal>
    </div>
  )
}
