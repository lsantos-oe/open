import { parseISO } from 'date-fns'
import { Entry, Phase } from '@/types'
import { addWorkdays, parseHolidays, toISODate, workdaysBetween } from './businessDays'

/**
 * The minimal shape the date engine needs — any `Project` already satisfies
 * this structurally, and an Incident's flat entry list can be wrapped in a
 * single synthetic phase to reuse the exact same cascade/rollup logic.
 */
export interface PhaseScope {
  phases: Phase[]
}

// ─── helpers ────────────────────────────────────────────────────────────────

function entryEndDate(e: Entry): string | undefined {
  return e.type === 'task' ? e.plannedEnd : e.plannedDate
}

function entryStartDate(e: Entry): string | undefined {
  return e.type === 'task' ? e.plannedStart : e.plannedDate
}

/** Flatten all entries in a scope (phases + subtasks) into a map id→Entry */
export function buildEntryMap(scope: PhaseScope): Map<string, Entry> {
  const map = new Map<string, Entry>()
  for (const phase of scope.phases) {
    for (const entry of phase.entries) {
      map.set(entry.id, entry)
      for (const sub of entry.subtasks) map.set(sub.id, sub)
    }
  }
  return map
}

/** Find which top-level entry owns a given subtask id */
function findParent(scope: PhaseScope, subId: string): Entry | undefined {
  for (const phase of scope.phases) {
    for (const entry of phase.entries) {
      if (entry.subtasks.some((s) => s.id === subId)) return entry
    }
  }
}

// ─── roll-up ────────────────────────────────────────────────────────────────

/** Re-derive a parent entry's dates from its subtasks */
export function rollUpEntry(parent: Entry): Entry {
  if (parent.subtasks.length === 0) return parent
  const starts = parent.subtasks.map((s) => s.plannedStart).filter(Boolean) as string[]
  // For the end: prefer actualEnd for done subtasks, plannedEnd otherwise
  const ends = parent.subtasks
    .map((s) => (s.status === 'done' && s.actualEnd) ? s.actualEnd : s.plannedEnd)
    .filter(Boolean) as string[]
  if (starts.length === 0 || ends.length === 0) return parent
  return {
    ...parent,
    plannedStart: starts.sort()[0],
    plannedEnd: ends.sort().at(-1)!,
  }
}

/** Re-derive a phase's conceptual date range (used for display only, not stored) */
export function phaseRange(phase: Phase): { start?: string; end?: string } {
  const starts: string[] = []
  const ends: string[] = []
  for (const e of phase.entries) {
    const s = entryStartDate(e)
    const en = entryEndDate(e)
    if (s) starts.push(s)
    if (en) ends.push(en)
  }
  return {
    start: starts.sort()[0],
    end: ends.sort().at(-1),
  }
}

// ─── cascade ────────────────────────────────────────────────────────────────

/**
 * After changing a task's plannedEnd (or a milestone/meeting's plannedDate),
 * propagate the shift forward to all directly or transitively dependent entries.
 *
 * Returns a new phases array with all affected entries updated.
 */
export function cascadeForward(
  scope: PhaseScope,
  changedEntryId: string,
  holidays: string[],
): Phase[] {
  const holidayDates = parseHolidays(holidays)
  const entryMap = buildEntryMap(scope)

  // Build reverse dependency map: id → entries that depend on it
  const dependents = new Map<string, string[]>()
  for (const [id] of entryMap) dependents.set(id, [])
  for (const [id, entry] of entryMap) {
    for (const dep of entry.dependsOn) {
      dependents.get(dep)?.push(id)
    }
  }

  // BFS forward from the changed entry
  const queue = [changedEntryId]
  const visited = new Set<string>([changedEntryId])
  const updatedEntries = new Map<string, Entry>()

  while (queue.length > 0) {
    const currentId = queue.shift()!
    const current = updatedEntries.get(currentId) ?? entryMap.get(currentId)!

    for (const depId of dependents.get(currentId) ?? []) {
      if (visited.has(depId)) continue
      visited.add(depId)

      const dep = updatedEntries.get(depId) ?? entryMap.get(depId)!

      // Never cascade into a completed entry — its actual dates are fixed
      if (dep.actualEnd) continue

      // Earliest the dependent can start: 1 workday after predecessor ends
      const predecessorEnd = entryEndDate(current)
      if (!predecessorEnd) continue

      const newStart = addWorkdays(parseISO(predecessorEnd), 1, holidayDates)
      const newStartISO = toISODate(newStart)

      let updated: Entry
      if (dep.type === 'task') {
        const duration = dep.durationDays ?? 1
        const newEnd = addWorkdays(newStart, duration - 1, holidayDates)
        updated = { ...dep, plannedStart: newStartISO, plannedEnd: toISODate(newEnd) }
      } else {
        updated = { ...dep, plannedDate: newStartISO }
      }

      updatedEntries.set(depId, updated)
      queue.push(depId)
    }
  }

  if (updatedEntries.size === 0) return scope.phases

  // Apply updates to the phases tree
  return scope.phases.map((phase) => ({
    ...phase,
    entries: phase.entries.map((entry) => {
      const updated = updatedEntries.get(entry.id)
      const updatedSubtasks = entry.subtasks.map((sub) => updatedEntries.get(sub.id) ?? sub)
      const base = updated ?? entry
      const withSubs = { ...base, subtasks: updatedSubtasks }
      // roll-up parent if subtasks changed
      if (entry.subtasks.length > 0) return rollUpEntry(withSubs)
      return withSubs
    }),
  }))
}

