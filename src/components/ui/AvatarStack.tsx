interface Person {
  name: string
  avatarUrl?: string
}

interface Props {
  people: Person[]
  max?: number
  size?: number
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

/** Overlapping avatar/initials circles with a "+N" overflow — the standard assignee/owner pattern. */
export function AvatarStack({ people, max = 3, size = 22 }: Props) {
  if (people.length === 0) {
    return <span style={{ color: 'var(--text-disabled)' }}>—</span>
  }

  const visible = people.slice(0, max)
  const overflow = people.length - visible.length

  return (
    <div className="flex items-center">
      {visible.map((p, i) => (
        p.avatarUrl ? (
          <img
            key={i}
            src={p.avatarUrl}
            alt={p.name}
            title={p.name}
            className="rounded-full object-cover shrink-0"
            style={{
              width: size, height: size, marginLeft: i === 0 ? 0 : -6,
              border: '2px solid var(--surface-card)', zIndex: visible.length - i,
            }}
          />
        ) : (
          <span
            key={i}
            title={p.name}
            className="flex items-center justify-center rounded-full font-semibold shrink-0"
            style={{
              width: size, height: size, marginLeft: i === 0 ? 0 : -6,
              border: '2px solid var(--surface-card)', background: 'var(--oe-primary)', color: 'white',
              fontSize: Math.round(size * 0.4), zIndex: visible.length - i,
            }}
          >
            {initials(p.name)}
          </span>
        )
      ))}
      {overflow > 0 && (
        <span
          title={people.slice(max).map((p) => p.name).join(', ')}
          className="flex items-center justify-center rounded-full font-semibold shrink-0"
          style={{
            width: size, height: size, marginLeft: -6,
            border: '2px solid var(--surface-card)', background: 'var(--surface-subtle)', color: 'var(--text-secondary)',
            fontSize: Math.round(size * 0.35),
          }}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
