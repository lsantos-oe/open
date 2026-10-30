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
import { Client, Entry, EntryOwner, Incident, IncidentStatus, Project } from '@/types'
import { isProjectMine } from '@/utils/involvement'
import { isProjectDelayed, projectProgress } from '@/utils/projectStats'
import { buildCapacity, CapTask, DEFAULT_LIMIT } from '@/utils/capacity'
import { isLate } from '@/utils/statusCalc'
import { Avatar } from '@/components/ui/Chip'

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

/** Limites de carga que a pessoa ajustou na visão Carga (mesmos valores guardados lá). */
function readCapacityLimits(): { limit: number; limits: Record<string, number> } {
  try {
    const l = Number(localStorage.getItem('pb-capacity-limit'))
    const m = JSON.parse(localStorage.getItem('pb-capacity-limits') ?? '{}')
    return { limit: l >= 1 && l <= 50 ? l : DEFAULT_LIMIT, limits: m && typeof m === 'object' ? m : {} }
  } catch { return { limit: DEFAULT_LIMIT, limits: {} } }
}

/** Todas as tarefas ativas do sistema no formato da análise de capacidade (só usuários ativos contam como pessoa). */
function capacityInputs(projects: Project[], incidents: Incident[], standalone: Entry[], activeUsers: Set<string>): CapTask[] {
  const out: CapTask[] = []
  const add = (e: Entry) => {
    if (e.parentEntryId || e.type !== 'task') return
    const owners: EntryOwner[] = e.owners ?? []
    const executor = owners.find((o) => o.kind === 'executor') ?? (owners.every((o) => !o.kind) ? owners[0] : undefined)
    const user = executor && executor.type === 'member' && executor.memberId && activeUsers.has(executor.memberId) ? executor : undefined
    out.push({ id: e.id, type: e.type, status: e.status, start: e.plannedStart, end: e.plannedEnd, executorKey: user ? `member:${user.memberId}` : undefined, executorName: user?.name })
  }
  for (const p of projects) { if (p.archived || p.status === 'backlog') continue; for (const ph of p.phases) ph.entries.forEach(add) }
  for (const i of incidents) i.entries.forEach(add)
  standalone.forEach(add)
  return out
}

const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function Tile({ label, value, sub, tone, onClick }: { label: string; value: number | string; sub?: string; tone?: 'bad' | 'warn'; onClick?: () => void }) {
  const color = tone === 'bad' ? 'var(--color-danger-text)' : tone === 'warn' ? 'var(--color-warning-text)' : 'var(--text-primary)'
  return (
    <button onClick={onClick} className="oe-card px-4 py-3.5 text-left min-w-0 transition-shadow hover:shadow-[var(--shadow-sm)]">
      <p className="text-[12px] truncate" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      <p className="text-[28px] leading-tight font-semibold tabular-nums" style={{ color }}>{value}</p>
      <p className="text-[11.5px] truncate" style={{ color: 'var(--text-tertiary)' }}>{sub ?? '\u00A0'}</p>
    </button>
  )
}