// ─── variance ───────────────────────────────────────────────────────────────

export function computeVariance(entry: Entry, holidays: string[]): number | undefined {
  const holidayDates = parseHolidays(holidays)
  if (entry.type === 'task') {
    if (!entry.plannedEnd || !entry.baselineEnd) return undefined
    return workdaysBetween(parseISO(entry.baselineEnd), parseISO(entry.plannedEnd), holidayDates)
  } else {
    if (!entry.plannedDate || !entry.baselineDate) return undefined
    return workdaysBetween(parseISO(entry.baselineDate), parseISO(entry.plannedDate), holidayDates)
  }
}

// ─── duration recalc ────────────────────────────────────────────────────────

export function recalcDuration(entry: Entry, holidays: string[]): number {
  if (entry.type !== 'task' || !entry.plannedStart || !entry.plannedEnd) return entry.durationDays ?? 1
  const holidayDates = parseHolidays(holidays)
  const diff = workdaysBetween(parseISO(entry.plannedStart), parseISO(entry.plannedEnd), holidayDates)
  return diff + 1
}

// ─── full pipeline: apply date change ───────────────────────────────────────

/**
 * Apply a manual date change to an entry, then run roll-up + cascade.
 * Returns the updated phases array.
 */
export function applyDateChange(
  scope: PhaseScope,
  entryId: string,
  field: 'plannedStart' | 'plannedEnd' | 'plannedDate' | 'actualStart' | 'actualEnd',
  value: string,
  holidays: string[],
): Phase[] {
  const holidayDates = parseHolidays(holidays)

  // Step 1 — update the specific field
  let phasesWithChange = scope.phases.map((phase) => ({
    ...phase,
    entries: phase.entries.map((entry) => {
      if (entry.id === entryId) {
        let updated = { ...entry, [field]: value }
        // Recalculate duration if start/end changed
        if (field === 'plannedStart' || field === 'plannedEnd') {
          if (updated.plannedStart && updated.plannedEnd) {
            updated = { ...updated, durationDays: recalcDuration(updated, holidays) }
          }
          // If start changed, shift end by same duration
          if (field === 'plannedStart' && entry.durationDays && updated.plannedStart) {
            const newEnd = addWorkdays(parseISO(value), (entry.durationDays ?? 1) - 1, holidayDates)
            updated = { ...updated, plannedEnd: toISODate(newEnd) }
          }
        }
        return updated
      }
      // Check subtasks
      const hasSub = entry.subtasks.some((s) => s.id === entryId)
      if (!hasSub) return entry
      const updatedSubs = entry.subtasks.map((sub) => {
        if (sub.id !== entryId) return sub
        let updated = { ...sub, [field]: value }
        if (field === 'plannedStart' && sub.durationDays && updated.plannedStart) {
          const newEnd = addWorkdays(parseISO(value), (sub.durationDays ?? 1) - 1, holidayDates)
          updated = { ...updated, plannedEnd: toISODate(newEnd) }
        }
        return updated
      })
      return rollUpEntry({ ...entry, subtasks: updatedSubs })
    }),
  }))

  // Step 2 — cascade forward only when planned end / date changes
  if (field === 'plannedEnd' || field === 'plannedDate' || field === 'plannedStart') {
    phasesWithChange = cascadeForward({ phases: phasesWithChange }, entryId, holidays)
  }

  return phasesWithChange
}
