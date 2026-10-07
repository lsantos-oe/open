import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useToastStore } from '@/stores/useToastStore'
import { useRetroStore } from '@/stores/useRetroStore'
import { useAuthStore } from '@/stores/useAuthStore'
import type {
  DbRetro, DbRetroCard, DbRetroCardAuthor, DbRetroCardLink, DbRetroComment, DbRetroReview, DbRetroVote,
} from '@/types/database'
import {
  RetroActionPatch, RetroCard, RetroCardKind, RetroCardLink, RetroComment, RetroLinkRef, RetroReview, RetroReviewOutcome, RetroVote, RETRO_PHASES,
} from '@/types/retro'
import { retroAncestors } from '@/utils/retro'

/** Quadro da retro aberta na tela (só uma por vez).
 *
 *  Quem pode ver o quê é decidido pelo banco (RLS): cards ainda sigilosos só
 *  chegam ao autor e ao condutor; em retro anônima, `authors` só traz a autoria
 *  dos cards do próprio usuário. Votos, comentários e vínculos herdam a
 *  visibilidade do card. Aqui nada disso é filtrado de novo — a tela mostra o
 *  que o banco entregou. */
interface RetroBoardStore {
  retroId: string | null
  cards: RetroCard[]
  /** card id → autor, apenas o que o banco deixou este usuário ver. */
  authors: Record<string, string>
  /** Vínculos com projetos/incidentes/clientes — visíveis só quando o card é visível. */
  links: RetroCardLink[]
  votes: RetroVote[]
  comments: RetroComment[]
  /** Revisões de follow-up das ações carregadas (da retro aberta e das anteriores). */
  reviews: RetroReview[]
  loading: boolean
  open: (retroId: string) => () => void
  addCard: (retroId: string, kind: RetroCardKind, text: string, links?: RetroLinkRef[]) => Promise<boolean>
  updateCard: (id: string, text: string) => Promise<boolean>
  /** Reconcilia os vínculos do card com `next`: insere os novos e remove os que saíram. */
  setCardLinks: (cardId: string, retroId: string, next: RetroLinkRef[]) => Promise<boolean>
  deleteCard: (id: string) => Promise<boolean>
  /** Alterna o voto/apoio do usuário num card. */
  toggleVote: (cardId: string) => Promise<boolean>
  /** Cria uma ação (parentId = card que ela endereça, ou ação pai no caso de sub-ação). Devolve o id. */
  addAction: (retroId: string, text: string, parentId?: string, links?: RetroLinkRef[]) => Promise<string | null>
  updateAction: (id: string, patch: RetroActionPatch) => Promise<boolean>
  addComment: (cardId: string, retroId: string, text: string) => Promise<boolean>
  deleteComment: (id: string) => Promise<boolean>
  /** Revisa, nesta retro (follow-up), uma ação de uma retro anterior. */
  reviewAction: (cardId: string, retroId: string, outcome: RetroReviewOutcome, note?: string, result?: string) => Promise<boolean>
}

const CARD_COLUMNS =
  'id, retro_id, kind, text, created_at, revealed_at, parent_card_id, description, owners, involved, ' +
  'success_metric, success_target, success_result, due_date, action_status, resolution_note, resolved_at'
const LINK_COLUMNS = 'id, card_id, retro_id, project_id, incident_id, client_id'

function dbToCard(row: DbRetroCard): RetroCard {
  return {
    id: row.id,
    retroId: row.retro_id,
    kind: row.kind,
    text: row.text,
    createdAt: row.created_at,
    revealedAt: row.revealed_at ?? undefined,
    parentCardId: row.parent_card_id ?? undefined,
    description: row.description ?? undefined,
    owners: row.owners ?? [],
    involved: row.involved ?? [],
    successMetric: row.success_metric ?? undefined,
    successTarget: row.success_target ?? undefined,
    successResult: row.success_result ?? undefined,
    dueDate: row.due_date ?? undefined,
    actionStatus: row.action_status ?? 'open',
    resolutionNote: row.resolution_note ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
  }
}

function dbToLink(row: DbRetroCardLink): RetroCardLink | null {
  if (row.project_id) return { linkId: row.id, cardId: row.card_id, type: 'project', id: row.project_id }
  if (row.incident_id) return { linkId: row.id, cardId: row.card_id, type: 'incident', id: row.incident_id }
  if (row.client_id) return { linkId: row.id, cardId: row.card_id, type: 'client', id: row.client_id }
  return null
}

