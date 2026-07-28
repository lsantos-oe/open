import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Field } from '@/components/ui/Input'
import type { UserRole } from '@/types/database'

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'U'
}

export default function UsersPage() {
  const { teamDirectory, invitedUsers, inviteUser, deleteInvite, updateProfileRole, setProfileActive } = useAppStore()
  const { user, profile } = useAuthStore()

  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<UserRole>('member')

  const isAdmin = profile?.role === 'admin'

  function openInvite() {
    setInviteEmail(''); setInviteName(''); setInviteRole('member')
    setShowInvite(true)
  }

  function handleInvite() {
    if (!inviteEmail.trim()) return
    inviteUser({ email: inviteEmail.trim(), name: inviteName.trim() || undefined, role: inviteRole })
    setShowInvite(false)
  }

  if (!isAdmin) {
    return (
      <div className="p-8 max-w-screen-xl mx-auto">
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Apenas administradores podem ver esta página.
        </p>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-screen-xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Usuários</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {teamDirectory.length} com acesso · {invitedUsers.length} convite(s) pendente(s)
          </p>
        </div>
        <Button onClick={openInvite}>+ Convidar usuário</Button>
      </div>

      {/* Active users */}
      <div className="rounded-[var(--radius-lg)] border overflow-hidden mb-6" style={{ borderColor: 'var(--border-default)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--surface-subtle)' }}>
              <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Nome</th>
              <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>E-mail</th>
              <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Papel</th>
              <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {teamDirectory.map((p) => {
              const isSelf = p.id === user?.id
              return (
                <tr key={p.id} className="border-t" style={{ borderColor: 'var(--border-default)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                    <div className="flex items-center gap-2">
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt={p.name ?? ''} className="w-6 h-6 rounded-[var(--radius-pill)] object-cover shrink-0" />
                      ) : (
                        <span
                          className="w-6 h-6 rounded-[var(--radius-pill)] flex items-center justify-center text-white text-[10px] font-semibold shrink-0"
                          style={{ background: 'var(--oe-primary)' }}
                        >
                          {getInitials(p.name ?? p.email ?? '')}
                        </span>
                      )}
                      {p.name ?? '—'}
                      {isSelf && <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>(você)</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{p.email}</td>
                  <td className="px-4 py-3">
                    <Select
                      value={p.role}
                      disabled={isSelf}
                      onChange={(e) => updateProfileRole(p.id, e.target.value as UserRole)}
                      className="w-auto"
                    >
                      <option value="member">Membro</option>
                      <option value="admin">Admin</option>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={p.active ? 'green' : 'red'}>{p.active ? 'Ativo' : 'Revogado'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setProfileActive(p.id, !p.active)}
                      disabled={isSelf}
                      className="text-xs disabled:opacity-40"
                      style={{ color: p.active ? 'var(--color-danger-text)' : 'var(--color-success-text)' }}
                    >
                      {p.active ? 'Revogar acesso' : 'Reativar'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pending invites */}
      {invitedUsers.length > 0 && (
        <div className="rounded-[var(--radius-lg)] border overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
          <div className="px-4 py-2" style={{ background: 'var(--surface-subtle)' }}>
            <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Convites pendentes</span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {invitedUsers.map((inv) => (
                <tr key={inv.id} className="border-t" style={{ borderColor: 'var(--border-default)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{inv.name || '—'}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{inv.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={inv.role === 'admin' ? 'primary' : 'gray'}>{inv.role === 'admin' ? 'Admin' : 'Membro'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => deleteInvite(inv.id)} className="text-xs" style={{ color: 'var(--color-danger-text)' }}>
                      Cancelar convite
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={showInvite}
        title="Convidar usuário"
        onClose={() => setShowInvite(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowInvite(false)}>Cancelar</Button>
            <Button onClick={handleInvite} disabled={!inviteEmail.trim()}>Convidar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="E-mail" required>
            <Input autoFocus type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="nome@empresa.com" />
          </Field>
          <Field label="Nome">
            <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Nome completo" />
          </Field>
          <Field label="Papel">
            <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as UserRole)}>
              <option value="member">Membro</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            A pessoa só ganha acesso de fato ao entrar com Google usando esse e-mail — o convite só reserva o nome e o papel com antecedência.
          </p>
        </div>
      </Modal>
    </div>
  )
}
