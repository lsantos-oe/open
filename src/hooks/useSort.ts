import { useMemo, useState } from 'react'

export type SortDir = 'asc' | 'desc'

/** Generic client-side sort: pass an accessor per sortable field, get back a
 *  `sortItems` function plus the state needed to render clickable headers.
 *  Comparators use localeCompare for strings so accented PT-BR names sort
 *  sanely, and treat missing values (undefined/null) as sorting last in
 *  either direction — an empty date/status shouldn't jump to the top on desc. */
export function useSort<T>(
  accessors: Record<string, (item: T) => string | number | null | undefined>,
  defaultField?: string,
  defaultDir: SortDir = 'asc',
) {
  const [sortField, setSortField] = useState<string | undefined>(defaultField)
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir)

  function toggleSort(field: string) {
    if (field !== sortField) {
      setSortField(field)
      setSortDir('asc')
    } else {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    }
  }

  function sortItems(items: T[]): T[] {
    if (!sortField) return items
    const accessor = accessors[sortField]
    if (!accessor) return items
    const sign = sortDir === 'asc' ? 1 : -1
    return [...items].sort((a, b) => {
      const va = accessor(a)
      const vb = accessor(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * sign
      return va < vb ? -sign : va > vb ? sign : 0
    })
  }

  return { sortField, sortDir, toggleSort, sortItems }
}

export type UseSortReturn<T> = ReturnType<typeof useSort<T>>
