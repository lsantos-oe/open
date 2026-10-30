import { useAppStore } from '@/store/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import type { AiTool } from '@/types/ai'
import type { Project } from '@/types'
import {
  ReadCtx, ProjectSection, DEFAULT_PROJECT_SECTIONS, TaskFilter, TaskRef, allOpenPoints, allTaskRefs, capList, clientDetails, clientRow,
  filterTasks, includesNorm, incidentDetails, incidentRow, incidentTaskRefs, portfolio, projectDetails, projectRow,
  projectTaskRefs, prune, searchKnowledge, taskView, workload, clip, norm,
} from '../readModel'

// Ferramentas de LEITURA do assistente. Todas calculam em cima do que já está carregado no app (sem rede) e devolvem
// resumos compactos com sinais prontos (atraso, bloqueio, progresso, carga por pessoa), para ele poder analisar e
// dar insights com números reais. Retros ficam de fora de propósito (sigilo garantido pelo banco).

export function buildReadCtx(): ReadCtx {
  const s = useAppStore.getState()
  return {
    today: new Date().toLocaleDateString('en-CA'),
    holidays: s.settings.holidays,
    projects: s.projects,
    incidents: s.incidents,
    clients: s.clients,
    contacts: s.contacts,
    teamDirectory: s.teamDirectory,
    standaloneTasks: s.standaloneTasks,
  }
}

/** Nome do usuário logado (para "minhas tarefas", "meus projetos"). */
export function currentUserName(ctx: ReadCtx): string | undefined {
  const id = useAuthStore.getState().user?.id
  const p = ctx.teamDirectory.find((x) => x.id === id)
  return p?.name ?? p?.email ?? undefined
}

type Resolved = { project: Project } | { error: string; matches?: { id: string; name: string }[] }

export function resolveProject(ctx: ReadCtx, input: Record<string, unknown>): Resolved {
  if (input.projectId) {
    const project = ctx.projects.find((p) => p.id === input.projectId)
    return project ? { project } : { error: 'Projeto não encontrado.' }
  }
  if (input.projectName) {
    const matches = ctx.projects.filter((p) => !p.archived && includesNorm(p.name, String(input.projectName)))
    if (matches.length === 1) return { project: matches[0] }
    if (matches.length === 0) return { error: `Nenhum projeto com "${input.projectName}".` }
    return { error: 'Mais de um projeto combina — pergunte ao usuário qual.', matches: matches.map((p) => ({ id: p.id, name: p.name })) }
  }
  return { error: 'Informe projectId ou projectName.' }
}

const arr = (v: unknown): string[] | undefined => (Array.isArray(v) && v.length ? v.map(String) : undefined)
const str = (v: unknown): string | undefined => (v === undefined || v === null || v === '' ? undefined : String(v))
const num = (v: unknown, d: number, max: number) => Math.min(max, typeof v === 'number' && v > 0 ? Math.floor(v) : d)

const PROJECT_REF = {
  projectId: { type: 'string', description: 'Id do projeto (obtido via find_project)' },
  projectName: { type: 'string', description: 'Alternativa ao id: nome (ou parte) do projeto — se mais de um combinar, a tool devolve as opções' },
}

const TASK_FILTER_PROPS = {
  status: { type: 'array', items: { type: 'string', enum: ['pending', 'todo', 'in_progress', 'validation', 'done', 'blocked', 'overdue'] }, description: 'Filtra por status (pending = Backlog)' },
  ownerName: { type: 'string', description: 'Executor ou validador (nome parcial)' },
  overdueOnly: { type: 'boolean', description: 'Só tarefas atrasadas (prazo passou e não concluída)' },
  onlyProblems: { type: 'boolean', description: 'Só tarefas com algum sinal: atrasada, parada (sem atividade há 5+ dias) ou bloqueada' },
  riskFlag: { type: 'string', enum: ['warning', 'critical'] },
  type: { type: 'string', enum: ['task', 'milestone', 'meeting'] },
  dueBefore: { type: 'string', description: 'Prazo até esta data (AAAA-MM-DD)' },
  dueAfter: { type: 'string', description: 'Prazo a partir desta data (AAAA-MM-DD)' },
  text: { type: 'string', description: 'Texto no nome ou na descrição' },
  includeDone: { type: 'boolean', description: 'Incluir concluídas (padrão: sim)' },
}

