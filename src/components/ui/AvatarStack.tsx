import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'

interface Person {
  name: string
  avatarUrl?: string
  /** Perfil da pessoa (EntryOwner.memberId): é por ele que a foto é achada. Sem ele, tenta pelo nome. */
  memberId?: string
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

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/** Foto de uma pessoa: a que veio no próprio item, a do perfil (por id) ou a do perfil de mesmo nome. */
function useAvatarOf() {
  const directory = useAppStore((s) => s.teamDirectory)
  return (p: Person): string | undefined => {
    if (p.avatarUrl) return p.avatarUrl
    const profile = (p.memberId ? directory.find((d) => d.id === p.memberId) : undefined)
      ?? (p.memberId ? undefined : directory.find((d) => d.name && fold(d.name) === fold(p.name)))
    return profile?.avatar_url ?? undefined
  }
}

/** Overlapping avatar/initials circles with a "+N" overflow — the standard assignee/owner pattern. Mostra a foto do
 *  perfil quando existe; sem foto (ou se a imagem falhar), as iniciais. */
export function AvatarStack({ people, max = 3, size = 22 }: Props) {
  const avatarOf = useAvatarOf()
  const [broken, setBroken] = useState<Set<string>>(new Set())
  if (people.length === 0) {
    return <span style={{ color: 'var(--text-disabled)' }}>—</span>
  }

  const visible = people.slice(0, max)
  const overflow = people.length - visible.length

  return (
    <div className="flex items-center">
      {visible.map((p, i) => {
        const src = avatarOf(p)
        return src && !broken.has(src) ? (
          <img
            key={i}
            src={src}
            alt={p.name}
            title={p.name}
            onError={() => setBroken((b) => new Set(b).add(src))}
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
              border: '2px solid var(--surface-card)', background: 'var(--surface-subtle)', color: 'var(--text-secondary)',
              fontSize: Math.round(size * 0.4), zIndex: visible.length - i,
            }}
          >
            {initials(p.name)}
          </span>
        )
      })}
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
