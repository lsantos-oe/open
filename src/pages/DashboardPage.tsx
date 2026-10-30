import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useEntryOpenerStore } from '@/stores/useEntryOpenerStore'
import { Badge, BadgeVariant } from '@/components/ui/Badge'
import { isEntryMine, isIncidentMine } from '@/utils/involvement'
import { useBacklogTasksPref } from '@/stores/useBacklogTasksPref'
import { entryClientIds } from '@/utils/entryClients'
import { Client, Entry, Incident, IncidentStatus, Project } from '@/types'

interface MyTask {
  entry: Entry
  projectId?: string
  incidentId?: string
  scopeName: string
}

const INCIDENT_STATUS_VARIANT: Record<IncidentStatus, BadgeVariant> = {
  open: 'gray', in_progress: 'blue', waiting_on_client: 'yellow', resolved: 'green', closed: 'gray',
}

function taskDueDate(entry: Entry): string | undefined {
  return entry.plannedEnd ?? entry.plannedDate
}

function daysUntil(iso: string): number {
  const d = new Date(iso + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}

function buildMyTasks(
  projects: Project[], incidents: Incident[], standaloneTasks: Entry[], clients: Client[], userId: string | undefined,
  includeBacklogProjects: boolean,
): MyTask[] {
  const tasks: MyTask[] = []
  for (const p of projects) {
    if (p.archived) continue
    // Projeto em Backlog ainda não começou: as tarefas dele só entram se o usuário pedir.
    if (p.status === 'backlog' && !includeBacklogProjects) continue
    for (const ph of p.phases) {
      for (const e of ph.entries) {
        if (e.parentEntryId) continue
        if (e.status === 'done') continue
        if (isEntryMine(e, userId)) tasks.push({ entry: e, projectId: p.id, scopeName: p.name })
      }
    }
  }
  for (const i of incidents) {
    for (const e of i.entries) {
      if (e.parentEntryId) continue
      if (e.status === 'done') continue
      if (isEntryMine(e, userId)) tasks.push({ entry: e, incidentId: i.id, scopeName: i.title })
    }
  }
  // Tarefas soltas (sem projeto nem incidente): o "escopo" é o cliente, ou "Tarefa solta" quando não há.
  for (const e of standaloneTasks) {
    if (e.parentEntryId || e.status === 'done') continue
    if (!isEntryMine(e, userId)) continue
    const clientNames = entryClientIds(e).map((id) => clients.find((c) => c.id === id)?.name).filter(Boolean).join(', ')
    tasks.push({ entry: e, scopeName: clientNames || 'Tarefa solta' })
  }
  return tasks
}

export default function DashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  // Clicar numa tarefa abre a tarefa (o modal, por cima da página inicial), não o projeto ou incidente dela.
  const openEntry = useEntryOpenerStore((s) => s.open)
  const { projects, incidents, standaloneTasks, clients } = useAppStore()
  const { user, profile } = useAuthStore()
  const showBacklogProjectTasks = useBacklogTasksPref((s) => s.showBacklogProjectTasks)
  const setShowBacklogProjectTasks = useBacklogTasksPref((s) => s.setShowBacklogProjectTasks)

  const myTasks = useMemo(
    () => buildMyTasks(projects, incidents, standaloneTasks, clients, user?.id, showBacklogProjectTasks),
    [projects, incidents, standaloneTasks, clients, user, showBacklogProjectTasks],
  )
  // Quantas tarefas minhas estão escondidas por serem de projetos em backlog (para avisar, em vez de sumirem em silêncio).
  const hiddenBacklogCount = useMemo(
    () => (showBacklogProjectTasks ? 0 : buildMyTasks(projects, incidents, standaloneTasks, clients, user?.id, true).length - myTasks.length),
    [projects, incidents, standaloneTasks, clients, user, showBacklogProjectTasks, myTasks.length],
  )
  const myIncidents = useMemo(
    () => incidents.filter((i) => isIncidentMine(i, user?.id) && i.status !== 'resolved' && i.status !== 'closed'),
    [incidents, user],
  )

  const dueSoon = useMemo(() => {
    const items: { label: string; date: string; days: number; onClick: () => void }[] = []
    for (const task of myTasks) {
      const due = taskDueDate(task.entry)
      if (!due) continue
      const days = daysUntil(due)
      if (days <= 7) {
        items.push({
          label: `${task.entry.name} · ${task.scopeName}`,
          date: due,
          days,
          onClick: () => openEntry(task.entry.id),
        })
      }
    }
    for (const i of myIncidents) {
      if (!i.deadline) continue
      const days = daysUntil(i.deadline)
      if (days <= 7) {
        items.push({ label: i.title, date: i.deadline, days, onClick: () => navigate(`/support/${i.id}`) })
      }
    }
    return items.sort((a, b) => a.days - b.days)
  }, [myTasks, myIncidents, navigate, openEntry])

  const sortedTasks = [...myTasks].sort((a, b) => {
    const da = taskDueDate(a.entry); const db = taskDueDate(b.entry)
    if (!da && !db) return 0
    if (!da) return 1
    if (!db) return -1
    return da.localeCompare(db)
  })

  const activeProjectsCount = projects.filter((p) => !p.archived && p.status !== 'done' && p.status !== 'backlog').length

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
        {t('dashboard.greeting', { name: profile?.name?.split(' ')[0] ?? t('dashboard.greetingFallback') })}
      </h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text-tertiary)' }}>{t('dashboard.subtitle')}</p>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="oe-card p-4">
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{myIncidents.length}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{t('dashboard.myOpenIncidents')}</p>
        </div>
        <div className="oe-card p-4">
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{sortedTasks.length}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{t('dashboard.myPendingTasks')}</p>
        </div>
        <div className="oe-card p-4">
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{activeProjectsCount}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{t('dashboard.activeProjects')}</p>
        </div>
      </div>

      {dueSoon.length > 0 && (
        <div className="rounded-[var(--radius-lg)] border p-4 mb-6" style={{ borderColor: 'var(--color-warning-text)', background: 'var(--color-warning-bg)' }}>
          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--color-warning-text)' }}>{t('dashboard.dueSoon')}</p>
          <div className="space-y-1.5">
            {dueSoon.map((item, i) => (
              <button key={i} onClick={item.onClick} className="w-full flex items-center justify-between text-left text-sm py-1 hover:underline" style={{ color: 'var(--text-primary)' }}>
                <span className="truncate">{item.label}</span>
                <span className="shrink-0 ml-3 text-xs" style={{ color: 'var(--color-warning-text)' }}>
                  {item.days < 0 ? t('dashboard.overdueDays', { n: -item.days }) : item.days === 0 ? t('dashboard.today') : t('dashboard.inDays', { n: item.days })}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="oe-card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('dashboard.myOpenTasks')}</p>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{sortedTasks.length}</span>
          </div>
          {(showBacklogProjectTasks || hiddenBacklogCount > 0) && (
            <label className="flex items-center gap-2 text-xs cursor-pointer mb-3" style={{ color: 'var(--text-tertiary)' }}>
              <input
                type="checkbox"
                className="rounded border-[var(--border-default)] accent-[var(--text-primary)]"
                checked={showBacklogProjectTasks}
                onChange={(e) => setShowBacklogProjectTasks(e.target.checked)}
              />
              Incluir projetos em backlog{!showBacklogProjectTasks ? ` (${hiddenBacklogCount} ${hiddenBacklogCount === 1 ? 'tarefa oculta' : 'tarefas ocultas'})` : ''}
            </label>
          )}
          {sortedTasks.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{t('dashboard.noOpenTasks')}</p>
          ) : (
            <div className="space-y-1">
              {sortedTasks.slice(0, 8).map((task) => (
                <button
                  key={task.entry.id}
                  onClick={() => openEntry(task.entry.id)}
                  className="w-full flex flex-col text-left text-sm py-1.5 rounded hover:bg-[var(--surface-subtle)] px-1 -mx-1 min-w-0"
                >
                  <span className="truncate w-full" style={{ color: 'var(--text-primary)' }}>{task.entry.name}</span>
                  <span className="truncate w-full text-xs" style={{ color: 'var(--text-tertiary)' }}>{task.scopeName}</span>
                </button>
              ))}
              {sortedTasks.length > 8 && (
                <p className="text-xs pt-1" style={{ color: 'var(--text-tertiary)' }}>{t('dashboard.moreOthersFem', { n: sortedTasks.length - 8 })}</p>
              )}
            </div>
          )}
        </div>

        <div className="oe-card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('dashboard.myIncidentsCard')}</p>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{myIncidents.length}</span>
          </div>
          {myIncidents.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{t('dashboard.noMyIncidents')}</p>
          ) : (
            <div className="space-y-1">
              {myIncidents.slice(0, 8).map((i) => (
                <button
                  key={i.id}
                  onClick={() => navigate(`/support/${i.id}`)}
                  className="w-full flex items-center justify-between text-left text-sm py-1.5 rounded hover:bg-[var(--surface-subtle)] px-1 -mx-1"
                >
                  <span className="truncate" style={{ color: 'var(--text-primary)' }}>{i.title}</span>
                  <Badge variant={INCIDENT_STATUS_VARIANT[i.status]}>{t(`incident.status_${i.status}`)}</Badge>
                </button>
              ))}
              {myIncidents.length > 8 && (
                <p className="text-xs pt-1" style={{ color: 'var(--text-tertiary)' }}>{t('dashboard.moreOthersMasc', { n: myIncidents.length - 8 })}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