function toFilter(input: Record<string, unknown>, ctx: ReadCtx): TaskFilter {
  return {
    status: arr(input.status),
    ownerName: input.mine ? currentUserName(ctx) : str(input.ownerName),
    overdueOnly: input.overdueOnly === true,
    onlyProblems: input.onlyProblems === true,
    riskFlag: str(input.riskFlag) as TaskFilter['riskFlag'],
    type: str(input.type),
    endBefore: str(input.dueBefore),
    endAfter: str(input.dueAfter),
    text: str(input.text),
    includeDone: input.includeDone === false ? false : undefined,
  }
}

const statusCounts = (refs: TaskRef[]) => refs.reduce<Record<string, number>>((m, r) => ({ ...m, [r.entry.status]: (m[r.entry.status] ?? 0) + 1 }), {})

const endKey = (r: TaskRef) => (r.entry.type === 'task' ? r.entry.plannedEnd : r.entry.plannedDate) ?? '9999-12-31'

export const listTasksTool: AiTool = {
  name: 'list_tasks',
  description: 'Lista tarefas/marcos/reuniões COM os detalhes de gestão: executor e validador, datas, duração, atraso em dias, desvio vs baseline, sinais (atrasada/parada/bloqueada), risco, caminho crítico, comentários e descrição. Cobre um projeto (todas as fases ou uma), um incidente, ou as tarefas soltas (se nenhum dos dois for informado). Aceita filtros (status, responsável, só atrasadas…). Subtarefas aparecem na lista com o campo parentTask. Use também para obter o id real de uma tarefa antes de update_task.',
  input_schema: {
    type: 'object',
    properties: {
      ...PROJECT_REF,
      phaseId: { type: 'string', description: 'Filtra por uma fase (obtida via list_phases)' },
      incidentId: { type: 'string', description: 'Id do incidente (obtido via find_incident)' },
      ...TASK_FILTER_PROPS,
      limit: { type: 'number', description: 'Máximo de tarefas devolvidas (padrão 100, máx. 250)' },
    },
  },
  isWrite: false,
  async execute(input) {
    const ctx = buildReadCtx()
    let refs: TaskRef[]
    let scope: Record<string, unknown>
    if (input.incidentId) {
      const incident = ctx.incidents.find((i) => i.id === input.incidentId)
      if (!incident) return { error: 'Incidente não encontrado.' }
      refs = incidentTaskRefs(incident)
      scope = { incident: incident.title }
    } else if (input.projectId || input.projectName) {
      const r = resolveProject(ctx, input)
      if ('error' in r) return r
      refs = projectTaskRefs(r.project)
      if (input.phaseId) {
        const ph = r.project.phases.find((x) => x.id === input.phaseId)
        if (!ph) return { error: 'Fase não encontrada neste projeto.' }
        refs = refs.filter((x) => x.phaseName === ph.name)
      }
      scope = { project: r.project.name }
    } else {
      refs = ctx.standaloneTasks.flatMap((e) => [{ entry: e, scope: 'standalone' as const } as TaskRef, ...e.subtasks.map((s) => ({ entry: s, scope: 'standalone' as const, parentName: e.name }) as TaskRef)])
      scope = { standalone: true }
    }
    const filtered = filterTasks(ctx, refs, toFilter(input, ctx))
    const page = capList(filtered, num(input.limit, 100, 250))
    return { today: ctx.today, ...scope, byStatus: statusCounts(filtered), total: page.total, truncated: page.truncated, tasks: page.items.map((r) => taskView(ctx, r, { descriptionMax: 160 })) }
  },
}

