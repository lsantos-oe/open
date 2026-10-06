import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useRetroStore } from '@/stores/useRetroStore'
import { RETRO_PHASES } from '@/types/retro'
import {
  canAdvanceRetroPhase, canManageRetro, formatRetroDate, nextRetroPhase, RETRO_PHASE_STYLE,
} from '@/utils/retro'
import { Button } from '@/components/ui/Button'
import { ExternalLinkIcon } from '@/components/ui/icons'
import RetroFormModal from '@/components/retro/RetroFormModal'
import RetroPhaseBadge from '@/components/retro/RetroPhaseBadge'

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2" style={{ borderBottom: '0.5px solid var(--border-default)' }}>
      <span className="w-40 shrink-0 text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <div className="text-[13px] min-w-0" style={{ color: 'var(--text-primary)' }}>{children}</div>
    </div>
  )
}

export default function RetroDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { teamDirectory, settings } = useAppStore()
  const { user, profile } = useAuthStore()
  const { retros, loaded, loadRetros, advancePhase, deleteRetro } = useRetroStore()
  const [editing, setEditing] = useState(false)
  const [advancing, setAdvancing] = useState(false)

  useEffect(() => { if (!loaded) loadRetros() }, [loaded, loadRetros])

  const retro = retros.find((r) => r.id === id)
  const isAdmin = profile?.role === 'admin'
  const personById = useMemo(() => new Map(teamDirectory.map((p) => [p.id, p])), [teamDirectory])
  const nameOf = (uid?: string) => (uid ? personById.get(uid)?.name ?? personById.get(uid)?.email ?? '—' : '—')
  const dateFmt = (iso?: string) => formatRetroDate(iso, settings.dateFormat)

  if (!retro) {
    return (
      <div className="p-6 max-w-[1000px] mx-auto">
        <Link to="/retros" className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('retro.back')}</Link>
        <p className="text-sm mt-6" style={{ color: 'var(--text-tertiary)' }}>{loaded ? t('retro.notFound') : '…'}</p>
      </div>
    )
  }

  const previous = retro.previousRetroId ? retros.find((r) => r.id === retro.previousRetroId) : undefined
  const followUps = retros.filter((r) => r.previousRetroId === retro.id)
  const canManage = canManageRetro(retro, user?.id, isAdmin)
  const canAdvance = canAdvanceRetroPhase(retro, user?.id, isAdmin)
  const next = nextRetroPhase(retro.phase)
  const conductorId = retro.conductorId ?? retro.createdBy

  async function handleAdvance() {
    if (!next || !window.confirm(t(`retro.confirm_${retro!.phase}`))) return
    setAdvancing(true)
    await advancePhase(retro!.id)
    setAdvancing(false)
  }

  async function handleDelete() {
    if (!window.confirm(t('retro.deleteConfirm'))) return
    if (await deleteRetro(retro!.id)) navigate('/retros')
  }

  return (
    <div className="p-6 max-w-[1000px] mx-auto">
      <Link to="/retros" className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('retro.back')}</Link>

      <div className="flex items-start justify-between gap-4 mt-2 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{retro.title}</h1>
            <RetroPhaseBadge phase={retro.phase} />
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>{t('retro.edit')}</Button>
            {(retro.createdBy === user?.id || isAdmin) && (
              <Button variant="danger" size="sm" onClick={handleDelete}>{t('retro.delete')}</Button>
            )}
          </div>
        )}
      </div>

      {/* Fases: stepper + ação do condutor */}
      <section
        className="mb-6 p-4 rounded-[var(--radius-lg)] border"
        style={{ background: 'var(--surface-card)', borderColor: 'var(--border-default)' }}
      >
        <ol className="flex items-center gap-1 flex-wrap mb-3">
          {RETRO_PHASES.map((p, i) => {
            const reached = RETRO_PHASES.indexOf(retro.phase) >= i
            const current = retro.phase === p
            return (
              <li key={p} className="flex items-center gap-1">
                <span
                  className="text-[11.5px] px-2.5 py-1"
                  style={{
                    borderRadius: 'var(--radius-pill)',
                    fontWeight: current ? 600 : 400,
                    ...(current
                      ? RETRO_PHASE_STYLE[p]
                      : { background: 'transparent', color: reached ? 'var(--text-secondary)' : 'var(--text-disabled)' }),
                  }}
                >
                  {t(`retro.phase_${p}`)}
                </span>
                {i < RETRO_PHASES.length - 1 && <span style={{ color: 'var(--text-disabled)' }}>›</span>}
              </li>
            )
          })}
        </ol>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t(`retro.hint_${retro.phase}`)}</p>
          {canAdvance && next && (
            <Button size="sm" onClick={handleAdvance} disabled={advancing}>{t(`retro.advance_${retro.phase}`)}</Button>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div>
          <section className="mb-6">
            <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>{t('retro.details')}</h2>
            <InfoRow label={t('retro.date')}>{dateFmt(retro.retroDate)}</InfoRow>
            <InfoRow label={t('retro.period')}>
              {retro.periodStart || retro.periodEnd ? `${dateFmt(retro.periodStart) || '…'} – ${dateFmt(retro.periodEnd) || '…'}` : '—'}
            </InfoRow>
            <InfoRow label={t('retro.conductor')}>
              {retro.conductorId ? nameOf(conductorId) : t('retro.conductorDefault', { name: nameOf(conductorId) })}
            </InfoRow>
            <InfoRow label={t('retro.recording')}>
              {retro.recordingLink ? (
                <a href={retro.recordingLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline" style={{ color: 'var(--oe-primary)' }}>
                  {t('retro.openRecording')} <ExternalLinkIcon className="w-3 h-3" />
                </a>
              ) : '—'}
            </InfoRow>
            <InfoRow label={t('retro.followUp')}>
              {!previous && followUps.length === 0 ? (
                <span style={{ color: 'var(--text-tertiary)' }}>{t('retro.noFollowUp')}</span>
              ) : (
                <div className="space-y-1">
                  {previous && (
                    <div>
                      <span className="text-xs mr-1.5" style={{ color: 'var(--text-tertiary)' }}>{t('retro.previousRetro')}:</span>
                      <Link to={`/retros/${previous.id}`} className="hover:underline" style={{ color: 'var(--oe-primary)' }}>{previous.title}</Link>
                    </div>
                  )}
                  {followUps.length > 0 && (
                    <div>
                      <span className="text-xs mr-1.5" style={{ color: 'var(--text-tertiary)' }}>{t('retro.nextRetros')}:</span>
                      {followUps.map((f, i) => (
                        <span key={f.id}>
                          {i > 0 && ', '}
                          <Link to={`/retros/${f.id}`} className="hover:underline" style={{ color: 'var(--oe-primary)' }}>{f.title}</Link>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </InfoRow>
            <InfoRow label={t('retro.fieldAnonymous')}>
              {retro.anonymous ? t('retro.anonymousYes') : t('retro.anonymousNo')} · {t('retro.votesInfo', { n: retro.votesPerPerson })}
            </InfoRow>
          </section>

          <div
            className="p-6 text-center text-sm rounded-[var(--radius-lg)] border border-dashed"
            style={{ borderColor: 'var(--border-strong)', color: 'var(--text-tertiary)' }}
          >
            {t('retro.boardSoon')}
          </div>
        </div>

        <aside>
          <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
            {t('retro.participants')} ({retro.participantIds.length})
          </h2>
          {retro.participantIds.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('retro.noParticipants')}</p>
          ) : (
            <ul className="space-y-1.5">
              {retro.participantIds.map((uid) => (
                <li key={uid} className="text-[13px] flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <span
                    className="w-6 h-6 flex items-center justify-center text-[10px] font-semibold shrink-0"
                    style={{ borderRadius: 'var(--radius-pill)', background: 'var(--surface-subtle)', color: 'var(--text-secondary)' }}
                  >
                    {nameOf(uid).slice(0, 2).toUpperCase()}
                  </span>
                  <span className="truncate">{nameOf(uid)}</span>
                  {uid === conductorId && (
                    <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>· {t('retro.conductor').toLowerCase()}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {editing && <RetroFormModal open onClose={() => setEditing(false)} retro={retro} />}
    </div>
  )
}
