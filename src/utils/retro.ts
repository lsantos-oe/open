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

/** Hoje (YYYY-MM-DD) no fuso de São Paulo — o mesmo que o banco usa para decidir se a data da retro já passou. */
export function todayInSaoPaulo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export function retroDatePassed(retro: Retro): boolean {
  return retro.retroDate < todayInSaoPaulo()
}

/** Dá para reabrir a urna? Condutor/admin, retro fechada ou em discussão (nunca encerrada).
 *  A data da retro ter passado NÃO esconde o botão: ele aparece desabilitado explicando o motivo. */
export function canReopenUrn(retro: Retro, userId?: string, isAdmin?: boolean): boolean {
  return (retro.phase === 'revealed' || retro.phase === 'discussing') && canAdvanceRetroPhase(retro, userId, isAdmin)
}

/** Retros anteriores encadeadas (a mais recente primeiro). Seguro contra ciclos em previous_retro_id. */
export function retroAncestors(retros: Retro[], retroId: string): Retro[] {
  const byId = new Map(retros.map((r) => [r.id, r]))
  const out: Retro[] = []
  const seen = new Set([retroId])
  let cur = byId.get(retroId)?.previousRetroId
  while (cur && !seen.has(cur)) {
    const r = byId.get(cur)
    if (!r) break
    out.push(r)
    seen.add(cur)
    cur = r.previousRetroId
  }
  return out
}
