import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { useAppStore } from '@/store/useAppStore'
import { eligibleClients, groupNameTaken, MIN_GROUP_CLIENTS, normalizeGroupName } from '@/utils/clientGroups'
import type { ClientGroup } from '@/types'

/** Novo grupo: nome + 2 ou mais clientes. */
export function NewGroupModal({ open, onClose, initialClientIds = [], onCreated }: {
  open: boolean
  onClose: () => void
  initialClientIds?: string[]
  onCreated?: (id: string) => void
}) {
  const clients = useAppStore((s) => s.clients)
  const groups = useAppStore((s) => s.clientGroups)
  const allowMultiple = useAppStore((s) => s.settings.allowMultipleClientGroups ?? false)
  const createClientGroup = useAppStore((s) => s.createClientGroup)
  const [name, setName] = useState('')
  const [clientIds, setClientIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) { setName(''); setClientIds(initialClientIds); setSaving(false) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const options = useMemo(
    () => eligibleClients(clients, groups, null, allowMultiple).map((c) => ({ id: c.id, label: c.name })),
    [clients, groups, allowMultiple],
  )
  const taken = !!normalizeGroupName(name) && groupNameTaken(groups, name)
  const canSave = !!normalizeGroupName(name) && !taken && clientIds.length >= MIN_GROUP_CLIENTS && !saving

  async function save() {
    if (!canSave) return
    setSaving(true)
    const id = await createClientGroup(name, clientIds)
    setSaving(false)
    if (id) { onClose(); onCreated?.(id) }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo grupo de clientes"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={save} disabled={!canSave}>{saving ? 'Criando…' : 'Criar grupo'}</Button>
      </>}
    >
      <div className="space-y-4">
        <Field label="Nome do grupo" required hint={taken ? undefined : 'Ex.: o nome do conglomerado ou da holding.'}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do grupo" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') void save() }} />
          {taken && <p className="text-xs mt-1" role="alert" style={{ color: 'var(--color-danger-text)' }}>Já existe um grupo com esse nome.</p>}
        </Field>
        <Field label={`Clientes (${clientIds.length})`} required hint={`Escolha ${MIN_GROUP_CLIENTS} ou mais.${allowMultiple ? '' : ' Só aparecem clientes que ainda não estão em um grupo.'}`}>
          <MultiSelect values={clientIds} onChange={setClientIds} options={options} placeholder="Selecione os clientes" />
        </Field>
        {clientIds.length > 0 && clientIds.length < MIN_GROUP_CLIENTS && (
          <p className="text-xs" style={{ color: 'var(--color-warning-text)' }}>Um grupo precisa de pelo menos {MIN_GROUP_CLIENTS} clientes.</p>
        )}
      </div>
    </Modal>
  )
}

/** Coloca os clientes escolhidos (na Carteira) num grupo que já existe. */
export function AddToGroupModal({ open, onClose, clientIds, onDone }: {
  open: boolean
  onClose: () => void
  clientIds: string[]
  onDone?: (groupId: string) => void
}) {
  const groups = useAppStore((s) => s.clientGroups)
  const addClientsToGroup = useAppStore((s) => s.addClientsToGroup)
  const [groupId, setGroupId] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) { setGroupId(''); setSaving(false) } }, [open])

  const group = groups.find((g) => g.id === groupId)
  const toAdd = group ? clientIds.filter((id) => !group.clientIds.includes(id)) : clientIds

  async function save() {
    if (!group || toAdd.length === 0) return
    setSaving(true)
    const ok = await addClientsToGroup(group.id, toAdd)
    setSaving(false)
    if (ok) { onClose(); onDone?.(group.id) }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adicionar a um grupo"
      size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={save} disabled={!group || toAdd.length === 0 || saving}>{saving ? 'Adicionando…' : `Adicionar ${toAdd.length || ''}`.trim()}</Button>
      </>}
    >
      <Field label="Grupo" required>
        <SearchableSelect
          value={groupId}
          onChange={setGroupId}
          placeholder="Escolha o grupo"
          options={groups.map((g) => ({ id: g.id, label: g.name, sublabel: `${g.clientIds.length} clientes` }))}
        />
      </Field>
      {group && toAdd.length < clientIds.length && (
        <p className="text-xs mt-3" style={{ color: 'var(--text-tertiary)' }}>{clientIds.length - toAdd.length} já {clientIds.length - toAdd.length === 1 ? 'está' : 'estão'} neste grupo.</p>
      )}
    </Modal>
  )
}

