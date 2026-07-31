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

export const createClientTool: AiTool = {
  name: 'create_client',
  description: 'Cria um novo cliente na Carteira. Sempre requer confirmação do usuário antes de executar.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Nome do cliente' },
      country: { type: 'string', description: 'País (opcional)' },
      ploomesLink: { type: 'string', description: 'Link do registro no Ploomes (opcional)' },
      notes: { type: 'string', description: 'Notas (opcional)' },
      status: { type: 'string', enum: ['pre_venda', 'implantacao', 'sustentacao_novos_projetos'], description: 'Padrão: pre_venda' },
    },
    required: ['name'],
  },
  isWrite: true,
  describe(input) {
    return `Estou prestes a criar um novo cliente na Carteira. O resultado final ficará assim: "${input.name}"${input.country ? `, ${input.country}` : ''}. É basicamente isso?`
  },
  async execute(input) {
    const store = useAppStore.getState()
    const id = store.createClient({
      name: String(input.name),
      country: input.country ? String(input.country) : undefined,
      ploomesLink: input.ploomesLink ? String(input.ploomesLink) : undefined,
      notes: input.notes ? String(input.notes) : undefined,
      status: (input.status as never) ?? 'pre_venda',
    })
    return { createdClientId: id }
  },
}

export const updateClientTool: AiTool = {
  name: 'update_client',
  description: 'Edita um cliente já existente (nome, país, link do Ploomes, notas, status). Sempre requer confirmação do usuário antes de executar.',
  input_schema: {
    type: 'object',
    properties: {
      clientId: { type: 'string', description: 'Id do cliente (obtido via find_client)' },
      clientName: { type: 'string', description: 'Nome atual do cliente, só pro resumo de confirmação' },
      name: { type: 'string', description: 'Novo nome (opcional)' },
      country: { type: 'string', description: 'Novo país (opcional)' },
      ploomesLink: { type: 'string', description: 'Novo link do Ploomes (opcional)' },
      notes: { type: 'string', description: 'Novas notas (opcional)' },
      status: { type: 'string', enum: ['pre_venda', 'implantacao', 'sustentacao_novos_projetos'] },
    },
    required: ['clientId', 'clientName'],
  },
  isWrite: true,
  describe(input) {
    const changes: string[] = []
    if (input.name) changes.push(`nome → "${input.name}"`)
    if (input.country) changes.push(`país → ${input.country}`)
    if (input.status) changes.push(`status → ${input.status}`)
    if (input.notes !== undefined) changes.push('notas atualizadas')
    if (input.ploomesLink) changes.push('link do Ploomes atualizado')
    return `Estou prestes a editar o cliente "${input.clientName}". O resultado final ficará assim: ${changes.join(', ') || '(nenhuma alteração informada)'}. É basicamente isso?`
  },
  async execute(input) {
    const store = useAppStore.getState()
    const patch: Record<string, unknown> = {}
    if (input.name) patch.name = String(input.name)
    if (input.country) patch.country = String(input.country)
    if (input.ploomesLink) patch.ploomesLink = String(input.ploomesLink)
    if (input.notes !== undefined) patch.notes = String(input.notes)
    if (input.status) patch.status = input.status
    store.updateClient(String(input.clientId), patch as never)
    return { success: true, clientId: input.clientId }
  },
}

export const findContactTool: AiTool = {
  name: 'find_contact',
  description: 'Busca contatos pelo nome. Retorna um único match ou uma lista de matches se houver ambiguidade — nesse caso, pergunte ao usuário qual ele quer antes de prosseguir.',
  input_schema: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Nome (ou parte do nome) do contato' } },
    required: ['name'],
  },
  isWrite: false,
  async execute(input) {
    const { contacts, clients } = useAppStore.getState()
    const matches = findByName(contacts, String(input.name), (c) => c.name)
      .map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
        email: c.email,
        clientNames: c.clientIds.map((id) => clients.find((cl) => cl.id === id)?.name).filter(Boolean),
      }))
    if (matches.length === 1) return { match: matches[0] }
    if (matches.length === 0) return { matches: [] }
    return { matches }
  },
}

export const createContactTool: AiTool = {
  name: 'create_contact',
  description: 'Cria um novo contato, opcionalmente já vinculado a um ou mais clientes. Sempre requer confirmação do usuário antes de executar.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Nome do contato' },
      role: { type: 'string', description: 'Cargo (opcional)' },
      email: { type: 'string', description: 'E-mail (opcional)' },
      phone: { type: 'string', description: 'Telefone (opcional)' },
      clientIds: { type: 'array', items: { type: 'string' }, description: 'Ids dos clientes a vincular (obtidos via find_client)' },
    },
    required: ['name'],
  },
  isWrite: true,
  describe(input) {
    return `Estou prestes a criar um novo contato. O resultado final ficará assim: "${input.name}"${input.role ? `, ${input.role}` : ''}. É basicamente isso?`
  },
  async execute(input) {
    const store = useAppStore.getState()
    const id = store.createContact({
      name: String(input.name),
      role: input.role ? String(input.role) : undefined,
      email: input.email ? String(input.email) : undefined,
      phone: input.phone ? String(input.phone) : undefined,
      clientIds: Array.isArray(input.clientIds) ? (input.clientIds as string[]) : undefined,
    })
    return { createdContactId: id }
  },
}

export const updateContactTool: AiTool = {
  name: 'update_contact',
  description: 'Edita um contato já existente (nome, cargo, e-mail, telefone). Sempre requer confirmação do usuário antes de executar.',
  input_schema: {
    type: 'object',
    properties: {
      contactId: { type: 'string', description: 'Id do contato (obtido via find_contact)' },
      contactName: { type: 'string', description: 'Nome atual do contato, só pro resumo de confirmação' },
      name: { type: 'string', description: 'Novo nome (opcional)' },
      role: { type: 'string', description: 'Novo cargo (opcional)' },
      email: { type: 'string', description: 'Novo e-mail (opcional)' },
      phone: { type: 'string', description: 'Novo telefone (opcional)' },
    },
    required: ['contactId', 'contactName'],
  },
  isWrite: true,
  describe(input) {
    const changes: string[] = []
    if (input.name) changes.push(`nome → "${input.name}"`)
    if (input.role) changes.push(`cargo → ${input.role}`)
    if (input.email) changes.push(`e-mail → ${input.email}`)
    if (input.phone) changes.push(`telefone → ${input.phone}`)
    return `Estou prestes a editar o contato "${input.contactName}". O resultado final ficará assim: ${changes.join(', ') || '(nenhuma alteração informada)'}. É basicamente isso?`
  },
  async execute(input) {
    const store = useAppStore.getState()
    const patch: Record<string, unknown> = {}
    if (input.name) patch.name = String(input.name)
    if (input.role) patch.role = String(input.role)
    if (input.email) patch.email = String(input.email)
    if (input.phone) patch.phone = String(input.phone)
    store.updateContact(String(input.contactId), patch as never)
    return { success: true, contactId: input.contactId }
  },
}