function Panel({ title, action, onAction, children, className = '' }: { title: string; action?: string; onAction?: () => void; children: React.ReactNode; className?: string }) {
  return (
    <section className={`oe-card p-5 flex flex-col min-w-0 ${className}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
        {action && <button onClick={onAction} className="text-[12px] hover:underline shrink-0" style={{ color: 'var(--text-tertiary)' }}>{action}</button>}
      </div>
      {children}
    </section>
  )
}

export default function DashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  // Clicar numa tarefa abre a tarefa (o modal, por cima da página inicial), não o projeto ou incidente dela.
  const openEntry = useEntryOpenerStore((s) => s.open)
  const { projects, incidents, standaloneTasks, clients, clientGroups, teamDirectory, settings } = useAppStore()
  const { user, profile } = useAuthStore()
  const showBacklogProjectTasks = useBacklogTasksPref((s) => s.showBacklogProjectTasks)
  const setShowBacklogProjectTasks = useBacklogTasksPref((s) => s.setShowBacklogProjectTasks)
  const today = new Date().toISOString().split('T')[0]

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

  const sortedTasks = useMemo(() => [...myTasks].sort((a, b) => {
    const da = taskDueDate(a.entry); const db = taskDueDate(b.entry)
    if (!da && !db) return 0
    if (!da) return 1
    if (!db) return -1
    return da.localeCompare(db)
  }), [myTasks])

  const overdueMine = useMemo(() => myTasks.filter((tk) => isLate(tk.entry as any, today)), [myTasks, today])
  const blockedMine = myTasks.filter((tk) => tk.entry.status === 'blocked').length

  // Agenda: atrasadas + os próximos 7 dias (tarefas minhas e prazos dos meus incidentes)
  const agenda = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i)
      return { iso: d.toISOString().split('T')[0], dow: WEEKDAY[d.getDay()], day: d.getDate(), count: 0 }
    })
    const items: { label: string; sub: string; days: number; date: string; onClick: () => void }[] = []
    for (const task of myTasks) {
      const due = taskDueDate(task.entry)
      if (!due) continue
      const n = daysUntil(due)
      if (n > 6) continue
      const slot = days.find((d) => d.iso === due)
      if (slot) slot.count++
      items.push({ label: task.entry.name, sub: task.scopeName, days: n, date: due, onClick: () => openEntry(task.entry.id) })
    }
    for (const i of myIncidents) {
      if (!i.deadline) continue
      const n = daysUntil(i.deadline)
      if (n > 6) continue
      const slot = days.find((d) => d.iso === i.deadline)
      if (slot) slot.count++
      items.push({ label: i.title, sub: 'Incidente', days: n, date: i.deadline, onClick: () => navigate(`/support/${i.id}`) })
    }
    items.sort((a, b) => a.days - b.days)
    return { days, items, overdue: items.filter((it) => it.days < 0).length }
  }, [myTasks, myIncidents, navigate, openEntry])

  const activeProjects = useMemo(() => projects.filter((p) => !p.archived && p.status !== 'done' && p.status !== 'backlog'), [projects])
  const delayedProjects = useMemo(() => activeProjects.filter((p) => isProjectDelayed(p, settings.holidays)), [activeProjects, settings.holidays])
  const myProjects = useMemo(() => {
    const mine = activeProjects.filter((p) => isProjectMine(p, user?.id))
    return (mine.length > 0 ? mine : activeProjects).slice(0, 5)
  }, [activeProjects, user])

  // Carga do time: usuários ativos com mais tarefas, contra o limite que a pessoa definiu na visão Carga.
  const capacity = useMemo(() => {
    const active = new Set(teamDirectory.filter((p) => p.active).map((p) => p.id))
    const { limit, limits } = readCapacityLimits()
    return buildCapacity(capacityInputs(projects, incidents, standaloneTasks, active), { today, limit, limits })
  }, [projects, incidents, standaloneTasks, teamDirectory, today])
  const topLoad = capacity.people.slice(0, 5)

  const firstName = profile?.name?.split(' ')[0] ?? t('dashboard.greetingFallback')
  const dateLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/-feira/i, '-feira')
  const summary = [
    overdueMine.length > 0 ? `${overdueMine.length} ${overdueMine.length === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}` : null,
    myIncidents.length > 0 ? `${myIncidents.length} ${myIncidents.length === 1 ? 'incidente aberto' : 'incidentes abertos'}` : null,
    agenda.items.filter((it) => it.days >= 0).length > 0 ? `${agenda.items.filter((it) => it.days >= 0).length} ${agenda.items.filter((it) => it.days >= 0).length === 1 ? 'prazo' : 'prazos'} nos próximos 7 dias` : null,
  ].filter(Boolean)

  const dayLabel = (n: number) => (n < 0 ? t('dashboard.overdueDays', { n: -n }) : n === 0 ? t('dashboard.today') : t('dashboard.inDays', { n }))
  const maxCount = Math.max(1, ...agenda.days.map((d) => d.count))

  return (
    <div className="px-8 pt-6 pb-10 max-w-[1280px] mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{t('dashboard.greeting', { name: firstName })}</h1>
        <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          <span>{dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}</span>{summary.length > 0 ? ` · ${summary.join(' · ')}` : ' · Nada urgente por aqui.'}
        </p>
      </div>

      {/* Números: cada um leva à lista já filtrada */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <Tile label="Minhas tarefas" value={sortedTasks.length} sub={blockedMine ? `${blockedMine} bloqueada${blockedMine > 1 ? 's' : ''}` : 'em aberto'} onClick={() => navigate('/tasks?view=kanban&mine=1', { state: { qa: Date.now() } })} />
        <Tile label="Atrasadas" value={overdueMine.length} tone={overdueMine.length ? 'bad' : undefined} sub={overdueMine.length ? 'precisam de data nova' : 'tudo em dia'} onClick={() => navigate('/tasks?view=table&mine=1&overdue=1', { state: { qa: Date.now() } })} />
        <Tile label="Vencem em 7 dias" value={agenda.items.filter((it) => it.days >= 0).length} sub="tarefas e incidentes" onClick={() => navigate('/tasks?view=table&mine=1', { state: { qa: Date.now() } })} />
        <Tile label="Meus incidentes" value={myIncidents.length} tone={myIncidents.some((i) => i.status === 'waiting_on_client') ? 'warn' : undefined} sub={myIncidents.filter((i) => i.status === 'waiting_on_client').length ? `${myIncidents.filter((i) => i.status === 'waiting_on_client').length} aguardando cliente` : 'em aberto'} onClick={() => navigate('/support?view=kanban&mine=1', { state: { qa: Date.now() } })} />
        <Tile label="Projetos ativos" value={activeProjects.length} tone={delayedProjects.length ? 'warn' : undefined} sub={delayedProjects.length ? `${delayedProjects.length} atrasado${delayedProjects.length > 1 ? 's' : ''}` : 'no prazo'} onClick={() => navigate('/portfolio?view=list')} />
        <Tile label="Carteira" value={clients.length} sub={clientGroups.length ? `${clientGroups.length} grupo${clientGroups.length > 1 ? 's' : ''}` : 'clientes'} onClick={() => navigate('/wallet')} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Agenda da semana */}
        <Panel title="Próximos 7 dias" action="Ver tarefas" onAction={() => navigate('/tasks?view=table&mine=1', { state: { qa: Date.now() } })} className="xl:col-span-2">
          <div className="grid grid-cols-7 gap-2 mb-4" aria-label="Prazos por dia">
            {agenda.days.map((d, i) => (
              <div key={d.iso} className="flex flex-col items-center gap-1.5">
                <div className="w-full flex items-end justify-center rounded-[var(--radius-md)]" style={{ height: 56, background: 'var(--surface-subtle)' }} title={`${d.count} ${d.count === 1 ? 'prazo' : 'prazos'}`}>
                  <div className="w-full rounded-[var(--radius-md)]" style={{ height: d.count ? `${Math.max(14, (d.count / maxCount) * 100)}%` : 0, background: i === 0 ? 'var(--text-primary)' : 'var(--text-tertiary)', opacity: i === 0 ? 1 : 0.55 }} />
                </div>
                <span className="text-[11.5px] tabular-nums" style={{ color: i === 0 ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: i === 0 ? 600 : 400 }}>{d.dow} {d.day}</span>
                <span className="text-[11.5px] tabular-nums" style={{ color: d.count ? 'var(--text-secondary)' : 'var(--text-disabled)' }}>{d.count || '·'}</span>
              </div>
            ))}
          </div>
          {agenda.items.length === 0 ? (
            <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>Nenhum prazo seu nos próximos 7 dias.</p>
          ) : (
            <ul className="space-y-0.5">
              {agenda.items.slice(0, 6).map((it, k) => (
                <li key={k}>
                  <button onClick={it.onClick} className="w-full flex items-center gap-3 text-left py-1.5 px-2 -mx-2 rounded-[var(--radius-md)] hover:bg-[var(--surface-subtle)] transition-colors">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]" style={{ color: 'var(--text-primary)' }}>{it.label}</span>
                      <span className="block truncate text-[11.5px]" style={{ color: 'var(--text-tertiary)' }}>{it.sub}</span>
                    </span>
                    <Badge variant={it.days < 0 ? 'red' : it.days === 0 ? 'yellow' : 'gray'} size="sm">{dayLabel(it.days)}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Carga do time */}
        <Panel title="Carga do time" action="Ver carga" onAction={() => navigate('/tasks?view=capacity', { state: { qa: Date.now() } })}>
          {topLoad.length === 0 ? (
            <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>Nenhuma tarefa ativa com responsável do time.</p>
          ) : (
            <ul className="space-y-3">
              {topLoad.map((p) => {
                const pct = Math.min(100, Math.round((p.active / Math.max(1, p.limit)) * 100))
                const over = p.active > p.limit
                return (
                  <li key={p.key}>
                    <div className="flex items-center gap-2 mb-1">
                      <Avatar name={p.name} size={20} />
                      <span className="flex-1 truncate text-[13px]" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                      {p.overdue > 0 && <span className="text-[11.5px] tabular-nums" style={{ color: 'var(--color-danger-text)' }} title="Atrasadas">{p.overdue} atras.</span>}
                      <span className="text-[12px] tabular-nums" style={{ color: over ? 'var(--color-danger-text)' : 'var(--text-secondary)' }}>{p.active}/{p.limit}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-subtle)' }} role="img" aria-label={`${p.active} de ${p.limit} tarefas`}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: over ? 'var(--color-danger-text)' : pct > 75 ? 'var(--color-warning-text)' : 'var(--text-tertiary)' }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {capacity.unassigned.active > 0 && <p className="text-[11.5px] mt-3" style={{ color: 'var(--text-tertiary)' }}>{capacity.unassigned.active} tarefa{capacity.unassigned.active > 1 ? 's' : ''} sem responsável do time.</p>}
        </Panel>

        {/* Minhas tarefas */}
        <Panel title={t('dashboard.myOpenTasks')} action={`Ver todas (${sortedTasks.length})`} onAction={() => navigate('/tasks?view=table&mine=1', { state: { qa: Date.now() } })}>
          {(showBacklogProjectTasks || hiddenBacklogCount > 0) && (
            <label className="flex items-center gap-2 text-[12px] cursor-pointer mb-2" style={{ color: 'var(--text-tertiary)' }}>
              <input type="checkbox" className="accent-[var(--text-primary)]" checked={showBacklogProjectTasks} onChange={(e) => setShowBacklogProjectTasks(e.target.checked)} />
              Incluir projetos em backlog{!showBacklogProjectTasks ? ` (${hiddenBacklogCount} oculta${hiddenBacklogCount === 1 ? '' : 's'})` : ''}
            </label>
          )}
          {sortedTasks.length === 0 ? (
            <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>{t('dashboard.noOpenTasks')}</p>
          ) : (
            <ul className="space-y-0.5">
              {sortedTasks.slice(0, 6).map((task) => {
                const due = taskDueDate(task.entry)
                const late = isLate(task.entry as any, today)
                return (
                  <li key={task.entry.id}>
                    <button onClick={() => openEntry(task.entry.id)} className="w-full flex items-center gap-3 text-left py-1.5 px-2 -mx-2 rounded-[var(--radius-md)] hover:bg-[var(--surface-subtle)] transition-colors">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]" style={{ color: 'var(--text-primary)' }}>{task.entry.name}</span>
                        <span className="block truncate text-[11.5px]" style={{ color: 'var(--text-tertiary)' }}>{task.scopeName}</span>
                      </span>
                      {due && <span className="shrink-0 text-[11.5px] tabular-nums" style={{ color: late ? 'var(--color-danger-text)' : 'var(--text-tertiary)' }}>{new Date(due + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        {/* Meus incidentes */}
        <Panel title={t('dashboard.myIncidentsCard')} action={`Ver todos (${myIncidents.length})`} onAction={() => navigate('/support?view=kanban&mine=1', { state: { qa: Date.now() } })}>
          {myIncidents.length === 0 ? (
            <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>{t('dashboard.noMyIncidents')}</p>
          ) : (
            <ul className="space-y-0.5">
              {myIncidents.slice(0, 6).map((i) => (
                <li key={i.id}>
                  <button onClick={() => navigate(`/support/${i.id}`)} className="w-full flex items-center gap-3 text-left py-1.5 px-2 -mx-2 rounded-[var(--radius-md)] hover:bg-[var(--surface-subtle)] transition-colors">
                    <span className="flex-1 min-w-0 truncate text-[13px]" style={{ color: 'var(--text-primary)' }}>{i.title}</span>
                    <Badge variant={INCIDENT_STATUS_VARIANT[i.status]} size="sm" dot>{t(`incident.status_${i.status}`)}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Projetos */}
        <Panel title={myProjects.length && activeProjects.some((p) => isProjectMine(p, user?.id)) ? 'Meus projetos' : 'Projetos em andamento'} action="Ver portfólio" onAction={() => navigate('/portfolio?view=list')}>
          {myProjects.length === 0 ? (
            <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>Nenhum projeto em andamento.</p>
          ) : (
            <ul className="space-y-3">
              {myProjects.map((p) => {
                const prog = projectProgress(p)
                const late = isProjectDelayed(p, settings.holidays)
                return (
                  <li key={p.id}>
                    <button onClick={() => navigate(`/projects/${p.id}`)} className="w-full text-left group">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="flex-1 truncate text-[13px] group-hover:underline" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                        {late && <Badge variant="red" size="sm">Atrasado</Badge>}
                        <span className="text-[12px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>{prog ? `${prog.pct}%` : '—'}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-subtle)' }} role="img" aria-label={prog ? `${prog.pct}% concluído` : 'sem entregas'}>
                        <div className="h-full rounded-full" style={{ width: `${prog?.pct ?? 0}%`, background: late ? 'var(--color-warning-text)' : 'var(--text-tertiary)' }} />
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
