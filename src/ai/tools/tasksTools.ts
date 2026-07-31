import { useAppStore } from '@/store/useAppStore'
import { AiTool } from '@/types/ai'
import { EntryOwner } from '@/types'
import { resolveOwnerByName, teamDirectoryAsTeamMembers } from './helpers'

export const createTaskTool: AiTool = {
  name: 'create_task',
  description: 'Cria uma nova tarefa em um projeto ou em um incidente. Toda tarefa precisa de um Executor; o Validador é opcional. Sempre requer confirmação do usuário antes de executar.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Nome da tarefa' },
      description: { type: 'string' },
      type: { type: 'string', enum: ['task', 'milestone', 'meeting'], description: 'Padrão: task' },
      projectId: { type: 'string', description: 'Id do projeto (obtido via find_project) — obrigatório se a tarefa é de um projeto' },
      phaseId: { type: 'string', description: 'Id da fase do projeto — se omitido, usa a primeira fase existente' },
      incidentId: { type: 'string', description: 'Id do incidente (obtido via find_incident) — obrigatório se a tarefa é de um incidente' },
      executorName: { type: 'string', description: 'Nome do responsável executor (obrigatório)' },
      validatorName: { type: 'string', description: 'Nome do validador (opcional)' },
    },
    required: ['name', 'executorName'],
  },
  isWrite: true,
  describe(input) {
    const scope = input.incidentId ? 'no incidente' : 'no projeto'
    const validatorText = input.validatorName ? `, validador ${input.validatorName}` : ''
    return `Estou prestes a criar uma tarefa ${scope}. O resultado final ficará assim: "${input.name}", executor ${input.executorName}${validatorText}. É basicamente isso?`
  },
  async execute(input) {
    const store = useAppStore.getState()
    const teamMembers = teamDirectoryAsTeamMembers(store.teamDirectory)
    const owners: EntryOwner[] = [resolveOwnerByName(String(input.executorName), teamMembers, 'executor')]
    if (input.validatorName) owners.push(resolveOwnerByName(String(input.validatorName), teamMembers, 'validator'))

    const base = {
      name: String(input.name),
      description: input.description ? String(input.description) : undefined,
      type: (input.type as 'task' | 'milestone' | 'meeting') ?? 'task',
      owners,
      responsible: owners[0].name,
      status: 'pending' as const,
      riskFlag: 'none' as const,
      dependsOn: [] as string[],
      order: 0,
    }

    if (input.incidentId) {
      store.addIncidentEntry(String(input.incidentId), base)
      return { success: true, scope: 'incident', incidentId: input.incidentId }
    }
    if (input.projectId) {
      const project = store.projects.find((p) => p.id === input.projectId)
      const phaseId = input.phaseId ? String(input.phaseId) : project?.phases[0]?.id
      if (!phaseId) return { error: 'O projeto não tem nenhuma fase cadastrada — crie uma fase antes de adicionar tarefas.' }
      store.addEntry(String(input.projectId), phaseId, base)
      return { success: true, scope: 'project', projectId: input.projectId, phaseId }
    }
    return { error: 'É necessário informar projectId ou incidentId.' }
  },
}
