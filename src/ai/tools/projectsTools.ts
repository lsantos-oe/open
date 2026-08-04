import { useAppStore } from '@/store/useAppStore'
import { AiTool } from '@/types/ai'
import { projectDurationDays, projectEndVariance, isProjectDelayed } from '@/utils/projectStats'
import { findByName, teamDirectoryAsTeamMembers } from './helpers'

export const findProjectTool: AiTool = {
  name: 'find_project',
  description: 'Busca projetos pelo nome (busca parcial, sem diferenciar maiúsculas/minúsculas). Retorna um único match ou uma lista de matches se houver ambiguidade — nesse caso, pergunte ao usuário qual ele quer antes de prosseguir.',
  input_schema: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Nome (ou parte do nome) do projeto' } },
    required: ['name'],
  },
  isWrite: false,
  async execute(input) {
    const { projects, clients } = useAppStore.getState()
    const matches = findByName(projects.filter((p) => !p.archived), String(input.name), (p) => p.name)
      .map((p) => ({
        id: p.id, name: p.name, status: p.status,
        clients: p.clientIds.map((id) => clients.find((c) => c.id === id)?.name).filter(Boolean),
      }))
    if (matches.length === 1) return { match: matches[0] }
    if (matches.length === 0) return { matches: [] }
    return { matches }
  },
}

export const getProjectOverviewTool: AiTool = {
  name: 'get_project_overview',
  description: 'Retorna o status detalhado de um projeto: status, fase atual, duração, variância de baseline e se está atrasado.',
  input_schema: {
    type: 'object',
    properties: { projectId: { type: 'string', description: 'Id do projeto (obtido via find_project)' } },
    required: ['projectId'],
  },
  isWrite: false,
  async execute(input) {
    const { projects, clients, settings } = useAppStore.getState()
    const project = projects.find((p) => p.id === input.projectId)
    if (!project) return { error: 'Projeto não encontrado.' }
    const duration = projectDurationDays(project, settings.holidays)
    const variance = projectEndVariance(project, settings.holidays)
    const delayed = isProjectDelayed(project, settings.holidays)
    return {
      name: project.name,
      clients: project.clientIds.map((id) => clients.find((c) => c.id === id)?.name).filter(Boolean),
      pm: project.pm, status: project.status,
      delayed, durationDays: duration, varianceDays: variance,
      phaseCount: project.phases.length,
      openRisks: project.risks.filter((r) => r.status !== 'resolved' && r.status !== 'mitigated').length,
    }
  },
}

export const listProjectsTool: AiTool = {
  name: 'list_projects',
  description: 'Lista projetos, opcionalmente filtrados por cliente, líder (pm) ou status.',
  input_schema: {
    type: 'object',
    properties: {
      clientName: { type: 'string', description: 'Filtra por nome do cliente (busca parcial)' },
      pmName: { type: 'string', description: 'Filtra por nome do líder do projeto (busca parcial)' },
      status: { type: 'string', enum: ['backlog', 'planning', 'in_progress', 'done'] },
    },
  },
  isWrite: false,
  async execute(input) {
    const { projects, clients } = useAppStore.getState()
    let list = projects.filter((p) => !p.archived)
    if (input.clientName) {
      const q = String(input.clientName).toLowerCase()
      list = list.filter((p) => p.clientIds.some((id) => clients.find((c) => c.id === id)?.name.toLowerCase().includes(q)))
    }
    if (input.pmName) list = list.filter((p) => p.pm.toLowerCase().includes(String(input.pmName).toLowerCase()))
    if (input.status) list = list.filter((p) => p.status === input.status)
    return {
      projects: list.map((p) => ({
        id: p.id, name: p.name, pm: p.pm, status: p.status,
        clients: p.clientIds.map((id) => clients.find((c) => c.id === id)?.name).filter(Boolean),
      })),
    }
  },
}

export const createProjectTool: AiTool = {
  name: 'create_project',
  description: 'Cria um novo projeto, opcionalmente vinculado a um ou mais clientes (um projeto pode ter múltiplos clientes). Sempre requer confirmação do usuário antes de executar.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Nome do projeto' },
      clientIds: { type: 'array', items: { type: 'string' }, description: 'Ids dos clientes vinculados (obtidos via find_client) — um projeto pode ter mais de um' },
      clientNames: { type: 'array', items: { type: 'string' }, description: 'Nomes dos clientes vinculados, só pro resumo de confirmação' },
      pmName: { type: 'string', description: 'Nome do líder do projeto — precisa ser um usuário cadastrado no sistema' },
      type: { type: 'string', enum: ['nova_conta', 'novo_projeto'] },
      language: { type: 'string', enum: ['pt', 'en', 'es'], description: 'Idioma do projeto, padrão pt' },
    },
    required: ['name', 'pmName', 'type'],
  },
  isWrite: true,
  describe(input) {
    const clientsText = Array.isArray(input.clientNames) && input.clientNames.length
      ? ` no(s) cliente(s) ${(input.clientNames as string[]).join(', ')}` : ''
    return `Estou prestes a criar um novo projeto${clientsText}. O resultado final ficará assim: projeto "${input.name}" (${input.type === 'nova_conta' ? 'Nova Conta' : 'Novo Projeto'}), líder ${input.pmName}. É basicamente isso?`
  },
  async execute(input) {
    const store = useAppStore.getState()
    const teamMembers = teamDirectoryAsTeamMembers(store.teamDirectory)
    const pmMember = teamMembers.find((m) => m.name.toLowerCase() === String(input.pmName).toLowerCase())
    const id = store.createProject({
      name: String(input.name),
      clientIds: Array.isArray(input.clientIds) ? (input.clientIds as string[]) : [],
      pm: pmMember?.name ?? String(input.pmName),
      pmMemberId: pmMember?.userId,
      type: (input.type as 'nova_conta' | 'novo_projeto') ?? 'novo_projeto',
      language: (input.language as 'pt' | 'en' | 'es') ?? 'pt',
    })
    return { createdProjectId: id }
  },
}

