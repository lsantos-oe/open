import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { Button } from '@/components/ui/Button'
import { Input, Field, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import CountrySelect from '@/components/ui/CountrySelect'
import OwnersField from '@/components/plan/OwnersField'
import { StatusDot } from '@/components/ui/StatusDot'
import { AvatarStack } from '@/components/ui/AvatarStack'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { EmptyState } from '@/components/ui/EmptyState'
import { SelectionBar } from '@/components/ui/SelectionBar'
import { SearchInput } from '@/components/ui/SearchInput'
import { MineToggle } from '@/components/ui/MineToggle'
import { ViewToggle } from '@/components/ui/ViewToggle'
import { ListIcon, KanbanIcon, FolderIcon } from '@/components/ui/icons'
import { isClientMine } from '@/utils/involvement'
import { findCountry } from '@/data/countries'
import { exportClientsCsv } from '@/utils/exportListsCsv'
import { ClientStatus, EntryOwner, TeamMember } from '@/types'

const STATUS_COLOR: Record<ClientStatus, string> = {
  pre_venda: 'var(--color-info-text)',
  implantacao: 'var(--color-warning-text)',
  sustentacao_novos_projetos: 'var(--color-success-text)',
}

const STATUSES: ClientStatus[] = ['pre_venda', 'implantacao', 'sustentacao_novos_projetos']

export default function ClientsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { clients, teamDirectory, createClient, updateClient, archiveClient } = useAppStore()
  const { user } = useAuthStore()
  const projects = useAppStore((s) => s.projects)

  const [view, setView] = useState<'list' | 'kanban'>(() =>
    (localStorage.getItem('pb-carteira-view') as 'list' | 'kanban') ?? 'list',
  )
  useEffect(() => { localStorage.setItem('pb-carteira-view', view) }, [view])

  const [showAdd, setShowAdd] = useState(false)
  const [query, setQuery] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkOwnersOpen, setBulkOwnersOpen] = useState(false)
  const [bulkOwners, setBulkOwners] = useState<EntryOwner[]>([])

  const [name, setName] = useState('')
  const [country, setCountry] = useState<string | undefined>(undefined)
  const [ploomesLink, setPloomesLink] = useState('')
  const [status, setStatus] = useState<ClientStatus>('pre_venda')
  const [owners, setOwners] = useState<EntryOwner[]>([])

  const STATUS_LABEL: Record<ClientStatus, string> = {
    pre_venda: t('wallet.statusPreVenda'),
    implantacao: t('wallet.statusImplantacao'),
    sustentacao_novos_projetos: t('wallet.statusSustentacao'),
  }

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
      if (onlyMine && !isClientMine(c, user?.id)) return false
      if (query.trim() && !c.name.toLowerCase().includes(query.trim().toLowerCase())) return false
      if (countryFilter && c.country !== countryFilter) return false
      if (ownerFilter && !c.owners.some((o) => o.memberId === ownerFilter)) return false
      return true
    })
  }, [clients, query, countryFilter, ownerFilter, onlyMine, user])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function applyBulkOwners() {
    for (const id of selected) updateClient(id, { owners: bulkOwners })
    setSelected(new Set())
    setBulkOwnersOpen(false)
  }

  function applyBulkArchive() {
    for (const id of selected) archiveClient(id)
    setSelected(new Set())
  }

  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name))

  function projectCount(clientId: string): number {
    return projects.filter((p) => p.clientIds.includes(clientId)).length
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
    <div className="p-8 max-w-screen-xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('nav.wallet')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{filtered.length} / {clients.length} {clients.length !== 1 ? t('wallet.clients') : t('wallet.client')}</p>
        </div>
        <Button onClick={openAdd}>+ {t('wallet.client')}</Button>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('wallet.searchPlaceholder')}
        />
        <ViewToggle
          value={view}
          onChange={setView}
          options={[
            { value: 'list', label: t('project.viewList'), icon: <ListIcon className="w-3.5 h-3.5" /> },
            { value: 'kanban', label: t('project.viewKanban'), icon: <KanbanIcon className="w-3.5 h-3.5" /> },
          ]}
        />
        <MineToggle active={onlyMine} onClick={() => setOnlyMine((v) => !v)} />
        <div className="flex-1" />
        <FilterMenu
          activeCount={[countryFilter, ownerFilter].filter(Boolean).length}
          onClear={() => { setCountryFilter(''); setOwnerFilter('') }}
        >
          <Field label={t('wallet.country')}>
            <Select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
              <option value="">{t('wallet.allCountries')}</option>
              {countryOptions.sort((a, b) => (findCountry(a)?.name ?? a).localeCompare(findCountry(b)?.name ?? b)).map((code) => (
                <option key={code} value={code}>{findCountry(code)?.name ?? code}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('wallet.owner')}>
            <Select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
              <option value="">{t('wallet.allOwners')}</option>
              {directoryAsTeam.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
        </FilterMenu>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<FolderIcon className="w-9 h-9" />}
          title={clients.length === 0 ? t('wallet.noClientsYet') : t('wallet.noClientsFiltered')}
          action={clients.length === 0 ? { label: t('wallet.createFirst'), onClick: openAdd } : undefined}
        />
      ) : view === 'list' ? (
        <div className="rounded-[var(--radius-lg)] border overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr style={{ background: 'var(--surface-subtle)' }}>
                <th className="px-4 py-2" style={{ width: 32 }} />
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('wallet.colClient')}</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('wallet.colCountry')}</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('wallet.colStatus')}</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('wallet.colOwner')}</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('wallet.colCurrentCs')}</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>{t('wallet.colProjects')}</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-default)' }}>
              {sorted.map((c) => {
                const cs = currentCs(c.id)
                return (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/wallet/${c.id}`)}
                    className="cursor-pointer transition-colors"
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-subtle)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="rounded border-[var(--border-default)] accent-[var(--oe-primary)]" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} />
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ maxWidth: 220 }}>
                      <span className="block truncate" style={{ color: 'var(--text-primary)' }} title={c.name}>{c.name}</span>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{findCountry(c.country)?.name ?? '—'}</td>
                    <td className="px-4 py-3"><StatusDot color={STATUS_COLOR[c.status]} label={STATUS_LABEL[c.status]} /></td>
                    <td className="px-4 py-3"><AvatarStack people={c.owners} size={20} /></td>
                    <td className="px-4 py-3"><AvatarStack people={cs ? [{ name: cs }] : []} size={20} /></td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{projectCount(c.id)}</td>
                  </tr>
                )
              })}
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
                    <div
                      key={c.id}
                      onClick={() => navigate(`/wallet/${c.id}`)}
                      role="button"
                      className="relative w-full text-left rounded-[var(--radius-lg)] p-3 shadow-sm border hover:border-[var(--oe-primary)] hover:shadow transition-all cursor-pointer"
                      style={{ background: 'var(--surface-card)', borderColor: 'var(--border-default)' }}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleSelect(c.id)}
                        className="absolute top-2 right-2 rounded border-[var(--border-default)] accent-[var(--oe-primary)]"
                      />
                      <p className="font-medium text-sm mb-1 pr-5" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
                      <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>{findCountry(c.country)?.name ?? '—'}</p>
                      <AvatarStack people={c.owners} size={18} />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={showAdd}
        title={t('wallet.newClientTitle')}
        onClose={() => setShowAdd(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAdd(false)}>{t('actions.cancel')}</Button>
            <Button onClick={handleCreate} disabled={!name.trim()}>{t('actions.confirm')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('wallet.clientName')} required>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('wallet.companyNamePlaceholder')} />
          </Field>
          <Field label={t('wallet.country')}>
            <CountrySelect value={country} onChange={setCountry} />
          </Field>
          <Field label={t('wallet.colStatus')}>
            <Select value={status} onChange={(e) => setStatus(e.target.value as ClientStatus)}>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </Select>
          </Field>
          <Field label={t('wallet.owner')}>
            <OwnersField owners={owners} onChange={setOwners} teamMembers={directoryAsTeam} />
          </Field>
          <Field label={t('wallet.ploomesLink')}>
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
            <span className="mr-1">↓</span>{t('exportCsv')}
          </button>
        </div>
      )}

      <SelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <button
          onClick={() => { setBulkOwners([]); setBulkOwnersOpen(true) }}
          className="text-xs px-2 py-1 rounded-[var(--radius-md)]"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          {t('wallet.changeOwner')}
        </button>
        <button
          onClick={applyBulkArchive}
          className="text-xs px-2 py-1 rounded-[var(--radius-md)]"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          {t('wallet.archive')}
        </button>
      </SelectionBar>

      <Modal
        open={bulkOwnersOpen}
        title={t('wallet.changeOwnerOf', { n: selected.size })}
        onClose={() => setBulkOwnersOpen(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkOwnersOpen(false)}>{t('actions.cancel')}</Button>
            <Button onClick={applyBulkOwners} disabled={bulkOwners.length === 0}>{t('actions.confirm')}</Button>
          </>
        }
      >
        <OwnersField owners={bulkOwners} onChange={setBulkOwners} teamMembers={directoryAsTeam} />
      </Modal>
    </div>
  )
}