function dbToComment(row: DbRetroComment): RetroComment {
  return { id: row.id, cardId: row.card_id, authorId: row.author_id, text: row.text, createdAt: row.created_at }
}

function dbToReview(row: DbRetroReview): RetroReview {
  return {
    id: row.id, cardId: row.card_id, retroId: row.retro_id, outcome: row.outcome,
    note: row.note ?? undefined, result: row.result ?? undefined, reviewedBy: row.reviewed_by, createdAt: row.created_at,
  }
}

const REVIEW_COLUMNS = 'id, card_id, retro_id, outcome, note, result, reviewed_by, created_at'

function refToColumn(ref: RetroLinkRef): Record<string, string> {
  return { [`${ref.type}_id`]: ref.id }
}

/** Patch da tela → colunas do banco. Texto opcional vazio vira null. */
function actionPatchToDb(patch: RetroActionPatch): Record<string, unknown> {
  const blank = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null)
  const out: Record<string, unknown> = {
    text: patch.text?.trim(),
    description: blank(patch.description),
    owners: patch.owners,
    involved: patch.involved,
    success_metric: blank(patch.successMetric),
    success_target: blank(patch.successTarget),
    success_result: blank(patch.successResult),
    due_date: patch.dueDate === undefined ? undefined : patch.dueDate || null,
    action_status: patch.actionStatus,
    resolution_note: blank(patch.resolutionNote),
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined))
}

const byCreatedAt = (a: RetroCard, b: RetroCard) => a.createdAt.localeCompare(b.createdAt)
const voteKey = (v: RetroVote) => `${v.cardId}:${v.userId}`

function toastError(message: string) {
  useToastStore.getState().addToast(message)
}

/** Ids de um card e de todos os seus descendentes (apagar uma ação apaga as sub-ações em cascata). */
function withDescendants(cards: RetroCard[], rootId: string): Set<string> {
  const ids = new Set([rootId])
  let grew = true
  while (grew) {
    grew = false
    for (const c of cards) {
      if (c.parentCardId && ids.has(c.parentCardId) && !ids.has(c.id)) { ids.add(c.id); grew = true }
    }
  }
  return ids
}

