import { useAppStore } from '@/store/useAppStore'
import { AiTool } from '@/types/ai'
import { findByName } from './helpers'

export const findClientTool: AiTool = {
  name: 'find_client',
  description: 'Busca clientes (Carteira) pelo nome. Retorna um único match ou uma lista de matches se houver ambiguidade — nesse caso, pergunte ao usuário qual ele quer antes de prosseguir.',
  input_schema: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Nome (ou parte do nome) do cliente' } },
    required: ['name'],
  },
  isWrite: false,
  async execute(input) {
    const { clients } = useAppStore.getState()
    const matches = findByName(clients.filter((c) => !c.archived), String(input.name), (c) => c.name)
      .map((c) => ({ id: c.id, name: c.name, status: c.status, country: c.country }))
    if (matches.length === 1) return { match: matches[0] }
    if (matches.length === 0) return { matches: [] }
    return { matches }
  },
}
