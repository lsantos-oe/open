import { useAppStore } from '@/store/useAppStore'
import { AiTool } from '@/types/ai'
import { matchesQuery } from './helpers'

export const findUserTool: AiTool = {
  name: 'find_user',
  description: 'Busca usuários cadastrados no sistema pelo nome ou e-mail. Retorna um único match ou uma lista de matches se houver ambiguidade — nesse caso, pergunte ao usuário qual ele quer antes de prosseguir.',
  input_schema: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Nome ou e-mail (ou parte) do usuário' } },
    required: ['name'],
  },
  isWrite: false,
  async execute(input) {
    const { teamDirectory } = useAppStore.getState()
    const query = String(input.name)
    const matches = teamDirectory
      .filter((p) => p.active && (matchesQuery(p.name ?? '', query) || matchesQuery(p.email ?? '', query)))
      .map((p) => ({ id: p.id, name: p.name, email: p.email }))
    if (matches.length === 1) return { match: matches[0] }
    if (matches.length === 0) return { matches: [] }
    return { matches }
  },
}

export const bulkReassignProjectsTool: AiTool = {
  name: 'bulk_reassign_projects',
  description: 'Reatribui TODOS os projetos liderados pelo usuário de origem para o usuário de destino (troca o Líder do projeto). Lista os projetos afetados numa única chamada — sempre requer confirmação do usuário antes de executar.',
  input_schema: {
    type: 'object',
    properties: {
      fromUserId: { type: 'string', description: 'Id do usuário de origem (obtido via find_user)' },
      toUserId: { type: 'string', description: 'Id do usuário de destino (obtido via find_user)' },
    },
    required: ['fromUserId', 'toUserId'],
  },
  isWrite: true,
  describe(input) {
    const { projects, teamDirectory } = useAppStore.getState()
    const fromName = teamDirectory.find((p) => p.id === input.fromUserId)?.name ?? String(input.fromUserId)
    const toName = teamDirectory.find((p) => p.id === input.toUserId)?.name ?? String(input.toUserId)
    const affected = projects.filter((p) => !p.archived && p.pmMemberId === input.fromUserId)
    const list = affected.length ? affected.map((p) => `"${p.name}"`).join(', ') : '(nenhum projeto encontrado)'
    return `Estou prestes a reatribuir projetos de ${fromName} para ${toName}. O resultado final ficará assim: ${affected.length} projeto(s) — ${list} — passam a ter ${toName} como Líder. É basicamente isso?`
  },
  async execute(input) {
    const store = useAppStore.getState()
    const toMember = store.teamDirectory.find((p) => p.id === input.toUserId)
    const affected = store.projects.filter((p) => !p.archived && p.pmMemberId === input.fromUserId)
    for (const project of affected) {
      store.updateProject(project.id, { pm: toMember?.name ?? '', pmMemberId: String(input.toUserId) })
    }
    return { reassignedCount: affected.length, projectIds: affected.map((p) => p.id) }
  },
}
