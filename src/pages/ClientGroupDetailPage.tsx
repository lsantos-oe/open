import { useEffect, useMemo, useState } from 'react'
import { useRouteEntityId } from '@/hooks/useRouteEntityId'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { AnchorNav } from '@/components/ui/AnchorNav'
import { EntityCodeLink } from '@/components/ui/CodeBadge'
import { StatusDot } from '@/components/ui/StatusDot'
import DocumentationPanel from '@/components/docs/DocumentationPanel'
import { AddClientsModal, GroupContactModal } from '@/components/clients/GroupModals'
import { useEntryOpenerStore } from '@/stores/useEntryOpenerStore'
import { entryClientIds } from '@/utils/entryClients'
import { groupContacts, groupNameTaken, isUnderMinimum, MIN_GROUP_CLIENTS, normalizeGroupName } from '@/utils/clientGroups'
import { findCountry } from '@/data/countries'
import type { IncidentStatus, ProjectStatus } from '@/types'

type Section = 'members' | 'contacts' | 'projects' | 'incidents' | 'tasks' | 'notes' | 'docs'

const PROJECT_STATUS: Record<ProjectStatus, { label: string; color: string }> = {
  backlog: { label: 'Backlog', color: 'var(--text-tertiary)' },
  planning: { label: 'Planejamento', color: 'var(--color-info-text)' },
  in_progress: { label: 'Em andamento', color: 'var(--color-warning-text)' },
  done: { label: 'Concluído', color: 'var(--color-success-text)' },
}
const INCIDENT_STATUS: Record<IncidentStatus, { label: string; color: string }> = {
  open: { label: 'Aberto', color: 'var(--text-tertiary)' },
  in_progress: { label: 'Em andamento', color: 'var(--color-info-text)' },
  waiting_on_client: { label: 'Aguardando cliente', color: 'var(--color-warning-text)' },
  resolved: { label: 'Resolvido', color: 'var(--color-success-text)' },
  closed: { label: 'Fechado', color: 'var(--text-disabled)' },
}

const chip = (text: string, key?: string) => <Badge key={key ?? text} size="sm">{text}</Badge>

const Empty = ({ children }: { children: string }) => <p className="text-sm py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>{children}</p>

/** Página do grupo de clientes: um compilado do que é dos clientes membros — contatos, projetos, incidentes,
 *  tarefas, notas e documentação. O que é adicionado aqui é só o que é do grupo (clientes e contatos). */