export const updateProjectTool: AiTool = {
  name: 'update_project',
  description: 'Edita um projeto já existente (nome, líder, dev lead, status, visão geral/notas, clientes vinculados). Sempre requer confirmação do usuário antes de executar.',
  input_schema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Id do projeto (obtido via find_project)' },
      projectName: { type: 'string', description: 'Nome atual do projeto, só pro resumo de confirmação' },
      name: { type: 'string', description: 'Novo nome (opcional)' },
      pmName: { type: 'string', description: 'Novo líder do projeto (opcional) — precisa ser um usuário cadastrado' },
      devLead: { type: 'string', description: 'Novo dev lead (opcional)' },
      status: { type: 'string', enum: ['backlog', 'planning', 'in_progress', 'done'] },
      overview: { type: 'string', description: 'Novo texto de notas/visão geral (opcional)' },
      addClientIds: { type: 'array', items: { type: 'string' }, description: 'Ids de clientes a vincular ao projeto (obtidos via find_client) — um projeto pode ter mais de um cliente' },
      addClientNames: { type: 'array', items: { type: 'string' }, description: 'Nomes desses clientes, só pro resumo de confirmação' },
      removeClientIds: { type: 'array', items: { type: 'string' }, description: 'Ids de clientes a desvincular do projeto' },
      removeClientNames: { type: 'array', items: { type: 'string' }, description: 'Nomes desses clientes, só pro resumo de confirmação' },
    },
    required: ['projectId', 'projectName'],
  },
  isWrite: true,
  describe(input) {
    const changes: string[] = []
    if (input.name) changes.push(`nome → "${input.name}"`)
    if (Array.isArray(input.addClientNames) && input.addClientNames.length) changes.push(`+ cliente(s) ${(input.addClientNames as string[]).join(', ')}`)
    if (Array.isArray(input.removeClientNames) && input.removeClientNames.length) changes.push(`− cliente(s) ${(input.removeClientNames as string[]).join(', ')}`)
    if (input.pmName) changes.push(`líder → ${input.pmName}`)
    if (input.devLead) changes.push(`dev lead → ${input.devLead}`)
    if (input.status) changes.push(`status → ${input.status}`)
    if (input.overview !== undefined) changes.push('notas atualizadas')
    return `Estou prestes a editar o projeto "${input.projectName}". O resultado final ficará assim: ${changes.join(', ') || '(nenhuma alteração informada)'}. É basicamente isso?`
  },
  async execute(input) {
    const store = useAppStore.getState()
    const patch: Record<string, unknown> = {}
    if (input.name) patch.name = String(input.name)
    if (input.devLead) patch.devLead = String(input.devLead)
    if (input.status) patch.status = input.status
    if (input.overview !== undefined) patch.overview = String(input.overview)
    if (input.pmName) {
      const teamMembers = teamDirectoryAsTeamMembers(store.teamDirectory)
      const pmMember = teamMembers.find((m) => m.name.toLowerCase() === String(input.pmName).toLowerCase())
      patch.pm = pmMember?.name ?? String(input.pmName)
      patch.pmMemberId = pmMember?.userId
    }
    if (Object.keys(patch).length > 0) store.updateProject(String(input.projectId), patch as never)
    if (Array.isArray(input.addClientIds)) {
      for (const clientId of input.addClientIds as string[]) store.linkProjectClient(String(input.projectId), clientId)
    }
    if (Array.isArray(input.removeClientIds)) {
      for (const clientId of input.removeClientIds as string[]) store.unlinkProjectClient(String(input.projectId), clientId)
    }
    return { success: true, projectId: input.projectId }
  },
}

export const updateEntityStatusTool: AiTool = {
  name: 'update_entity_status',
  description: 'Atualiza o status de um projeto, tarefa ou incidente. Sempre requer confirmação do usuário antes de executar.',
  input_schema: {
    type: 'object',
    properties: {
      entityType: { type: 'string', enum: ['project', 'task', 'incident'] },
      entityId: { type: 'string', description: 'Id da entidade (projeto/tarefa/incidente)' },
      projectId: { type: 'string', description: 'Obrigatório quando entityType=task e a tarefa é de um projeto' },
      incidentId: { type: 'string', description: 'Obrigatório quando entityType=task e a tarefa é de um incidente, ou quando entityType=incident' },
      status: { type: 'string', description: 'Novo status (valores válidos dependem do tipo de entidade)' },
      entityName: { type: 'string', description: 'Nome da entidade, só pro resumo de confirmação' },
    },
    required: ['entityType', 'entityId', 'status', 'entityName'],
  },
  isWrite: true,
  describe(input) {
    return `Estou prestes a alterar o status de "${input.entityName}". O resultado final ficará assim: status = ${input.status}. É basicamente isso?`
  },
  async execute(input) {
    const store = useAppStore.getState()
    if (input.entityType === 'project') {
      store.updateProject(String(input.entityId), { status: input.status as never })
    } else if (input.entityType === 'incident') {
      store.updateIncidentStatus(String(input.entityId), input.status as never)
    } else if (input.entityType === 'task') {
      if (input.incidentId) store.updateIncidentEntryStatus(String(input.incidentId), String(input.entityId), input.status as never)
      else if (input.projectId) store.updateEntryStatus(String(input.projectId), String(input.entityId), input.status as never)
      else store.updateStandaloneTaskStatus(String(input.entityId), input.status as never)
    }
    return { success: true }
  },
}
