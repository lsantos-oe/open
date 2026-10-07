import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { useRetroStore } from '@/stores/useRetroStore'
import { useRetroBoardStore } from '@/stores/useRetroBoardStore'
import { Retro, RetroCard } from '@/types/retro'
import { REVIEW_OUTCOME_STYLE, isActionOverdue } from '@/utils/retroBoard'
import { formatRetroDate, retroAncestors, todayInSaoPaulo } from '@/utils/retro'
import { AvatarStack } from '@/components/ui/AvatarStack'
import { Button } from '@/components/ui/Button'
import { StatusPill } from './RetroActionCard'
import RetroReviewDialog from './RetroReviewDialog'

interface Props {
  retro: Retro
  /** Pode registrar revisões (participante, condutor/criador ou admin) numa retro ainda não encerrada. */
  canReview: boolean
  onOpenAction: (id: string) => void
}

/** Follow-up: as ações da retro anterior (e as ainda em aberto de retros mais antigas da cadeia),
 *  para o time revisar cada uma — resolvida, descartada ou levada adiante. */
export default function RetroFollowUpPanel({ retro, canReview, onOpenAction }: Props) {
  const { t } = useTranslation()
  const { settings, teamDirectory } = useAppStore()
  const retros = useRetroStore((s) => s.retros)
  const { cards, reviews } = useRetroBoardStore()
  const [reviewing, setReviewing] = useState<RetroCard | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const ancestors = useMemo(() => retroAncestors(retros, retro.id), [retros, retro.id])
  const previous = ancestors[0]
  const ancestorIds = new Set(ancestors.map((a) => a.id))
  const today = todayInSaoPaulo()

  const items = useMemo(() => {
    const actions = cards.filter((c) => c.kind === 'action' && ancestorIds.has(c.retroId) && !cards.some((p) => p.id === c.parentCardId && p.kind === 'action'))
    // A anterior inteira (com o desfecho que já teve) + as ainda pendentes de retros mais antigas.
    const relevant = actions.filter((a) => a.retroId === previous?.id || a.actionStatus === 'open' || a.actionStatus === 'in_progress')
    const mine = (a: RetroCard) => reviews.find((r) => r.cardId === a.id && r.retroId === retro.id)
    const pending = (a: RetroCard) => (a.actionStatus === 'open' || a.actionStatus === 'in_progress' ? 0 : 1)
    return relevant
      .map((a) => ({ card: a, review: mine(a) }))
      .sort((x, y) => Number(!!x.review) - Number(!!y.review) || pending(x.card) - pending(y.card) || x.card.createdAt.localeCompare(y.card.createdAt))
  }, [cards, reviews, previous?.id, retro.id])

  if (!previous) return null
  const reviewedCount = items.filter((i) => i.review).length
  const avatarOf = (memberId?: string) => teamDirectory.find((p) => p.id === memberId)?.avatar_url ?? undefined
  const retroTitle = (id: string) => retros.find((r) => r.id === id)?.title ?? '—'

  return (
    <section
      className="mb-6 rounded-[var(--radius-lg)] border"
      style={{ background: 'var(--surface-card)', borderColor: 'var(--border-default)' }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{t('retro.followUpTitle', { title: previous.title })}</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{t('retro.followUpHint')}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {items.length > 0 && (
            <span className="text-xs" style={{ color: reviewedCount === items.length ? 'var(--color-success-text)' : 'var(--text-secondary)' }}>
              {t('retro.followUpProgress', { done: reviewedCount, total: items.length })}
            </span>
          )}
          <button type="button" onClick={() => setCollapsed((v) => !v)} className="text-xs hover:underline" style={{ color: 'var(--text-tertiary)' }}>
            {collapsed ? t('retro.followUpExpand') : t('retro.followUpCollapse')}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div style={{ borderTop: '0.5px solid var(--border-default)' }}>
          {items.length === 0 ? (
            <p className="text-xs px-4 py-4" style={{ color: 'var(--text-tertiary)' }}>{t('retro.followUpEmpty')}</p>
          ) : (
            <ul>
              {items.map(({ card, review }) => {
                const overdue = isActionOverdue(card, today)
                return (
                  <li key={card.id} className="px-4 py-3 flex items-start justify-between gap-4" style={{ borderBottom: '0.5px solid var(--border-default)' }}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button type="button" onClick={() => onOpenAction(card.id)} className="text-[13px] font-medium text-left hover:underline" style={{ color: 'var(--text-primary)' }}>
                          {card.text}
                        </button>
                        <StatusPill status={card.actionStatus} />
                        {card.retroId !== previous.id && (
                          <span className="text-[10.5px]" style={{ color: 'var(--text-tertiary)' }}>{t('retro.followUpInherited', { title: retroTitle(card.retroId) })}</span>
                        )}
                      </div>
                      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
                        <AvatarStack people={card.owners.map((o) => ({ name: o.name, avatarUrl: avatarOf(o.memberId) }))} size={20} />
                        {card.dueDate && (
                          <span style={{ color: overdue ? 'var(--color-danger-text)' : undefined }}>
                            {formatRetroDate(card.dueDate, settings.dateFormat)}{overdue ? ` · ${t('retro.overdue')}` : ''}
                          </span>
                        )}
                        {(card.successMetric || card.successTarget) && (
                          <span>{card.successMetric}{card.successTarget ? ` → ${card.successTarget}` : ''}</span>
                        )}
                        {card.successResult && <span style={{ color: 'var(--text-primary)' }}>{t('retro.currentResult')}: {card.successResult}</span>}
                      </div>
                      {review ? (
                        <div className="mt-2 text-[11.5px]">
                          <span className="inline-block px-1.5 py-[1px] font-[500]" style={{ ...REVIEW_OUTCOME_STYLE[review.outcome], borderRadius: 'var(--radius-pill)' }}>
                            {t('retro.reviewedAs', { outcome: t(`retro.outcomeDone_${review.outcome}`) })}
                          </span>
                          {review.note && <span className="ml-2" style={{ color: 'var(--text-secondary)' }}>{review.note}</span>}
                        </div>
                      ) : (
                        <p className="mt-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{t('retro.notReviewed')}</p>
                      )}
                    </div>
                    {canReview && (
                      <Button variant={review ? 'ghost' : 'secondary'} size="xs" onClick={() => setReviewing(card)}>
                        {review ? t('retro.reviewEdit') : t('retro.review')}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {reviewing && (
        <RetroReviewDialog
          key={reviewing.id}
          card={cards.find((c) => c.id === reviewing.id) ?? reviewing}
          retroId={retro.id}
          existing={reviews.find((r) => r.cardId === reviewing.id && r.retroId === retro.id)}
          onClose={() => setReviewing(null)}
        />
      )}
    </section>
  )
}
