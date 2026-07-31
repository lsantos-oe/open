import { useAppStore } from '@/store/useAppStore'
import { AiTool } from '@/types/ai'
import { Entry, EntryOwner } from '@/types'
import { resolveOwnerByName, teamDirectoryAsTeamMembers } from './helpers'

export const listPhasesTool: AiTool = {
  name: 'list_phases',
  description: 'Lista as fases de um projeto (id, nome, ordem e quantas tarefas cada uma tem). Use antes de create_task/update_task quando precisar escolher ou mover uma tarefa de fase.',
  input_schema: {
    type: 'object',
    properties: { projectId: { type: 'string', description: 'Id do projeto (obtido via find_project)' } },
    required: ['projectId'],
  },
  isWrite: false,
  async execute(input) {
    const { projects } = useAppStore.getState()
    const project = projects.find((p) => p.id === input.projectId)
    if (!project) return { error: 'Projeto não encontrado.' }
    return {
      phases: project.phases
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((ph) => ({ id: ph.id, name: ph.name, order: ph.order, taskCount: ph.entries.length })),
    }
  },
}

function findEntry(entries: Entry[], entryId: string): Entry | undefined {
  for (const e of entries) {
    if (e.id === entryId) return e
    const sub = e.subtasks.find((s) => s.id === entryId)
    if (sub) return sub
  }
  return undefined
}

export const createTaskTool: AiTool = {
  name: 'create_task',
  description: 'Cria uma nova tarefa, marco ou reunião em um projeto ou em um incidente. Toda tarefa precisa de um Executor; o Validador é opcional. Datas/duração são opcionais — se omitidas, o item entra sem agendamento e pode ser agendado depois com update_task. Sempre requer confirmação do usuário antes de executar.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Nome da tarefa/marco/reunião' },
      description: { type: 'string' },
      type: { type: 'string', enum: ['task', 'milestone', 'meeting'], description: 'Padrão: task' },
      projectId: { type: 'string', description: 'Id do projeto (obtido via find_project) — obrigatório se o item é de um projeto' },
      phaseId: { type: 'string', description: 'Id da fase do projeto (obtido via list_phases) — se omitido, usa a primeira fase existente' },
      incidentId: { type: 'string', description: 'Id do incidente (obtido via find_incident) — obrigatório se o item é de um incidente' },
      executorName: { type: 'string', description: 'Nome do responsável executor (obrigatório)' },
      validatorName: { type: 'string', description: 'Nome do validador (opcional)' },
      plannedStart: { type: 'string', description: 'Data de início planejada (YYYY-MM-DD) — só pra type=task' },
      plannedEnd: { type: 'string', description: 'Data de fim planejada (YYYY-MM-DD) — só pra type=task' },
      durationDays: { type: 'number', description: 'Duração em dias úteis — só pra type=task' },
      plannedDate: { type: 'string', description: 'Data (YYYY-MM-DD) — só pra type=milestone ou meeting' },
      durationHours: { type: 'number', description: 'Duração em horas — só pra type=meeting' },
      dependsOn: { type: 'array', items: { type: 'string' }, description: 'Ids de outras tarefas das quais esta depende (obtidos previamente)' },
    },
    required: ['name', 'executorName'],
  },
  isWrite: true,
  describe(input) {
    const scope = input.incidentId ? 'no incidente' : 'no projeto'
    const validatorText = input.validatorName ? `, validador ${input.validatorName}` : ''
    const dateText = input.plannedStart && input.plannedEnd
      ? `, de ${input.plannedStart} a ${input.plannedEnd}`
      : input.plannedDate ? `, em ${input.plannedDate}` : ''
    return `Estou prestes a criar um item ${scope}. O resultado final ficará assim: "${input.name}", executor ${input.executorName}${validatorText}${dateText}. É basicamente isso?`
  },
  async execute(input) {
    const store = useAppStore.getState()
    const teamMembers = teamDirectoryAsTeamMembers(store.teamDirectory)
    const owners: EntryOwner[] = [resolveOwnerByName(String(input.executorName), teamMembers, 'executor')]
    if (input.validatorName) owners.push(resolveOwnerByName(String(input.validatorName), teamMembers, 'validator'))

    const type = (input.type as 'task' | 'milestone' | 'meeting') ?? 'task'
    const base = {
      name: String(input.name),
      description: input.description ? String(input.description) : undefined,
      type,
      owners,
      responsible: owners[0].name,
      status: 'pending' as const,
      riskFlag: 'none' as const,
      dependsOn: Array.isArray(input.dependsOn) ? (input.dependsOn as string[]) : [],
      order: 0,
      plannedStart: type === 'task' && input.plannedStart ? String(input.plannedStart) : undefined,
      plannedEnd: type === 'task' && input.plannedEnd ? String(input.plannedEnd) : undefined,
      durationDays: type === 'task' && typeof input.durationDays === 'number' ? input.durationDays : undefined,
      plannedDate: type !== 'task' && input.plannedDate ? String(input.plannedDate) : undefined,
      durationHours: type === 'meeting' && typeof input.durationHours === 'number' ? input.durationHours : undefined,
    }

    if (input.incidentId) {
      store.addIncidentEntry(String(input.incidentId), base)
      const incident = useAppStore.getState().incidents.find((i) => i.id === input.incidentId)
      const createdEntryId = incident?.entries[incident.entries.length - 1]?.id
      return { success: true, scope: 'incident', incidentId: input.incidentId, createdEntryId }
    }
    if (input.projectId) {
      const project = store.projects.find((p) => p.id === input.projectId)
      const phaseId = input.phaseId ? String(input.phaseId) : project?.phases[0]?.id
      if (!phaseId) return { error: 'O projeto não tem nenhuma fase cadastrada — crie uma fase antes de adicionar tarefas.' }
      store.addEntry(String(input.projectId), phaseId, base)
      const updatedProject = useAppStore.getState().projects.find((p) => p.id === input.projectId)
      const phase = updatedProject?.phases.find((ph) => ph.id === phaseId)
      const createdEntryId = phase?.entries[phase.entries.length - 1]?.id
      return { success: true, scope: 'project', projectId: input.projectId, phaseId, createdEntryId }
    }
    return { error: 'É necessário informar projectId ou incidentId.' }
  },
}

