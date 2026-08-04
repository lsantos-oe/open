import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/Button'
import { Input, Field, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { SelectionBar } from '@/components/ui/SelectionBar'
import { SearchInput } from '@/components/ui/SearchInput'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { CappedBadgeList } from '@/components/ui/CappedBadgeList'
import { ClientContact } from '@/types'

export default function ContactsPage() {
  const { t } = useTranslation()
  const { contacts, clients, createContact, updateContact, deleteContact, linkContactToClient, unlinkContactFromClient } = useAppStore()

  const [query, setQuery] = useState('')
  const [filterClientId, setFilterClientId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [showModal, setShowModal] = useState(false)
  const [editContact, setEditContact] = useState<ClientContact | null>(null)
  const [form, setForm] = useState({ name: '', role: '', email: '', phone: '' })
  const [linkedClientIds, setLinkedClientIds] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return contacts.filter((c) => {
      if (filterClientId && !c.clientIds.includes(filterClientId)) return false
      if (!q) return true
      return c.name.toLowerCase().includes(q) ||
        (c.role ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q)
    })
  }, [contacts, query, filterClientId])

  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name))

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function clientNames(c: ClientContact): string[] {
    return c.clientIds.map((id) => clients.find((cl) => cl.id === id)?.name).filter(Boolean) as string[]
  }

  function openAdd() {
    setEditContact(null)
    setForm({ name: '', role: '', email: '', phone: '' })
    setLinkedClientIds(new Set())
    setShowModal(true)
  }

  function openEdit(c: ClientContact) {
    setEditContact(c)
    setForm({ name: c.name, role: c.role ?? '', email: c.email ?? '', phone: c.phone ?? '' })
    setLinkedClientIds(new Set(c.clientIds))
    setShowModal(true)
  }

  function toggleLinkedClient(id: string) {
    setLinkedClientIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function saveContact() {
    if (!form.name.trim()) return
    const patch = {
      name: form.name.trim(),
      role: form.role.trim() || undefined,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
    }
    if (editContact) {
      updateContact(editContact.id, patch)
      const before = new Set(editContact.clientIds)
      for (const id of linkedClientIds) if (!before.has(id)) linkContactToClient(editContact.id, id)
      for (const id of before) if (!linkedClientIds.has(id)) unlinkContactFromClient(editContact.id, id)
    } else {
      createContact({ ...patch, clientIds: Array.from(linkedClientIds) })
    }
    setShowModal(false)
  }

  function applyBulkDelete() {
    for (const id of selected) deleteContact(id)
    setSelected(new Set())
  }

  return (
    <div className="p-8 max-w-screen-xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('nav.contacts')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{filtered.length} / {contacts.length} {contacts.length !== 1 ? t('contacts.contacts') : t('contacts.contact')}</p>
        </div>
        <Button onClick={openAdd}>+ {t('contacts.contact')}</Button>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('contacts.searchPlaceholder')}
        />
        <div className="flex-1" />
        <FilterMenu activeCount={filterClientId ? 1 : 0} onClear={() => setFilterClientId('')}>
          <Field label={t('contacts.linkedClient')}>
            <Select value={filterClientId} onChange={(e) => setFilterClientId(e.target.value)}>
              <option value="">{t('contacts.allClients')}</option>
              {[...clients].sort((a, b) => a.name.localeCompare(b.name)).map((cl) => (
                <option key={cl.id} value={cl.id}>{cl.name}</option>
              ))}
            </Select>
          </Field>
        </FilterMenu>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon="👤"
          title={contacts.length === 0 ? t('contacts.noContactsYet') : t('contacts.noContactsFiltered')}
          action={contacts.length === 0 ? { label: t('contacts.createFirst'), onClick: openAdd } : undefined}
        />
      ) : (
        <div className="rounded-[var(--radius-lg)] border overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr style={{ background: 'var(--surface-subtle)' }}>
                <th className="px-4 py-2" style={{ width: 32 }} />
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('contacts.colName')}</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('contacts.colRole')}</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('contacts.colContact')}</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('contacts.linkedClients')}</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-default)' }}>
              {sorted.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => openEdit(c)}
                  className="cursor-pointer transition-colors"
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-subtle)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="rounded border-[var(--border-default)] accent-[var(--oe-primary)]" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} />
                  </td>
                  <td className="px-4 py-3 font-medium" style={{ maxWidth: 220 }}>
                    <span
                      className="block truncate"
                      style={{ color: 'var(--text-primary)' }}
                      title={c.name}
                    >
                      {c.name}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{c.role ?? '—'}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                    {[c.email, c.phone].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-4 py-3" style={{ maxWidth: 260 }}>
                    <CappedBadgeList items={clientNames(c)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={showModal}
        title={editContact ? t('contacts.editContact') : t('contacts.newContact')}
        onClose={() => setShowModal(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>{t('actions.cancel')}</Button>
            <Button onClick={saveContact} disabled={!form.name.trim()}>{t('actions.confirm')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('contacts.colName')} required>
            <Input autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label={t('contacts.colRole')}>
            <Input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} />
          </Field>
          <Field label={t('contacts.email')}>
            <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <Field label={t('contacts.phone')}>
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </Field>
          <Field label={t('contacts.linkedClients')}>
            <div className="space-y-1 max-h-40 overflow-y-auto rounded-[var(--radius-md)] border p-2" style={{ borderColor: 'var(--border-default)' }}>
              {clients.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('contacts.noClientsRegistered')}</p>
              ) : (
                [...clients].sort((a, b) => a.name.localeCompare(b.name)).map((cl) => (
                  <label key={cl.id} className="flex items-center gap-2 text-sm px-1 py-0.5 cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                    <input
                      type="checkbox"
                      className="rounded border-[var(--border-default)] accent-[var(--oe-primary)]"
                      checked={linkedClientIds.has(cl.id)}
                      onChange={() => toggleLinkedClient(cl.id)}
                    />
                    {cl.name}
                  </label>
                ))
              )}
            </div>
          </Field>
        </div>
      </Modal>

      <SelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <button
          onClick={applyBulkDelete}
          className="text-xs px-2 py-1 rounded-[var(--radius-md)]"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          {t('actions.delete')}
        </button>
      </SelectionBar>
    </div>
  )
}
