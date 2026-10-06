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