export const searchTasksTool: AiTool = {
  name: 'search_tasks',
  description: 'Busca tarefas em TODO o Open de uma vez (projetos, incidentes e tarefas soltas) com os mesmos detalhes de list_tasks mais o contexto de onde cada uma vive. Ideal para perguntas transversais: "o que a Ana tem atrasado?", "tarefas críticas desta semana", "o que está bloqueado em clientes da Lockton?". Use mine=true para as tarefas do usuário atual.',
  input_schema: {
    type: 'object',
    properties: {
      ...TASK_FILTER_PROPS,
      mine: { type: 'boolean', description: 'Só tarefas em que o usuário atual é executor/validador' },
      scope: { type: 'string', enum: ['project', 'incident', 'standalone', 'all'], description: 'Padrão: all' },
      projectName: { type: 'string', description: 'Só tarefas de projetos cujo nome contém isto' },
      clientName: { type: 'string', description: 'Só tarefas de projetos/incidentes deste cliente (nome parcial)' },
      limit: { type: 'number', description: 'Máximo (padrão 80, máx. 200)' },
    },
  },
  isWrite: false,
  async execute(input) {
    const ctx = buildReadCtx()
    let refs = allTaskRefs(ctx)
    const scope = str(input.scope) ?? 'all'
    if (scope !== 'all') refs = refs.filter((r) => r.scope === scope)
    if (input.projectName) refs = refs.filter((r) => r.scope === 'project' && includesNorm(r.scopeName, String(input.projectName)))
    if (input.clientName) {
      const q = String(input.clientName)
      const projIds = new Set(ctx.projects.filter((p) => ctx.clients.some((c) => p.clientIds.includes(c.id) && includesNorm(c.name, q))).map((p) => p.id))
      const incIds = new Set(ctx.incidents.filter((i) => ctx.clients.some((c) => i.clientIds.includes(c.id) && includesNorm(c.name, q))).map((i) => i.id))
      refs = refs.filter((r) => (r.scope === 'project' && projIds.has(r.scopeId!)) || (r.scope === 'incident' && incIds.has(r.scopeId!)))
    }
    const filtered = filterTasks(ctx, refs, toFilter(input, ctx)).sort((a, b) => endKey(a).localeCompare(endKey(b)))
    const page = capList(filtered, num(input.limit, 80, 200))
    return { today: ctx.today, byStatus: statusCounts(filtered), total: page.total, truncated: page.truncated, tasks: page.items.map((r) => taskView(ctx, r, { withContext: true, descriptionMax: 160 })) }
  },
}

export const getTaskTool: AiTool = {
  name: 'get_task',
  description: 'Detalhe completo de UMA tarefa (de projeto, incidente ou solta): descrição inteira, todos os comentários, links, dependências (com nomes), subtarefas e histórico de datas/baseline.',
  input_schema: { type: 'object', properties: { taskId: { type: 'string', description: 'Id da tarefa ou subtarefa (obtido via list_tasks/search_tasks)' } }, required: ['taskId'] },
  isWrite: false,
  async execute(input) {
    const ctx = buildReadCtx()
    const refs = allTaskRefs(ctx)
    const ref = refs.find((r) => r.entry.id === input.taskId)
    if (!ref) return { error: 'Tarefa não encontrada.' }
    const e = ref.entry
    const nameById = new Map(refs.map((r) => [r.entry.id, r.entry.name]))
    return prune({
      ...taskView(ctx, ref, { withContext: true, withSubtasks: true, descriptionMax: 3000 }),
      dependsOnNames: e.dependsOn.map((id) => nameById.get(id) ?? id),
      links: e.links.map((l) => ({ label: l.label, url: l.url })),
      createdAt: e.createdAt?.slice(0, 10),
      // Conversa em cadeia: respostas indicam a quem respondem.
      comments: e.comments.slice(-25).map((c) => ({ author: c.author, date: c.createdAt.slice(0, 10), text: clip(c.text, 400), replyTo: c.parentId ? e.comments.find((x) => x.id === c.parentId)?.author : undefined, edited: c.updatedAt ? true : undefined })),
    })
  },
}