/** Dentro do grupo: acrescenta clientes. */
export function AddClientsModal({ open, onClose, group }: { open: boolean; onClose: () => void; group: ClientGroup }) {
  const clients = useAppStore((s) => s.clients)
  const groups = useAppStore((s) => s.clientGroups)
  const allowMultiple = useAppStore((s) => s.settings.allowMultipleClientGroups ?? false)
  const addClientsToGroup = useAppStore((s) => s.addClientsToGroup)
  const [ids, setIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) { setIds([]); setSaving(false) } }, [open])
  const options = useMemo(() => eligibleClients(clients, groups, group, allowMultiple).map((c) => ({ id: c.id, label: c.name })), [clients, groups, group, allowMultiple])

  async function save() {
    if (ids.length === 0) return
    setSaving(true)
    const ok = await addClientsToGroup(group.id, ids)
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adicionar clientes ao grupo"
      size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={save} disabled={ids.length === 0 || saving}>{saving ? 'Adicionando…' : 'Adicionar'}</Button>
      </>}
    >
      <Field label="Clientes" hint={allowMultiple ? undefined : 'Só aparecem clientes que ainda não estão em um grupo.'}>
        <MultiSelect values={ids} onChange={setIds} options={options} placeholder={options.length ? 'Selecione os clientes' : 'Nenhum cliente disponível'} />
      </Field>
      <p className="text-xs mt-3" style={{ color: 'var(--text-tertiary)' }}>
        Os contatos colocados direto no grupo passam a valer também para os clientes que entrarem.
      </p>
    </Modal>
  )
}

/** Contato direto no grupo: uma pessoa que já existe ou um contato novo; fica ligado a todos os clientes do grupo. */
export function GroupContactModal({ open, onClose, group }: { open: boolean; onClose: () => void; group: ClientGroup }) {
  const contacts = useAppStore((s) => s.contacts)
  const addContactToGroup = useAppStore((s) => s.addContactToGroup)
  const createContactInGroup = useAppStore((s) => s.createContactInGroup)
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [contactId, setContactId] = useState('')
  const [form, setForm] = useState({ name: '', role: '', email: '', phone: '' })
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) { setMode('existing'); setContactId(''); setForm({ name: '', role: '', email: '', phone: '' }); setSaving(false) } }, [open])

  const options = useMemo(
    () => contacts.filter((c) => !group.contactIds.includes(c.id)).map((c) => ({ id: c.id, label: c.name, sublabel: [c.role, c.email].filter(Boolean).join(' · ') || undefined })),
    [contacts, group.contactIds],
  )
  const canSave = mode === 'existing' ? !!contactId : !!form.name.trim()

  async function save() {
    if (!canSave || saving) return
    setSaving(true)
    const ok = mode === 'existing'
      ? await addContactToGroup(group.id, contactId)
      : await createContactInGroup(group.id, { name: form.name.trim(), role: form.role.trim() || undefined, email: form.email.trim() || undefined, phone: form.phone.trim() || undefined })
    setSaving(false)
    if (ok) onClose()
  }

  const tab = (m: 'existing' | 'new', label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border transition-colors"
      style={mode === m
        ? { background: 'var(--text-primary)', color: 'var(--surface-page)', borderColor: 'var(--text-primary)' }
        : { background: 'var(--surface-subtle)', color: 'var(--text-secondary)', borderColor: 'transparent' }}
    >{label}</button>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Contato do grupo"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={save} disabled={!canSave || saving}>{saving ? 'Salvando…' : 'Adicionar ao grupo'}</Button>
      </>}
    >
      <div className="space-y-4">
        <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          O contato fica ligado a <strong>todos os {group.clientIds.length} clientes</strong> do grupo — e aos que entrarem depois.
        </p>
        <div className="flex gap-2" role="group" aria-label="Tipo de contato">
          {tab('existing', 'Contato existente')}
          {tab('new', 'Novo contato')}
        </div>
        {mode === 'existing' ? (
          <Field label="Contato" required>
            <SearchableSelect value={contactId} onChange={setContactId} options={options} placeholder="Busque pelo nome" />
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Nome" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field></div>
            <Field label="Cargo"><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></Field>
            <Field label="Telefone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <div className="col-span-2"><Field label="E-mail"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field></div>
          </div>
        )}
      </div>
    </Modal>
  )
}
