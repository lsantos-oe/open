import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/Button'
import { Input, Field, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import CountrySelect from '@/components/ui/CountrySelect'
import OwnersField from '@/components/plan/OwnersField'
import { findCountry } from '@/data/countries'
import { exportClientsCsv } from '@/utils/exportListsCsv'
import { ClientStatus, EntryOwner, TeamMember } from '@/types'

const STATUS_LABEL: Record<ClientStatus, string> = {
  pre_venda: 'Pré-venda',
  implantacao: 'Implantação',
  sustentacao_novos_projetos: 'Sustentação / Novos projetos',
}

const STATUSES: ClientStatus[] = ['pre_venda', 'implantacao', 'sustentacao_novos_projetos']

export default function ClientsPage() {
  const navigate = useNavigate()
  const { clients, teamDirectory, createClient, projects } = useAppStore()

  const [view, setView] = useState<'list' | 'kanban'>(() =>
    (localStorage.getItem('pb-carteira-view') as 'list' | 'kanban') ?? 'list',
  )
  useEffect(() => { localStorage.setItem('pb-carteira-view', view) }, [view])

  const [showAdd, setShowAdd] = useState(false)
  const [query, setQuery] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')

  const [name, setName] = useState('')
  const [country, setCountry] = useState<string | undefined>(undefined)
  const [ploomesLink, setPloomesLink] = useState('')
  const [status, setStatus] = useState<ClientStatus>('pre_venda')
  const [owners, setOwners] = useState<EntryOwner[]>([])

  const directoryAsTeam: TeamMember[] = useMemo(
    () => teamDirectory.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name ?? p.email ?? '', role: '', email: p.email ?? undefined, userId: p.id })),
    [teamDirectory],
  )

  const countryOptions = useMemo(
    () => [...new Set(clients.map((c) => c.country).filter(Boolean))] as string[],
    [clients],
  )

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (query.trim() && !c.name.toLowerCase().includes(query.trim().toLowerCase())) return false
      if (countryFilter && c.country !== countryFilter) return false
      if (ownerFilter && !c.owners.some((o) => o.memberId === ownerFilter)) return false
      return true
    })
  }, [clients, query, countryFilter, ownerFilter])

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
    setName(''); setCountry(undefined); setPloomesLink(''); setStatus('pre_venda'); setOwners([])
    setShowAdd(true)
  }

  function handleCreate() {
    if (!name.trim()) return
    const id = createClient({ name: name.trim(), country, ploomesLink: ploomesLink.trim() || undefined, status, owners })
    setShowAdd(false)
    navigate(`/wallet/${id}`)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Carteira</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{filtered.length} / {clients.length} cliente{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-[var(--radius-lg)] border overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
            <button
              onClick={() => setView('list')}
              className="px-3 py-2 text-sm transition-colors"
              style={{ background: view === 'list' ? 'var(--text-primary)' : 'var(--surface-card)', color: view === 'list' ? 'white' : 'var(--text-secondary)' }}
            >
              Lista
            </button>
            <button
              onClick={() => setView('kanban')}
              className="px-3 py-2 text-sm transition-colors"
              style={{ background: view === 'kanban' ? 'var(--text-primary)' : 'var(--surface-card)', color: view === 'kanban' ? 'white' : 'var(--text-secondary)' }}
            >
              Kanban
            </button>
          </div>
          <Button onClick={openAdd}>+ Cliente</Button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cliente..."
          className="flex-1 min-w-[180px]"
        />
        <Select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} className="w-auto">
          <option value="">Todos os países</option>
          {countryOptions.sort((a, b) => (findCountry(a)?.name ?? a).localeCompare(findCountry(b)?.name ?? b)).map((code) => (
            <option key={code} value={code}>{findCountry(code)?.name ?? code}</option>
          ))}
        </Select>
        <Select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className="w-auto">
          <option value="">Todos os owners</option>
          {directoryAsTeam.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-tertiary)' }}>
          <p className="text-sm">{clients.length === 0 ? 'Nenhum cliente cadastrado ainda.' : 'Nenhum cliente encontrado com esses filtros.'}</p>
          {clients.length === 0 && <Button size="sm" className="mt-3" onClick={openAdd}>+ Criar primeiro cliente</Button>}
        </div>
      ) : view === 'list' ? (
        <div className="rounded-[var(--radius-lg)] border overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--surface-subtle)' }}>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Cliente</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>País</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Status</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Owner</th>
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
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{STATUS_LABEL[c.status]}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{c.owners.map((o) => o.name).join(', ') || '—'}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{currentCs(c.id) ?? '—'}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{projectCount(c.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {STATUSES.map((s) => {
            const cards = sorted.filter((c) => c.status === s)
            return (
              <div key={s} className="border rounded-[var(--radius-lg)] p-3 min-h-[300px]" style={{ borderColor: 'var(--border-default)', background: 'var(--surface-subtle)' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{STATUS_LABEL[s]}</span>
                  <span className="rounded-[var(--radius-pill)] text-xs px-2 py-0.5 font-medium border" style={{ background: 'var(--surface-card)', color: 'var(--text-secondary)', borderColor: 'var(--border-default)' }}>
                    {cards.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {cards.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/wallet/${c.id}`)}
                      className="w-full text-left rounded-[var(--radius-lg)] p-3 shadow-sm border hover:border-[var(--oe-primary)] hover:shadow transition-all"
                      style={{ background: 'var(--surface-card)', borderColor: 'var(--border-default)' }}
                    >
                      <p className="font-medium text-sm mb-1" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
                      <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>{findCountry(c.country)?.name ?? '—'}</p>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {c.owners.length > 0 ? c.owners.map((o) => o.name).join(', ') : 'Sem owner'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
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
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as ClientStatus)}>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </Select>
          </Field>
          <Field label="Owner">
            <OwnersField owners={owners} onChange={setOwners} teamMembers={directoryAsTeam} />
          </Field>
          <Field label="Link no Ploomes">
            <Input value={ploomesLink} onChange={(e) => setPloomesLink(e.target.value)} placeholder="https://..." />
          </Field>
        </div>
      </Modal>

      {clients.length > 0 && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => exportClientsCsv(sorted, projectCount)}
            className="text-xs transition-colors"
            style={{ color: 'var(--text-disabled)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-disabled)')}
          >
            <span className="mr-1">↓</span>Exportar CSV
          </button>
        </div>
      )}
    </div>
  )
}