export const getProjectOverviewTool: AiTool = {
  name: 'get_project_overview',
  description: 'Resumo de saúde de um projeto: status, líder, atraso e variância vs baseline, progresso (% concluído), tarefas atrasadas/bloqueadas/paradas, riscos abertos, pontos em aberto, atraso acumulado e prazo (go-live). Para o detalhe (riscos, atrasos, charter, reuniões…) use get_project_details.',
  input_schema: { type: 'object', properties: PROJECT_REF },
  isWrite: false,
  async execute(input) {
    const ctx = buildReadCtx()
    const r = resolveProject(ctx, input)
    return 'error' in r ? r : projectRow(ctx, r.project)
  },
}

export const getProjectDetailsTool: AiTool = {
  name: 'get_project_details',
  description: 'Visão completa de um projeto, por seções: summary (sempre), team, charter (sponsor, orçamento e documento), phases (progresso por fase), risks, delays (atraso total por responsabilidade/tipo + registros), open_points, meetings (atas e itens), history, links. Padrão: team, phases, risks, delays e open_points — peça charter/meetings/history quando a pergunta precisar.',
  input_schema: {
    type: 'object',
    properties: {
      ...PROJECT_REF,
      sections: { type: 'array', items: { type: 'string', enum: ['team', 'charter', 'phases', 'risks', 'delays', 'open_points', 'meetings', 'history', 'links'] }, description: 'Seções a incluir' },
    },
  },
  isWrite: false,
  async execute(input) {
    const ctx = buildReadCtx()
    const r = resolveProject(ctx, input)
    if ('error' in r) return r
    return projectDetails(ctx, r.project, (arr(input.sections) as ProjectSection[] | undefined) ?? DEFAULT_PROJECT_SECTIONS)
  },
}

export const listProjectsTool: AiTool = {
  name: 'list_projects',
  description: 'Panorama do portfólio: cada projeto com status, líder, clientes, atraso/variância, progresso %, tarefas atrasadas/bloqueadas/paradas, riscos, pontos em aberto, atraso acumulado e prazo. Filtros por cliente, líder (pm/dev lead) e status; onlyAtRisk=true traz só os com problemas; ordenado por "atenção" (piores primeiro) por padrão. Use para perguntas como "quais projetos estão em risco?" ou "como está a carteira do Fulano?".',
  input_schema: {
    type: 'object',
    properties: {
      clientName: { type: 'string', description: 'Filtra por nome do cliente (busca parcial)' },
      pmName: { type: 'string', description: 'Filtra por líder do projeto ou dev lead (busca parcial)' },
      status: { type: 'string', enum: ['backlog', 'planning', 'in_progress', 'done'] },
      onlyAtRisk: { type: 'boolean', description: 'Só projetos com atraso, tarefas atrasadas/bloqueadas ou riscos altos' },
      sortBy: { type: 'string', enum: ['attention', 'name', 'deadline'] },
      mine: { type: 'boolean', description: 'Só projetos em que o usuário atual é líder ou dev lead' },
    },
  },
  isWrite: false,
  async execute(input) {
    const ctx = buildReadCtx()
    return portfolio(ctx, {
      pmName: input.mine ? currentUserName(ctx) : str(input.pmName),
      clientName: str(input.clientName),
      status: str(input.status),
      onlyAtRisk: input.onlyAtRisk === true,
      sortBy: str(input.sortBy) as 'attention' | 'name' | 'deadline' | undefined,
    })
  },
}

