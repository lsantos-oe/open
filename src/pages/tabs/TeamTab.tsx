import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Project, TeamMember, EntryOwner } from '@/types'
import { useAppStore } from '@/store/useAppStore'
import { contactsForClients } from '@/utils/contacts'
import { Button } from '@/components/ui/Button'
import { Input, Field } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import OwnersField from '@/components/plan/OwnersField'

interface Props { project: Project }

const ROLES = ['PM', 'Dev Lead', 'Desenvolvedor', 'Consultor', 'Analista', 'Cliente (Champion)', 'Patrocinador']

function memberToOwner(m: Omit<TeamMember, 'id'>): EntryOwner[] {
  if (!m.name) return []
  return [{ id: 'pending', type: m.userId ? 'member' : 'text', memberId: m.userId, name: m.name }]
}

export default function TeamTab({ project }: Props) {
  const { t } = useTranslation()
  const { addTeamMember, updateTeamMember, removeTeamMember, teamDirectory, contacts } = useAppStore()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Omit<TeamMember, 'id'>>({ name: '', role: 'PM', email: '' })
  const [pendingOwner, setPendingOwner] = useState<EntryOwner[]>([])

  const directoryAsTeam: TeamMember[] = useMemo(
    () => teamDirectory.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name ?? p.email ?? '', role: '', email: p.email ?? undefined, userId: p.id })),
    [teamDirectory],
  )
  const projectContacts = useMemo(
    () => project.clientIds.length ? contactsForClients(contacts, project.clientIds) : [],
    [contacts, project.clientIds],
  )

  function openAdd() {
    setEditId(null)
    setForm({ name: '', role: 'PM', email: '' })
    setPendingOwner([])
    setOpen(true)
  }

  function openEdit(m: TeamMember) {
    setEditId(m.id)
    setForm({ name: m.name, role: m.role, email: m.email ?? '', userId: m.userId })
    setPendingOwner(memberToOwner(m))
    setOpen(true)
  }

  function handleSave() {
    const picked = pendingOwner[0]
    if (!picked) return
    const email = picked.type === 'member'
      ? directoryAsTeam.find((m) => m.userId === picked.memberId)?.email
      : picked.type === 'contact'
      ? contacts.find((c) => c.id === picked.contactId)?.email
      : form.email || undefined
    const member: Omit<TeamMember, 'id'> = {
      name: picked.name,
      role: form.role,
      email,
      userId: picked.type === 'member' ? picked.memberId : undefined,
    }
    if (editId) {
      updateTeamMember(project.id, editId, member)
    } else {
      addTeamMember(project.id, member)
    }
    setOpen(false)
  }

  const roleColors: Record<string, { bg: string; color: string }> = {
    PM: { bg: 'var(--color-violet-bg)', color: 'var(--color-violet-text)' },
    'Dev Lead': { bg: 'var(--color-info-bg)', color: 'var(--color-info-text)' },
    Desenvolvedor: { bg: 'var(--color-success-bg)', color: 'var(--color-success-text)' },
    Consultor: { bg: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' },
    Analista: { bg: 'var(--color-info-bg)', color: 'var(--color-info-text)' },
    'Cliente (Champion)': { bg: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' },
    Patrocinador: { bg: 'var(--color-success-bg)', color: 'var(--color-success-text)' },
  }
  const fallbackRoleColor = { bg: 'var(--surface-subtle)', color: 'var(--text-secondary)' }

  function initials(name: string) {
    return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
  }

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={openAdd}>+ {t('team.add')}</Button>
      </div>

      {project.team.length === 0 ? (
        <div className="text-center py-10 text-[var(--text-tertiary)]">
          <div className="text-3xl mb-2">👥</div>
          <p className="text-sm">{t('team.noMembers')}</p>
          <Button size="sm" className="mt-3" variant="secondary" onClick={openAdd}>{t('team.add')}</Button>
        </div>
      ) : (
        <div className="space-y-1">
          {project.team.map((member) => {
            const rc = roleColors[member.role] ?? fallbackRoleColor
            return (
              <div
                key={member.id}
                className="flex items-center gap-4 p-3 rounded-[var(--radius-lg)] hover:bg-[var(--surface-subtle)] group transition-colors"
              >
                <div className="w-9 h-9 rounded-[var(--radius-pill)] bg-[var(--surface-subtle)] flex items-center justify-center text-sm font-semibold text-[var(--text-secondary)] shrink-0">
                  {initials(member.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{member.name}</p>
                  {member.email && (
                    <p className="text-xs text-[var(--text-tertiary)] truncate">{member.email}</p>
                  )}
                </div>
                <span className="text-xs font-medium px-2 py-0.5 rounded-[var(--radius-pill)]" style={{ background: rc.bg, color: rc.color }}>
                  {member.role}
                </span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(member)} className="text-[var(--text-tertiary)] hover:text-[var(--oe-primary)] text-xs px-1">✎</button>
                  <button onClick={() => removeTeamMember(project.id, member.id)} className="text-[var(--text-tertiary)] hover:text-[var(--color-danger-text)] text-xs px-1">✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={open}
        title={editId ? 'Editar membro' : t('team.add')}
        onClose={() => setOpen(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>{t('actions.cancel')}</Button>
            <Button onClick={handleSave} disabled={!pendingOwner[0]}>{t('actions.save')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('team.name')} required>
            <OwnersField
              owners={pendingOwner}
              onChange={setPendingOwner}
              teamMembers={directoryAsTeam}
              contacts={projectContacts}
              max={1}
            />
          </Field>
          <Field label={t('team.role')}>
            <div className="flex flex-wrap gap-2 mt-1">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, role: r }))}
                  className={`text-xs px-3 py-1.5 rounded-[var(--radius-pill)] border transition-colors ${
                    form.role === r
                      ? 'bg-[var(--oe-primary)] text-white border-[var(--oe-primary)]'
                      : 'bg-[var(--surface-card)] text-[var(--text-secondary)] border-[var(--border-strong)] hover:border-[var(--oe-primary-mid)]'
                  }`}
                >
                  {r}
                </button>
              ))}
              {!ROLES.includes(form.role) && (
                <Input
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  placeholder="Papel personalizado"
                  className="mt-1"
                />
              )}
            </div>
            <Input
              value={ROLES.includes(form.role) ? '' : form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              placeholder="Ou escreva um papel..."
              className="mt-2"
            />
          </Field>
          {pendingOwner[0]?.type === 'text' && (
            <Field label={t('team.email')}>
              <Input type="email" value={form.email ?? ''} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@empresa.com" />
            </Field>
          )}
        </div>
      </Modal>
    </>
  )
}