export const useRetroBoardStore = create<RetroBoardStore>((set, get) => {
  // Sequencial de propósito (ver App.tsx): chamadas simultâneas disputam o lock de sessão do gotrue-js.
  /** `ancestorIds`: retros anteriores encadeadas — suas AÇÕES entram no quadro para o follow-up
   *  (a tela filtra por retroId, então não aparecem nas raias da retro atual). */
  async function loadBoard(retroId: string, ancestorIds: string[]) {
    set({ loading: true })
    try {
      const { data: cards, error } = await supabase.from('retro_cards').select(CARD_COLUMNS).eq('retro_id', retroId)
      if (error) throw new Error(error.message)
      let ancestorActions: DbRetroCard[] = []
      if (ancestorIds.length > 0) {
        const { data, error: ee } = await supabase.from('retro_cards').select(CARD_COLUMNS).in('retro_id', ancestorIds).eq('kind', 'action')
        if (ee) throw new Error(ee.message)
        ancestorActions = (data ?? []) as unknown as DbRetroCard[]
      }
      const ancestorCardIds = ancestorActions.map((c) => c.id)

      const { data: authors, error: ae } = await supabase.from('retro_card_authors').select('card_id, author_id').eq('retro_id', retroId)
      if (ae) throw new Error(ae.message)

      // links / votos / comentários: os da retro atual + os das ações das retros anteriores.
      const [links, votes, comments] = await (async () => {
        const out: [DbRetroCardLink[], DbRetroVote[], DbRetroComment[]] = [[], [], []]
        const queries = [
          ['retro_card_links', LINK_COLUMNS], ['retro_votes', 'card_id, user_id'], ['retro_comments', 'id, card_id, author_id, text, created_at'],
        ] as const
        for (let i = 0; i < queries.length; i++) {
          const [table, cols] = queries[i]
          const base = await supabase.from(table).select(cols).eq('retro_id', retroId)
          if (base.error) throw new Error(base.error.message)
          const rows = [...((base.data ?? []) as unknown[])]
          if (ancestorCardIds.length > 0) {
            const extra = await supabase.from(table).select(cols).in('card_id', ancestorCardIds)
            if (extra.error) throw new Error(extra.error.message)
            rows.push(...((extra.data ?? []) as unknown[]))
          }
          ;(out[i] as unknown[]) = rows
        }
        return out
      })()

      const actionIds = [...((cards ?? []) as unknown as DbRetroCard[]).filter((c) => c.kind === 'action').map((c) => c.id), ...ancestorCardIds]
      let reviews: DbRetroReview[] = []
      if (actionIds.length > 0) {
        const { data, error: re } = await supabase.from('retro_action_reviews').select(REVIEW_COLUMNS).in('card_id', actionIds)
        if (re) throw new Error(re.message)
        reviews = (data ?? []) as DbRetroReview[]
      }

      if (get().retroId !== retroId) return // o usuário já saiu desta retro
      set({
        cards: [...((cards ?? []) as unknown as DbRetroCard[]), ...ancestorActions].map(dbToCard).sort(byCreatedAt),
        authors: Object.fromEntries(((authors ?? []) as DbRetroCardAuthor[]).map((a) => [a.card_id, a.author_id])),
        links: links.map(dbToLink).filter((l): l is RetroCardLink => !!l),
        votes: votes.map((v) => ({ cardId: v.card_id, userId: v.user_id })),
        comments: comments.map(dbToComment),
        reviews: reviews.map(dbToReview),
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

  function upsertReview(r: RetroReview) {
    set((s) => ({
      reviews: s.reviews.some((x) => x.id === r.id) ? s.reviews.map((x) => (x.id === r.id ? r : x)) : [...s.reviews, r],
    }))
  }

  function addVoteLocal(v: RetroVote) {
    set((s) => (s.votes.some((x) => voteKey(x) === voteKey(v)) ? s : { votes: [...s.votes, v] }))
  }

  function removeVoteLocal(v: RetroVote) {
    set((s) => ({ votes: s.votes.filter((x) => voteKey(x) !== voteKey(v)) }))
  }

  function upsertComment(c: RetroComment) {
    set((s) => ({
      comments: s.comments.some((x) => x.id === c.id) ? s.comments.map((x) => (x.id === c.id ? c : x)) : [...s.comments, c],
    }))
  }

  /** Cria o card via RPC (valida fase e participação no banco) e já o põe na tela. */
  async function createCard(retroId: string, kind: RetroCardKind, text: string, links: RetroLinkRef[], parentId?: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('retro_add_card', { p_retro: retroId, p_kind: kind, p_text: text, p_parent: parentId ?? null, p_links: links })
    if (error || !data) { toastError(error?.message ?? 'Não foi possível enviar o card.'); return null }
    const id = data as string
    const userId = useAuthStore.getState().user?.id
    const now = new Date().toISOString()
    upsertCard({
      id, retroId, kind, text: text.trim(), createdAt: now,
      revealedAt: kind === 'action' ? now : undefined, // ações já nascem reveladas
      parentCardId: parentId, owners: [], involved: [], actionStatus: 'open',
    })
    if (links.length > 0) {
      // Os vínculos nasceram junto com o card (mesma RPC); busca os ids reais das linhas.
      const { data: rows } = await supabase.from('retro_card_links').select(LINK_COLUMNS).eq('card_id', id)
      const fresh = ((rows ?? []) as DbRetroCardLink[]).map(dbToLink).filter((l): l is RetroCardLink => !!l)
      set((s) => ({ links: [...s.links.filter((l) => l.cardId !== id), ...fresh] }))
    }
    if (userId) set((s) => ({ authors: { ...s.authors, [id]: userId } }))
    return id
  }

  return {
    retroId: null,
    cards: [],
    authors: {},
    links: [],
    votes: [],
    comments: [],
    reviews: [],
    loading: false,

    open(retroId) {
      const ancestorIds = retroAncestors(useRetroStore.getState().retros, retroId).map((r) => r.id)
      set({ retroId, cards: [], authors: {}, links: [], votes: [], comments: [], reviews: [] })
      loadBoard(retroId, ancestorIds)

      // O Realtime respeita o RLS do assinante: durante a coleta só chegam os
      // eventos dos cards que este usuário já pode ver.
      let builder = supabase
        .channel(`retro-board:${retroId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'retro_cards', filter: `retro_id=eq.${retroId}` }, (payload) => {
          if (payload.eventType === 'DELETE') return // tratado abaixo (DELETE não aceita filtro)
          upsertCard(dbToCard(payload.new as DbRetroCard))
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'retro_cards' }, (payload) => {
          const id = (payload.old as { id?: string }).id
          if (!id) return
          set((s) => {
            const gone = withDescendants(s.cards, id)
            return {
              cards: s.cards.filter((c) => !gone.has(c.id)),
              links: s.links.filter((l) => !gone.has(l.cardId)),
              votes: s.votes.filter((v) => !gone.has(v.cardId)),
              comments: s.comments.filter((c) => !gone.has(c.cardId)),
            }
          })
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'retro_card_links', filter: `retro_id=eq.${retroId}` }, (payload) => {
          const link = dbToLink(payload.new as DbRetroCardLink)
          if (link) set((s) => ({ links: s.links.some((l) => l.linkId === link.linkId) ? s.links : [...s.links, link] }))
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'retro_card_links' }, (payload) => {
          const id = (payload.old as { id?: string }).id
          if (id) set((s) => ({ links: s.links.filter((l) => l.linkId !== id) }))
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'retro_votes', filter: `retro_id=eq.${retroId}` }, (payload) => {
          const v = payload.new as DbRetroVote
          addVoteLocal({ cardId: v.card_id, userId: v.user_id })
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'retro_votes' }, (payload) => {
          const v = payload.old as Partial<DbRetroVote>
          if (v.card_id && v.user_id) removeVoteLocal({ cardId: v.card_id, userId: v.user_id })
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'retro_comments', filter: `retro_id=eq.${retroId}` }, (payload) => {
          upsertComment(dbToComment(payload.new as DbRetroComment))
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'retro_comments', filter: `retro_id=eq.${retroId}` }, (payload) => {
          upsertComment(dbToComment(payload.new as DbRetroComment))
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'retro_comments' }, (payload) => {
          const id = (payload.old as { id?: string }).id
          if (id) set((s) => ({ comments: s.comments.filter((c) => c.id !== id) }))
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'retros', filter: `id=eq.${retroId}` }, (payload) => {
          const row = payload.new as DbRetro
          const retros = useRetroStore.getState()
          const prev = retros.retros.find((r) => r.id === retroId)
          retros.applyRemoteRetro(row)
          // Ao revelar, os cards dos outros passam a ser visíveis mas não geraram evento
          // enquanto estavam sigilosos — por isso recarrega o quadro inteiro.
          if (prev && RETRO_PHASES.indexOf(prev.phase) < 2 && RETRO_PHASES.indexOf(row.phase) >= 2) loadBoard(retroId, ancestorIds)
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'retro_participants', filter: `retro_id=eq.${retroId}` }, () => {
          useRetroStore.getState().reloadParticipants(retroId)
        })

      // Follow-up: ações das retros anteriores (e o que acontece nelas) também chegam ao vivo.
      if (ancestorIds.length > 0) {
        const inAncestors = `retro_id=in.(${ancestorIds.join(',')})`
        builder = builder
          .on('postgres_changes', { event: '*', schema: 'public', table: 'retro_cards', filter: inAncestors }, (payload) => {
            if (payload.eventType === 'DELETE') return // já tratado pelo handler de DELETE sem filtro
            const row = payload.new as DbRetroCard
            if (row.kind === 'action') upsertCard(dbToCard(row))
          })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'retro_comments', filter: inAncestors }, (payload) => {
            upsertComment(dbToComment(payload.new as DbRetroComment))
          })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'retro_votes', filter: inAncestors }, (payload) => {
            const v = payload.new as DbRetroVote
            addVoteLocal({ cardId: v.card_id, userId: v.user_id })
          })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'retro_card_links', filter: inAncestors }, (payload) => {
            const link = dbToLink(payload.new as DbRetroCardLink)
            if (link) set((s) => ({ links: s.links.some((l) => l.linkId === link.linkId) ? s.links : [...s.links, link] }))
          })
      }

      // Revisões feitas nesta retro ou nas intermediárias da cadeia.
      const reviewFilter = `retro_id=in.(${[retroId, ...ancestorIds].join(',')})`
      builder = builder
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'retro_action_reviews', filter: reviewFilter }, (payload) => upsertReview(dbToReview(payload.new as DbRetroReview)))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'retro_action_reviews', filter: reviewFilter }, (payload) => upsertReview(dbToReview(payload.new as DbRetroReview)))
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'retro_action_reviews' }, (payload) => {
          const id = (payload.old as { id?: string }).id
          if (id) set((s) => ({ reviews: s.reviews.filter((r) => r.id !== id) }))
        })
      const channel = builder.subscribe()

      return () => {
        supabase.removeChannel(channel)
        if (get().retroId === retroId) set({ retroId: null, cards: [], authors: {}, links: [], votes: [], comments: [], reviews: [] })
      }
    },

    async addCard(retroId, kind, text, links = []) {
      return !!(await createCard(retroId, kind, text, links))
    },

    async addAction(retroId, text, parentId, links = []) {
      return createCard(retroId, 'action', text, links, parentId)
    },

    async updateCard(id, text) {
      const { data, error } = await supabase.from('retro_cards').update({ text: text.trim() }).eq('id', id).select(CARD_COLUMNS)
      if (error) { toastError(error.message); return false }
      if (!data || data.length === 0) { toastError('Você não pode mais editar este card.'); return false }
      upsertCard(dbToCard(data[0] as unknown as DbRetroCard))
      return true
    },

    async updateAction(id, patch) {
      const dbPatch = actionPatchToDb(patch)
      if (Object.keys(dbPatch).length === 0) return true
      const { data, error } = await supabase.from('retro_cards').update(dbPatch).eq('id', id).select(CARD_COLUMNS)
      if (error) { toastError(error.message); return false }
      if (!data || data.length === 0) { toastError('Você não tem permissão para alterar esta ação.'); return false }
      upsertCard(dbToCard(data[0] as unknown as DbRetroCard))
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
          .select(LINK_COLUMNS)
        if (error) { toastError(error.message); return false }
        const created = ((data ?? []) as DbRetroCardLink[]).map(dbToLink).filter((l): l is RetroCardLink => !!l)
        set((s) => ({ links: [...s.links, ...created.filter((c) => !s.links.some((l) => l.linkId === c.linkId))] }))
      }
      return true
    },

    async deleteCard(id) {
      const { data, error } = await supabase.from('retro_cards').delete().eq('id', id).select('id')
      if (error) { toastError(error.message); return false }
      if (!data || data.length === 0) { toastError('Você não pode excluir este card.'); return false }
      set((s) => {
        const gone = withDescendants(s.cards, id)
        return {
          cards: s.cards.filter((c) => !gone.has(c.id)),
          links: s.links.filter((l) => !gone.has(l.cardId)),
          votes: s.votes.filter((v) => !gone.has(v.cardId)),
          comments: s.comments.filter((c) => !gone.has(c.cardId)),
        }
      })
      return true
    },

    async toggleVote(cardId) {
      const userId = useAuthStore.getState().user?.id
      const { data, error } = await supabase.rpc('retro_toggle_vote', { p_card: cardId })
      if (error) { toastError(error.message); return false }
      if (userId) (data ? addVoteLocal : removeVoteLocal)({ cardId, userId })
      return true
    },

    async addComment(cardId, retroId, text) {
      const userId = useAuthStore.getState().user?.id
      if (!userId || !text.trim()) return false
      const { data, error } = await supabase
        .from('retro_comments')
        .insert({ card_id: cardId, retro_id: retroId, author_id: userId, text: text.trim() })
        .select('id, card_id, author_id, text, created_at')
        .single()
      if (error || !data) { toastError(error?.message ?? 'Não foi possível comentar.'); return false }
      upsertComment(dbToComment(data as DbRetroComment))
      return true
    },

    async reviewAction(cardId, retroId, outcome, note, result) {
      const { error } = await supabase.rpc('retro_review_action', { p_card: cardId, p_retro: retroId, p_outcome: outcome, p_note: note ?? null, p_result: result ?? null })
      if (error) { toastError(error.message); return false }
      // O RPC atualiza revisão e card juntos; relê os dois (sequencial) para refletir o estado real.
      const { data: card } = await supabase.from('retro_cards').select(CARD_COLUMNS).eq('id', cardId)
      if (card && card[0]) upsertCard(dbToCard(card[0] as unknown as DbRetroCard))
      const { data: review } = await supabase.from('retro_action_reviews').select(REVIEW_COLUMNS).eq('card_id', cardId).eq('retro_id', retroId)
      if (review && review[0]) upsertReview(dbToReview(review[0] as DbRetroReview))
      return true
    },

    async deleteComment(id) {
      const { data, error } = await supabase.from('retro_comments').delete().eq('id', id).select('id')
      if (error) { toastError(error.message); return false }
      if (!data || data.length === 0) { toastError('Você não pode excluir este comentário.'); return false }
      set((s) => ({ comments: s.comments.filter((c) => c.id !== id) }))
      return true
    },
  }
})
