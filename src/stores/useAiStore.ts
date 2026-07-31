import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useToastStore } from '@/stores/useToastStore'
import { clearCachedKey } from '@/ai/client'

interface AiStore {
  hasKey: boolean
  hasKeyLoaded: boolean
  saving: boolean
  loadHasKey: () => Promise<void>
  validateKey: (key: string) => Promise<boolean>
  saveKey: (key: string) => Promise<boolean>
  removeKey: () => Promise<void>
}

/** Confirms the key authenticates with Anthropic without spending tokens —
 *  GET /v1/models is a free, read-only call, ideal for pure key validation. */
async function checkKeyWithAnthropic(key: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
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

  validateKey: async (key) => checkKeyWithAnthropic(key.trim()),

  saveKey: async (key) => {
    const trimmed = key.trim()
    if (!trimmed) return false
    set({ saving: true })
    try {
      const ok = await get().validateKey(trimmed)
      if (!ok) {
        useToastStore.getState().addToast('Sua chave da API do Claude é inválida ou expirou. Verifique suas configurações.')
        return false
      }
      const { error } = await supabase.rpc('ai_set_key', { p_key: trimmed })
      if (error) {
        useToastStore.getState().addToast('Não foi possível salvar a chave. Tente novamente.')
        return false
      }
      clearCachedKey()
      set({ hasKey: true })
      return true
    } finally {
      set({ saving: false })
    }
  },

  removeKey: async () => {
    const { error } = await supabase.rpc('ai_clear_key')
    if (error) {
      useToastStore.getState().addToast('Não foi possível remover a chave. Tente novamente.')
      return
    }
    clearCachedKey()
    set({ hasKey: false })
  },
}))
