import { differenceInCalendarDays } from 'date-fns'
import { Entry, EntrySignal } from '@/types'

/** Days without activity before a task is flagged "parado". Not exposed as a
 *  setting yet — hardcoded per the tracking-upgrade proposal (N=5). */
export const STALLED_THRESHOLD_DAYS = 5

/** Computes tracking signals for an Entry, always live from its own fields —
 *  never from the persisted `status` column. `status='overdue'` is only ever
 *  (re)computed reactively inside specific store actions (date/status edits),
 *  never on load and never in bulk (`recalculateStatuses` exists but is not
 *  called anywhere), so a task nobody has touched since its deadline passed
 *  can sit with a stale non-overdue status indefinitely. Comparing the
 *  planned date to `today` directly — the same approach `TasksPage.tsx`'s
 *  `isCardOverdue` already uses — is the only reliable way to know. */
export function computeEntrySignals(entry: Entry, today: string): EntrySignal[] {
  const signals: EntrySignal[] = []

  if (entry.status === 'blocked') signals.push('blocked')

  const end = entry.type === 'task' ? entry.plannedEnd : entry.plannedDate
  if (end && end < today && entry.status !== 'done') signals.push('overdue')

  // Backlog is expected to sit untouched for a while — that's what a backlog
  // is — so it's excluded from "parado" (unlike 'todo', which represents
  // this week's prioritized pull and SHOULD flag if nobody starts it).
  if (entry.status !== 'done' && entry.status !== 'blocked' && entry.status !== 'pending') {
    // Falls back to createdAt for an entry that's never had a tracked
    // activity event (e.g. predates this feature) — skips the signal
    // entirely rather than guessing if neither is available.
    const baseline = entry.lastActivityAt ?? entry.createdAt
    if (baseline) {
      const daysSince = differenceInCalendarDays(new Date(today), new Date(baseline))
      if (daysSince >= STALLED_THRESHOLD_DAYS) signals.push('stalled')
    }
  }

  return signals
}
