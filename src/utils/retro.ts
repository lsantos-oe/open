import { format, parseISO } from 'date-fns'
import { Retro, RetroPhase, RETRO_PHASES } from '@/types/retro'

export function nextRetroPhase(phase: RetroPhase): RetroPhase | undefined {
  return RETRO_PHASES[RETRO_PHASES.indexOf(phase) + 1]
}

/** Condutor efetivo: o definido, ou o criador quando não há condutor — mesma regra do banco. */
export function effectiveConductorId(retro: Retro): string {
  return retro.conductorId ?? retro.createdBy
}

export function isRetroConductor(retro: Retro, userId?: string): boolean {
  return !!userId && effectiveConductorId(retro) === userId
}

/** Quem configura a retro (título, datas, participantes): criador, condutor ou admin.
 *  O banco é quem de fato impõe isso — aqui só decidimos o que mostrar na tela. */
export function canManageRetro(retro: Retro, userId?: string, isAdmin?: boolean): boolean {
  if (!userId) return false
  return !!isAdmin || retro.createdBy === userId || retro.conductorId === userId
}

export function canAdvanceRetroPhase(retro: Retro, userId?: string, isAdmin?: boolean): boolean {
  return isRetroConductor(retro, userId) || !!isAdmin
}

export function formatRetroDate(iso: string | undefined, dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY'): string {
  if (!iso) return ''
  return format(parseISO(iso), dateFormat === 'MM/DD/YYYY' ? 'MM/dd/yyyy' : 'dd/MM/yyyy')
}

export const RETRO_PHASE_STYLE: Record<RetroPhase, { background: string; color: string }> = {
  draft: { background: 'var(--surface-subtle)', color: 'var(--text-tertiary)' },
  collecting: { background: 'var(--color-info-bg)', color: 'var(--color-info-text)' },
  revealed: { background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' },
  discussing: { background: 'var(--color-violet-bg)', color: 'var(--color-violet-text)' },
  closed: { background: 'var(--color-success-bg)', color: 'var(--color-success-text)' },
}
