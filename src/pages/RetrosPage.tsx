import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { useRetroStore } from '@/stores/useRetroStore'
import { formatRetroDate } from '@/utils/retro'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { AvatarStack } from '@/components/ui/AvatarStack'
import RetroFormModal from '@/components/retro/RetroFormModal'
import RetroPhaseBadge from '@/components/retro/RetroPhaseBadge'

export default function RetrosPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { teamDirectory, settings } = useAppStore()
  const { retros, loaded, loadRetros } = useRetroStore()
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)

  useEffect(() => { loadRetros() }, [loadRetros])

  const personById = useMemo(() => new Map(teamDirectory.map((p) => [p.id, p])), [teamDirectory])
  const nameOf = (id?: string) => (id ? personById.get(id)?.name ?? personById.get(id)?.email ?? '—' : '—')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? retros.filter((r) => r.title.toLowerCase().includes(q)) : retros
  }, [retros, search])

  const dateFmt = (iso?: string) => formatRetroDate(iso, settings.dateFormat)

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{t('retro.title')}</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{t('retro.subtitle')}</p>
        </div>
        <Button onClick={() => setShowNew(true)}>{t('retro.new')}</Button>
      </div>

      {retros.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('retro.search')} />
        </div>
      )}

      {loaded && retros.length === 0 ? (
        <EmptyState
          title={t('retro.emptyTitle')}
          description={t('retro.emptyDesc')}
          action={{ label: t('retro.new'), onClick: () => setShowNew(true) }}
        />
      ) : filtered.length === 0 && loaded ? (
        <p className="text-sm text-center py-12" style={{ color: 'var(--text-tertiary)' }}>{t('retro.noResults')}</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border" style={{ borderColor: 'var(--border-default)', background: 'var(--surface-card)' }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--border-default)' }}>
                {[t('retro.colTitle'), t('retro.colDate'), t('retro.colPeriod'), t('retro.colConductor'), t('retro.colPhase'), t('retro.colParticipants')].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-[11px] font-[600] uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const previous = r.previousRetroId ? retros.find((x) => x.id === r.previousRetroId) : undefined
                return (
                  <tr
                    key={r.id}
                    onClick={() => navigate(`/retros/${r.id}`)}
                    className="cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors"
                    style={{ borderBottom: '0.5px solid var(--border-default)' }}
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{r.title}</div>
                      {previous && (
                        <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                          ↳ {t('retro.followUpOf', { title: previous.title })}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{dateFmt(r.retroDate)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                      {r.periodStart || r.periodEnd ? `${dateFmt(r.periodStart) || '…'} – ${dateFmt(r.periodEnd) || '…'}` : '—'}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>{nameOf(r.conductorId ?? r.createdBy)}</td>
                    <td className="px-3 py-2.5"><RetroPhaseBadge phase={r.phase} /></td>
                    <td className="px-3 py-2.5">
                      <AvatarStack people={r.participantIds.map((id) => ({ name: nameOf(id), avatarUrl: personById.get(id)?.avatar_url ?? undefined }))} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <RetroFormModal open onClose={() => setShowNew(false)} onSaved={(id) => navigate(`/retros/${id}`)} />
      )}
    </div>
  )
}
