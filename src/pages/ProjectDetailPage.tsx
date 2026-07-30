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
import { ProjectStatus, Project, Entry, AppLanguage } from '@/types'
import { generateStatusReport, ReportConfig } from '@/utils/statusReport'
import { useSmartPosition } from '@/hooks/useSmartPosition'
import ReportConfigModal from '@/components/report/ReportConfigModal'
import ImportJsonModal from '@/components/import/ImportJsonModal'
import { exportProjectCsv } from '@/utils/exportCsv'
import { exportProjectToJson } from '@/utils/exportJson'
import { projectDurationDays } from '@/utils/projectStats'
import PlanPage from './PlanPage'
import KanbanPage from './KanbanPage'
import RisksPage from './RisksPage'
import DelayLogPage from './DelayLogPage'
import OverviewTab from './tabs/OverviewTab'
import TeamTab from './tabs/TeamTab'
import DiaryTab from './tabs/DiaryTab'
import { AnchorNav } from '@/components/ui/AnchorNav'
import { CollapsibleSection } from '@/components/ui/CollapsibleSection'

const TAB_IDS = ['overview', 'team', 'plan', 'kanban', 'risks', 'delayLog', 'diary'] as const
type TabId = typeof TAB_IDS[number]

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso?: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function findGoLive(project: Project): string | undefined {
  const milestones: Entry[] = []
  for (const ph of project.phases) {
    for (const e of ph.entries) {
      if (e.type === 'milestone') milestones.push(e)
    }
  }
  const goLive = milestones.find((e) => e.name.toLowerCase().includes('go live') || e.name.toLowerCase().includes('go-live'))
  const target = goLive ?? milestones[milestones.length - 1]
  return target?.plannedDate
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
    <span className="flex items-center gap-1">
      <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{label}</span>
      <span style={{ color: 'var(--text-secondary)', fontSize: 11, fontWeight: 500 }}>{value}</span>
    </span>
  )
}