export const workloadTool: AiTool = {
  name: 'workload_by_person',
  description: 'Carga e contribuição por pessoa, calculadas das tarefas: por executor (ou validador) quantas tarefas tem, concluídas, em andamento, bloqueadas, atrasadas, dias planejados e dias entregues, e a participação % de cada um nas entregas. Serve para "quem mais contribuiu no projeto X?", "quem está sobrecarregado?", "como o trabalho está distribuído?". Sem projeto/incidente, considera TODO o Open. Explique ao usuário qual métrica usou (tarefas concluídas e dias de duração das concluídas).',
  input_schema: {
    type: 'object',
    properties: {
      ...PROJECT_REF,
      incidentId: { type: 'string' },
      role: { type: 'string', enum: ['executor', 'validator'], description: 'Padrão: executor' },
      includeTypes: { type: 'array', items: { type: 'string', enum: ['task', 'milestone', 'meeting'] }, description: 'Padrão: só task' },
      from: { type: 'string', description: 'Só conta concluídas a partir desta data (AAAA-MM-DD)' },
      to: { type: 'string', description: 'Só conta concluídas até esta data (AAAA-MM-DD)' },
    },
  },
  isWrite: false,
  async execute(input) {
    const ctx = buildReadCtx()
    let refs: TaskRef[]
    let scope: string
    if (input.incidentId) {
      const i = ctx.incidents.find((x) => x.id === input.incidentId)
      if (!i) return { error: 'Incidente não encontrado.' }
      refs = incidentTaskRefs(i); scope = `incidente ${i.title}`
    } else if (input.projectId || input.projectName) {
      const r = resolveProject(ctx, input)
      if ('error' in r) return r
      refs = projectTaskRefs(r.project); scope = `projeto ${r.project.name}`
    } else {
      refs = allTaskRefs(ctx); scope = 'todo o Open (projetos, incidentes e tarefas soltas)'
    }
    return { today: ctx.today, scope, ...workload(ctx, refs, { role: str(input.role) as 'executor' | 'validator' | undefined, types: arr(input.includeTypes), from: str(input.from), to: str(input.to) }) }
  },
}

export const listIncidentsTool: AiTool = {
  name: 'list_incidents',
  description: 'Lista incidentes (Sustentação) com responsável, clientes, projetos, prazo, atraso, idade em dias, dias no status atual, tempo de resolução e tarefas/pontos em aberto. Filtros: cliente, status, responsável, só abertos, só atrasados. Use para análises como tempo médio de resolução, incidentes parados ou carga por responsável.',
  input_schema: {
    type: 'object',
    properties: {
      clientName: { type: 'string', description: 'Filtra por nome do cliente vinculado (busca parcial)' },
      status: { type: 'string', enum: ['open', 'in_progress', 'waiting_on_client', 'resolved', 'closed'] },
      ownerName: { type: 'string', description: 'Responsável (nome parcial)' },
      onlyOpen: { type: 'boolean', description: 'Só não resolvidos/encerrados' },
      overdueOnly: { type: 'boolean', description: 'Só com prazo vencido e ainda abertos' },
      priority: { type: 'string', enum: ['low', 'medium', 'high'] },
    },
  },
  isWrite: false,
  async execute(input) {
    const ctx = buildReadCtx()
    let list = ctx.incidents
    if (input.clientName) {
      const ids = new Set(ctx.clients.filter((c) => includesNorm(c.name, String(input.clientName))).map((c) => c.id))
      list = list.filter((i) => i.clientIds.some((id) => ids.has(id)))
    }
    if (input.status) list = list.filter((i) => i.status === input.status)
    if (input.priority) list = list.filter((i) => i.priority === input.priority)
    if (input.ownerName) list = list.filter((i) => i.owner && includesNorm(i.owner.name, String(input.ownerName)))
    if (input.onlyOpen) list = list.filter((i) => i.status !== 'resolved' && i.status !== 'closed')
    const rows = list.map((i) => incidentRow(ctx, i) as Record<string, any>)
    const filtered = input.overdueOnly ? rows.filter((r) => r.overdue) : rows
    const resolved = rows.map((r) => r.resolutionDays).filter((n): n is number => typeof n === 'number')
    return {
      today: ctx.today,
      byStatus: filtered.reduce<Record<string, number>>((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {}),
      avgResolutionDays: resolved.length ? Math.round((resolved.reduce((s, n) => s + n, 0) / resolved.length) * 10) / 10 : undefined,
      incidents: capList(filtered.sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0)), 100),
    }
  },
}

export const getIncidentDetailsTool: AiTool = {
  name: 'get_incident_details',
  description: 'Visão completa de um incidente: descrição, responsável, stakeholders, prazos, tarefas (com detalhes), pontos em aberto e histórico.',
  input_schema: { type: 'object', properties: { incidentId: { type: 'string', description: 'Id do incidente (obtido via find_incident)' } }, required: ['incidentId'] },
  isWrite: false,
  async execute(input) {
    const ctx = buildReadCtx()
    const i = ctx.incidents.find((x) => x.id === input.incidentId)
    return i ? incidentDetails(ctx, i) : { error: 'Incidente não encontrado.' }
  },
}

