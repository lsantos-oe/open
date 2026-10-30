import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ClientContact, EntryOwner, TeamMember } from '@/types'
import { useSmartPosition } from '@/hooks/useSmartPosition'
import { useAppStore } from '@/store/useAppStore'
import { AddChip, Avatar, Chip } from '@/components/ui/Chip'

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
  /** Contacts pickable as owners — e.g. client stakeholders scoped to an incident/project's
   *  linked clients. Omit to hide the "Contato" tab entirely. */
  contacts?: ClientContact[]
  /** Clientes a que um contato criado aqui fica ligado (normalmente os clientes do projeto/incidente). */
  newContactClientIds?: string[]
  /** Versão compacta para células de tabela: sem caixa ao redor, uma linha só. */
  inline?: boolean
  /** Só usuários do Open (sem contatos nem texto livre): some o seletor de origem. */
  usersOnly?: boolean
}

export default function OwnersField({ owners, onChange, teamMembers, max, kind, contacts, newContactClientIds, inline, usersOnly }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'member' | 'contact' | 'text'>('member')
  const [freeText, setFreeText] = useState('')
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [newContact, setNewContact] = useState({ name: '', role: '', email: '' })
  const [savingContact, setSavingContact] = useState(false)
  const createContactNow = useAppStore((st) => st.createContactNow)
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

  function contactAlreadyAdded(contact: ClientContact): boolean {
    return owners.some((o) => o.type === 'contact' && o.contactId === contact.id)
  }

  function addContact(contact: ClientContact) {
    if (contactAlreadyAdded(contact)) return
    onChange(withMax([
      ...owners,
      { id: crypto.randomUUID(), type: 'contact', contactId: contact.id, name: contact.name, role: contact.role, kind },
    ]))
  }

  function addFreeText() {
    if (!freeText.trim()) return
    onChange(withMax([...owners, { id: crypto.randomUUID(), type: 'text', name: freeText.trim(), kind }]))
    setFreeText('')
  }

  async function saveNewContact() {
    const name = newContact.name.trim()
    if (!name || savingContact) return
    setSavingContact(true)
    const c = await createContactNow({ name, role: newContact.role.trim() || undefined, email: newContact.email.trim() || undefined, clientIds: newContactClientIds })
    setSavingContact(false)
    if (!c) return
    addContact(c)
    setCreating(false); setNewContact({ name: '', role: '', email: '' }); setOpen(false)
  }

  useEffect(() => { if (!open) { setQuery(''); setCreating(false) } }, [open])
  const fold = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = fold(query.trim())
  const matches = (name: string, role?: string) => !q || fold(`${name} ${role ?? ''}`).includes(q)

  function remove(id: string) {
    onChange(owners.filter((o) => o.id !== id))
  }

  const field = { border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', background: 'var(--surface-input)', color: 'var(--text-primary)' } as const
  const row = 'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-[var(--radius-md)] text-left transition-colors hover:bg-[var(--surface-subtle)] disabled:opacity-40 disabled:hover:bg-transparent'

  const personRow = (key: string, name: string, role: string | undefined, already: boolean, pick: () => void) => (
    <button key={key} onClick={pick} disabled={already} className={row} style={{ fontSize: 13, color: 'var(--text-primary)' }}>
      <Avatar name={name} size={24} />
      <span className="flex-1 truncate">{name}</span>
      {role && <span className="text-[11.5px] shrink-0 truncate max-w-[40%]" style={{ color: 'var(--text-tertiary)' }}>{role}</span>}
      {already && <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>✓</span>}
    </button>
  )

  const sources = usersOnly ? (['member'] as const) : (contacts ? (['member', 'contact', 'text'] as const) : (['member', 'text'] as const))

  return (
    <div className="relative">
      <div className={inline ? 'flex flex-wrap items-center gap-1' : 'flex flex-wrap items-center gap-1.5 min-h-9 px-2 py-1 rounded-[18px]'} style={inline ? undefined : { background: 'var(--surface-subtle)' }}>
        {owners.map((owner) => (
          <Chip key={owner.id} solid={!inline} person={owner.name} onRemove={() => remove(owner.id)} removeLabel={`Remover ${owner.name}`}>
            {owner.name}
            {owner.role && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}> · {owner.role}</span>}
          </Chip>
        ))}
        {/* Campo de um responsável só: o botão não promete "adicionar" — escolher alguém substitui quem já está. */}
        {/* Campo de um responsável só: com alguém escolhido não há botão — para trocar, tire e escolha outro. */}
        {!(max === 1 && owners.length > 0) ? (
          <AddChip buttonRef={triggerRef as any} onClick={() => setOpen((v) => !v)}>
            {max === 1 ? `+ ${t('entry.pickOwner')}` : `+ ${t('entry.addOwner')}`}
          </AddChip>
        ) : <span ref={triggerRef as any} />}
      </div>

      {open && createPortal(
        <div
          ref={popoverRef as any}
          style={{
            position: 'fixed', ...position, zIndex: 1000, width: 292,
            background: 'var(--surface-card)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', padding: 8,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Origem: pílulas num trilho suave */}
          {sources.length > 1 && <div className="flex gap-0.5 p-0.5 mb-2" style={{ background: 'var(--badge-gray-bg)', borderRadius: 'var(--radius-pill)' }} role="tablist">
            {sources.map((t_) => (
              <button
                key={t_}
                role="tab"
                aria-selected={tab === t_}
                onClick={() => setTab(t_)}
                className="flex-1 py-1 text-xs font-medium transition-colors"
                style={{
                  borderRadius: 'var(--radius-pill)',
                  background: tab === t_ ? 'var(--surface-card)' : 'transparent',
                  color: tab === t_ ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  boxShadow: tab === t_ ? 'var(--shadow-sm)' : undefined,
                }}
              >
                {t_ === 'member' ? t('entry.fromTeam') : t_ === 'contact' ? t('entry.fromContact') : t('entry.freeText')}
              </button>
            ))}
          </div>}

          {tab === 'text' ? (
            <div className="flex gap-1.5">
              <input
                autoFocus
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { addFreeText(); setOpen(false) }
                  if (e.key === 'Escape') setOpen(false)
                }}
                placeholder="Nome…"
                className="flex-1 min-w-0 focus:outline-none focus:border-[var(--text-tertiary)] text-[13px]"
                style={{ ...field, padding: '6px 10px' }}
              />
              <button
                onClick={() => { addFreeText(); setOpen(false) }}
                disabled={!freeText.trim()}
                className="px-3 text-xs font-medium disabled:opacity-40"
                style={{ background: 'var(--oe-primary)', color: 'white', borderRadius: 'var(--radius-md)' }}
              >
                Adicionar
              </button>
            </div>
          ) : tab === 'contact' && creating ? (
            <div className="space-y-1.5">
              <input autoFocus value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} placeholder="Nome do contato" aria-label="Nome do contato"
                onKeyDown={(e) => { if (e.key === 'Enter') void saveNewContact() }}
                className="w-full focus:outline-none focus:border-[var(--text-tertiary)] text-[13px]" style={{ ...field, padding: '6px 10px' }} />
              <div className="flex gap-1.5">
                <input value={newContact.role} onChange={(e) => setNewContact({ ...newContact, role: e.target.value })} placeholder="Cargo" aria-label="Cargo"
                  className="flex-1 min-w-0 focus:outline-none focus:border-[var(--text-tertiary)] text-[13px]" style={{ ...field, padding: '6px 10px' }} />
                <input type="email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} placeholder="E-mail" aria-label="E-mail"
                  onKeyDown={(e) => { if (e.key === 'Enter') void saveNewContact() }}
                  className="flex-1 min-w-0 focus:outline-none focus:border-[var(--text-tertiary)] text-[13px]" style={{ ...field, padding: '6px 10px' }} />
              </div>
              {newContactClientIds && newContactClientIds.length > 0 && (
                <p className="text-[11.5px] px-0.5" style={{ color: 'var(--text-tertiary)' }}>Fica ligado ao(s) cliente(s) deste item.</p>
              )}
              <div className="flex justify-end gap-1.5 pt-0.5">
                <button onClick={() => setCreating(false)} className="px-3 py-1 text-xs font-medium rounded-[var(--radius-md)] hover:bg-[var(--surface-subtle)]" style={{ color: 'var(--text-secondary)' }}>Voltar</button>
                <button onClick={() => void saveNewContact()} disabled={!newContact.name.trim() || savingContact} className="px-3 py-1 text-xs font-medium disabled:opacity-40"
                  style={{ background: 'var(--oe-primary)', color: 'white', borderRadius: 'var(--radius-md)' }}>{savingContact ? 'Criando…' : 'Criar e adicionar'}</button>
              </div>
            </div>
          ) : (
            <>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
                placeholder={tab === 'member' ? 'Buscar pessoa…' : 'Buscar contato…'}
                aria-label="Buscar"
                className="w-full mb-1.5 focus:outline-none focus:border-[var(--text-tertiary)] text-[13px]"
                style={{ ...field, padding: '6px 10px' }}
              />
              <div className="max-h-52 overflow-y-auto space-y-0.5">
                {tab === 'member' ? (
                  teamMembers.filter((m) => matches(m.name, m.role)).map((member) =>
                    personRow(member.id, member.name, member.role, memberAlreadyAdded(member), () => { addMember(member); setOpen(false) }))
                ) : (
                  (contacts ?? []).filter((c) => matches(c.name, c.role)).map((contact) =>
                    personRow(contact.id, contact.name, contact.role, contactAlreadyAdded(contact), () => { addContact(contact); setOpen(false) }))
                )}
                {(tab === 'member' ? teamMembers.filter((m) => matches(m.name, m.role)) : (contacts ?? []).filter((c) => matches(c.name, c.role))).length === 0 && (
                  <p className="text-xs py-2 px-2" style={{ color: 'var(--text-tertiary)' }}>
                    {q ? 'Ninguém encontrado.' : tab === 'member' ? 'Nenhum membro na equipe.' : 'Nenhum contato vinculado.'}
                  </p>
                )}
              </div>
              {tab === 'contact' && (
                <button
                  onClick={() => { setNewContact({ name: query.trim(), role: '', email: '' }); setCreating(true) }}
                  className={`${row} mt-1`}
                  style={{ fontSize: 13, color: 'var(--text-secondary)' }}
                >
                  <span className="inline-flex items-center justify-center shrink-0" style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--oe-primary-light)' }}>+</span>
                  <span>{query.trim() ? `Criar contato "${query.trim()}"` : 'Criar novo contato'}</span>
                </button>
              )}
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
