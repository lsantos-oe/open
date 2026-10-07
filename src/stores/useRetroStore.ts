import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useToastStore } from '@/stores/useToastStore'
import { useAuthStore } from '@/stores/useAuthStore'
import type { DbRetro, DbRetroParticipant } from '@/types/database'
import { Retro, RetroInput } from '@/types/retro'
import { nextRetroPhase } from '@/utils/retro'

interface RetroStore {
  retros: Retro[]
  loaded: boolean
  loading: boolean
  loadRetros: () => Promise<void>
  createRetro: (input: RetroInput) => Promise<string | null>
  updateRetro: (id: string, input: RetroInput) => Promise<boolean>
  advancePhase: (id: string) => Promise<boolean>
  deleteRetro: (id: string) => Promise<boolean>
  /** Aplica uma mudança de retros vinda do Realtime (ex.: o condutor avançou a fase). */
  applyRemoteRetro: (row: DbRetro) => void
  reloadParticipants: (retroId: string) => Promise<void>
}

function dbToRetro(row: DbRetro, participantIds: string[]): Retro {
  return {
    id: row.id,
    title: row.title,
    retroDate: row.retro_date,
    periodStart: row.period_start ?? undefined,
    periodEnd: row.period_end ?? undefined,
    recordingLink: row.recording_link ?? undefined,
    conductorId: row.conductor_id ?? undefined,
    phase: row.phase,
    anonymous: row.anonymous,
    votesPerPerson: row.votes_per_person,
    previousRetroId: row.previous_retro_id ?? undefined,
    revealedAt: row.revealed_at ?? undefined,
    closedAt: row.closed_at ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    participantIds,
  }
}

function inputToDb(input: RetroInput) {
  return {
    title: input.title.trim(),
    retro_date: input.retroDate,
    period_start: input.periodStart || null,
    period_end: input.periodEnd || null,
    recording_link: input.recordingLink?.trim() || null,
    conductor_id: input.conductorId || null,
    anonymous: input.anonymous,
    votes_per_person: input.votesPerPerson,
    previous_retro_id: input.previousRetroId || null,
  }
}

/** O condutor (ou, sem condutor, o criador) sempre participa: também envia cards e vota. */
function withConductor(input: RetroInput, fallbackConductorId: string): RetroInput {
  const conductor = input.conductorId || fallbackConductorId
  return input.participantIds.includes(conductor) ? input : { ...input, participantIds: [...input.participantIds, conductor] }
}

function toastError(message: string) {
  useToastStore.getState().addToast(message)
}

// Um UPDATE barrado pelo RLS afeta 0 linhas e o .single() reclama disso com
// PGRST116 — para quem usa, isso é só "sem permissão".
function writeErrorMessage(error: { code?: string; message: string } | null, fallback: string): string {
  if (!error) return fallback
  return error.code === 'PGRST116' ? 'Você não tem permissão para fazer essa alteração.' : error.message
}

export const useRetroStore = create<RetroStore>((set, get) => ({
  retros: [],
  loaded: false,
  loading: false,

  // Sequential on purpose (see App.tsx): concurrent supabase.from() calls race
  // for gotrue-js's session lock.
  async loadRetros() {
    if (get().loading) return
    set({ loading: true })
    try {
      const { data: rows, error } = await supabase.from('retros').select('*').order('retro_date', { ascending: false })
      if (error) throw new Error(error.message)
      const { data: parts, error: pe } = await supabase.from('retro_participants').select('retro_id, user_id')
      if (pe) throw new Error(pe.message)

      const byRetro = new Map<string, string[]>()
      for (const p of (parts ?? []) as DbRetroParticipant[]) {
        byRetro.set(p.retro_id, [...(byRetro.get(p.retro_id) ?? []), p.user_id])
      }
      set({ retros: ((rows ?? []) as DbRetro[]).map((r) => dbToRetro(r, byRetro.get(r.id) ?? [])), loaded: true })
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Erro ao carregar retros')
    } finally {
      set({ loading: false })
    }
  },

  async createRetro(rawInput) {
    const userId = useAuthStore.getState().user?.id
    if (!userId) return null
    const input = withConductor(rawInput, userId)
    const { data, error } = await supabase
      .from('retros')
      .insert({ ...inputToDb(input), created_by: userId })
      .select('*')
      .single()
    if (error || !data) { toastError(error?.message ?? 'Erro ao criar retro'); return null }

    const retroId = (data as DbRetro).id
    if (input.participantIds.length > 0) {
      const { error: pe } = await supabase
        .from('retro_participants')
        .insert(input.participantIds.map((user_id) => ({ retro_id: retroId, user_id })))
      if (pe) toastError(pe.message)
    }
    set((s) => ({ retros: [dbToRetro(data as DbRetro, input.participantIds), ...s.retros] }))
    return retroId
  },

  async updateRetro(id, rawInput) {
    const current = get().retros.find((r) => r.id === id)
    if (!current) return false
    const input = withConductor(rawInput, current.createdBy)

    // phase fica de fora de propósito: só avança via advancePhase().
    const { data, error } = await supabase.from('retros').update(inputToDb(input)).eq('id', id).select('*').single()
    if (error || !data) { toastError(writeErrorMessage(error, 'Erro ao salvar retro')); return false }

    const toAdd = input.participantIds.filter((u) => !current.participantIds.includes(u))
    const toRemove = current.participantIds.filter((u) => !input.participantIds.includes(u))
    if (toRemove.length > 0) {
      const { error: de } = await supabase.from('retro_participants').delete().eq('retro_id', id).in('user_id', toRemove)
      if (de) toastError(de.message)
    }
    if (toAdd.length > 0) {
      const { error: ie } = await supabase.from('retro_participants').insert(toAdd.map((user_id) => ({ retro_id: id, user_id })))
      if (ie) toastError(ie.message)
    }
    set((s) => ({ retros: s.retros.map((r) => (r.id === id ? dbToRetro(data as DbRetro, input.participantIds) : r)) }))
    return true
  },

  async advancePhase(id) {
    const current = get().retros.find((r) => r.id === id)
    const next = current && nextRetroPhase(current.phase)
    if (!current || !next) return false
    const { data, error } = await supabase.from('retros').update({ phase: next }).eq('id', id).select('*').single()
    if (error || !data) { toastError(writeErrorMessage(error, 'Não foi possível avançar a fase.')); return false }
    set((s) => ({ retros: s.retros.map((r) => (r.id === id ? dbToRetro(data as DbRetro, r.participantIds) : r)) }))
    return true
  },

  applyRemoteRetro(row) {
    set((s) => {
      const exists = s.retros.some((r) => r.id === row.id)
      if (!exists) return { retros: [dbToRetro(row, []), ...s.retros] }
      return { retros: s.retros.map((r) => (r.id === row.id ? dbToRetro(row, r.participantIds) : r)) }
    })
  },

  async reloadParticipants(retroId) {
    const { data, error } = await supabase.from('retro_participants').select('user_id').eq('retro_id', retroId)
    if (error) return
    const ids = (data ?? []).map((p) => p.user_id as string)
    set((s) => ({ retros: s.retros.map((r) => (r.id === retroId ? { ...r, participantIds: ids } : r)) }))
  },

  async deleteRetro(id) {
    const { error } = await supabase.from('retros').delete().eq('id', id)
    if (error) { toastError(error.message); return false }
    set((s) => ({
      retros: s.retros
        .filter((r) => r.id !== id)
        .map((r) => (r.previousRetroId === id ? { ...r, previousRetroId: undefined } : r)),
    }))
    return true
  },
}))