export const listClientsTool: AiTool = {
  name: 'list_clients',
  description: 'Lista os clientes da Carteira com status, responsáveis (CS), quantos projetos (e ativos) e incidentes abertos. Filtros por nome, status e responsável.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      status: { type: 'string', enum: ['pre_venda', 'implantacao', 'sustentacao_novos_projetos'] },
      ownerName: { type: 'string', description: 'Responsável pelo cliente (nome parcial)' },
    },
  },
  isWrite: false,
  async execute(input) {
    const ctx = buildReadCtx()
    let list = ctx.clients.filter((c) => !c.archived)
    if (input.name) list = list.filter((c) => includesNorm(c.name, String(input.name)))
    if (input.status) list = list.filter((c) => c.status === input.status)
    if (input.ownerName) list = list.filter((c) => c.owners.some((o) => includesNorm(o.name, String(input.ownerName))))
    return { clients: capList(list.map((c) => clientRow(ctx, c)), 120) }
  },
}

export const getClientDetailsTool: AiTool = {
  name: 'get_client_details',
  description: 'Visão 360° de um cliente: notas, responsáveis e histórico de CS, contatos, todos os projetos (com saúde), incidentes e tarefas soltas vinculadas.',
  input_schema: { type: 'object', properties: { clientId: { type: 'string', description: 'Id do cliente (obtido via find_client)' } }, required: ['clientId'] },
  isWrite: false,
  async execute(input) {
    const ctx = buildReadCtx()
    const c = ctx.clients.find((x) => x.id === input.clientId)
    return c ? clientDetails(ctx, c) : { error: 'Cliente não encontrado.' }
  },
}

export const listOpenPointsTool: AiTool = {
  name: 'list_open_points',
  description: 'Pontos em aberto do Diário de todos os projetos e incidentes de uma vez, com responsável, prazo, idade e descrição. Filtros: status (padrão: abertos), responsável, projeto, só vencidos.',
  input_schema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['open', 'resolved', 'all'] },
      ownerName: { type: 'string' },
      projectName: { type: 'string' },
      overdueOnly: { type: 'boolean' },
    },
  },
  isWrite: false,
  async execute(input) {
    const ctx = buildReadCtx()
    return { today: ctx.today, openPoints: allOpenPoints(ctx, { status: str(input.status) as 'open' | 'resolved' | 'all' | undefined, ownerName: str(input.ownerName), projectName: str(input.projectName), overdueOnly: input.overdueOnly === true }) }
  },
}

export const searchKnowledgeTool: AiTool = {
  name: 'search_knowledge',
  description: 'Busca de texto em TODO o conhecimento escrito do Open: anotações e charter de projetos, descrições e comentários de tarefas, riscos, justificativas de atraso, pontos em aberto, atas de reunião, histórico, incidentes e notas de clientes. Todas as palavras precisam aparecer (sem diferenciar acento/caixa). Devolve trechos com a origem e os ids. Use para "o que foi decidido sobre X?", "já tivemos problema parecido com Y?", "o que combinamos com o cliente Z?".',
  input_schema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Palavras a procurar (todas devem aparecer no mesmo trecho)' }, limit: { type: 'number', description: 'Máximo de resultados (padrão 25, máx. 60)' } },
    required: ['query'],
  },
  isWrite: false,
  async execute(input) {
    const ctx = buildReadCtx()
    const q = String(input.query ?? '')
    if (norm(q).length < 2) return { error: 'Informe o que procurar.' }
    return searchKnowledge(ctx, q, num(input.limit, 25, 60))
  },
}

export const listUsersTool: AiTool = {
  name: 'list_users',
  description: 'Lista as pessoas cadastradas e ativas no Open (nome, e-mail e papel). Para saber quem é quem e quem pode ser responsável.',
  input_schema: { type: 'object', properties: {} },
  isWrite: false,
  async execute() {
    const ctx = buildReadCtx()
    return { users: ctx.teamDirectory.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, email: p.email, role: p.role })) }
  },
}
