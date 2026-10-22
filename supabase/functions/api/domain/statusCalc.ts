// GERADO por tools/sync-domain.ts — NÃO EDITAR. Origem: src/utils/statusCalc.ts (sha256 e3b70d78c24d012397ab367554d507f1b4af34276ca95ead9e3b416bfbf7d54e)
import { Entry, EntryStatus } from './types.ts'

const BOARD_STATUSES: readonly EntryStatus[] = ['pending', 'todo', 'in_progress', 'validation', 'done', 'blocked']

type DatedEntry = Pick<Entry, 'type' | 'plannedStart' | 'plannedEnd' | 'plannedDate' | 'actualEnd' | 'status'>

/** Atraso NÃO é uma etapa: uma tarefa pode estar atrasada em Backlog, To Do, Em andamento… Por isso é sempre calculado
 *  pela data (prazo passou e a tarefa não está concluída) e nunca grava no `status`, que é a etapa em que ela está. */
export function isLate(entry: DatedEntry, today: string): boolean {
  if (entry.actualEnd || entry.status === 'done') return false
  const end = entry.type === 'task' ? entry.plannedEnd : entry.plannedDate
  return !!end && end < today
}

/** Etapa automática (quando ninguém escolheu o status à mão): concluída se tem fim real; em andamento a partir da
 *  data de início; senão Backlog. Nunca devolve 'overdue' — ver isLate. */
export function computeAutoStatus(entry: Entry, today: string): EntryStatus {
  if (entry.actualEnd) return 'done'
  const end = entry.type === 'task' ? entry.plannedEnd : entry.plannedDate
  const start = entry.type === 'task' ? entry.plannedStart : entry.plannedDate
  if (!end) return 'pending'
  if (start && today >= start) return 'in_progress'
  return 'pending'
}

/** Raia do kanban onde o card aparece. O quadro tem seis raias e o status gravado 'overdue' (legado: versões antigas
 *  trocavam a etapa por "Atrasado" quando o prazo passava) não tem raia — sem isto o card entrava no contador e sumia
 *  do quadro. Para esses, reconstrói a etapa pelas datas, como a etapa automática faria. Vazio/desconhecido: Backlog. */
export function boardStatus(entry: DatedEntry, today: string): EntryStatus {
  const s = entry.status
  if (s && BOARD_STATUSES.includes(s)) return s
  if (s === 'overdue') {
    if (entry.actualEnd) return 'done'
    const start = entry.type === 'task' ? entry.plannedStart : entry.plannedDate
    return start && today >= start ? 'in_progress' : 'pending'
  }
  return 'pending'
}

export function applyAutoStatus(entry: Entry, today: string): Entry {
  if (entry.statusOverride) return entry
  if (entry.status === 'blocked') return entry
  const newStatus = computeAutoStatus(entry, today)
  if (newStatus === entry.status) return entry
  return { ...entry, status: newStatus }
}

/** Baseline (re)computation used by "Definir Baseline"/"Re-baseline" — applied
 *  per entry so a single project can mix frozen (done, already-baselined)
 *  entries with freshly-rebaselined ones (still open work).
 *
 *  - Done entries that already have a baseline are left untouched: that's the
 *    historical commitment we measure variance against, and re-baselining the
 *    rest of the plan shouldn't erase it.
 *  - Everything else (open work, or a done entry that never got a baseline)
 *    is (re)seeded from the real date when the entry is done and has one,
 *    otherwise from the current planned date — so a baseline set retroactively
 *    on an already-finished task reflects what actually happened, not a stale
 *    planning guess. */
export function computeBaselineFields(entry: Entry): Pick<Entry, 'baselineStart' | 'baselineEnd' | 'baselineDate'> {
  const isDone = entry.status === 'done'

  if (entry.type !== 'task') {
    if (isDone && entry.baselineDate) return { baselineDate: entry.baselineDate }
    return { baselineDate: entry.plannedDate }
  }

  if (isDone && entry.baselineEnd) {
    return { baselineStart: entry.baselineStart, baselineEnd: entry.baselineEnd }
  }
  return {
    baselineStart: isDone && entry.actualStart ? entry.actualStart : entry.plannedStart,
    baselineEnd: isDone && entry.actualEnd ? entry.actualEnd : entry.plannedEnd,
  }
}
