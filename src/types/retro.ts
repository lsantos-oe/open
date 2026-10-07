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

export interface RetroCard {
  id: string
  retroId: string
  kind: RetroCardKind
  text: string
  createdAt: string
  /** Preenchido quando o condutor fecha a urna. Sem isso, o card ainda é sigiloso (só autor e condutor veem). */
  revealedAt?: string
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
