interface Props {
  columns?: number
  rows?: number
}

/** Shared loading placeholder for list pages — mirrors the shape of the real table. */
export function TableSkeleton({ columns = 6, rows = 5 }: Props) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border-default)] shadow-sm bg-[var(--surface-card)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--surface-subtle)] border-b border-[var(--border-default)]">
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-4 py-3">
                <div className="h-3 rounded bg-[var(--border-default)] animate-pulse" style={{ width: i === 0 ? '120px' : '60px' }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-default)]">
          {Array.from({ length: rows }).map((_, row) => (
            <tr key={row}>
              {Array.from({ length: columns }).map((_, col) => (
                <td key={col} className="px-4 py-3">
                  <div className="h-4 rounded bg-[var(--surface-subtle)] animate-pulse" style={{ width: col === 0 ? '140px' : '80px' }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
