import { AiTool } from '@/types/ai'

/** Extracted-item shape the model sends in `propose_extracted_items` — kept
 *  intentionally small; runConversation.ts fans these out into real
 *  create_task/create_incident calls once the user approves (see the
 *  special-cased handling there, not this tool's own execute()). */
export interface ExtractedItem {
  entityType: 'task' | 'incident'
  name: string
  description?: string
  executorName?: string
  projectId?: string
  incidentId?: string
  priority?: 'low' | 'medium' | 'high'
  impact?: 'low' | 'medium' | 'high'
}

export const proposeExtractedItemsTool: AiTool = {
  name: 'propose_extracted_items',
  description: 'Usada exclusivamente no fluxo multimodal: depois de ler um texto colado, imagem ou PDF, chame esta tool com a lista estruturada de tarefas/incidentes identificados em vez de criá-los diretamente. Aciona um cartão de confirmação com checklist; ao aprovar, cada item vira uma chamada real de create_task/create_incident.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            entityType: { type: 'string', enum: ['task', 'incident'] },
            name: { type: 'string' },
            description: { type: 'string' },
            executorName: { type: 'string', description: 'Obrigatório quando entityType=task' },
            projectId: { type: 'string' },
            incidentId: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'] },
            impact: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
          required: ['entityType', 'name'],
        },
      },
    },
    required: ['items'],
  },
  isWrite: true,
  describe(input) {
    const items = (input.items as ExtractedItem[]) ?? []
    const list = items.map((i) => `${i.entityType === 'task' ? 'Tarefa' : 'Incidente'}: "${i.name}"`).join('; ')
    return `Identifiquei ${items.length} item(ns) no conteúdo analisado. O resultado final ficará assim: ${list}. É basicamente isso?`
  },
  // Real side effects happen in runConversation.ts's approval handler, not here —
  // this tool's own execute() is only reached if something calls it directly.
  async execute() {
    return { acknowledged: true }
  },
}
