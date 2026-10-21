import { format } from 'date-fns'
import type { Entry, Incident, IncidentStatus, Project } from '@/types'

/** O que foi encerrado e precisa perguntar sobre as tarefas abertas. */
export interface CloseOutTarget {
  kind: 'project' | 'incident'
  id: string
}

/** Dia de hoje no relógio de quem fez a ação (não em UTC: à noite, no Brasil, UTC já é o dia seguinte). */
export function localTodayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function isClosingIncidentStatus(status: IncidentStatus): boolean {
  return status === 'resolved' || status === 'closed'
}

const isOpenTask = (e: Entry) => e.type === 'task' && e.status !== 'done'

/** Tarefas ainda não concluídas do projeto (todas as fases, inclusive as fora do plano). Marcos e reuniões ficam de fora. */
export function openTasksOfProject(project: Project): Entry[] {
  return project.phases.flatMap((ph) => ph.entries.filter(isOpenTask))
}

export function openTasksOfIncident(incident: Incident): Entry[] {
  return incident.entries.filter(isOpenTask)
}
