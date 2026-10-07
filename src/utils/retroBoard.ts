import { Retro, RetroActionStatus, RetroCard, RetroReviewOutcome, RetroVote } from '@/types/retro'

export function voteCounts(votes: RetroVote[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const v of votes) counts.set(v.cardId, (counts.get(v.cardId) ?? 0) + 1)
  return counts
}

/** Mais apoiados primeiro; empate resolve pela ordem de criação (estável). */
export function sortByVotes(cards: RetroCard[], counts: Map<string, number>): RetroCard[] {
  return [...cards].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.createdAt.localeCompare(b.createdAt))
}

/** Votos já gastos em coisas boas/ruins — apoio a ações não conta no limite. */
export function votesUsed(votes: RetroVote[], cards: RetroCard[], userId?: string): number {
  if (!userId) return 0
  const kind = new Map(cards.map((c) => [c.id, c.kind]))
  return votes.filter((v) => v.userId === userId && (kind.get(v.cardId) === 'good' || kind.get(v.cardId) === 'bad')).length
}

/** Espelha retro_can_engage_action do banco (que é quem de fato decide): dono/envolvido da ação, ou
 *  gestor/participante da retro da ação ou da retro aberta na tela (um follow-up dela). Serve só para
 *  decidir o que mostrar editável. */
export function canEngageAction(retro: Retro, card: RetroCard, userId?: string, isAdmin?: boolean, retros: Retro[] = []): boolean {
  if (!userId) return false
  if (isAdmin) return true
  if ([...card.owners, ...card.involved].some((o) => o.memberId === userId)) return true
  const candidates = [retro, retros.find((r) => r.id === card.retroId)].filter((r): r is Retro => !!r)
  return candidates.some((r) => r.createdBy === userId || r.conductorId === userId || r.participantIds.includes(userId))
}

export const ACTION_STATUSES: RetroActionStatus[] = ['open', 'in_progress', 'done', 'dropped']

export const ACTION_STATUS_STYLE: Record<RetroActionStatus, { background: string; color: string }> = {
  open: { background: 'var(--color-info-bg)', color: 'var(--color-info-text)' },
  in_progress: { background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' },
  done: { background: 'var(--color-success-bg)', color: 'var(--color-success-text)' },
  dropped: { background: 'var(--surface-subtle)', color: 'var(--text-tertiary)' },
}

export function isActionOverdue(card: RetroCard, today: string): boolean {
  return !!card.dueDate && card.dueDate < today && (card.actionStatus === 'open' || card.actionStatus === 'in_progress')
}

export const REVIEW_OUTCOMES: RetroReviewOutcome[] = ['resolved', 'carried', 'dropped']

export const REVIEW_OUTCOME_STYLE: Record<RetroReviewOutcome, { background: string; color: string }> = {
  resolved: { background: 'var(--color-success-bg)', color: 'var(--color-success-text)' },
  carried: { background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' },
  dropped: { background: 'var(--surface-subtle)', color: 'var(--text-tertiary)' },
}
