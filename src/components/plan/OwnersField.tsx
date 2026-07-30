import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { EntryOwner, TeamMember } from '@/types'
import { useSmartPosition } from '@/hooks/useSmartPosition'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

interface Props {
  owners: EntryOwner[]
  onChange: (owners: EntryOwner[]) => void
  teamMembers: TeamMember[]
  /** Caps how many owners this field holds — once at max, picking someone new
   *  replaces the existing one(s) instead of appending. */
  max?: number
  /** Tags every owner added through this field instance (e.g. 'executor'/'validator'),
   *  so a single Entry can carry multiple OwnersField instances for different roles. */
  kind?: EntryOwner['kind']
}

export default function OwnersField({ owners, onChange, teamMembers, max, kind }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'member' | 'text'>('member')
  const [freeText, setFreeText] = useState('')
  const { triggerRef, popoverRef, position } = useSmartPosition(open)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function withMax(next: EntryOwner[]): EntryOwner[] {
    return max ? next.slice(next.length - max) : next
  }

  function memberAlreadyAdded(member: TeamMember): boolean {
    return member.userId
      ? owners.some((o) => o.memberId === member.userId)
      : owners.some((o) => o.type === 'text' && o.name === member.name)
  }

  function addMember(member: TeamMember) {
    if (memberAlreadyAdded(member)) return
    // Only a team member linked to a real registered user (userId) can be stored as
    // type:'member' — entries.responsible_member_id has a FK to profiles(id), so an
    // unlinked (external/free-text) team member must fall back to type:'text' instead.
    onChange(withMax([
      ...owners,
      member.userId
        ? { id: crypto.randomUUID(), type: 'member', memberId: member.userId, name: member.name, role: member.role, kind }
        : { id: crypto.randomUUID(), type: 'text', name: member.name, role: member.role, kind },
    ]))
  }

  function addFreeText() {
    if (!freeText.trim()) return
    onChange(withMax([...owners, { id: crypto.randomUUID(), type: 'text', name: freeText.trim(), kind }]))
    setFreeText('')
  }

  function remove(id: string) {
    onChange(owners.filter((o) => o.id !== id))
  }

  return (
    <div className="relative">
      {/* Owner chips */}
      <div className="flex flex-wrap gap-1.5 min-h-[32px] mb-1">
        {owners.map((owner) => (
          <span
            key={owner.id}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-pill)] text-xs font-medium"
            style={{ background: 'var(--oe-primary-light)', color: 'var(--oe-primary)', border: '1px solid var(--oe-primary)' }}
          >
            <span
              className="flex items-center justify-center shrink-0"
              style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--oe-primary)', color: 'white', fontSize: 8, fontWeight: 700 }}
            >
              {initials(owner.name)}
            </span>
            {owner.name}
            {owner.role && <span style={{ color: 'var(--oe-primary)', opacity: 0.7 }}>· {owner.role}</span>}
            <button
              onClick={() => remove(owner.id)}
              className="ml-0.5 leading-none hover:opacity-70"
              style={{ fontSize: 14, lineHeight: 1 }}
            >
              ×
            </button>
          </span>
        ))}
        <button
          ref={triggerRef as any}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-pill)] text-xs transition-colors"
          style={{ border: '1px dashed var(--border-default)', color: 'var(--text-tertiary)' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--oe-primary)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-default)')}
        >
          + {t('entry.addOwner')}
        </button>
      </div>

      {/* Popover — portaled so it's never clipped by a modal's overflow */}
      {open && createPortal(
        <div
          ref={popoverRef as any}
          className="rounded-[var(--radius-lg)] shadow-lg"
          style={{
            position: 'fixed',
            ...position,
            zIndex: 1000,
            minWidth: 240,
            background: 'var(--surface-card)',
            border: '1px solid var(--border-default)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Tabs */}
          <div className="flex border-b" style={{ borderColor: 'var(--border-default)' }}>
            {(['member', 'text'] as const).map((t_) => (
              <button
                key={t_}
                onClick={() => setTab(t_)}
                className="flex-1 py-2 text-xs font-medium transition-colors"
                style={{
                  color: tab === t_ ? 'var(--oe-primary)' : 'var(--text-tertiary)',
                  borderBottom: tab === t_ ? '2px solid var(--oe-primary)' : '2px solid transparent',
                }}
              >
                {t_ === 'member' ? t('entry.fromTeam') : t('entry.freeText')}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-2">
            {tab === 'member' ? (
              teamMembers.length === 0 ? (
                <p className="text-xs py-2 px-1" style={{ color: 'var(--text-tertiary)' }}>
                  Nenhum membro na equipe.
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {teamMembers.map((member) => {
                    const already = memberAlreadyAdded(member)
                    return (
                      <button
                        key={member.id}
                        onClick={() => { addMember(member); setOpen(false) }}
                        disabled={already}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors disabled:opacity-40"
                        style={{ fontSize: 12, color: 'var(--text-secondary)' }}
                        onMouseEnter={e => { if (!already) (e.currentTarget.style.background = 'var(--surface-subtle)') }}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        <span
                          className="flex items-center justify-center shrink-0"
                          style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--oe-primary)', color: 'white', fontSize: 9, fontWeight: 600 }}
                        >
                          {initials(member.name)}
                        </span>
                        <span className="flex-1 truncate">{member.name}</span>
                        {member.role && (
                          <span className="text-[10px] shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                            {member.role}
                          </span>
                        )}
                        {already && <span style={{ fontSize: 10, color: 'var(--oe-primary)' }}>✓</span>}
                      </button>
                    )
                  })}
                </div>
              )
            ) : (
              <div className="flex gap-1.5">
                <input
                  autoFocus
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { addFreeText(); setOpen(false) }
                    if (e.key === 'Escape') setOpen(false)
                  }}
                  placeholder="Nome..."
                  className="flex-1 focus:outline-none text-sm"
                  style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    padding: '5px 8px',
                    color: 'var(--text-primary)',
                    background: 'var(--surface-input)',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--oe-primary)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-default)')}
                />
                <button
                  onClick={() => { addFreeText(); setOpen(false) }}
                  disabled={!freeText.trim()}
                  className="px-3 py-1 rounded text-xs font-medium disabled:opacity-40"
                  style={{ background: 'var(--oe-primary)', color: 'white' }}
                >
                  OK
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
