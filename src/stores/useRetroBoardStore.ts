import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useToastStore } from '@/stores/useToastStore'
import { useRetroStore } from '@/stores/useRetroStore'
import { useAuthStore } from '@/stores/useAuthStore'
import type { DbRetro, DbRetroCard, DbRetroCardAuthor, DbRetroCardLink } from '@/types/database'
import { RetroCard, RetroCardKind, RetroCardLink, RetroLinkRef } from '@/types/retro'
import { RETRO_PHASES } from '@/types/retro'

/** Quadro da retro aberta na tela (só uma por vez).
 *
 *  Quem pode ver o quê é decidido pelo banco (RLS): antes da revelação o
 *  SELECT devolve só os cards do próprio usuário (ou todos, para o condutor);
 *  em retro anônima, `authors` só traz a autoria dos cards do próprio usuário.
 *  Aqui nada disso é filtrado de novo — a tela mostra o que o banco entregou. */
interface RetroBoardStore {
  retroId: string | null
  cards: RetroCard[]
  /** card id → autor, apenas o que o banco deixou este usuário ver. */
  authors: Record<string, string>
  /** Vínculos com projetos/incidentes/clientes — visíveis só quando o card é visível. */
  links: RetroCardLink[]
  loading: boolean
  open: (retroId: string) => () => void
  addCard: (retroId: string, kind: RetroCardKind, text: string, links?: RetroLinkRef[]) => Promise<boolean>
  updateCard: (id: string, text: string) => Promise<boolean>
  /** Reconcilia os vínculos do card com `next`: insere os novos e remove os que saíram. */
  setCardLinks: (cardId: string, retroId: string, next: RetroLinkRef[]) => Promise<boolean>
  deleteCard: (id: string) => Promise<boolean>
}

function dbToCard(row: DbRetroCard): RetroCard {
  return { id: row.id, retroId: row.retro_id, kind: row.kind, text: row.text, createdAt: row.created_at, revealedAt: row.revealed_at ?? undefined }
}

function dbToLink(row: DbRetroCardLink): RetroCardLink | null {
  if (row.project_id) return { linkId: row.id, cardId: row.card_id, type: 'project', id: row.project_id }
  if (row.incident_id) return { linkId: row.id, cardId: row.card_id, type: 'incident', id: row.incident_id }
  if (row.client_id) return { linkId: row.id, cardId: row.card_id, type: 'client', id: row.client_id }
  return null
}

function refToColumn(ref: RetroLinkRef): Record<string, string> {
  return { [`${ref.type}_id`]: ref.id }
}

const byCreatedAt = (a: RetroCard, b: RetroCard) => a.createdAt.localeCompare(b.createdAt)

function toastError(message: string) {
  useToastStore.getState().addToast(message)
}

