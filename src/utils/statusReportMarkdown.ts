import { Project, Entry, AppSettings } from '@/types'
import { projectDurationDays, projectEndVariance, isProjectDelayed } from './projectStats'

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog / Futuros',
  planning: 'Planejamento',
  in_progress: 'Em andamento',
  done: 'Concluído',
}

const ENTRY_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  validation: 'Validação/Teste',
  done: 'Concluído',
  blocked: 'Bloqueado',
  overdue: 'Atrasado',
}

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function flattenEntries(project: Project): Entry[] {
  const out: Entry[] = []
  for (const phase of project.phases) {
    for (const entry of phase.entries) {
      out.push(entry)
      out.push(...entry.subtasks)
    }
  }
  return out
}

/** Generate a Markdown status report for a project — used by the AI chat's
 *  `generate_status_report_markdown` tool. Unlike `statusReport.ts`'s
 *  `generateStatusReport()` (HTML-only, opens a new tab as a side effect),
 *  this returns a plain string so it can be dropped straight into a chat
 *  message. Reuses the same underlying stat calculations. */
export function generateStatusReportMarkdown(project: Project, settings: AppSettings): string {
  const duration = projectDurationDays(project, settings.holidays)
  const variance = projectEndVariance(project, settings.holidays)
  const delayed = isProjectDelayed(project, settings.holidays)
  const lines: string[] = []

  lines.push(`# Status Report — ${project.name}`)
  lines.push('')
  lines.push(`**Cliente:** ${project.client}  `)
  lines.push(`**Líder:** ${project.pm}  `)
  if (project.devLead) lines.push(`**Dev Lead:** ${project.devLead}  `)
  lines.push(`**Status:** ${STATUS_LABEL[project.status] ?? project.status}${delayed ? ' · **Atrasado**' : ''}  `)
  if (duration !== undefined) lines.push(`**Duração:** ${duration} dias úteis  `)
  if (variance !== undefined) lines.push(`**Variância:** ${variance > 0 ? `+${variance}` : variance} dias úteis  `)
  lines.push('')

  if (project.overview) {
    lines.push('## Overview')
    lines.push(project.overview)
    lines.push('')
  }

  const entries = flattenEntries(project)
  if (entries.length > 0) {
    lines.push('## Plano')
    lines.push('| Tarefa | Tipo | Responsável | Status | Prazo |')
    lines.push('|---|---|---|---|---|')
    for (const e of entries) {
      const end = e.type === 'task' ? e.plannedEnd : e.plannedDate
      lines.push(`| ${e.name} | ${e.type} | ${e.responsible || '—'} | ${ENTRY_STATUS_LABEL[e.status] ?? e.status} | ${fmtDate(end)} |`)
    }
    lines.push('')
  }

  if (project.risks.length > 0) {
    lines.push('## Riscos')
    lines.push('| Descrição | Probabilidade | Impacto | Status |')
    lines.push('|---|---|---|---|')
    for (const r of project.risks) {
      lines.push(`| ${r.description} | ${r.probability} | ${r.impact} | ${r.status} |`)
    }
    lines.push('')
  }

  if (project.delayLog.length > 0) {
    const totalDelay = project.delayLog.reduce((s, e) => s + Math.max(0, e.days), 0)
    lines.push('## Log de Atrasos')
    lines.push(`Atraso acumulado: **${totalDelay} dias**`)
    lines.push('')
    lines.push('| Data | Tarefa | Dias | Responsabilidade | Descrição |')
    lines.push('|---|---|---|---|---|')
    for (const d of project.delayLog) {
      lines.push(`| ${fmtDate(d.date)} | ${d.entryName} | ${d.days > 0 ? '+' : ''}${d.days} | ${d.responsibility} | ${d.description} |`)
    }
  }

  return lines.join('\n')
}