function ChipSep() {
  return <span style={{ color: 'var(--border-strong)', padding: '0 6px', fontSize: 11 }}>·</span>
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
  const { projects, duplicateProject, clients: storeClients, createClient } = useAppStore()
  const { addToast } = useToastStore()

  const [name, setName] = useState('')
  const [clientId, setClientId] = useState('')
  const [isNewClient, setIsNewClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [pm, setPm] = useState('')
  const [language, setLanguage] = useState<AppLanguage>('pt')
  const [hasDev, setHasDev] = useState(false)
  const [devLead, setDevLead] = useState('')
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
    setPm(project.pm ?? '')
    setLanguage(project.language ?? 'pt')
    const hasDev = !!project.devType
    setHasDev(hasDev)
    setDevLead(project.devLead ?? '')
    setDevType(project.devType ?? 'integration')
    setDevIntegration(project.devIntegration ?? '')
    setAttempted(false)
  }, [open, project])

  const allMembers = useMemo(
    () => [...new Set(projects.flatMap((p) => [p.pm, p.devLead].filter(Boolean) as string[]))].sort(),
    [projects],
  )

  const selectedClient = storeClients.find((c) => c.id === clientId)
  const finalClient = isNewClient ? newClientName : (selectedClient?.name ?? '')
  const errors = {
    name: attempted && !name.trim() ? t('errors.nameRequired') : '',
    client: attempted && !finalClient.trim() ? t('errors.clientRequired') : '',
    pm: attempted && !pm.trim() ? t('errors.pmRequired') : '',
  }

  function handleDuplicate() {
    setAttempted(true)
    if (!name.trim() || !finalClient.trim() || !pm.trim()) return
    const finalClientId = isNewClient ? createClient({ name: newClientName.trim() }) : (clientId || undefined)
    const newId = duplicateProject(project, {
      name: name.trim(),
      client: finalClient.trim(),
      clientId: finalClientId,
      pm: pm.trim(),
      language,
      ...(hasDev && devType ? { devLead: devLead || undefined, devType, devIntegration: devIntegration || undefined } : {}),
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
                className={`block w-full rounded-[var(--radius-md)] border px-3 py-2 text-sm focus:border-[var(--oe-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--oe-primary)] ${errors.client ? 'border-red-400' : 'border-[var(--border-default)]'}`}
              >
                <option value="">{t('project.selectClient')}</option>
                {[...storeClients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="__new__">{t('project.newClient')}</option>
              </select>
            )}
            {errors.client && <p className="text-xs text-[var(--color-danger-text)] mt-1">{errors.client}</p>}
          </Field>

          {/* PM */}
          <Field label={t('project.pm')} required>
            <input
              list="dup-pm-options"
              value={pm}
              onChange={(e) => setPm(e.target.value)}
              placeholder={t('project.pmPlaceholder')}
              className={`block w-full rounded-[var(--radius-md)] border px-3 py-2 text-sm focus:border-[var(--oe-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--oe-primary)] ${errors.pm ? 'border-red-400' : 'border-[var(--border-default)]'}`}
            />
            <datalist id="dup-pm-options">
              {allMembers.map((m) => <option key={m} value={m} />)}
            </datalist>
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
                <input
                  list="dup-dev-options"
                  value={devLead}
                  onChange={(e) => setDevLead(e.target.value)}
                  placeholder={t('project.devLeadPlaceholder')}
                  className="block w-full rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 py-2 text-sm focus:border-[var(--oe-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--oe-primary)]"
                />
                <datalist id="dup-dev-options">
                  {allMembers.map((m) => <option key={m} value={m} />)}
                </datalist>
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
  const { projects, settings, updateProject, archiveProject, clients: storeClients } = useAppStore()
  const queryTab = searchParams.get('tab')
  const defaultTab = localStorage.getItem('pb-default-project-tab')
  const initialTab = (TAB_IDS as readonly string[]).includes(queryTab ?? '')
    ? (queryTab as TabId)
    : (TAB_IDS as readonly string[]).includes(defaultTab ?? '')
      ? (defaultTab as TabId)
      : 'overview'
  const [openSections, setOpenSections] = useState<Set<TabId>>(new Set([initialTab]))
  const [focusRiskId, setFocusRiskId] = useState<string | null>(null)
  const [exportingReport, setExportingReport] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showArchiveModal, setShowArchiveModal] = useState(false)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)

  const project = projects.find((p) => p.id === id)

  const duration = useMemo(
    () => (project ? projectDurationDays(project, settings.holidays) : undefined),
    [project, settings.holidays],
  )
  const goLiveDate = useMemo(() => (project ? findGoLive(project) : undefined), [project])
  const currentPhase = useMemo(() => (project ? findCurrentPhase(project) : undefined), [project])

  function toggleSection(id: TabId) {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function openAndScroll(id: string) {
    setOpenSections((prev) => new Set(prev).add(id as TabId))
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
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
    <div className="flex flex-col min-h-full">

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
          <span className="text-[15px] font-[500] truncate" style={{ color: 'var(--text-primary)' }}>
            {project.name}
          </span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Status badge (clickable dropdown) */}
        <StatusBadge
          value={project.status}
          onChange={(s) => updateProject(project.id, { status: s as ProjectStatus })}
          options={[
            { value: 'planning', label: t('status.planning') },
            { value: 'in_progress', label: t('status.in_progress') },
            { value: 'delayed', label: t('status.delayed') },
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

        {/* Export CSV — only while the Plano section is open */}
        {openSections.has('plan') && (
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

      {/* ── Subheader chips ── */}
      <div
        className="flex items-center flex-wrap px-5 shrink-0"
        style={{ minHeight: 34, background: 'var(--surface-subtle)', borderBottom: '0.5px solid var(--border-default)', padding: '5px 20px' }}
      >
        {chips.map((chip, i) => (
          <span key={chip.label} className="flex items-center">
            {i > 0 && <ChipSep />}
            <InfoChip label={chip.label} value={chip.value} />
          </span>
        ))}
      </div>

      {/* ── Anchor nav ── */}
      <div className="px-5 shrink-0" style={{ background: 'var(--surface-card)' }}>
        <AnchorNav
          items={TAB_IDS.map((tid) => ({
            id: tid,
            label:
              t(`tabs.${tid}`) +
              (tid === 'risks' && project.risks.length > 0 ? ` (${project.risks.length})` : '') +
              (tid === 'delayLog' && project.delayLog.length > 0 ? ` (${project.delayLog.length})` : '') +
              (tid === 'team' && project.team.length > 0 ? ` (${project.team.length})` : '') +
              (tid === 'diary' && (project.openPoints?.filter((op) => op.status === 'open').length ?? 0) > 0
                ? ` (${project.openPoints!.filter((op) => op.status === 'open').length})`
                : ''),
          }))}
          onNavigate={openAndScroll}
        />
      </div>

      {/* ── Sections ── */}
      <div className="flex-1 overflow-auto px-5 py-4" style={{ background: 'var(--surface-page)' }}>
        <CollapsibleSection id="overview" title={t('tabs.overview')} open={openSections.has('overview')} onToggle={() => toggleSection('overview')}>
          <OverviewTab project={project} />
        </CollapsibleSection>
        <CollapsibleSection id="team" title={t('tabs.team')} count={project.team.length || undefined} open={openSections.has('team')} onToggle={() => toggleSection('team')}>
          <TeamTab project={project} />
        </CollapsibleSection>
        <CollapsibleSection id="plan" title={t('tabs.plan')} open={openSections.has('plan')} onToggle={() => toggleSection('plan')}>
          <PlanPage projectId={project.id} onNavigateToRisk={(riskId) => { openAndScroll('risks'); setFocusRiskId(riskId) }} />
        </CollapsibleSection>
        <CollapsibleSection id="kanban" title={t('tabs.kanban')} open={openSections.has('kanban')} onToggle={() => toggleSection('kanban')}>
          <KanbanPage projectId={project.id} />
        </CollapsibleSection>
        <CollapsibleSection id="risks" title={t('tabs.risks')} count={project.risks.length || undefined} open={openSections.has('risks')} onToggle={() => toggleSection('risks')}>
          <RisksPage projectId={project.id} focusRiskId={focusRiskId} onFocusConsumed={() => setFocusRiskId(null)} />
        </CollapsibleSection>
        <CollapsibleSection id="delayLog" title={t('tabs.delayLog')} count={project.delayLog.length || undefined} open={openSections.has('delayLog')} onToggle={() => toggleSection('delayLog')}>
          <DelayLogPage projectId={project.id} />
        </CollapsibleSection>
        <CollapsibleSection id="diary" title={t('tabs.diary')} open={openSections.has('diary')} onToggle={() => toggleSection('diary')}>
          <DiaryTab project={project} />
        </CollapsibleSection>
      </div>

      {showReportModal && (
        <ReportConfigModal
          projectId={project.id}
          onGenerate={(config) => { setShowReportModal(false); handleGenerateReport(config) }}
          onClose={() => setShowReportModal(false)}
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
