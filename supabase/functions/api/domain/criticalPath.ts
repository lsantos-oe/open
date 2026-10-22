// GERADO por tools/sync-domain.ts — NÃO EDITAR. Origem: src/utils/criticalPath.ts (sha256 28adc408939f275d67c380e09910393006c04a6d32f6f01fb5caf0a7c73066da)
import { parseISO, differenceInCalendarDays } from 'date-fns'
import { Entry, Phase } from './types.ts'

interface Node {
  id: string
  endDate?: string
  dependsOn: string[]
}

function toDate(iso?: string): Date | null {
  return iso ? parseISO(iso) : null
}

function nodeEnd(node: Node): Date | null {
  return toDate(node.endDate)
}

/**
 * Classic critical-path via longest-path DFS on a DAG.
 * Returns the set of entry IDs that lie on the critical path.
 */
export function computeCriticalPath(phases: Phase[]): Set<string> {
  const nodes: Node[] = []
  for (const phase of phases) {
    for (const entry of phase.entries) {
      const end = entry.type === 'task' ? entry.plannedEnd : entry.plannedDate
      nodes.push({ id: entry.id, endDate: end, dependsOn: entry.dependsOn })
      for (const sub of entry.subtasks) {
        const subEnd = sub.type === 'task' ? sub.plannedEnd : sub.plannedDate
        nodes.push({ id: sub.id, endDate: subEnd, dependsOn: sub.dependsOn })
      }
    }
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  // Earliest finish time (EFT) via memoised DFS
  const eft = new Map<string, number>()

  function getEFT(id: string, visited: Set<string>): number {
    if (eft.has(id)) return eft.get(id)!
    if (visited.has(id)) return 0 // cycle guard
    visited.add(id)

    const node = nodeMap.get(id)
    if (!node) return 0

    const ownEnd = nodeEnd(node)
    const ownDays = ownEnd ? differenceInCalendarDays(ownEnd, new Date('2000-01-01')) : 0

    let maxPredEnd = 0
    for (const predId of node.dependsOn) {
      maxPredEnd = Math.max(maxPredEnd, getEFT(predId, visited))
    }

    const result = Math.max(ownDays, maxPredEnd)
    eft.set(id, result)
    return result
  }

  for (const node of nodes) {
    getEFT(node.id, new Set())
  }

  if (eft.size === 0) return new Set()

  const maxEFT = Math.max(...eft.values())

  // Backtrack from nodes with max EFT
  const critical = new Set<string>()

  function markCritical(id: string) {
    if (critical.has(id)) return
    critical.add(id)
    const node = nodeMap.get(id)
    if (!node) return
    for (const predId of node.dependsOn) {
      markCritical(predId)
    }
  }

  for (const [id, val] of eft.entries()) {
    if (val === maxEFT) markCritical(id)
  }

  return critical
}

/** Apply isCritical flag to all entries in the phases array */
export function applyIsCritical(phases: Phase[]): Phase[] {
  const critical = computeCriticalPath(phases)
  return phases.map((phase) => ({
    ...phase,
    entries: phase.entries.map((entry) => ({
      ...entry,
      isCritical: critical.has(entry.id),
      subtasks: entry.subtasks.map((sub) => ({
        ...sub,
        isCritical: critical.has(sub.id),
      })),
    })),
  }))
}
