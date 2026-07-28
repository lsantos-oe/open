import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/Button'
import { Input, Field } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import CountrySelect from '@/components/ui/CountrySelect'
import { findCountry } from '@/data/countries'

export default function ClientsPage() {
  const navigate = useNavigate()
  const { clients, createClient, projects } = useAppStore()
  const [showAdd, setShowAdd] = useState(false)
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [country, setCountry] = useState<string | undefined>(undefined)
  const [ploomesLink, setPloomesLink] = useState('')

  const filtered = clients.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name))

  function projectCount(clientId: string): number {
    return projects.filter((p) => p.clientId === clientId).length
  }

  function currentCs(clientId: string): string | undefined {
    const client = clients.find((c) => c.id === clientId)
    if (!client || client.csHistory.length === 0) return undefined
    return [...client.csHistory].sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))[0].owner.name
  }

  function openAdd() {
    setName(''); setCountry(undefined); setPloomesLink('')
    setShowAdd(true)
  }

  function handleCreate() {
    if (!name.trim()) return
    const id = createClient({ name: name.trim(), country, ploomesLink: ploomesLink.trim() || undefined })
    setShowAdd(false)
    navigate(`/wallet/${id}`)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Carteira</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{clients.length} cliente{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={openAdd}>+ Cliente</Button>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar cliente..."
        className="mb-4"
      />

      {sorted.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-tertiary)' }}>
          <p className="text-sm">{clients.length === 0 ? 'Nenhum cliente cadastrado ainda.' : 'Nenhum cliente encontrado com essa busca.'}</p>
          {clients.length === 0 && <Button size="sm" className="mt-3" onClick={openAdd}>+ Criar primeiro cliente</Button>}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--surface-subtle)' }}>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Cliente</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>País</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>CS atual</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Projetos</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/wallet/${c.id}`)}
                  className="cursor-pointer transition-colors border-t"
                  style={{ borderColor: 'var(--border-default)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-subtle)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{c.name}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{findCountry(c.country)?.name ?? '—'}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{currentCs(c.id) ?? '—'}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{projectCount(c.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={showAdd}
        title="Novo Cliente"
        onClose={() => setShowAdd(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!name.trim()}>Criar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nome do cliente" required>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da empresa" />
          </Field>
          <Field label="País">
            <CountrySelect value={country} onChange={setCountry} />
          </Field>
          <Field label="Link no Ploomes">
            <Input value={ploomesLink} onChange={(e) => setPloomesLink(e.target.value)} placeholder="https://..." />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