export default function ClientGroupDetailPage() {
  const { t } = useTranslation()
  const { id, pending } = useRouteEntityId('client_groups')
  const navigate = useNavigate()
  const openEntry = useEntryOpenerStore((s) => s.open)
  const { clientGroups, clients, projects, incidents, standaloneTasks, contacts, settings,
    renameClientGroup, deleteClientGroup, removeClientFromGroup, removeContactFromGroup, loadClientGroups } = useAppStore()
  const group = clientGroups.find((g) => g.id === id)
  const allowMultiple = settings.allowMultipleClientGroups ?? false

  const [tab, setTab] = useState<Section>('members')
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [addClients, setAddClients] = useState(false)
  const [addContact, setAddContact] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [removingClient, setRemovingClient] = useState<string | null>(null)

  // Outra pessoa pode ter mexido no grupo: atualiza ao abrir.
  useEffect(() => { void loadClientGroups() }, [loadClientGroups])

  const memberIds = useMemo(() => new Set(group?.clientIds ?? []), [group])
  const members = useMemo(() => (group?.clientIds ?? []).map((cid) => clients.find((c) => c.id === cid)).filter((c): c is NonNullable<typeof c> => !!c)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [group, clients])
  const nameOf = (cid: string) => clients.find((c) => c.id === cid)?.name ?? '—'

  const contactRows = useMemo(() => (group ? groupContacts(group, contacts) : []), [group, contacts])
  const groupProjects = useMemo(() => projects.filter((p) => !p.archived && p.clientIds.some((c) => memberIds.has(c))), [projects, memberIds])
  const groupIncidents = useMemo(() => incidents.filter((i) => i.clientIds.some((c) => memberIds.has(c)))
    .sort((a, b) => Number(a.status === 'resolved' || a.status === 'closed') - Number(b.status === 'resolved' || b.status === 'closed') || b.createdAt.localeCompare(a.createdAt)), [incidents, memberIds])
  const groupTasks = useMemo(() => standaloneTasks.filter((t) => t.status !== 'done' && entryClientIds(t).some((c) => memberIds.has(c))), [standaloneTasks, memberIds])
  const notes = members.filter((m) => m.notes?.trim())

  if (!group && pending) return null
  if (!group) {
    return (
      <div className="p-8">
        <Link to="/wallet" className="text-sm" style={{ color: 'var(--text-tertiary)' }}>← Carteira</Link>
        <p className="mt-6 text-sm" style={{ color: 'var(--text-secondary)' }}>Grupo não encontrado — ele pode ter sido desfeito.</p>
      </div>
    )
  }

  async function saveName() {
    const name = normalizeGroupName(nameDraft)
    if (!name || name === group!.name) { setRenaming(false); return }
    if (groupNameTaken(clientGroups, name, group!.id)) return
    if (await renameClientGroup(group!.id, name)) setRenaming(false)
  }
  const nameTaken = renaming && !!normalizeGroupName(nameDraft) && groupNameTaken(clientGroups, nameDraft, group.id)

  const TABS: { id: Section; label: string }[] = [
    { id: 'members', label: `Clientes (${group.clientIds.length})` },
    { id: 'contacts', label: `Contatos (${contactRows.length})` },
    { id: 'projects', label: `Projetos (${groupProjects.length})` },
    { id: 'incidents', label: `Incidentes (${groupIncidents.length})` },
    { id: 'tasks', label: `Tarefas (${groupTasks.length})` },
    { id: 'notes', label: 'Notas' },
    { id: 'docs', label: 'Documentação' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-1">
        <div className="flex items-center gap-3 min-w-0">
          {renaming ? (
            <div className="flex items-center gap-2">
              <Input autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void saveName(); if (e.key === 'Escape') setRenaming(false) }} aria-label="Nome do grupo" style={{ width: 280 }} />
              <Button size="sm" onClick={() => void saveName()} disabled={nameTaken}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>Cancelar</Button>
              {nameTaken && <span className="text-xs" role="alert" style={{ color: 'var(--color-danger-text)' }}>Já existe um grupo com esse nome.</span>}
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{group.name}</h1>
              <EntityCodeLink table="client_groups" id={group.id} />
              <button className="text-xs shrink-0" style={{ color: 'var(--text-tertiary)' }} onClick={() => { setNameDraft(group.name); setRenaming(true) }}>renomear</button>
            </>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(true)}>Desfazer grupo</Button>
      </div>

      {isUnderMinimum(group) && (
        <div role="status" className="mx-6 mt-4 px-4 py-3 text-[13px] rounded-[var(--radius-md)]" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' }}>
          Este grupo tem {group.clientIds.length === 0 ? 'nenhum cliente' : 'só 1 cliente'}. Um grupo precisa de pelo menos {MIN_GROUP_CLIENTS} — adicione outro cliente ou desfaça o grupo.
        </div>
      )}

      <div className="px-6 pt-3"><AnchorNav items={TABS} onNavigate={(s) => setTab(s as Section)} active={tab} /></div>

      <div className="p-6">
        {tab === 'members' && <div className="max-w-5xl">
          <div className="flex justify-end mb-3"><Button size="sm" onClick={() => setAddClients(true)}>{t('addBtn.client')}</Button></div>
          {members.length === 0 ? <Empty>Nenhum cliente neste grupo.</Empty> : (
            <ul className="divide-y" style={{ borderColor: 'var(--border-default)' }}>
              {members.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <Link to={`/wallet/${c.id}`} className="text-sm font-medium hover:underline" style={{ color: 'var(--text-primary)' }}>{c.name}</Link>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{findCountry(c.country)?.name ?? 'Sem país'} · {c.owners.map((o) => o.name).join(', ') || 'Sem owner'}</p>
                  </div>
                  {removingClient === c.id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs mr-1" style={{ color: 'var(--text-secondary)' }}>Tirar do grupo?</span>
                      <Button variant="danger" size="xs" onClick={async () => { setRemovingClient(null); await removeClientFromGroup(group.id, c.id) }}>Sim</Button>
                      <Button variant="ghost" size="xs" onClick={() => setRemovingClient(null)}>Não</Button>
                    </div>
                  ) : (
                    <Button variant="ghost" size="xs" onClick={() => setRemovingClient(c.id)} aria-label={`Tirar ${c.name} do grupo`}>Tirar do grupo</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {allowMultiple && <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>Os clientes podem participar de mais de um grupo (opção em Configurações).</p>}
        </div>}

        {tab === 'contacts' && <div className="max-w-5xl">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Os contatos do grupo ficam ligados a todos os clientes dele. Os demais vêm dos clientes membros.
            </p>
            <Button size="sm" onClick={() => setAddContact(true)} disabled={group.clientIds.length === 0}>+ Contato do grupo</Button>
          </div>
          {contactRows.length === 0 ? <Empty>Nenhum contato ainda.</Empty> : (
            <ul className="divide-y" style={{ borderColor: 'var(--border-default)' }}>
              {contactRows.map(({ contact: c, direct, clientIds }) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {c.name} {c.role && <span className="font-normal text-xs" style={{ color: 'var(--text-tertiary)' }}>· {c.role}</span>}
                    </p>
                    {(c.email || c.phone) && <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{[c.email, c.phone].filter(Boolean).join(' · ')}</p>}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {direct
                        ? chip('Todos os clientes do grupo', 'all')
                        : clientIds.map((cid) => chip(nameOf(cid), cid))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {direct && (
                      <Badge variant="violet" size="sm">Direto no grupo</Badge>
                    )}
                    {direct && <Button variant="ghost" size="xs" onClick={() => void removeContactFromGroup(group.id, c.id)} aria-label={`Tirar ${c.name} do grupo`}>Tirar do grupo</Button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>}

        {tab === 'projects' && <div className="max-w-5xl">
          {groupProjects.length === 0 ? <Empty>Nenhum projeto dos clientes do grupo.</Empty> : (
            <ul className="divide-y" style={{ borderColor: 'var(--border-default)' }}>
              {groupProjects.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <Link to={`/projects/${p.id}`} className="text-sm font-medium hover:underline" style={{ color: 'var(--text-primary)' }}>{p.name}</Link>
                    <div className="flex flex-wrap gap-1.5 mt-1">{p.clientIds.filter((c) => memberIds.has(c)).map((c) => chip(nameOf(c), c))}</div>
                  </div>
                  <StatusDot color={PROJECT_STATUS[p.status].color} label={PROJECT_STATUS[p.status].label} />
                </li>
              ))}
            </ul>
          )}
        </div>}

        {tab === 'incidents' && <div className="max-w-5xl">
          {groupIncidents.length === 0 ? <Empty>Nenhum incidente dos clientes do grupo.</Empty> : (
            <ul className="divide-y" style={{ borderColor: 'var(--border-default)' }}>
              {groupIncidents.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <Link to={`/support/${i.id}`} className="text-sm font-medium hover:underline" style={{ color: 'var(--text-primary)' }}>{i.title}</Link>
                    <div className="flex flex-wrap gap-1.5 mt-1">{i.clientIds.filter((c) => memberIds.has(c)).map((c) => chip(nameOf(c), c))}</div>
                  </div>
                  <StatusDot color={INCIDENT_STATUS[i.status].color} label={INCIDENT_STATUS[i.status].label} />
                </li>
              ))}
            </ul>
          )}
        </div>}

        {tab === 'tasks' && <div className="max-w-5xl">
          {groupTasks.length === 0 ? <Empty>Nenhuma tarefa avulsa em aberto dos clientes do grupo.</Empty> : (
            <ul className="divide-y" style={{ borderColor: 'var(--border-default)' }}>
              {groupTasks.map((t) => (
                <li key={t.id} className="px-4 py-2.5">
                  <button className="text-sm font-medium hover:underline text-left" style={{ color: 'var(--text-primary)' }} onClick={() => openEntry(t.id)}>{t.name}</button>
                  <div className="flex flex-wrap gap-1.5 mt-1">{entryClientIds(t).filter((c) => memberIds.has(c)).map((c) => chip(nameOf(c), c))}</div>
                </li>
              ))}
            </ul>
          )}
        </div>}

        {tab === 'notes' && <div className="max-w-5xl">
          {notes.length === 0 ? <Empty>Nenhum cliente do grupo tem notas.</Empty> : (
            <div className="space-y-4">
              {notes.map((c) => (
                <div key={c.id}>
                  <p className="text-[11.5px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>
                    {c.name} <button className="normal-case font-normal underline ml-2" style={{ color: 'var(--text-secondary)' }} onClick={() => navigate(`/wallet/${c.id}`)}>editar no cliente</button>
                  </p>
                  <div className="text-[13px] whitespace-pre-wrap break-words" style={{ color: 'var(--text-secondary)' }}>{c.notes}</div>
                </div>
              ))}
            </div>
          )}
        </div>}

        {tab === 'docs' && <div className="max-w-5xl">
          <DocumentationPanel scope={{ kind: 'group', id: group.id }} />
        </div>}
      </div>

      <AddClientsModal open={addClients} onClose={() => setAddClients(false)} group={group} />
      <GroupContactModal open={addContact} onClose={() => setAddContact(false)} group={group} />
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Desfazer o grupo?"
        size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
          <Button variant="danger" onClick={async () => { if (await deleteClientGroup(group.id)) navigate('/wallet?tab=groups') }}>Desfazer grupo</Button>
        </>}
      >
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Os clientes, projetos e documentos continuam como estão. Os contatos que foram colocados direto no grupo deixam de estar ligados aos clientes pelo grupo — os vínculos que já existiam antes ficam.
        </p>
      </Modal>
    </div>
  )
}
