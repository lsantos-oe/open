import i18n from '@/i18n'
import { Project, AppSettings, Entry, ProjectCharter } from '@/types'
import { projectDurationDays, projectDateRange } from './projectStats'
import { computeVariance } from './dateEngine'

// ─── types ────────────────────────────────────────────────────────────────────

export interface ReportConfig {
  layout: 'standard' | 'ploomes'
  sections: {
    summary: boolean
    team: boolean
    charter: boolean
    milestones: boolean
    plan: boolean
    delayLog: boolean
    risks: boolean
  }
  planColumns: {
    type: boolean
    responsible: boolean
    deps: boolean
    plannedStart: boolean
    plannedEnd: boolean
    baselineStart: boolean
    baselineEnd: boolean
    variance: boolean
    duration: boolean
    status: boolean
  }
}

export const DEFAULT_REPORT_CONFIG: ReportConfig = {
  layout: 'standard',
  sections: {
    summary: true,
    team: false,
    charter: false,
    milestones: true,
    plan: true,
    delayLog: true,
    risks: true,
  },
  planColumns: {
    type: true,
    responsible: true,
    deps: false,
    plannedStart: true,
    plannedEnd: true,
    baselineStart: false,
    baselineEnd: false,
    variance: true,
    duration: false,
    status: true,
  },
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const STANDARD_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Inter', 'Arimo', Arial, sans-serif;
  font-size: 13px;
  color: #1C1917;
  background: #fff;
  line-height: 1.6;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.page { max-width: 794px; margin: 0 auto; padding: 40px 44px; }

@media print {
  body { margin: 0; }
  .page { padding: 28px 32px; max-width: 100%; }
  .no-break { page-break-inside: avoid; break-inside: avoid; }
  .page-break { page-break-before: always; break-before: always; }
  @page { margin: 0; size: A4; }
}

/* CABEÇALHO */
.report-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 18px;
  border-bottom: 2px solid #1C1917;
  margin-bottom: 28px;
}
.report-logo {
  font-family: 'Manrope', sans-serif;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
  color: #1C1917;
}
.report-logo span { color: #E8590C; }
.report-title {
  font-family: 'Lora', serif;
  font-style: italic;
  font-weight: 600;
  font-size: 24px;
  color: #1C1917;
  margin-bottom: 6px;
  line-height: 1.2;
}
.report-meta {
  font-size: 12px;
  color: #A8A29E;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.report-meta span { white-space: nowrap; }
.report-date-block { text-align: right; }
.report-date-label {
  font-family: 'Manrope', sans-serif;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: #A8A29E;
  margin-bottom: 3px;
}
.report-date-val { font-size: 13px; font-weight: 500; color: #1C1917; }

/* SEÇÕES */
.section { margin-bottom: 28px; }
.section-title {
  font-family: 'Manrope', sans-serif;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .07em;
  color: #A8A29E;
  border-bottom: 0.5px solid #E7E5E4;
  padding-bottom: 6px;
  margin-bottom: 14px;
}

/* CARDS DE RESUMO */
.summary-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; }
.summary-card { background: #F5F4F2; border-radius: 8px; padding: 12px 14px; }
.summary-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: #A8A29E;
  margin-bottom: 5px;
  font-weight: 500;
}
.summary-value {
  font-family: 'Manrope', sans-serif;
  font-size: 18px;
  font-weight: 600;
  color: #1C1917;
  line-height: 1.2;
}
.summary-value.status-prog { color: #E8590C; }
.summary-value.status-late { color: #991B1B; }
.summary-value.status-done { color: #166534; }
.summary-value.muted { color: #A8A29E; font-size: 14px; padding-top: 3px; }

/* TABELAS */
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th {
  font-family: 'Manrope', sans-serif;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: #A8A29E;
  padding: 6px 12px;
  text-align: left;
  background: #F5F4F2;
  border-bottom: 0.5px solid #E7E5E4;
  white-space: nowrap;
  vertical-align: middle;
}
td {
  padding: 8px 12px;
  border-bottom: 0.5px solid #E7E5E4;
  vertical-align: middle;
  line-height: 1.4;
}
tr:last-child td { border-bottom: none; }

/* LINHAS DE FASE */
.phase-row td {
  background: #F5F4F2;
  font-family: 'Manrope', sans-serif;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: #57534E;
  padding: 6px 12px;
  border-bottom: 0.5px solid #E7E5E4;
}

/* LINHAS DE MILESTONE */
.milestone-row td { background: #FFFBEB; }
.milestone-diamond {
  color: #78350F;
  font-size: 11px;
  margin-right: 5px;
  display: inline-block;
  vertical-align: middle;
  line-height: 1;
}
.milestone-name { font-weight: 500; vertical-align: middle; }

/* PILLS */
.pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 20px;
  white-space: nowrap;
  line-height: 1.4;
  vertical-align: middle;
}
.pill-done { background: #F0FDF4; color: #166534; }
.pill-prog { background: #FEF0E8; color: #C84B08; }
.pill-pend { background: #F5F4F2; color: #A8A29E; }
.pill-late { background: #FEF2F2; color: #991B1B; }
.pill-mon  { background: #FFFBEB; color: #78350F; }

/* BULLETS */
.bullet { display: inline-block; width: 9px; height: 9px; border-radius: 50%; vertical-align: middle; flex-shrink: 0; }
.bullet-done { background: #166534; }
.bullet-pend { background: #D6D3D1; }
.bullet-late { background: #E24B4A; }

/* CHARTER */
.charter-table { width: 100%; }
.charter-table td { padding: 8px 0; border-bottom: 0.5px solid #E7E5E4; vertical-align: top; line-height: 1.55; }
.charter-table tr:last-child td { border-bottom: none; }
.charter-label {
  font-family: 'Manrope', sans-serif;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: #A8A29E;
  width: 130px;
  padding-right: 16px;
  vertical-align: top;
  padding-top: 9px;
}
.charter-value { font-size: 12px; color: #57534E; }

/* BARRAS DE ATRASO */
.delay-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.delay-block { background: #F5F4F2; border-radius: 8px; padding: 12px 14px; }
.delay-block-title {
  font-family: 'Manrope', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: #57534E;
  margin-bottom: 10px;
}
.bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 7px; }
.bar-label { font-size: 11px; color: #57534E; width: 100px; flex-shrink: 0; }
.bar-track { flex: 1; height: 5px; background: #E7E5E4; border-radius: 3px; overflow: hidden; }
.bar-fill { height: 5px; border-radius: 3px; }
.bar-val { font-size: 11px; font-weight: 500; color: #1C1917; width: 32px; text-align: right; }

/* RISCOS */
.risk-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 0.5px solid #E7E5E4; }
.risk-row:last-child { border-bottom: none; }
.risk-flag { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.risk-flag-r { background: #E24B4A; }
.risk-flag-o { background: #F59E0B; }
.risk-desc { flex: 1; font-size: 12px; color: #1C1917; line-height: 1.4; }
.risk-owner { font-size: 11px; color: #A8A29E; flex-shrink: 0; padding-left: 10px; }

/* RODAPÉ */
.report-footer {
  border-top: 0.5px solid #E7E5E4;
  padding-top: 12px;
  margin-top: 28px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #A8A29E;
}

/* UTILITÁRIOS */
.text-muted    { color: #A8A29E; }
.text-danger   { color: #991B1B; font-weight: 500; }
.text-success  { color: #166534; }
.font-medium   { font-weight: 500; }
.indent        { padding-left: 24px !important; }
`

const PLOOMES_OVERRIDES = `
/* ── Ploomes cover ── */
.ploomes-cover {
  background: #1E0C45;
  padding: 36px 44px;
}
.ploomes-logo-row { display: flex; align-items: center; gap: 8px; margin-bottom: 28px; }
.ploomes-logo-text { font-family: 'Manrope', sans-serif; font-size: 15px; font-weight: 600; color: #fff; }
.ploomes-report-label {
  font-family: 'Manrope', sans-serif;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .07em;
  color: #7443F6;
  margin-bottom: 12px;
}
.ploomes-project-name {
  font-family: 'Lora', serif;
  font-style: italic;
  font-weight: 600;
  font-size: 28px;
  color: #fff;
  line-height: 1.2;
  margin-bottom: 10px;
}
.ploomes-meta { font-size: 12px; color: #DBD4FF; margin-bottom: 24px; display: flex; gap: 12px; flex-wrap: wrap; }
.ploomes-meta span { white-space: nowrap; }
.ploomes-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 28px; }
.ploomes-chip {
  border: 1px solid rgba(255,255,255,.15);
  background: rgba(116,67,246,.2);
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 12px;
  color: #DBD4FF;
  font-weight: 500;
}
.ploomes-chip-status {
  background: #7443F6;
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 12px;
  color: #fff;
  font-weight: 600;
}
.ploomes-cover-footer {
  border-top: 1px solid rgba(255,255,255,.1);
  padding-top: 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #7B6FA0;
}
.ploomes-cover-footer .brand { color: #7443F6; font-weight: 600; }

/* ── Ploomes body overrides ── */
.ploomes-body .section-title { color: #7443F6; border-bottom: 1.5px solid #EBE5FF; }
.ploomes-body .summary-card  { background: #F7F5FF; border: 1px solid #EBE5FF; }
.ploomes-body th { background: #F7F5FF; border-bottom: 1.5px solid #EBE5FF; }
.ploomes-body td { border-bottom: 0.5px solid #EBE5FF; }
.ploomes-body tr:last-child td { border-bottom: none; }
.ploomes-body .phase-row td { background: #F7F5FF; color: #7443F6; border-bottom: 0.5px solid #EBE5FF; }
.ploomes-body .milestone-row td { background: #F0ECFF; }
.ploomes-body .milestone-diamond { color: #7443F6; }
.ploomes-body .delay-block { background: #F7F5FF; }
.ploomes-body .pill-prog { background: #EDE8FF; color: #5B32D6; }
.ploomes-body .risk-row { border-bottom-color: #EBE5FF; }
.ploomes-body .charter-table td { border-bottom-color: #EBE5FF; }
.ploomes-body .report-footer { border-top-color: #EBE5FF; }

/* ── Ploomes footer ── */
.ploomes-footer {
  background: #1E0C45;
  padding: 16px 44px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #7B6FA0;
}
.ploomes-footer .brand { color: #7443F6; font-weight: 600; }

@media print {
  .ploomes-cover { padding: 28px 32px; }
  .ploomes-footer { padding: 12px 32px; }
}
`

// ─── helpers ──────────────────────────────────────────────────────────────────

function t(key: string): string {
  return i18n.t(key) as string
}

function esc(str: string | undefined | null): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtDate(iso: string | undefined, fmt: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.substring(0, 10).split('-')
  return fmt === 'MM/DD/YYYY' ? `${m}/${d}/${y}` : `${d}/${m}/${y}`
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function todayFormatted(fmt: string): string {
  return fmtDate(todayISO(), fmt)
}

function nowFormatted(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function pillClass(status: string): string {
  switch (status) {
    case 'done':        case 'closed':    return 'pill-done'
    case 'in_progress':                   return 'pill-prog'
    case 'pending':     case 'planning':  return 'pill-pend'
    case 'blocked':     case 'overdue':   return 'pill-late'
    case 'delayed':     case 'mitigated': case 'accepted': return 'pill-mon'
    default: return 'pill-pend'
  }
}

function pill(status: string, label: string): string {
  return `<span class="pill ${pillClass(status)}">${esc(label)}</span>`
}

function varHtml(variance: number | undefined): string {
  if (variance === undefined) return '<span class="text-muted">—</span>'
  if (variance === 0)         return '<span class="text-muted">0</span>'
  if (variance > 0)           return `<span class="text-danger">+${variance}d</span>`
  return `<span class="text-success">${variance}d</span>`
}

// ─── section builders ─────────────────────────────────────────────────────────

function buildSummarySection(project: Project, settings: AppSettings): string {
  const dur      = projectDurationDays(project, settings.holidays)
  const range    = projectDateRange(project)
  const status   = project.status
  const statusLabel = t(`project.${status}`)

  const statusClass = status === 'in_progress' ? 'status-prog'
    : status === 'delayed' ? 'status-late'
    : status === 'done'    ? 'status-done'
    : ''

  const totalDelay = project.delayLog.reduce((s, e) => s + Math.max(0, e.days), 0)
  const hasBaseline = !!project.baselineSetAt

  const varianceContent = hasBaseline
    ? totalDelay > 0
      ? `<span class="text-danger">+${totalDelay} ${t('report.days')}</span>`
      : `<span class="text-muted">0 ${t('report.days')}</span>`
    : `<span class="muted" style="font-size:12px;font-style:italic;">${t('report.noBaseline')}</span>`

  const cards = [
    {
      label: t('report.currentStatus'),
      html: `<div class="summary-value ${statusClass}">${esc(statusLabel)}</div>`,
    },
    {
      label: t('report.totalDuration'),
      html: `<div class="summary-value">${dur !== undefined ? `${dur} ${t('report.workingDays')}` : '—'}</div>`,
    },
    {
      label: t('report.totalVariance'),
      html: `<div class="summary-value">${varianceContent}</div>`,
    },
    {
      label: t('report.projectedEnd'),
      html: `<div class="summary-value">${range.end ? fmtDate(range.end, settings.dateFormat) : '—'}</div>`,
    },
  ]

  const cardHtml = cards.map((c) => `
    <div class="summary-card no-break">
      <div class="summary-label">${c.label}</div>
      ${c.html}
    </div>
  `).join('')

  return `
    <div class="section no-break">
      <div class="section-title">${t('report.summary')}</div>
      <div class="summary-grid">${cardHtml}</div>
    </div>
  `
}

function buildTeamSection(project: Project): string {
  if (project.team.length === 0) return ''

  const rows = project.team.map((m) => `
    <tr class="no-break">
      <td class="font-medium">${esc(m.name)}</td>
      <td>${esc(m.role)}</td>
      <td class="text-muted">${esc(m.email) || '—'}</td>
    </tr>
  `).join('')

  return `
    <div class="section">
      <div class="section-title">${t('tabs.team')}</div>
      <table>
        <thead>
          <tr><th>${t('team.name')}</th><th>${t('team.role')}</th><th>${t('team.email')}</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

function buildCharterSection(project: Project): string {
  const charter = project.charter
  if (!charter) return ''

  type CharterKey = keyof ProjectCharter
  const fields: { key: CharterKey; labelKey: string }[] = [
    { key: 'sponsor',         labelKey: 'charter.sponsor' },
    { key: 'objectives',      labelKey: 'charter.objectives' },
    { key: 'scope',           labelKey: 'charter.scope' },
    { key: 'outOfScope',      labelKey: 'charter.outOfScope' },
    { key: 'successCriteria', labelKey: 'charter.successCriteria' },
    { key: 'constraints',     labelKey: 'charter.constraints' },
    { key: 'assumptions',     labelKey: 'charter.assumptions' },
    { key: 'budget',          labelKey: 'charter.budget' },
  ]

  const rows = fields
    .filter((f) => charter[f.key])
    .map((f) => `
      <tr>
        <td class="charter-label">${t(f.labelKey)}</td>
        <td class="charter-value" style="white-space:pre-wrap;">${esc(charter[f.key] as string)}</td>
      </tr>
    `).join('')

  if (!rows) return ''

  return `
    <div class="section">
      <div class="section-title">${t('charter.title')}</div>
      <table class="charter-table"><tbody>${rows}</tbody></table>
    </div>
  `
}

function buildMilestonesSection(project: Project, settings: AppSettings): string {
  const today = todayISO()
  const milestones: Array<Entry & { phaseName: string }> = []
  for (const ph of project.phases) {
    for (const e of ph.entries) {
      if (e.type === 'milestone') milestones.push({ ...e, phaseName: ph.name })
    }
  }
  if (milestones.length === 0) return ''

  const rows = milestones.map((m) => {
    const plannedDate = m.plannedDate ?? m.plannedEnd
    const done    = m.status === 'done' || !!m.actualEnd
    const overdue = !done && !!plannedDate && today > plannedDate
    const bulletCls = done ? 'bullet-done' : overdue ? 'bullet-late' : 'bullet-pend'
    const milStatus = done ? 'done' : overdue ? 'overdue' : 'pending'
    const milLabel  = done ? t('entry.done') : overdue ? t('status.overdue') : t('entry.pending')
    const variance  = computeVariance(m, settings.holidays)

    return `
      <tr class="no-break">
        <td style="width:20px;padding-right:4px;"><span class="bullet ${bulletCls}"></span></td>
        <td class="font-medium">${esc(m.name)}</td>
        <td>${esc(m.phaseName)}</td>
        <td style="white-space:nowrap;">${fmtDate(plannedDate, settings.dateFormat)}</td>
        <td style="text-align:right;white-space:nowrap;">${varHtml(variance)}</td>
        <td>${pill(milStatus, milLabel)}</td>
      </tr>
    `
  }).join('')

  return `
    <div class="section no-break">
      <div class="section-title">${t('report.milestones')}</div>
      <table>
        <thead>
          <tr>
            <th style="width:20px;padding-right:4px;"></th>
            <th>${t('report.name')}</th>
            <th>${t('report.phase')}</th>
            <th>${t('report.planEnd')}</th>
            <th style="text-align:right;">${t('report.variance')}</th>
            <th>${t('report.status')}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

function buildPlanSection(project: Project, settings: AppSettings, config: ReportConfig): string {
  const pc = config.planColumns
  const nameMap = new Map<string, string>()
  const addNames = (entries: Entry[]) => {
    for (const e of entries) { nameMap.set(e.id, e.name); addNames(e.subtasks) }
  }
  for (const ph of project.phases) addNames(ph.entries)

  type ColDef = { key: string; label: string; width?: string; align?: 'right' }
  const cols: ColDef[] = [{ key: 'name', label: t('report.name') }]
  if (pc.type)          cols.push({ key: 'type',          label: t('report.type'),             width: '65px' })
  if (pc.responsible)   cols.push({ key: 'responsible',   label: t('report.responsible'),      width: '110px' })
  if (pc.deps)          cols.push({ key: 'deps',          label: t('report.colDeps'),          width: '90px' })
  if (pc.plannedStart)  cols.push({ key: 'plannedStart',  label: t('report.planStart'),        width: '80px' })
  if (pc.plannedEnd)    cols.push({ key: 'plannedEnd',    label: t('report.planEnd'),          width: '80px' })
  if (pc.baselineStart) cols.push({ key: 'baselineStart', label: t('report.colBaselineStart'), width: '75px' })
  if (pc.baselineEnd)   cols.push({ key: 'baselineEnd',   label: t('report.colBaselineEnd'),   width: '75px' })
  if (pc.duration)      cols.push({ key: 'duration',      label: t('report.duration'),         width: '65px', align: 'right' })
  if (pc.variance)      cols.push({ key: 'variance',      label: t('report.variance'),         width: '65px', align: 'right' })
  if (pc.status)        cols.push({ key: 'status',        label: t('report.status'),           width: '90px' })

  const colgroup = cols.map((c) =>
    c.key === 'name'
      ? `<col style="min-width:160px;">`
      : `<col style="width:${c.width};">`
  ).join('')

  const headers = cols.map((c) =>
    `<th${c.align === 'right' ? ' style="text-align:right;"' : ''}>${c.label}</th>`
  ).join('')

  const bodyRows: string[] = []

  for (const phase of project.phases) {
    bodyRows.push(`
      <tr class="phase-row no-break">
        <td colspan="${cols.length}">${esc(phase.name)}</td>
      </tr>
    `)

    const renderEntry = (e: Entry, indent: number) => {
      const isMilestone = e.type === 'milestone'
      const isMeeting   = e.type === 'meeting'
      const isTask      = e.type === 'task'

      const trClass = `no-break${isMilestone ? ' milestone-row' : ''}`
      const nameCell = isMilestone
        ? `<span class="milestone-diamond">&#9670;</span><span class="milestone-name">${esc(e.name)}</span>`
        : esc(e.name)

      const plannedStart = isTask ? e.plannedStart : e.plannedDate
      const plannedEnd   = isTask ? e.plannedEnd   : e.plannedDate

      const durContent = isMilestone ? '<span class="text-muted">—</span>'
        : isTask && e.durationDays  ? `<span class="text-muted">${e.durationDays}d</span>`
        : isMeeting && e.durationHours ? `<span class="text-muted">${e.durationHours}h</span>`
        : '<span class="text-muted">—</span>'

      const variance  = computeVariance(e, settings.holidays)
      const typeLabel = isMilestone ? t('report.milestone') : isMeeting ? t('report.meeting') : t('report.task')
      const depsText  = e.dependsOn.length > 0
        ? e.dependsOn.map((id) => esc(nameMap.get(id) ?? id)).join(', ')
        : '—'

      const namePadding = indent > 0 ? ` class="indent"` : ''

      const cells = cols.map((col) => {
        switch (col.key) {
          case 'name':
            return `<td${namePadding}>${nameCell}</td>`
          case 'type':
            return `<td class="text-muted">${typeLabel}</td>`
          case 'responsible':
            return `<td>${esc(e.responsible) || '<span class="text-muted">—</span>'}</td>`
          case 'deps':
            return `<td class="text-muted">${depsText}</td>`
          case 'plannedStart':
            return `<td style="white-space:nowrap;">${isMilestone ? '<span class="text-muted">—</span>' : fmtDate(plannedStart, settings.dateFormat)}</td>`
          case 'plannedEnd':
            return `<td style="white-space:nowrap;">${fmtDate(plannedEnd, settings.dateFormat)}</td>`
          case 'baselineStart': {
            const bl = isTask ? e.baselineStart : e.baselineDate
            return `<td class="text-muted" style="white-space:nowrap;">${fmtDate(bl, settings.dateFormat)}</td>`
          }
          case 'baselineEnd': {
            const bl = isTask ? e.baselineEnd : e.baselineDate
            return `<td class="text-muted" style="white-space:nowrap;">${fmtDate(bl, settings.dateFormat)}</td>`
          }
          case 'duration':
            return `<td style="text-align:right;">${durContent}</td>`
          case 'variance':
            return `<td style="text-align:right;">${varHtml(variance)}</td>`
          case 'status':
            return `<td>${pill(e.status, t(`entry.${e.status}`))}</td>`
          default: return '<td></td>'
        }
      }).join('')

      bodyRows.push(`<tr class="${trClass}">${cells}</tr>`)
      for (const sub of e.subtasks) renderEntry(sub, indent + 1)
    }

    for (const entry of phase.entries) renderEntry(entry, 0)
  }

  const needsPageBreak = config.sections.summary || config.sections.team || config.sections.charter || config.sections.milestones
  const sectionClass = `section${needsPageBreak ? ' page-break' : ''}`

  return `
    <div class="${sectionClass}">
      <div class="section-title">${t('report.plan')}</div>
      <table style="table-layout:auto;">
        <colgroup>${colgroup}</colgroup>
        <thead><tr>${headers}</tr></thead>
        <tbody>${bodyRows.join('')}</tbody>
      </table>
    </div>
  `
}

function buildDelaySection(project: Project, settings: AppSettings, layout: 'standard' | 'ploomes'): string {
  if (project.delayLog.length === 0) return ''

  const log = [...project.delayLog].sort((a, b) => b.date.localeCompare(a.date))

  const respSums: Record<string, number> = {}
  const typeSums: Record<string, number> = {}
  for (const e of log) {
    if (e.days > 0) {
      respSums[e.responsibility] = (respSums[e.responsibility] ?? 0) + e.days
      typeSums[e.type] = (typeSums[e.type] ?? 0) + e.days
    }
  }

  const RESP_LABELS: Record<string, string> = {
    internal: t('delay.internal'), client_business: t('delay.client_business'),
    client_it: t('delay.client_it'), client_provider: t('delay.client_provider'),
  }
  const RESP_COLORS: Record<string, string> = layout === 'ploomes'
    ? { internal: '#7443F6', client_business: '#F59E0B', client_it: '#E24B4A', client_provider: '#378ADD' }
    : { internal: '#E8590C', client_business: '#F59E0B', client_it: '#E24B4A', client_provider: '#378ADD' }

  const TYPE_LABELS: Record<string, string> = {
    execution: t('delay.execution'), definition: t('delay.definition'), planning: t('delay.planning'),
  }
  const TYPE_COLORS: Record<string, string> = {
    execution: '#A8A29E', definition: '#378ADD', planning: '#7443F6',
  }

  const barChart = (sums: Record<string, number>, labels: Record<string, string>, colors: Record<string, string>) => {
    const total = Object.values(sums).reduce((s, v) => s + v, 0)
    return Object.entries(sums).sort(([, a], [, b]) => b - a).map(([k, v]) => {
      const pct = Math.round((v / Math.max(1, total)) * 100)
      return `
        <div class="bar-row">
          <span class="bar-label">${esc(labels[k] ?? k)}</span>
          <div class="bar-track"><div class="bar-fill" style="background:${colors[k] ?? '#A8A29E'};width:${pct}%;"></div></div>
          <span class="bar-val">${v}d</span>
        </div>
      `
    }).join('')
  }

  let chartsHtml = ''
  if (Object.keys(respSums).length > 0) {
    chartsHtml = `
      <div class="delay-grid" style="margin-bottom:16px;">
        <div class="delay-block no-break">
          <div class="delay-block-title">${t('report.byResponsibility')}</div>
          ${barChart(respSums, RESP_LABELS, RESP_COLORS)}
        </div>
        <div class="delay-block no-break">
          <div class="delay-block-title">${t('report.byType')}</div>
          ${barChart(typeSums, TYPE_LABELS, TYPE_COLORS)}
        </div>
      </div>
    `
  }

  const tableRows = log.map((entry) => {
    const daysCls = entry.days > 0 ? 'text-danger' : 'text-success'
    const prefix  = entry.days > 0 ? '+' : ''
    const respLabel = RESP_LABELS[entry.responsibility] ?? entry.responsibility
    const typeLabel = TYPE_LABELS[entry.type] ?? entry.type
    return `
      <tr class="no-break">
        <td class="text-muted" style="white-space:nowrap;">${fmtDate(entry.date, settings.dateFormat)}</td>
        <td>${esc(entry.entryName)}</td>
        <td style="text-align:right;white-space:nowrap;"><span class="${daysCls}">${prefix}${entry.days}d</span></td>
        <td>${esc(respLabel)}</td>
        <td class="text-muted">${esc(typeLabel)}</td>
        <td class="text-muted">${esc(entry.description) || '—'}</td>
      </tr>
    `
  }).join('')

  return `
    <div class="section">
      <div class="section-title">${t('tabs.delayLog')}</div>
      ${chartsHtml}
      <table>
        <thead>
          <tr>
            <th>${t('delay.date')}</th>
            <th>${t('delay.selectEntry')}</th>
            <th style="text-align:right;">${t('delay.days')}</th>
            <th>${t('delay.responsibility')}</th>
            <th>${t('delay.type')}</th>
            <th>${t('delay.description')}</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `
}

function buildRisksSection(project: Project): string {
  const openRisks = project.risks.filter((r) => r.status !== 'closed')
  if (openRisks.length === 0) return ''

  const items = openRisks.map((r) => {
    const flag  = r.score >= 6 ? 'critical' : r.score >= 3 ? 'warning' : 'none'
    const flagCls = flag === 'critical' ? 'risk-flag-r' : flag === 'warning' ? 'risk-flag-o' : ''
    return `
      <div class="risk-row no-break">
        <span class="risk-flag ${flagCls}"></span>
        <span class="risk-desc">${esc(r.description)}</span>
        <span class="risk-owner">${esc(r.owner) || '—'}</span>
        ${pill(r.status, esc(r.status))}
      </div>
    `
  }).join('')

  return `
    <div class="section">
      <div class="section-title">${t('report.openRisks')}</div>
      <div>${items}</div>
    </div>
  `
}

// ─── standard layout ──────────────────────────────────────────────────────────

function buildStandardHeader(project: Project, fmt: string): string {
  const meta = [esc(project.client), `PM: ${esc(project.pm)}`]
  if (project.devType) meta.push(`Dev: ${esc(t(`project.${project.devType}`))}${project.devIntegration ? ` (${esc(project.devIntegration)})` : ''}`)

  return `
    <div class="report-header">
      <div>
        <div class="report-logo">OpEn</div>
        <div class="report-title">${esc(project.name)}</div>
        <div class="report-meta">
          ${meta.map((m) => `<span>${m}</span>`).join('')}
        </div>
      </div>
      <div class="report-date-block">
        <div class="report-date-label">${t('report.title')}</div>
        <div class="report-date-val">${todayFormatted(fmt)}</div>
      </div>
    </div>
  `
}

function buildStandardFooter(project: Project): string {
  return `
    <div class="report-footer">
      <span>${t('report.footer')} &nbsp;·&nbsp; PM: ${esc(project.pm)}</span>
      <span>${nowFormatted()}</span>
    </div>
  `
}

function buildStandardHTML(project: Project, settings: AppSettings, config: ReportConfig): string {
  const s   = config.sections
  const fmt = settings.dateFormat
  const lang = i18n.language ?? 'pt'

  const body = `
    <div class="page">
      ${buildStandardHeader(project, fmt)}
      ${s.summary    ? buildSummarySection(project, settings)                      : ''}
      ${s.team       ? buildTeamSection(project)                                   : ''}
      ${s.charter    ? buildCharterSection(project)                                : ''}
      ${s.milestones ? buildMilestonesSection(project, settings)                   : ''}
      ${s.plan       ? buildPlanSection(project, settings, config)                 : ''}
      ${s.delayLog   ? buildDelaySection(project, settings, config.layout)         : ''}
      ${s.risks      ? buildRisksSection(project)                                  : ''}
      ${buildStandardFooter(project)}
    </div>
  `

  return buildDocument(project.name, lang, STANDARD_CSS, body)
}

// ─── ploomes layout ───────────────────────────────────────────────────────────

function buildPloomesHeader(project: Project, settings: AppSettings): string {
  const fmt     = settings.dateFormat
  const dur     = projectDurationDays(project, settings.holidays)
  const range   = projectDateRange(project)
  const totalDelay = project.delayLog.reduce((s, e) => s + Math.max(0, e.days), 0)
  const status  = project.status
  const meta    = [esc(project.client), `PM: ${esc(project.pm)}`]
  if (project.devType) meta.push(`Dev: ${esc(t(`project.${project.devType}`))}`)

  const DIAMOND_SVG = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 2L16 9L9 16L2 9Z" fill="#7443F6"/></svg>`

  return `
    <div class="ploomes-cover">
      <div class="ploomes-logo-row">
        ${DIAMOND_SVG}
        <span class="ploomes-logo-text">Ploomes</span>
      </div>
      <div class="ploomes-report-label">${t('report.title')}</div>
      <div class="ploomes-project-name">${esc(project.name)}</div>
      <div class="ploomes-meta">
        ${meta.map((m) => `<span>${m}</span>`).join('')}
      </div>
      <div class="ploomes-chips">
        <span class="ploomes-chip-status">${esc(t(`project.${status}`))}</span>
        ${dur !== undefined ? `<span class="ploomes-chip">${dur} ${t('report.workingDays')}</span>` : ''}
        <span class="ploomes-chip">${totalDelay > 0 ? `+${totalDelay}d` : '0d'}</span>
        ${range.end ? `<span class="ploomes-chip">${t('report.projectedEnd')}: ${fmtDate(range.end, fmt)}</span>` : ''}
      </div>
      <div class="ploomes-cover-footer">
        <span>${t('report.generatedOn')} ${todayFormatted(fmt)}</span>
        <span class="brand">OpEn</span>
      </div>
    </div>
  `
}

function buildPloomesFooter(project: Project): string {
  return `
    <div class="ploomes-footer">
      <span>${t('report.footer')} &nbsp;·&nbsp; PM: ${esc(project.pm)}</span>
      <span>${nowFormatted()}</span>
    </div>
  `
}

function buildPloomesHTML(project: Project, settings: AppSettings, config: ReportConfig): string {
  const s    = config.sections
  const lang = i18n.language ?? 'pt'

  const body = `
    ${buildPloomesHeader(project, settings)}
    <div class="page ploomes-body">
      ${s.summary    ? buildSummarySection(project, settings)                      : ''}
      ${s.team       ? buildTeamSection(project)                                   : ''}
      ${s.charter    ? buildCharterSection(project)                                : ''}
      ${s.milestones ? buildMilestonesSection(project, settings)                   : ''}
      ${s.plan       ? buildPlanSection(project, settings, config)                 : ''}
      ${s.delayLog   ? buildDelaySection(project, settings, config.layout)         : ''}
      ${s.risks      ? buildRisksSection(project)                                  : ''}
    </div>
    ${buildPloomesFooter(project)}
  `

  return buildDocument(project.name, lang, STANDARD_CSS + PLOOMES_OVERRIDES, body)
}

// ─── document wrapper ─────────────────────────────────────────────────────────

function buildDocument(name: string, lang: string, css: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width">
  <title>${esc(name)} — Status Report</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Manrope:wght@500;600&family=Lora:ital,wght@1,600&display=swap" rel="stylesheet">
  <style>${css}</style>
</head>
<body>
${body}
</body>
</html>`
}

// ─── main export ──────────────────────────────────────────────────────────────

export async function generateStatusReport(
  project: Project,
  settings: AppSettings,
  config: ReportConfig,
): Promise<void> {
  const html = config.layout === 'ploomes'
    ? buildPloomesHTML(project, settings, config)
    : buildStandardHTML(project, settings, config)

  const blob = new Blob([html], { type: 'text/html' })
  const url  = URL.createObjectURL(blob)
  window.open(url, '_blank')
}