export const updateTaskTool: AiTool = {
  name: 'update_task',
  description: 'Edita uma tarefa/marco/reunião já existente (nome, descrição, executor, validador, status, datas, duração, dependências) e/ou move ela para outra fase do mesmo projeto. Sempre requer confirmação do usuário antes de executar.',
  input_schema: {
    type: 'object',
    properties: {
      entryId: { type: 'string', description: 'Id da tarefa/marco/reunião a editar' },
      entryName: { type: 'string', description: 'Nome atual do item, só pro resumo de confirmação' },
      projectId: { type: 'string', description: 'Obrigatório se o item é de um projeto' },
      incidentId: { type: 'string', description: 'Obrigatório se o item é de um incidente' },
      name: { type: 'string', description: 'Novo nome (opcional)' },
      description: { type: 'string', description: 'Nova descrição (opcional)' },
      executorName: { type: 'string', description: 'Novo executor (opcional)' },
      validatorName: { type: 'string', description: 'Novo validador (opcional) — passe string vazia pra remover' },
      status: { type: 'string', description: 'Novo status (opcional) — valores válidos dependem do tipo de item' },
      plannedStart: { type: 'string', description: 'Nova data de início (YYYY-MM-DD) — task' },
      plannedEnd: { type: 'string', description: 'Nova data de fim (YYYY-MM-DD) — task' },
      durationDays: { type: 'number', description: 'Nova duração em dias úteis — task' },
      plannedDate: { type: 'string', description: 'Nova data (YYYY-MM-DD) — milestone/meeting' },
      durationHours: { type: 'number', description: 'Nova duração em horas — meeting' },
      dependsOn: { type: 'array', items: { type: 'string' }, description: 'Substitui a lista de dependências (ids de outras tarefas)' },
      newPhaseId: { type: 'string', description: 'Id da fase (obtido via list_phases) pra mover a tarefa — só válido pra itens de projeto' },
    },
    required: ['entryId', 'entryName'],
  },
  isWrite: true,
  describe(input) {
    const changes: string[] = []
    if (input.name) changes.push(`nome → "${input.name}"`)
    if (input.executorName) changes.push(`executor → ${input.executorName}`)
    if (input.validatorName !== undefined) changes.push(`validador → ${input.validatorName || '(removido)'}`)
    if (input.status) changes.push(`status → ${input.status}`)
    if (input.plannedStart || input.plannedEnd) changes.push(`datas → ${input.plannedStart ?? '?'} a ${input.plannedEnd ?? '?'}`)
    if (input.plannedDate) changes.push(`data → ${input.plannedDate}`)
    if (typeof input.durationDays === 'number') changes.push(`duração → ${input.durationDays}d`)
    if (typeof input.durationHours === 'number') changes.push(`duração → ${input.durationHours}h`)
    if (input.dependsOn) changes.push('dependências atualizadas')
    if (input.newPhaseId) changes.push('mover de fase')
    return `Estou prestes a editar "${input.entryName}". O resultado final ficará assim: ${changes.join(', ') || '(nenhuma alteração informada)'}. É basicamente isso?`
  },
  async execute(input) {
    const store = useAppStore.getState()
    const entryId = String(input.entryId)
    const teamMembers = teamDirectoryAsTeamMembers(store.teamDirectory)

    const patch: Record<string, unknown> = {}
    if (input.name) patch.name = String(input.name)
    if (input.description !== undefined) patch.description = String(input.description) || undefined
    if (input.status) patch.status = input.status
    if (input.plannedStart !== undefined) patch.plannedStart = String(input.plannedStart) || undefined
    if (input.plannedEnd !== undefined) patch.plannedEnd = String(input.plannedEnd) || undefined
    if (input.plannedDate !== undefined) patch.plannedDate = String(input.plannedDate) || undefined
    if (typeof input.durationDays === 'number') patch.durationDays = input.durationDays
    if (typeof input.durationHours === 'number') patch.durationHours = input.durationHours
    if (Array.isArray(input.dependsOn)) patch.dependsOn = input.dependsOn

    if (input.executorName || input.validatorName !== undefined) {
      const existing = input.incidentId
        ? findEntry(store.incidents.find((i) => i.id === input.incidentId)?.entries ?? [], entryId)
        : findEntry(store.projects.find((p) => p.id === input.projectId)?.phases.flatMap((ph) => ph.entries) ?? [], entryId)
      if (!existing) return { error: 'Tarefa não encontrada.' }
      const owners: EntryOwner[] = (existing.owners ?? []).filter((o) => o.kind !== 'executor' && o.kind !== 'validator')
      const executor = input.executorName ? resolveOwnerByName(String(input.executorName), teamMembers, 'executor') : existing.owners?.find((o) => o.kind === 'executor')
      if (executor) owners.unshift(executor)
      if (input.validatorName) owners.push(resolveOwnerByName(String(input.validatorName), teamMembers, 'validator'))
      patch.owners = owners
      if (executor) patch.responsible = executor.name
    }

    if (input.incidentId) {
      store.updateIncidentEntry(String(input.incidentId), entryId, patch)
      return { success: true, scope: 'incident', incidentId: input.incidentId, entryId }
    }
    if (input.projectId) {
      store.updateEntry(String(input.projectId), entryId, patch)
      if (input.newPhaseId) {
        const project = store.projects.find((p) => p.id === input.projectId)
        const currentPhase = project?.phases.find((ph) => ph.entries.some((e) => e.id === entryId))
        if (currentPhase && currentPhase.id !== input.newPhaseId) {
          store.moveEntryToPhase(String(input.projectId), currentPhase.id, String(input.newPhaseId), entryId)
        }
      }
      return { success: true, scope: 'project', projectId: input.projectId, entryId }
    }
    return { error: 'É necessário informar projectId ou incidentId.' }
  },
}
