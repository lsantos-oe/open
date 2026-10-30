import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'
import { EmptyState } from '@/components/ui/EmptyState'
import { SearchInput } from '@/components/ui/SearchInput'
import { FolderIcon } from '@/components/ui/icons'
import { NewGroupModal } from './GroupModals'
import { isUnderMinimum } from '@/utils/clientGroups'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Aba "Grupos" da Carteira: um grupo reúne 2 ou mais clientes (ex.: empresas do mesmo conglomerado). */
export function GroupsTab({ newOpen, onNew, onNewClose }: { newOpen: boolean; onNew: () => void; onNewClose: () => void }) {
  const navigate = useNavigate()
  const groups = useAppStore((s) => s.clientGroups)
  const clients = useAppStore((s) => s.clients)
  const projects = useAppStore((s) => s.projects)
  const incidents = useAppStore((s) => s.incidents)
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const q = fold(query.trim())
    return groups
      .map((g) => {
        const members = g.clientIds.map((id) => clients.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c)
        return {
          group: g,
          members,
          projectCount: projects.filter((p) => !p.archived && p.clientIds.some((c) => g.clientIds.includes(c))).length,
          incidentCount: incidents.filter((i) => i.status !== 'resolved' && i.status !== 'closed' && i.clientIds.some((c) => g.clientIds.includes(c))).length,
        }
      })
      .filter((r) => !q || fold(r.group.name).includes(q) || r.members.some((m) => fold(m.name).includes(q)))
      .sort((a, b) => a.group.name.localeCompare(b.group.name, 'pt-BR'))
  }, [groups, clients, projects, incidents, query])

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        {groups.length > 0 && <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar grupo ou cliente…" aria-label="Buscar grupo" />}
        <div className="flex-1" />
        <Button size="sm" onClick={onNew}>+ Grupo</Button>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={<FolderIcon className="w-9 h-9" />}
          title="Nenhum grupo de clientes ainda"
          description="Reúna 2 ou mais clientes — por exemplo, empresas do mesmo conglomerado — para ver contatos, projetos, incidentes e documentação de todos num lugar só."
          action={{ label: 'Criar o primeiro grupo', onClick: onNew }}
        />
      ) : rows.length === 0 ? (
        <EmptyState icon={<FolderIcon className="w-9 h-9" />} title="Nenhum grupo encontrado" />
      ) : (
        <div className="oe-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--surface-subtle)' }}>
                {['Grupo', 'Clientes', 'Contatos diretos', 'Projetos', 'Incidentes abertos'].map((h) => (
                  <th key={h} className="text-left px-4 py-2 font-medium text-[13px]" style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-default)' }}>
              {rows.map(({ group, members, projectCount, incidentCount }) => (
                <tr
                  key={group.id}
                  tabIndex={0}
                  onClick={() => navigate(`/wallet/groups/${group.id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/wallet/groups/${group.id}`) }}
                  className="cursor-pointer transition-colors hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] outline-none"
                >
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {group.name}
                    {isUnderMinimum(group) && (
                      <Badge variant="yellow" size="sm" className="ml-2" title="Um grupo precisa de 2 ou mais clientes">menos de 2 clientes</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)', maxWidth: 360 }}>
                    <span className="block truncate" title={members.map((m) => m.name).join(', ')}>
                      <strong style={{ color: 'var(--text-primary)' }}>{group.clientIds.length}</strong>
                      {members.length > 0 && <> · {members.map((m) => m.name).join(', ')}</>}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{group.contactIds.length}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{projectCount}</td>
                  <td className="px-4 py-3" style={{ color: incidentCount ? 'var(--color-warning-text)' : 'var(--text-secondary)' }}>{incidentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewGroupModal open={newOpen} onClose={onNewClose} onCreated={(id) => navigate(`/wallet/groups/${id}`)} />
    </div>
  )
}
