import type { EntryOwner } from '@/types'

export type RetroPhase = 'draft' | 'collecting' | 'revealed' | 'discussing' | 'closed'

export const RETRO_PHASES: RetroPhase[] = ['draft', 'collecting', 'revealed', 'discussing', 'closed']

export interface Retro {
  id: string
  title: string
  retroDate: string
  periodStart?: string
  periodEnd?: string
  recordingLink?: string
  conductorId?: string
  phase: RetroPhase
  anonymous: boolean
  votesPerPerson: number
  previousRetroId?: string
  revealedAt?: string
  closedAt?: string
  createdBy: string
  createdAt: string
  participantIds: string[]
}

export interface RetroInput {
  title: string
  retroDate: string
  periodStart?: string
  periodEnd?: string
  recordingLink?: string
  conductorId?: string
  anonymous: boolean
  votesPerPerson: number
  previousRetroId?: string
  participantIds: string[]
}

export type RetroCardKind = 'good' | 'bad' | 'action'

export type RetroActionStatus = 'open' | 'in_progress' | 'done' | 'dropped'

export interface RetroCard {
  id: string
  retroId: string
  kind: RetroCardKind
  text: string
  createdAt: string
  /** Preenchido quando o condutor fecha a urna. Sem isso, o card ainda é sigiloso (só autor e condutor veem). */
  revealedAt?: string
  /** Ação → card que ela endereça; sub-ação → ação pai. */
  parentCardId?: string
  // ── só para kind === 'action' ──
  description?: string
  owners: EntryOwner[]
  involved: EntryOwner[]
  /** Indicador: como saberemos que deu certo. */
  successMetric?: string
  successTarget?: string
  /** Resultado medido (preenchido no follow-up). */
  successResult?: string
  dueDate?: string
  actionStatus: RetroActionStatus
  resolutionNote?: string
  resolvedAt?: string
}

/** Campos de uma ação que a tela pode alterar. */
export interface RetroActionPatch {
  text?: string
  description?: string
  owners?: EntryOwner[]
  involved?: EntryOwner[]
  successMetric?: string
  successTarget?: string
  successResult?: string
  dueDate?: string
  actionStatus?: RetroActionStatus
  resolutionNote?: string
}

export interface RetroVote {
  cardId: string
  userId: string
}

export interface RetroComment {
  id: string
  cardId: string
  authorId: string
  text: string
  createdAt: string
}

export type RetroLinkType = 'project' | 'incident' | 'client'

/** Referência a uma entidade do Open (usada para montar/comparar vínculos). */
export interface RetroLinkRef {
  type: RetroLinkType
  id: string
}

export interface RetroCardLink extends RetroLinkRef {
  /** id da linha em retro_card_links */
  linkId: string
  cardId: string
}

export type RetroReviewOutcome = 'resolved' | 'dropped' | 'carried'

/** Revisão de uma ação numa retro de follow-up: o histórico da ação ao longo das retros. */
export interface RetroReview {
  id: string
  cardId: string
  /** A retro de follow-up em que a ação foi revisada. */
  retroId: string
  outcome: RetroReviewOutcome
  note?: string
  result?: string
  reviewedBy: string
  createdAt: string
}
