import { useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'
import { ClientContact, ClientCsAssignment, ClientStatus, EntryOwner, TeamMember } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input, Field, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import CountrySelect from '@/components/ui/CountrySelect'
import OwnersField from '@/components/plan/OwnersField'
import { findCountry } from '@/data/countries'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const STATUS_LABEL: Record<ClientStatus, string> = {
  pre_venda: 'Pré-venda',
  implantacao: 'Implantação',
  sustentacao_novos_projetos: 'Sustentação / Novos projetos',
}

const STATUSES: ClientStatus[] = ['pre_venda', 'implantacao', 'sustentacao_novos_projetos']

type Tab = 'overview' | 'contacts' | 'csHistory' | 'timeline'

const EVENT_ICONS: Record<string, string> = {
  project_created: '🚀', status_changed: '🔄', baseline_set: '📌', risk_added: '⚠️',
  delay_logged: '⏱️', member_added: '👤', meeting_held: '📅', open_point_resolved: '✅', note: '📝',
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { clients, projects, teamDirectory, updateClient, deleteClient, addClientContact, updateClientContact, removeClientContact, addCsAssignment, removeCsAssignment } = useAppStore()
  const [tab, setTab] = useState<Tab>('overview')

  const client = clients.find((c) => c.id === id)

  // ── Overview local state ──
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState(client?.notes ?? '')
  const [editingLink, setEditingLink] = useState(false)
  const [linkDraft, setLinkDraft] = useState(client?.ploomesLink ?? '')
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)

  // ── Contact modal state ──
  const [showContactModal, setShowContactModal] = useState(false)
  const [editContact, setEditContact] = useState<ClientContact | null>(null)
  const [contactForm, setContactForm] = useState<Omit<ClientContact, 'id'>>({ name: '', role: '', email: '', phone: '' })

  // ── CS assignment modal state ──
  const [showCsModal, setShowCsModal] = useState(false)
  const [csMode, setCsMode] = useState<'directory' | 'text'>('directory')
  const [csUserId, setCsUserId] = useState('')
  const [csName, setCsName] = useState('')
  const [csDate, setCsDate] = useState(new Date().toISOString().slice(0, 10))
  const [csNote, setCsNote] = useState('')

  const directoryAsTeam: TeamMember[] = useMemo(
    () => teamDirectory.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name ?? p.email ?? '', role: '', email: p.email ?? undefined, userId: p.id })),
    [teamDirectory],
  )

  if (!client) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Cliente não encontrado.</p>
        <Link to="/wallet" className="text-sm" style={{ color: 'var(--oe-primary)' }}>← Voltar pra Carteira</Link>
      </div>
    )
  }

  const clientProjects = projects.filter((p) => p.clientId === client.id)
  const sortedCsHistory = [...client.csHistory].sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))
  const currentCs = sortedCsHistory[0]

  const timelineEvents = clientProjects
    .flatMap((p) => (p.history ?? []).map((h) => ({ ...h, projectName: p.name, projectId: p.id })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  function saveNotes() {
    updateClient(client!.id, { notes: notesDraft || undefined })
    setEditingNotes(false)
  }

  function saveLink() {
    updateClient(client!.id, { ploomesLink: linkDraft || undefined })
    setEditingLink(false)
  }

  function openAddContact() {
    setEditContact(null)
    setContactForm({ name: '', role: '', email: '', phone: '' })
    setShowContactModal(true)
  }

  function openEditContact(c: ClientContact) {
    setEditContact(c)
    setContactForm({ name: c.name, role: c.role ?? '', email: c.email ?? '', phone: c.phone ?? '' })
    setShowContactModal(true)
  }

  function saveContact() {
    if (!contactForm.name.trim()) return
    const payload = {
      name: contactForm.name.trim(),
      role: contactForm.role || undefined,
      email: contactForm.email || undefined,
      phone: contactForm.phone || undefined,
    }
    if (editContact) {
      updateClientContact(client!.id, editContact.id, payload)
    } else {
      addClientContact(client!.id, payload)
    }
    setShowContactModal(false)
  }

  function openAddCs() {
    setCsMode('directory'); setCsUserId(''); setCsName(''); setCsDate(new Date().toISOString().slice(0, 10)); setCsNote('')
    setShowCsModal(true)
  }

  function saveCs() {
    let owner: EntryOwner
    if (csMode === 'directory') {
      const profile = teamDirectory.filter((p) => p.active).find((p) => p.id === csUserId)
      if (!profile) return
      owner = { id: crypto.randomUUID(), type: 'member', memberId: profile.id, name: profile.name ?? profile.email ?? '' }
    } else {
      if (!csName.trim()) return
      owner = { id: crypto.randomUUID(), type: 'text', name: csName.trim() }
    }
    addCsAssignment(client!.id, { owner, assignedAt: csDate, note: csNote || undefined })
    setShowCsModal(false)
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'contacts', label: `Contatos${client.contacts.length ? ` (${client.contacts.length})` : ''}` },
    { id: 'csHistory', label: 'Histórico de CS' },
    { id: 'timeline', label: 'Timeline' },
  ]

  return (
    <div>
      {/* Topbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/wallet" className="text-sm shrink-0" style={{ color: 'var(--text-tertiary)' }}>← Carteira</Link>
          <h1 className="text-base font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{client.name}</h1>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setShowArchiveConfirm(true)}>Excluir cliente</Button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 px-6 border-b" style={{ borderColor: 'var(--border-default)' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
            style={{
              borderBottomColor: tab === t.id ? 'var(--oe-primary)' : 'transparent',
              color: tab === t.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-6 max-w-3xl">
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Field label="País">
                <CountrySelect value={client.country} onChange={(code) => updateClient(client.id, { country: code })} />
              </Field>
              <Field label="Status">
                <Select value={client.status} onChange={(e) => updateClient(client.id, { status: e.target.value as ClientStatus })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </Select>
              </Field>
            </div>

            <Field label="Owner">
              <OwnersField owners={client.owners} onChange={(owners) => updateClient(client.id, { owners })} teamMembers={directoryAsTeam} />
            </Field>

            <Field label="Link no Ploomes">
              {editingLink ? (
                <div className="flex gap-2">
                  <Input autoFocus value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} placeholder="https://..." />
                  <Button size="sm" onClick={saveLink}>Salvar</Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditingLink(false)}>Cancelar</Button>
                </div>
              ) : client.ploomesLink ? (
                <div className="flex items-center gap-2">
                  <a href={client.ploomesLink} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="secondary">Abrir no Ploomes ↗</Button>
                  </a>
                  <button onClick={() => { setLinkDraft(client.ploomesLink ?? ''); setEditingLink(true) }} className="text-xs" style={{ color: 'var(--text-tertiary)' }}>editar</button>
                </div>
              ) : (
                <button onClick={() => { setLinkDraft(''); setEditingLink(true) }} className="text-sm" style={{ color: 'var(--oe-primary)' }}>+ Adicionar link</button>
              )}
            </Field>

            <Field label="Notas">
              {editingNotes ? (
                <div>
                  <textarea
                    autoFocus
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    onBlur={saveNotes}
                    rows={6}
                    className="block w-full rounded-[var(--radius-md)] border px-3 py-2 text-sm focus:outline-none focus:ring-1"
                    style={{ borderColor: 'var(--border-default)', background: 'var(--surface-input)', color: 'var(--text-primary)', resize: 'none' }}
                  />
                </div>
              ) : (
                <div
                  onClick={() => { setNotesDraft(client.notes ?? ''); setEditingNotes(true) }}
                  className="p-3 rounded-[var(--radius-lg)] text-sm whitespace-pre-wrap cursor-text min-h-[80px]"
                  style={{ background: 'var(--surface-subtle)', color: client.notes ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}
                >
                  {client.notes || 'Clique para adicionar notas...'}
                </div>
              )}
            </Field>

            <Field label="Projetos vinculados">
              {clientProjects.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Nenhum projeto vinculado a este cliente ainda.</p>
              ) : (
                <div className="space-y-1">
                  {clientProjects.map((p) => (
                    <Link key={p.id} to={`/projects/${p.id}`} className="block text-sm py-1" style={{ color: 'var(--oe-primary)' }}>
                      {p.name}
                    </Link>
                  ))}
                </div>
              )}
            </Field>
          </div>
        )}

        {tab === 'contacts' && (
          <div>
            <div className="flex justify-end mb-3">
              <Button size="sm" onClick={openAddContact}>+ Contato</Button>
            </div>
            {client.contacts.length === 0 ? (
              <p className="text-sm text-center py-10" style={{ color: 'var(--text-tertiary)' }}>Nenhum contato cadastrado.</p>
            ) : (
              <div className="space-y-2">
                {client.contacts.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-[var(--radius-lg)] group" style={{ background: 'var(--surface-subtle)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{c.name} {c.role && <span className="font-normal" style={{ color: 'var(--text-tertiary)' }}>· {c.role}</span>}</p>
                      {(c.email || c.phone) && (
                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{[c.email, c.phone].filter(Boolean).join(' · ')}</p>
                      )}
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEditContact(c)} className="text-xs" style={{ color: 'var(--text-tertiary)' }}>editar</button>
                      <button onClick={() => removeClientContact(client.id, c.id)} className="text-xs" style={{ color: 'var(--color-danger-text)' }}>remover</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'csHistory' && (
          <div>
            <div className="flex justify-end mb-3">
              <Button size="sm" onClick={openAddCs}>+ Atribuir CS</Button>
            </div>
            {sortedCsHistory.length === 0 ? (
              <p className="text-sm text-center py-10" style={{ color: 'var(--text-tertiary)' }}>Nenhum CS atribuído ainda.</p>
            ) : (
              <div className="space-y-2">
                {sortedCsHistory.map((a, i) => (
                  <div key={a.id} className="flex items-center gap-3 p-3 rounded-[var(--radius-lg)] group" style={{ background: i === 0 ? 'var(--oe-primary-light)' : 'var(--surface-subtle)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {a.owner.name} {i === 0 && <span className="text-xs font-normal" style={{ color: 'var(--oe-primary)' }}>· atual</span>}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>desde {a.assignedAt}{a.note ? ` · ${a.note}` : ''}</p>
                    </div>
                    <button onClick={() => removeCsAssignment(client.id, a.id)} className="text-xs opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--color-danger-text)' }}>remover</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'timeline' && (
          <div>
            {timelineEvents.length === 0 ? (
              <p className="text-sm text-center py-10" style={{ color: 'var(--text-tertiary)' }}>Nenhum evento ainda — a timeline agrega o histórico dos projetos vinculados.</p>
            ) : (
              <div className="relative pl-10">
                <div className="absolute left-4 top-0 bottom-0 w-px" style={{ background: 'var(--border-default)' }} />
                <div className="space-y-3">
                  {timelineEvents.map((e) => (
                    <div key={e.id} className="relative">
                      <div className="absolute -left-10 w-8 h-8 rounded-[var(--radius-pill)] flex items-center justify-center text-base" style={{ background: 'var(--surface-card)', border: '2px solid var(--border-default)' }}>
                        {EVENT_ICONS[e.event] ?? '•'}
                      </div>
                      <div className="p-3 rounded-[var(--radius-lg)]" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-default)' }}>
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <Link to={`/projects/${e.projectId}`} className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-subtle)', color: 'var(--oe-primary)' }}>
                            {e.projectName}
                          </Link>
                          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{e.title}</span>
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true, locale: ptBR })}
                          </span>
                        </div>
                        {e.detail && <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{e.detail}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Contact Modal */}
      <Modal
        open={showContactModal}
        title={editContact ? 'Editar contato' : 'Novo contato'}
        onClose={() => setShowContactModal(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowContactModal(false)}>Cancelar</Button>
            <Button onClick={saveContact} disabled={!contactForm.name.trim()}>Salvar</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Nome" required>
            <Input autoFocus value={contactForm.name} onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Cargo">
            <Input value={contactForm.role ?? ''} onChange={(e) => setContactForm((f) => ({ ...f, role: e.target.value }))} />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={contactForm.email ?? ''} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <Field label="Telefone">
            <Input value={contactForm.phone ?? ''} onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      {/* Add CS assignment modal */}
      <Modal
        open={showCsModal}
        title="Atribuir CS"
        onClose={() => setShowCsModal(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCsModal(false)}>Cancelar</Button>
            <Button onClick={saveCs}>Salvar</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCsMode('directory')}
              className={`flex-1 text-xs font-medium px-3 py-1.5 rounded-[var(--radius-pill)] border transition-colors ${csMode === 'directory' ? 'bg-[var(--oe-primary)] text-white border-[var(--oe-primary)]' : 'bg-[var(--surface-card)] text-[var(--text-secondary)] border-[var(--border-default)]'}`}
            >
              Usuário
            </button>
            <button
              type="button"
              onClick={() => setCsMode('text')}
              className={`flex-1 text-xs font-medium px-3 py-1.5 rounded-[var(--radius-pill)] border transition-colors ${csMode === 'text' ? 'bg-[var(--oe-primary)] text-white border-[var(--oe-primary)]' : 'bg-[var(--surface-card)] text-[var(--text-secondary)] border-[var(--border-default)]'}`}
            >
              Texto livre
            </button>
          </div>
          {csMode === 'directory' ? (
            <Field label="Usuário" required>
              <select
                value={csUserId}
                onChange={(e) => setCsUserId(e.target.value)}
                className="block w-full rounded-[var(--radius-md)] border px-3 py-2 text-sm focus:outline-none"
                style={{ borderColor: 'var(--border-default)', background: 'var(--surface-input)', color: 'var(--text-primary)' }}
              >
                <option value="">Selecione...</option>
                {teamDirectory.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name ?? p.email}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Nome" required>
              <Input autoFocus value={csName} onChange={(e) => setCsName(e.target.value)} placeholder="Nome" />
            </Field>
          )}
          <Field label="Desde" required>
            <Input type="date" value={csDate} onChange={(e) => setCsDate(e.target.value)} />
          </Field>
          <Field label="Nota">
            <Input value={csNote} onChange={(e) => setCsNote(e.target.value)} placeholder="Opcional" />
          </Field>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={showArchiveConfirm}
        title="Excluir cliente"
        onClose={() => setShowArchiveConfirm(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowArchiveConfirm(false)}>Cancelar</Button>
            <Button
              variant="danger"
              onClick={() => { deleteClient(client.id); navigate('/wallet') }}
              disabled={clientProjects.length > 0}
            >
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {clientProjects.length > 0
            ? `Este cliente tem ${clientProjects.length} projeto(s) vinculado(s) — não é possível excluir enquanto houver projetos ligados a ele.`
            : `Excluir "${client.name}"? Esta ação não pode ser desfeita.`}
        </p>
      </Modal>
    </div>
  )
}
