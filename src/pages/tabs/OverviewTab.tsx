import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Project, ProjectCharter, TeamMember, EntryOwner, ReportLink } from '@/types'
import { useAppStore } from '@/store/useAppStore'
import {
  projectProgress, projectOverdueCount, projectMilestoneProgress,
  projectDeadline, projectDurationDays, projectEndVariance, projectDateRange, daysUntil,
} from '@/utils/projectStats'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Field } from '@/components/ui/Input'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { Modal } from '@/components/ui/Modal'
import { CollapsibleSection } from '@/components/ui/CollapsibleSection'
import OwnersField from '@/components/plan/OwnersField'
import TeamTab from './TeamTab'

const EMPTY_CHARTER: ProjectCharter = {
  sponsor: '',
  objectives: '',
  scope: '',
  outOfScope: '',
  successCriteria: '',
  constraints: '',
  assumptions: '',
  budget: '',
}

const CHARTER_TEXTAREAS: { key: keyof ProjectCharter; rows?: number }[] = [
  { key: 'objectives', rows: 4 },
  { key: 'scope', rows: 4 },
  { key: 'outOfScope', rows: 3 },
  { key: 'successCriteria', rows: 3 },
  { key: 'constraints', rows: 3 },
  { key: 'assumptions', rows: 3 },
]

interface Props {
  project: Project
}

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function fmtGeneratedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

/** Líder/Dev Lead as a single-slot EntryOwner — no `contacts` prop is passed
 *  when rendering these with OwnersField, so client contacts never show up
 *  as pickable there (project leadership stays internal, team or free text). */
function personToOwner(memberId: string | undefined, name: string | undefined): EntryOwner[] {
  if (!name) return []
  return [{ id: 'x', type: memberId ? 'member' : 'text', memberId, name }]
}

// ─── small shared bits ─────────────────────────────────────────────────────

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}

function KpiTile({ label, value, sub, tone = 'neutral' }: {
  label: string
  value: string
  sub?: string
  tone?: 'good' | 'bad' | 'neutral'
}) {
  const stripe = tone === 'good' ? 'var(--color-success-text)' : tone === 'bad' ? 'var(--color-danger-text)' : 'var(--border-strong)'
  const valueColor = tone === 'good' ? 'var(--color-success-text)' : tone === 'bad' ? 'var(--color-danger-text)' : 'var(--text-primary)'
  return (
    <div style={{ position: 'relative', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '12px 13px', background: 'var(--surface-subtle)', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: stripe }} />
      <p style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-tertiary)', marginBottom: 7 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: valueColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>{sub}</p>}
    </div>
  )
}

function DateChip({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: muted ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

function ExternalLinkField({
  label, value, onSave, buttonLabel,
}: {
  label: string
  value: string | undefined
  onSave: (url: string) => void
  buttonLabel: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  function save() {
    onSave(draft.trim())
    setEditing(false)
  }

  return (
    <Field label={label}>
      {editing ? (
        <div className="flex gap-2">
          <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="https://..." />
          <Button size="sm" onClick={save}>É basicamente isso</Button>
          <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
        </div>
      ) : value ? (
        <div className="flex items-center gap-2">
          <a href={value} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="secondary">{buttonLabel} ↗</Button>
          </a>
          <button onClick={() => { setDraft(value); setEditing(true) }} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">editar</button>
        </div>
      ) : (
        <button onClick={() => { setDraft(''); setEditing(true) }} className="text-sm text-[var(--oe-primary)] hover:underline">+ Adicionar link</button>
      )}
    </Field>
  )
}

function ReportLinkRow({ link, onDelete }: { link: ReportLink; onDelete: () => void }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!link.url) return
    await navigator.clipboard.writeText(link.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <li className="flex items-center gap-2 group">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--text-primary)] truncate">{link.label}</p>
        <p className="text-[11px] text-[var(--text-tertiary)]">{fmtGeneratedAt(link.generatedAt)}</p>
      </div>
      <button onClick={copy} className="text-xs font-medium text-[var(--oe-primary)] hover:underline shrink-0">
        {copied ? t('report.linkCopied') : t('report.linkCopy')}
      </button>
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-medium text-[var(--text-secondary)] hover:underline shrink-0"
      >
        {t('report.linkOpen')}
      </a>
      <button
        onClick={onDelete}
        className="text-[var(--text-disabled)] hover:text-[var(--color-danger-text)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
      >
        ×
      </button>
    </li>
  )
}

