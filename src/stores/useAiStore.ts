import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useToastStore } from '@/stores/useToastStore'

/** Tracks the single OpenRouter key shared by the whole workspace (not a
 *  per-user BYOK key) — ai_get_key()/ai_has_key() return the same value to
 *  every authenticated user; ai_set_key()/ai_clear_key() are admin-only,
 *  enforced server-side in the RPCs themselves (see 20260801_ai_shared_key.sql). */
interface AiStore {
  hasKey: boolean
  hasKeyLoaded: boolean
  saving: boolean
  loadHasKey: () => Promise<void>
  validateKey: (key: string) => Promise<boolean>
  saveKey: (key: string) => Promise<boolean>
  removeKey: () => Promise<void>
}

/** Confirms the key authenticates with OpenRouter without spending tokens —
 *  GET /api/v1/key is a free, read-only call that echoes back the key's own
 *  account info, ideal for pure key validation. */
async function checkKeyWithOpenRouter(key: string): Promise<boolean> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${key}` },
    })
    return res.ok
  } catch {
    return false
  }
}

export const useAiStore = create<AiStore>((set, get) => ({
  hasKey: false,
  hasKeyLoaded: false,
  saving: false,

  loadHasKey: async () => {
    const { data, error } = await supabase.rpc('ai_has_key')
    if (error) { set({ hasKeyLoaded: true }); return }
    set({ hasKey: !!data, hasKeyLoaded: true })
  },

  validateKey: async (key) => checkKeyWithOpenRouter(key.trim()),

  saveKey: async (key) => {
    const trimmed = key.trim()
    if (!trimmed) return false
    set({ saving: true })
    try {
      const ok = await get().validateKey(trimmed)
      if (!ok) {
        useToastStore.getState().addToast('Sua chave do OpenRouter é inválida ou expirou. Verifique suas configurações.')
        return false
      }
      const { error } = await supabase.rpc('ai_set_key', { p_key: trimmed })
      if (error) {
        useToastStore.getState().addToast(error.message || 'Não foi possível salvar a chave. Tente novamente.')
        return false
      }
      set({ hasKey: true })
      return true
    } finally {
      set({ saving: false })
    }
  },

  removeKey: async () => {
    const { error } = await supabase.rpc('ai_clear_key')
    if (error) {
      useToastStore.getState().addToast(error.message || 'Não foi possível remover a chave. Tente novamente.')
      return
    }
    set({ hasKey: false })
  },
}))
