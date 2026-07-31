import { useAppStore } from '@/store/useAppStore'
import { AiTool } from '@/types/ai'
import { findByName } from './helpers'

export const findIncidentTool: AiTool = {
  name: 'find_incident',
  description: 'Busca incidentes (Sustentação) pelo título. Retorna um único match ou uma lista de matches se houver ambiguidade — nesse caso, pergunte ao usuário qual ele quer antes de prosseguir.',
  input_schema: {
    type: 'object',
    properties: { title: { type: 'string', description: 'Título (ou parte do título) do incidente' } },
    required: ['title'],
  },
  isWrite: false,
  async execute(input) {
    const { incidents } = useAppStore.getState()
    const matches = findByName(incidents, String(input.title), (i) => i.title)
      .map((i) => ({ id: i.id, title: i.title, status: i.status, priority: i.priority }))
    if (matches.length === 1) return { match: matches[0] }
    if (matches.length === 0) return { matches: [] }
    return { matches }
  },
}

export const listIncidentsTool: AiTool = {
  name: 'list_incidents',
  description: 'Lista incidentes, opcionalmente filtrados por nome do cliente ou status.',
  input_schema: {
    type: 'object',
    properties: {
      clientName: { type: 'string', description: 'Filtra por nome do cliente vinculado (busca parcial)' },
      status: { type: 'string', enum: ['open', 'in_progress', 'waiting_on_client', 'resolved', 'closed'] },
    },
  },
  isWrite: false,
  async execute(input) {
    const { incidents, clients } = useAppStore.getState()
    let list = incidents
    if (input.clientName) {
      const clientIds = new Set(
        clients.filter((c) => c.name.toLowerCase().includes(String(input.clientName).toLowerCase())).map((c) => c.id),
      )
      list = list.filter((i) => i.clientIds.some((id) => clientIds.has(id)))
    }
    if (input.status) list = list.filter((i) => i.status === input.status)
    return {
      incidents: list.map((i) => ({
        id: i.id, title: i.title, status: i.status, priority: i.priority,
        clients: i.clientIds.map((id) => clients.find((c) => c.id === id)?.name).filter(Boolean),
      })),
    }
  },
}

export const createIncidentTool: AiTool = {
  name: 'create_incident',
  description: 'Cria um novo incidente (Sustentação), opcionalmente vinculado a um ou mais clientes. Sempre requer confirmação do usuário antes de executar.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      impact: { type: 'string', enum: ['low', 'medium', 'high'] },
      clientIds: { type: 'array', items: { type: 'string' }, description: 'Ids dos clientes vinculados (obtidos via find_client)' },
      clientNames: { type: 'array', items: { type: 'string' }, description: 'Nomes dos clientes vinculados, só pro resumo de confirmação' },
    },
    required: ['title', 'priority', 'impact'],
  },
  isWrite: true,
  describe(input) {
    const clientsText = Array.isArray(input.clientNames) && input.clientNames.length
      ? ` vinculado a ${(input.clientNames as string[]).join(', ')}` : ''
    return `Estou prestes a criar um novo incidente${clientsText}. O resultado final ficará assim: "${input.title}" (prioridade ${input.priority}, impacto ${input.impact}). É basicamente isso?`
  },
  async execute(input) {
    const store = useAppStore.getState()
    const id = store.createIncident({
      title: String(input.title),
      description: input.description ? String(input.description) : undefined,
      priority: input.priority as 'low' | 'medium' | 'high',
      impact: input.impact as 'low' | 'medium' | 'high',
      clientIds: Array.isArray(input.clientIds) ? (input.clientIds as string[]) : undefined,
    })
    return { createdIncidentId: id }
  },
}
