import { Project } from '@/types'

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function triggerDownload(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function projectToExportShape(project: Project) {
  return {
    name: project.name,
    client: project.client,
    type: project.type,
    pm: project.pm,
    language: project.language,
    status: project.status,
    ...(project.devLead && { devLead: project.devLead }),
    ...(project.devType && { devType: project.devType }),
    ...(project.devIntegration && { devIntegration: project.devIntegration }),
    ...(project.overview && { overview: project.overview }),
    ...(project.baselineSetAt && { baselineSetAt: project.baselineSetAt }),
    ...(project.charter && { charter: project.charter }),
    team: project.team.map(({ id: _id, ...m }) => m),
    links: project.links.length > 0 ? project.links : undefined,
    phases: project.phases.map((ph) => ({
      name: ph.name,
      order: ph.order,
      entries: ph.entries.map((e) => ({
        tempId: e.id,
        type: e.type,
        name: e.name,
        responsible: e.responsible || undefined,
        dependsOn: e.dependsOn.length > 0 ? e.dependsOn : undefined,
        ...(e.parentEntryId && { parentEntryTempId: e.parentEntryId }),
        plannedStart: e.plannedStart,
        plannedEnd: e.plannedEnd,
        plannedDate: e.plannedDate,
        ...(e.baselineStart && { baselineStart: e.baselineStart }),
        ...(e.baselineEnd && { baselineEnd: e.baselineEnd }),
        ...(e.baselineDate && { baselineDate: e.baselineDate }),
        ...(e.actualStart && { actualStart: e.actualStart }),
        ...(e.actualEnd && { actualEnd: e.actualEnd }),
        ...(e.durationDays && { durationDays: e.durationDays }),
        ...(e.durationHours && { durationHours: e.durationHours }),
        riskFlag: e.riskFlag !== 'none' ? e.riskFlag : undefined,
        status: e.status,
        ...(e.statusOverride && { statusOverride: true }),
        links: e.links.length > 0 ? e.links : undefined,
        comments: e.comments.length > 0 ? e.comments : undefined,
        subtasks: e.subtasks.length > 0
          ? e.subtasks.map((sub) => ({
              tempId: sub.id,
              type: sub.type,
              name: sub.name,
              responsible: sub.responsible || undefined,
              dependsOn: sub.dependsOn.length > 0 ? sub.dependsOn : undefined,
              plannedStart: sub.plannedStart,
              plannedEnd: sub.plannedEnd,
              plannedDate: sub.plannedDate,
              ...(sub.actualStart && { actualStart: sub.actualStart }),
              ...(sub.actualEnd && { actualEnd: sub.actualEnd }),
              ...(sub.durationDays && { durationDays: sub.durationDays }),
              ...(sub.durationHours && { durationHours: sub.durationHours }),
              riskFlag: sub.riskFlag !== 'none' ? sub.riskFlag : undefined,
              status: sub.status,
              links: sub.links.length > 0 ? sub.links : undefined,
              comments: sub.comments.length > 0 ? sub.comments : undefined,
            }))
          : undefined,
      })),
    })),
    risks: project.risks.length > 0
      ? project.risks.map((r) => ({
          description: r.description,
          probability: r.probability,
          impact: r.impact,
          score: r.score,
          status: r.status,
          owner: r.owner || undefined,
          ...(r.dueDate && { dueDate: r.dueDate }),
          linkedEntryTempIds: r.linkedEntryIds.length > 0 ? r.linkedEntryIds : undefined,
          actionTasks: r.actionTasks.length > 0
            ? r.actionTasks.map(({ id: _id, ...t }) => t)
            : undefined,
        }))
      : undefined,
    delayLog: project.delayLog.length > 0 ? project.delayLog : undefined,
    openPoints: project.openPoints && project.openPoints.length > 0
      ? project.openPoints.map(({ attachments: _a, ...op }) => op)
      : undefined,
    meetings: project.meetings && project.meetings.length > 0
      ? project.meetings.map(({ attachments: _a, ...m }) => m)
      : undefined,
    history: project.history && project.history.length > 0
      ? project.history
      : undefined,
  }
}

export function exportProjectToJson(project: Project): void {
  const data = {
    import_version: '1.0',
    exported_at: new Date().toISOString(),
    project: projectToExportShape(project),
  }
  triggerDownload(JSON.stringify(data, null, 2), `${project.name} - ${todayISO()}.json`)
}

export function exportAllProjectsToJson(
  activeProjects: Project[],
  archivedProjects: Project[],
  confirmMsg: string,
): void {
  let projects = [...activeProjects]
  if (archivedProjects.length > 0 && window.confirm(confirmMsg)) {
    projects = [...projects, ...archivedProjects]
  }
  const data = {
    export_version: '1.0',
    exported_at: new Date().toISOString(),
    total_projects: projects.length,
    projects: projects.map(projectToExportShape),
  }
  triggerDownload(
    JSON.stringify(data, null, 2),
    `OpEn - Backup - ${todayISO()}.json`,
  )
}
