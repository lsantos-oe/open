import { useEffect, useState } from 'react'

export interface ColumnDef {
  key: string
  label: string
  /** Always shown, no checkbox in the menu (e.g. the name/title column). */
  locked?: boolean
}

function load(storageKey: string, allKeys: string[]): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return new Set(allKeys)
    const saved: string[] = JSON.parse(raw)
    // New columns added after a user last customized this table default to
    // visible — a saved list missing them shouldn't silently hide them.
    const known = new Set(saved.filter((k) => allKeys.includes(k)))
    for (const k of allKeys) if (!saved.includes(k)) known.add(k)
    return known
  } catch {
    return new Set(allKeys)
  }
}

/** Per-table show/hide column state, persisted to localStorage under
 *  `storageKey` so each list page remembers its own column picks. */
export function useColumnVisibility(storageKey: string, columns: ColumnDef[]) {
  const allKeys = columns.map((c) => c.key)
  const [visible, setVisible] = useState<Set<string>>(() => load(storageKey, allKeys))

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify([...visible]))
  }, [storageKey, visible])

  function isVisible(key: string) {
    return visible.has(key)
  }

  function toggle(key: string) {
    setVisible((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  return { isVisible, toggle, visible }
}
