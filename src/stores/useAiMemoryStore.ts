import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/useAuthStore'
import { useToastStore } from '@/stores/useToastStore'
import { MEMORY_LIMIT, MEMORY_MAX_LENGTH, normalizeMemoryText, sameMemory, shortMemoryId } from '@/ai/history'
import type { AiMemory, AiMemoryKind } from '@/types/ai'

interface AiMemoryStore {
  memories: AiMemory[]
  loaded: boolean
  loadedFor: string | null
  load: () => Promise<void>
  add: (input: { content: string; kind: AiMemoryKind; source: 'assistant' | 'user'; conversationId?: string | null }) => Promise<{ ok: boolean; error?: string; memory?: AiMemory }>
  update: (id: string, patch: { content?: string; kind?: AiMemoryKind }) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  /** O assistente pede para esquecer pelo id curto (8 caracteres) que viu no prompt. */
  removeByShortId: (shortId: string) => Promise<{ ok: boolean; error?: string }>
  clearAll: () => Promise<boolean>
}

type Row = { id: string; kind: AiMemoryKind; content: string; source: 'assistant' | 'user'; created_at: string; updated_at: string }
const fromRow = (r: Row): AiMemory => ({ id: r.id, kind: r.kind, content: r.content, source: r.source, createdAt: r.created_at, updatedAt: r.updated_at })
const toast = (m: string) => useToastStore.getState().addToast(m)
const uid = () => useAuthStore.getState().user?.id

export const useAiMemoryStore = create<AiMemoryStore>((set, get) => ({
  memories: [],
  loaded: false,
  loadedFor: null,

  async load() {
    const userId = uid()
    if (!userId) return
    // Outro usuário no mesmo navegador: descarta o que era do anterior antes de qualquer coisa.
    if (get().loadedFor !== userId) set({ memories: [], loaded: false, loadedFor: userId })
    const { data, error } = await supabase
      .from('ai_memories')
      .select('id, kind, content, source, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
    if (error) { toast(error.message); set({ loaded: true }); return }
    set({ memories: ((data ?? []) as Row[]).map(fromRow), loaded: true })
  },

  async add({ content, kind, source, conversationId }) {
    const userId = uid()
    if (!userId) return { ok: false, error: 'Sessão expirada.' }
    const text = normalizeMemoryText(content)
    if (!text) return { ok: false, error: 'O texto da memória está vazio.' }
    if (text.length > MEMORY_MAX_LENGTH) return { ok: false, error: `A memória passa de ${MEMORY_MAX_LENGTH} caracteres — resuma.` }
    if (!get().loaded || get().loadedFor !== userId) await get().load()
    if (get().memories.some((m) => sameMemory(m.content, text))) return { ok: false, error: 'Essa memória já existe.' }
    if (get().memories.length >= MEMORY_LIMIT) return { ok: false, error: `Limite de ${MEMORY_LIMIT} memórias atingido: apague ou esqueça algumas antes de salvar outra.` }

    const { data, error } = await supabase
      .from('ai_memories')
      .insert({ user_id: userId, kind, content: text, source, conversation_id: conversationId ?? null })
      .select('id, kind, content, source, created_at, updated_at')
      .single()
    if (error || !data) return { ok: false, error: error?.message ?? 'Não foi possível salvar a memória.' }
    const memory = fromRow(data as Row)
    set((s) => ({ memories: [memory, ...s.memories] }))
    return { ok: true, memory }
  },

  async update(id, patch) {
    const fields: Record<string, unknown> = {}
    if (patch.content !== undefined) {
      const text = normalizeMemoryText(patch.content)
      if (!text || text.length > MEMORY_MAX_LENGTH) { toast(`A memória precisa ter de 1 a ${MEMORY_MAX_LENGTH} caracteres.`); return false }
      fields.content = text
    }
    if (patch.kind !== undefined) fields.kind = patch.kind
    const { data, error } = await supabase
      .from('ai_memories').update(fields).eq('id', id)
      .select('id, kind, content, source, created_at, updated_at').single()
    if (error || !data) { toast(error?.message ?? 'Não foi possível salvar a memória.'); return false }
    set((s) => ({ memories: s.memories.map((m) => (m.id === id ? fromRow(data as Row) : m)) }))
    return true
  },

  async remove(id) {
    const { error } = await supabase.from('ai_memories').delete().eq('id', id)
    if (error) { toast(error.message); return false }
    set((s) => ({ memories: s.memories.filter((m) => m.id !== id) }))
    return true
  },

  async removeByShortId(shortId) {
    if (!get().loaded) await get().load()
    const matches = get().memories.filter((m) => shortMemoryId(m.id) === shortId.trim())
    if (matches.length === 0) return { ok: false, error: `Nenhuma memória com o id "${shortId}".` }
    if (matches.length > 1) return { ok: false, error: `O id "${shortId}" é ambíguo.` }
    const ok = await get().remove(matches[0].id)
    return ok ? { ok: true } : { ok: false, error: 'Não foi possível apagar a memória.' }
  },

  async clearAll() {
    const userId = uid()
    if (!userId) return false
    const { error } = await supabase.from('ai_memories').delete().eq('user_id', userId)
    if (error) { toast(error.message); return false }
    set({ memories: [] })
    return true
  },
}))
