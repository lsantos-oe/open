import { Entry, EntrySignal } from '@/types'
import { computeEntrySignals } from '@/utils/signals'
import { Badge } from './Badge'

const LABELS: Record<EntrySignal, string> = {
  blocked: 'Bloqueado',
  overdue: 'Atrasado',
  stalled: 'Parado',
}

const VARIANTS: Record<EntrySignal, 'gray' | 'red' | 'yellow'> = {
  blocked: 'gray',
  overdue: 'red',
  stalled: 'yellow',
}

// Blocked first — it's an intentional state, not an alert to chase, so it
// takes visual priority over the other two.
const ORDER: EntrySignal[] = ['blocked', 'overdue', 'stalled']

interface Props {
  entry: Entry
  /** ISO date to compare against — defaults to today. Pass explicitly from a
   *  caller that already computed "today" once for a whole list, to avoid a
   *  fresh `new Date()` per row. */
  today?: string
  className?: string
}

/** Shared signal badges (Atrasado/Parado/Bloqueado) — the single place this is
 *  computed, reused by the tracking table, /tasks, and the read-only badges
 *  on the Plano tab, so the three screens can never drift into disagreeing
 *  about whether a task is overdue. Renders nothing when there's no signal. */
export function SignalBadges({ entry, today, className }: Props) {
  const t = today ?? new Date().toISOString().split('T')[0]
  const signals = computeEntrySignals(entry, t)
  if (signals.length === 0) return null

  return (
    <span className={`inline-flex items-center gap-1 flex-wrap ${className ?? ''}`}>
      {ORDER.filter((s) => signals.includes(s)).map((s) => (
        <Badge key={s} variant={VARIANTS[s]}>{LABELS[s]}</Badge>
      ))}
    </span>
  )
}

/** Subtle row background tint for the strongest active signal — a visual aid
 *  only (§5 diretrizes: cor nunca é o único sinal, o texto do badge já cobre
 *  isso). Blocked > Atrasado > Parado, matching the badge priority above. */
export function signalRowTint(entry: Entry, today?: string): string | undefined {
  const t = today ?? new Date().toISOString().split('T')[0]
  const signals = computeEntrySignals(entry, t)
  if (signals.includes('blocked')) return 'var(--surface-subtle)'
  if (signals.includes('overdue')) return 'var(--color-danger-bg)'
  if (signals.includes('stalled')) return 'var(--color-warning-bg)'
  return undefined
}
