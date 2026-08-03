import { useMemo, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Field } from '@/components/ui/Input'
import { StatusDot } from '@/components/ui/StatusDot'
import { AvatarStack } from '@/components/ui/AvatarStack'
import { SearchInput } from '@/components/ui/SearchInput'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { EmptyState } from '@/components/ui/EmptyState'
import type { UserRole } from '@/types/database'

/** Full users management UI (active users table + pending invites + invite modal),
 *  reused as-is by the standalone /users route and by the "Usuários" tab in Configurações. */
export function UsersManagementPanel() {
  const { teamDirectory, invitedUsers, inviteUser, deleteInvite, updateProfileRole, setProfileActive } = useAppStore()
  const { user } = useAuthStore()

  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<UserRole>('member')

  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'' | UserRole>('')
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'revoked'>('')

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    return teamDirectory.filter((p) => {
      if (roleFilter && p.role !== roleFilter) return false
      if (statusFilter === 'active' && !p.active) return false
      if (statusFilter === 'revoked' && p.active) return false
      if (!q) return true
      return (p.name ?? '').toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q)
    })
  }, [teamDirectory, query, roleFilter, statusFilter])

  function openInvite() {
    setInviteEmail(''); setInviteName(''); setInviteRole('member')
    setShowInvite(true)
  }

  function handleInvite() {
    if (!inviteEmail.trim()) return
    inviteUser({ email: inviteEmail.trim(), name: inviteName.trim() || undefined, role: inviteRole })
    setShowInvite(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Usuários</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {teamDirectory.length} com acesso · {invitedUsers.length} convite(s) pendente(s)
          </p>
        </div>
        <Button onClick={openInvite}>+ Convidar usuário</Button>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome ou e-mail..."
        />
        <div className="flex-1" />
        <FilterMenu
          activeCount={[roleFilter, statusFilter].filter(Boolean).length}
          onClear={() => { setRoleFilter(''); setStatusFilter('') }}
        >
          <Field label="Papel">
            <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as '' | UserRole)}>
              <option value="">Todos os papéis</option>
              <option value="member">Membro</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | 'active' | 'revoked')}>
              <option value="">Todos os status</option>
              <option value="active">Ativo</option>
              <option value="revoked">Revogado</option>
            </Select>
          </Field>
        </FilterMenu>
      </div>

      {/* Active users */}
      {filteredUsers.length === 0 ? (
        <EmptyState
          icon="👥"
          title={teamDirectory.length === 0 ? 'Nenhum usuário ainda.' : 'Nenhum usuário encontrado com esses filtros.'}
        />
      ) : (
      <div className="rounded-[var(--radius-lg)] border overflow-hidden mb-6" style={{ borderColor: 'var(--border-default)' }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr style={{ background: 'var(--surface-subtle)' }}>
              <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Nome</th>
              <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>E-mail</th>
              <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Papel</th>
              <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border-default)' }}>
            {filteredUsers.map((p) => {
              const isSelf = p.id === user?.id
              return (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                    <div className="flex items-center gap-2">
                      <AvatarStack people={[{ name: p.name ?? p.email ?? '', avatarUrl: p.avatar_url ?? undefined }]} size={24} />
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
                    >
                      <option value="member">Membro</option>
                      <option value="admin">Admin</option>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <StatusDot color={p.active ? 'var(--color-success-text)' : 'var(--color-danger-text)'} label={p.active ? 'Ativo' : 'Revogado'} />
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
      )}

      {/* Pending invites */}
      {invitedUsers.length > 0 && (
        <div className="rounded-[var(--radius-lg)] border overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
          <div className="px-4 py-2" style={{ background: 'var(--surface-subtle)' }}>
            <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Convites pendentes</span>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y" style={{ borderColor: 'var(--border-default)' }}>
              {invitedUsers.map((inv) => (
                <tr key={inv.id}>
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
            <Button onClick={handleInvite} disabled={!inviteEmail.trim()}>É basicamente isso</Button>
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

export default function UsersPage() {
  const { profile } = useAuthStore()
  const isAdmin = profile?.role === 'admin'

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
      <UsersManagementPanel />
    </div>
  )
}