/** Click-to-edit identity field backed by a searchable id→label picklist
 *  (client or team member). Local edit state, same interaction as
 *  ExternalLinkField — no field is ever locked to a separate "edit project"
 *  flow; everything here is editable in place. */
function EditableSelectField({
  label, value, options, onSave, allowClear,
}: {
  label: string
  value: string
  options: { id: string; label: string }[]
  onSave: (id: string) => void
  allowClear?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const displayLabel = options.find((o) => o.id === value)?.label

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      {editing ? (
        <div className="flex gap-2">
          <SearchableSelect
            value={draft}
            onChange={setDraft}
            options={options}
            emptyOptionLabel={allowClear ? '— Nenhum —' : undefined}
          />
          <Button size="sm" onClick={() => { onSave(draft); setEditing(false) }}>Salvar</Button>
          <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
        </div>
      ) : (
        <div
          onClick={() => { setDraft(value); setEditing(true) }}
          className="group flex items-center justify-between gap-2 px-2.5 py-1.5 -mx-2.5 rounded-[var(--radius-md)] cursor-pointer hover:bg-[var(--surface-subtle)]"
        >
          <span className="text-sm font-medium" style={{ color: displayLabel ? 'var(--text-primary)' : 'var(--text-disabled)', fontStyle: displayLabel ? 'normal' : 'italic' }}>
            {displayLabel ?? '—'}
          </span>
          <PencilIcon className="opacity-0 group-hover:opacity-100 shrink-0" />
        </div>
      )}
    </div>
  )
}

/** "Tipo de desenvolvimento" bundles three project fields (devType,
 *  devIntegration, and whether there's dev at all) into one editable row. */
function EditableDevField({ project, onSave }: {
  project: Project
  onSave: (patch: { devType?: 'integration' | 'application'; devIntegration?: string }) => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [hasDev, setHasDev] = useState(!!project.devType)
  const [devType, setDevType] = useState<'integration' | 'application'>(project.devType ?? 'integration')
  const [devIntegration, setDevIntegration] = useState(project.devIntegration ?? '')

  function startEdit() {
    setHasDev(!!project.devType)
    setDevType(project.devType ?? 'integration')
    setDevIntegration(project.devIntegration ?? '')
    setEditing(true)
  }

  function save() {
    onSave(hasDev ? { devType, devIntegration: devIntegration.trim() || undefined } : { devType: undefined, devIntegration: undefined })
    setEditing(false)
  }

  const displayValue = project.devType
    ? `${t(`project.${project.devType}`)}${project.devIntegration ? ` — ${project.devIntegration}` : ''}`
    : undefined

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>{t('overview.devType')}</p>
      {editing ? (
        <div className="space-y-2 p-3 rounded-[var(--radius-md)]" style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-default)' }}>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={hasDev} onChange={(e) => setHasDev(e.target.checked)} />
            {t('project.hasDev')}
          </label>
          {hasDev && (
            <>
              <div className="flex gap-2">
                {(['integration', 'application'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setDevType(v)}
                    className="flex-1 px-3 py-1.5 rounded-[var(--radius-md)] border text-xs font-medium"
                    style={devType === v
                      ? { background: 'var(--oe-primary)', color: 'white', borderColor: 'var(--oe-primary)' }
                      : { background: 'var(--surface-card)', color: 'var(--text-secondary)', borderColor: 'var(--border-default)' }}
                  >
                    {t(`project.${v}`)}
                  </button>
                ))}
              </div>
              {devType === 'integration' && (
                <Input value={devIntegration} onChange={(e) => setDevIntegration(e.target.value)} placeholder="Ex: SAP, Protheus, Salesforce..." />
              )}
            </>
          )}
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={save}>Salvar</Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <div
          onClick={startEdit}
          className="group flex items-center justify-between gap-2 px-2.5 py-1.5 -mx-2.5 rounded-[var(--radius-md)] cursor-pointer hover:bg-[var(--surface-subtle)]"
        >
          <span className="text-sm font-medium" style={{ color: displayValue ? 'var(--text-primary)' : 'var(--text-disabled)', fontStyle: displayValue ? 'normal' : 'italic' }}>
            {displayValue ?? '—'}
          </span>
          <PencilIcon className="opacity-0 group-hover:opacity-100 shrink-0" />
        </div>
      )}
    </div>
  )
}

