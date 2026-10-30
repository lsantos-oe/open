import { Entry, EntrySignal } from '@/types'
import { computeEntrySignals } from '@/utils/signals'

const LABELS: Record<EntrySignal, string> = {
  blocked: 'Bloqueado',
  overdue: 'Atrasado',
  stalled: 'Parado',
}

const TONE: Record<EntrySignal, { bg: string; fg: string }> = {
  blocked: { bg: 'var(--badge-gray-bg)', fg: 'var(--text-secondary)' },
  overdue: { bg: 'var(--badge-red-bg)', fg: 'var(--color-danger-text)' },
  stalled: { bg: 'var(--badge-amber-bg)', fg: 'var(--color-warning-text)' },
}

const ICON_PATH: Record<EntrySignal, string[]> = {
  blocked: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M5.6 5.6l12.8 12.8'],   // círculo cortado
  overdue: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M12 7v5l3 2'],           // relógio
  stalled: ['M9 6v12', 'M15 6v12'],                                       // pausa
}

/** Sinal só com ícone (o nome aparece ao passar o mouse e para leitores de tela). */
function SignalIcon({ signal, size = 'md' }: { signal: EntrySignal; size?: 'xs' | 'sm' | 'md' }) {
  const box = size === 'xs' ? 15 : size === 'sm' ? 18 : 22
  const tone = TONE[signal]
  return (
    <span
      role="img" aria-label={LABELS[signal]} title={LABELS[signal]}
      className="inline-flex items-center justify-center shrink-0"
      style={{ width: box, height: box, borderRadius: '50%', background: tone.bg, color: tone.fg }}
    >
      <svg width={size === 'xs' ? 9 : size === 'sm' ? 11 : 13} height={size === 'xs' ? 9 : size === 'sm' ? 11 : 13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICON_PATH[signal].map((d, i) => <path key={i} d={d} />)}
      </svg>
    </span>
  )
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
  /** xs = 15px (cartões do kanban), sm = 18px (tabelas), md = 22px. */
  size?: 'xs' | 'sm' | 'md'
}

/** Shared signal icons (Atrasado/Parado/Bloqueado) — the single place this is
 *  computed, reused by the tracking table, /tasks, and the read-only badges
 *  on the Plano tab, so the three screens can never drift into disagreeing
 *  about whether a task is overdue. Renders nothing when there's no signal. */
export function SignalBadges({ entry, today, className, size = 'md' }: Props) {
  const t = today ?? new Date().toISOString().split('T')[0]
  const signals = computeEntrySignals(entry, t)
  if (signals.length === 0) return null

  return (
    <span className={`inline-flex items-center gap-1 flex-wrap ${className ?? ''}`}>
      {ORDER.filter((s) => signals.includes(s)).map((s) => (
        <SignalIcon key={s} signal={s} size={size} />
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
  void signals   // o sinal já aparece como ícone; a linha não é mais pintada
  return undefined
}