export const useRetroBoardStore = create<RetroBoardStore>((set, get) => {
  // Sequencial de propósito (ver App.tsx): chamadas simultâneas disputam o lock de sessão do gotrue-js.
  async function loadBoard(retroId: string) {
    set({ loading: true })
    try {
      const { data: cards, error } = await supabase.from('retro_cards').select('id, retro_id, kind, text, created_at, revealed_at').eq('retro_id', retroId)
      if (error) throw new Error(error.message)
      const { data: authors, error: ae } = await supabase.from('retro_card_authors').select('card_id, author_id').eq('retro_id', retroId)
      if (ae) throw new Error(ae.message)
      const { data: links, error: le } = await supabase.from('retro_card_links').select('id, card_id, retro_id, project_id, incident_id, client_id').eq('retro_id', retroId)
      if (le) throw new Error(le.message)
      if (get().retroId !== retroId) return // o usuário já saiu desta retro
      set({
        cards: ((cards ?? []) as DbRetroCard[]).map(dbToCard).sort(byCreatedAt),
        authors: Object.fromEntries(((authors ?? []) as DbRetroCardAuthor[]).map((a) => [a.card_id, a.author_id])),
        links: ((links ?? []) as DbRetroCardLink[]).map(dbToLink).filter((l): l is RetroCardLink => !!l),
      })
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Erro ao carregar o quadro')
    } finally {
      set({ loading: false })
    }
  }

  function upsertCard(card: RetroCard) {
    set((s) => ({
      cards: s.cards.some((c) => c.id === card.id)
        ? s.cards.map((c) => (c.id === card.id ? card : c))
        : [...s.cards, card].sort(byCreatedAt),
    }))
  }

  return {
    retroId: null,
    cards: [],
    authors: {},
    links: [],
    loading: false,

    open(retroId) {
      set({ retroId, cards: [], authors: {}, links: [] })
      loadBoard(retroId)

      // O Realtime respeita o RLS do assinante: durante a coleta só chegam os
      // eventos dos cards que este usuário já pode ver.
      const channel = supabase
        .channel(`retro-board:${retroId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'retro_cards', filter: `retro_id=eq.${retroId}` }, (payload) => {
          if (payload.eventType === 'DELETE') return // tratado abaixo (DELETE não aceita filtro)
          upsertCard(dbToCard(payload.new as DbRetroCard))
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'retro_cards' }, (payload) => {
          const id = (payload.old as { id?: string }).id
          if (id) set((s) => ({ cards: s.cards.filter((c) => c.id !== id), links: s.links.filter((l) => l.cardId !== id) }))
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'retro_card_links', filter: `retro_id=eq.${retroId}` }, (payload) => {
          const link = dbToLink(payload.new as DbRetroCardLink)
          if (link) set((s) => ({ links: s.links.some((l) => l.linkId === link.linkId) ? s.links : [...s.links, link] }))
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'retro_card_links' }, (payload) => {
          const id = (payload.old as { id?: string }).id
          if (id) set((s) => ({ links: s.links.filter((l) => l.linkId !== id) }))
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'retros', filter: `id=eq.${retroId}` }, (payload) => {
          const row = payload.new as DbRetro
          const retros = useRetroStore.getState()
          const prev = retros.retros.find((r) => r.id === retroId)
          retros.applyRemoteRetro(row)
          // Ao revelar, os cards dos outros passam a ser visíveis mas não geraram evento
          // enquanto estavam sigilosos — por isso recarrega o quadro inteiro.
          if (prev && RETRO_PHASES.indexOf(prev.phase) < 2 && RETRO_PHASES.indexOf(row.phase) >= 2) loadBoard(retroId)
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'retro_participants', filter: `retro_id=eq.${retroId}` }, () => {
          useRetroStore.getState().reloadParticipants(retroId)
        })
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
        if (get().retroId === retroId) set({ retroId: null, cards: [], authors: {}, links: [] })
      }
    },

    async addCard(retroId, kind, text, links = []) {
      const { data, error } = await supabase.rpc('retro_add_card', { p_retro: retroId, p_kind: kind, p_text: text, p_links: links })
      if (error || !data) { toastError(error?.message ?? 'Não foi possível enviar o card.'); return false }
      const userId = useAuthStore.getState().user?.id
      upsertCard({ id: data as string, retroId, kind, text: text.trim(), createdAt: new Date().toISOString() })
      if (links.length > 0) {
        // Os vínculos nasceram junto com o card (mesma RPC); busca os ids reais das linhas.
        const { data: rows } = await supabase.from('retro_card_links').select('id, card_id, retro_id, project_id, incident_id, client_id').eq('card_id', data as string)
        const fresh = ((rows ?? []) as DbRetroCardLink[]).map(dbToLink).filter((l): l is RetroCardLink => !!l)
        set((s) => ({ links: [...s.links.filter((l) => l.cardId !== data), ...fresh] }))
      }
      if (userId) set((s) => ({ authors: { ...s.authors, [data as string]: userId } }))
      return true
    },

    async updateCard(id, text) {
      const { data, error } = await supabase.from('retro_cards').update({ text: text.trim() }).eq('id', id).select('id, retro_id, kind, text, created_at, revealed_at')
      if (error) { toastError(error.message); return false }
      if (!data || data.length === 0) { toastError('Você não pode mais editar este card.'); return false }
      upsertCard(dbToCard(data[0] as DbRetroCard))
      return true
    },

    async setCardLinks(cardId, retroId, next) {
      const current = get().links.filter((l) => l.cardId === cardId)
      const key = (r: RetroLinkRef) => `${r.type}:${r.id}`
      const nextKeys = new Set(next.map(key))
      const curKeys = new Set(current.map(key))
      const toRemove = current.filter((l) => !nextKeys.has(key(l)))
      const toAdd = next.filter((r) => !curKeys.has(key(r)))

      if (toRemove.length > 0) {
        const { data, error } = await supabase.from('retro_card_links').delete().in('id', toRemove.map((l) => l.linkId)).select('id')
        if (error) { toastError(error.message); return false }
        if (!data || data.length < toRemove.length) { toastError('Você não pode alterar os vínculos deste card.'); return false }
        const removed = new Set(toRemove.map((l) => l.linkId))
        set((s) => ({ links: s.links.filter((l) => !removed.has(l.linkId)) }))
      }
      if (toAdd.length > 0) {
        const { data, error } = await supabase
          .from('retro_card_links')
          .insert(toAdd.map((r) => ({ card_id: cardId, retro_id: retroId, ...refToColumn(r) })))
          .select('id, card_id, retro_id, project_id, incident_id, client_id')
        if (error) { toastError(error.message); return false }
        const created = ((data ?? []) as DbRetroCardLink[]).map(dbToLink).filter((l): l is RetroCardLink => !!l)
        set((s) => ({ links: [...s.links, ...created.filter((c) => !s.links.some((l) => l.linkId === c.linkId))] }))
      }
      return true
    },

    async deleteCard(id) {
      const { data, error } = await supabase.from('retro_cards').delete().eq('id', id).select('id')
      if (error) { toastError(error.message); return false }
      if (!data || data.length === 0) { toastError('Você não pode mais excluir este card.'); return false }
      set((s) => ({ cards: s.cards.filter((c) => c.id !== id), links: s.links.filter((l) => l.cardId !== id) }))
      return true
    },
  }
})
