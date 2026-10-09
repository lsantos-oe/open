import type { AiTool, AiMemoryKind } from '@/types/ai'
import { useAiMemoryStore } from '@/stores/useAiMemoryStore'
import { useAiChatStore } from '@/stores/useAiChatStore'
import { MEMORY_MAX_LENGTH } from '@/ai/history'

const KINDS: AiMemoryKind[] = ['preference', 'fact', 'correction', 'context']

// Memória pessoal: só grava notas do PRÓPRIO usuário (RLS), editáveis e apagáveis por ele em
// Configurações → Memória do assistente. Por isso estas tools não passam pelo cartão de confirmação das escritas
// do sistema — mas o prompt obriga o assistente a avisar, em uma frase, o que anotou ou esqueceu.

export const rememberTool: AiTool = {
  name: 'remember',
  description:
    'Guarda uma nota curta e duradoura sobre o usuário para conversas futuras: preferência de trabalho, correção de algo que você errou, fato estável sobre como ele ou o time operam. Use só para o que continuará útil depois — nunca para detalhes de uma tarefa pontual, dados que já estão no sistema, nem segredos (senhas, chaves, documentos pessoais). Confira a lista <memorias_do_usuario> antes: se já existe algo equivalente, não salve de novo.',
  input_schema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: `A nota, em uma frase curta em português (máx. ${MEMORY_MAX_LENGTH} caracteres), escrita sobre o usuário. Ex: "Prefere status reports curtos, sem tabela de riscos."` },
      kind: { type: 'string', enum: KINDS, description: 'preference = como ele gosta das coisas; correction = você errou e ele corrigiu; fact = fato estável (nomes, apelidos, regras do time); context = contexto de longo prazo do trabalho dele.' },
    },
    required: ['content', 'kind'],
  },
  isWrite: false,
  async execute(input) {
    const kind = KINDS.includes(input.kind as AiMemoryKind) ? (input.kind as AiMemoryKind) : 'fact'
    const res = await useAiMemoryStore.getState().add({
      content: String(input.content ?? ''),
      kind,
      source: 'assistant',
      conversationId: useAiChatStore.getState().conversationId,
    })
    if (!res.ok) return { saved: false, reason: res.error }
    return { saved: true, id: res.memory!.id.slice(0, 8) }
  },
}

export const forgetTool: AiTool = {
  name: 'forget',
  description:
    'Apaga uma memória do usuário. Use quando ele pedir para esquecer algo, ou quando uma memória ficou errada/obsoleta. O id é o código de 8 caracteres entre colchetes na lista <memorias_do_usuario>.',
  input_schema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Id curto (8 caracteres) da memória, como aparece na lista.' } },
    required: ['id'],
  },
  isWrite: false,
  async execute(input) {
    const res = await useAiMemoryStore.getState().removeByShortId(String(input.id ?? ''))
    return res.ok ? { forgotten: true } : { forgotten: false, reason: res.error }
  },
}
