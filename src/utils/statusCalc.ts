import { Entry, EntryStatus } from '@/types'

export function computeAutoStatus(entry: Entry, today: string): EntryStatus {
  if (entry.actualEnd) return 'done'
  const end = entry.type === 'task' ? entry.plannedEnd : entry.plannedDate
  const start = entry.type === 'task' ? entry.plannedStart : entry.plannedDate
  if (!end) return 'pending'
  if (today > end) return 'overdue'
  if (start && today >= start) return 'in_progress'
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
