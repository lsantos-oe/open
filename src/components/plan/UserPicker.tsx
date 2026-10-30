import { useMemo } from 'react'
import OwnersField from '@/components/plan/OwnersField'
import { TeamMember } from '@/types'

/** Escolha de UM usuário do Open, com o mesmo visual do campo de responsável. O valor é o id do usuário ('' = ninguém). */
export function UserPicker({ value, onChange, teamMembers }: { value: string; onChange: (userId: string) => void; teamMembers: TeamMember[] }) {
  const owners = useMemo(() => {
    const m = value ? teamMembers.find((t) => t.userId === value) : undefined
    return m ? [{ id: `user:${value}`, type: 'member' as const, memberId: value, name: m.name }] : []
  }, [value, teamMembers])
  return (
    <OwnersField
      owners={owners}
      onChange={(next) => onChange(next[next.length - 1]?.memberId ?? '')}
      teamMembers={teamMembers}
      max={1}
      usersOnly
    />
  )
}