// ─── component ──────────────────────────────────────────────────────────────

export default function OverviewTab({ project }: Props) {
  const { t } = useTranslation()
  const { updateProject, addProjectLink, removeProjectLink, deleteReportLink, clients, teamDirectory, settings } = useAppStore()
  const [overview, setOverview] = useState(project.overview ?? '')
  const [charter, setCharter] = useState<ProjectCharter>(project.charter ?? EMPTY_CHARTER)
  const [linkModal, setLinkModal] = useState(false)
  const [linkForm, setLinkForm] = useState({ label: '', url: '' })
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['dashboard']))
  const overviewTimer = useRef<ReturnType<typeof setTimeout>>()
  const charterTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    setOverview(project.overview ?? '')
    setCharter(project.charter ?? EMPTY_CHARTER)
  }, [project.id])

  useEffect(() => {
    clearTimeout(overviewTimer.current)
    overviewTimer.current = setTimeout(() => updateProject(project.id, { overview }), 700)
    return () => clearTimeout(overviewTimer.current)
  }, [overview])

  useEffect(() => {
    clearTimeout(charterTimer.current)
    charterTimer.current = setTimeout(() => updateProject(project.id, { charter }), 700)
    return () => clearTimeout(charterTimer.current)
  }, [charter])

  function setCharterField(field: keyof ProjectCharter, value: string) {
    setCharter((c) => ({ ...c, [field]: value }))
  }

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleAddLink() {
    if (!linkForm.url) return
    addProjectLink(project.id, { label: linkForm.label || linkForm.url, url: linkForm.url })
    setLinkForm({ label: '', url: '' })
    setLinkModal(false)
  }

  const teamMembers: TeamMember[] = useMemo(
    () => teamDirectory.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name ?? p.email ?? '', role: '', email: p.email ?? undefined, userId: p.id })),
    [teamDirectory],
  )
  const clientOptions = useMemo(() => [...clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ id: c.id, label: c.name })), [clients])

  // ── KPIs ──────────────────────────────────────────────────────────────
  const holidays = settings.holidays
  const progress = projectProgress(project)
  const variance = project.baselineSetAt ? projectEndVariance(project, holidays) : undefined
  const overdueCount = projectOverdueCount(project)
  const duration = projectDurationDays(project, holidays)
  const milestones = projectMilestoneProgress(project)
  const deadline = projectDeadline(project)
  const deadlineDays = deadline ? daysUntil(deadline.date) : undefined
  const dateRange = projectDateRange(project)

  return (
    <div className="p-6">
      <CollapsibleSection id="dashboard" title="Dashboard" open={openSections.has('dashboard')} onToggle={() => toggleSection('dashboard')}>
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
            <KpiTile
              label="Progresso"
              value={progress ? `${progress.pct}%` : '—'}
              sub={progress ? `${progress.done} de ${progress.total} entregas` : 'sem entregas'}
              tone={progress && progress.pct === 100 ? 'good' : 'neutral'}
            />
            <KpiTile
              label="Variação"
              value={variance !== undefined ? `${variance > 0 ? '+' : ''}${variance}d` : '—'}
              sub={project.baselineSetAt ? 'vs. baseline' : 'sem baseline'}
              tone={variance === undefined ? 'neutral' : variance > 0 ? 'bad' : variance < 0 ? 'good' : 'neutral'}
            />
            <KpiTile
              label="Atrasadas"
              value={String(overdueCount)}
              sub="tarefas em aberto"
              tone={overdueCount > 0 ? 'bad' : 'good'}
            />
            <KpiTile
              label="Duração"
              value={duration !== undefined ? `${duration}d` : '—'}
              sub="dias úteis"
            />
            <KpiTile
              label="Marcos"
              value={milestones ? `${milestones.done}/${milestones.total}` : '—'}
              sub="concluídos"
              tone={milestones && milestones.total > 0 && milestones.done === milestones.total ? 'good' : 'neutral'}
            />
            <KpiTile
              label="Prazo final"
              value={deadline && deadlineDays !== undefined ? `${Math.abs(deadlineDays)}d` : '—'}
              sub={
                !deadline ? 'sem data definida'
                : deadlineDays! < 0 ? 'em atraso'
                : (deadline.isGoLive ? 'até o go-live' : 'até o fim planejado')
              }
              tone={!deadline ? 'neutral' : deadlineDays! < 0 ? 'bad' : deadlineDays! <= 3 ? 'bad' : 'neutral'}
            />
          </div>

          {/* Important dates */}
          <div className="flex flex-wrap gap-6 px-4 py-3 rounded-[var(--radius-md)]" style={{ background: 'var(--surface-subtle)' }}>
            <DateChip label="Início planejado" value={fmtDate(dateRange.start)} />
            <DateChip label="Fim planejado" value={fmtDate(dateRange.end)} />
            {deadline?.isGoLive && <DateChip label="Go-live" value={fmtDate(deadline.date)} />}
            <DateChip label={t('overview.baseline')} value={project.baselineSetAt ? fmtDate(project.baselineSetAt.split('T')[0]) : '—'} muted />
          </div>

          {/* Informações */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3.5">
              <EditableSelectField
                label={t('project.client')}
                value={project.clientId ?? ''}
                options={clientOptions}
                onSave={(id) => updateProject(project.id, { clientId: id || undefined, client: clients.find((c) => c.id === id)?.name ?? project.client })}
              />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>{t('project.pm')}</p>
                <OwnersField
                  owners={personToOwner(project.pmMemberId, project.pm)}
                  onChange={(owners) => {
                    const o = owners[0]
                    updateProject(project.id, { pmMemberId: o?.type === 'member' ? o.memberId : undefined, pm: o?.name ?? '' })
                  }}
                  teamMembers={teamMembers}
                  max={1}
                />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>{t('project.devLead')}</p>
                <OwnersField
                  owners={personToOwner(project.devLeadMemberId, project.devLead)}
                  onChange={(owners) => {
                    const o = owners[0]
                    updateProject(project.id, { devLeadMemberId: o?.type === 'member' ? o.memberId : undefined, devLead: o?.name })
                  }}
                  teamMembers={teamMembers}
                  max={1}
                />
              </div>
              <EditableDevField project={project} onSave={(patch) => updateProject(project.id, patch)} />
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-tertiary)' }}>Links Ploomes</p>
                <div className="space-y-3">
                  <ExternalLinkField
                    label="Proposta"
                    value={project.proposalLink}
                    buttonLabel="Abrir proposta"
                    onSave={(url) => updateProject(project.id, { proposalLink: url || undefined })}
                  />
                  <ExternalLinkField
                    label="Negócio (deal)"
                    value={project.dealLink}
                    buttonLabel="Abrir negócio"
                    onSave={(url) => updateProject(project.id, { dealLink: url || undefined })}
                  />
                </div>
              </div>

              <div className="border-t pt-4" style={{ borderColor: 'var(--border-default)' }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>{t('overview.links')}</p>
                  <button onClick={() => setLinkModal(true)} className="text-xs font-medium text-[var(--oe-primary)] hover:underline">+ {t('overview.addLink')}</button>
                </div>
                {project.links.length === 0 ? (
                  <p className="text-sm text-[var(--text-tertiary)]">{t('overview.noLinks')}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {project.links.map((link) => (
                      <li key={link.id} className="flex items-center gap-2 group">
                        <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--oe-primary)] hover:underline flex-1 truncate">
                          {link.label}
                        </a>
                        <button
                          onClick={() => removeProjectLink(project.id, link.id)}
                          className="text-[var(--text-disabled)] hover:text-[var(--color-danger-text)] opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t pt-4" style={{ borderColor: 'var(--border-default)' }}>
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-tertiary)' }}>{t('report.linksTitle')}</p>
                {project.reportLinks.length === 0 ? (
                  <p className="text-sm text-[var(--text-tertiary)]">{t('report.noLinks')}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {project.reportLinks.map((link) => (
                      <ReportLinkRow
                        key={link.id}
                        link={link}
                        onDelete={() => { if (confirm(t('report.linkDeleteConfirm'))) deleteReportLink(project.id, link.id) }}
                      />
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t pt-4" style={{ borderColor: 'var(--border-default)' }}>
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-tertiary)' }}>{t('overview.notes')}</p>
                <Textarea
                  value={overview}
                  onChange={(e) => setOverview(e.target.value)}
                  rows={4}
                  placeholder={t('overview.notesPlaceholder')}
                />
                <p className="text-[11px] text-[var(--text-disabled)] mt-1.5">{t('overview.autosaved')}</p>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="team" title="Equipe do projeto" count={project.team.length}
        open={openSections.has('team')} onToggle={() => toggleSection('team')}
      >
        <TeamTab project={project} />
      </CollapsibleSection>

      <CollapsibleSection id="charter" title={t('charter.title')} open={openSections.has('charter')} onToggle={() => toggleSection('charter')}>
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label={t('charter.sponsor')}>
              <Input
                value={charter.sponsor}
                onChange={(e) => setCharterField('sponsor', e.target.value)}
                placeholder="Nome do sponsor executivo"
              />
            </Field>
            <Field label={t('charter.budget')}>
              <Input
                value={charter.budget ?? ''}
                onChange={(e) => setCharterField('budget', e.target.value)}
                placeholder="Ex: R$ 50.000"
              />
            </Field>
          </div>

          <div className="border-t border-[var(--border-default)] pt-5 grid grid-cols-1 gap-5">
            {CHARTER_TEXTAREAS.map(({ key, rows }) => (
              <Field key={key} label={t(`charter.${key}`)}>
                <Textarea
                  value={charter[key] ?? ''}
                  onChange={(e) => setCharterField(key, e.target.value)}
                  rows={rows ?? 3}
                  placeholder={`Descreva ${t(`charter.${key}`).toLowerCase()}...`}
                />
              </Field>
            ))}
          </div>
        </div>
      </CollapsibleSection>

      {/* Add link modal */}
      <Modal
        open={linkModal}
        title={t('overview.addLink')}
        onClose={() => setLinkModal(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLinkModal(false)}>{t('actions.cancel')}</Button>
            <Button onClick={handleAddLink} disabled={!linkForm.url}>{t('actions.confirm')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('overview.linkLabel')}>
            <Input
              value={linkForm.label}
              onChange={(e) => setLinkForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Ex: SharePoint do projeto"
            />
          </Field>
          <Field label={t('overview.linkUrl')} required>
            <Input
              value={linkForm.url}
              onChange={(e) => setLinkForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://..."
              type="url"
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
