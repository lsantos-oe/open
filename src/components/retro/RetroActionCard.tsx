import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { RetroCard } from '@/types/retro'
import { ACTION_STATUS_STYLE, isActionOverdue } from '@/utils/retroBoard'
import { formatRetroDate, todayInSaoPaulo } from '@/utils/retro'
import { AvatarStack } from '@/components/ui/AvatarStack'
import { ChatBubbleIcon } from '@/components/ui/icons'
import VoteButton from './VoteButton'
import { EntityLinkChips } from './EntityLinks'
import { RetroCardLink } from '@/types/retro'

interface Props {
  card: RetroCard
  subActions: RetroCard[]
  links: RetroCardLink[]
  /** Texto do card (bom/ruim) que esta ação endereça, se houver. */
  addresses?: string
  commentCount: number
  vote: { count: number; voted: boolean; disabled: boolean; title?: string; onToggle: () => Promise<unknown> }
  onOpen: (id: string) => void
}

export function StatusPill({ status }: { status: RetroCard['actionStatus'] }) {
  const { t } = useTranslation()
  return (
    <span className="inline-block whitespace-nowrap text-[10.5px] font-[500] px-1.5 py-[1px]" style={{ ...ACTION_STATUS_STYLE[status], borderRadius: 'var(--radius-pill)' }}>
      {t(`retro.actionStatus_${status}`)}
    </span>
  )
}

export default function RetroActionCard({ card, subActions, links, addresses, commentCount, vote, onOpen }: Props) {
  const { t } = useTranslation()
  const { teamDirectory, settings } = useAppStore()
  const avatarOf = (memberId?: string) => teamDirectory.find((p) => p.id === memberId)?.avatar_url ?? undefined
  const overdue = isActionOverdue(card, todayInSaoPaulo())
  const faded = card.actionStatus === 'done' || card.actionStatus === 'dropped'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(card.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(card.id) }}
      className="p-2.5 text-[13px] rounded-[var(--radius-md)] border cursor-pointer hover:border-[var(--oe-primary)] transition-colors"
      style={{ background: 'var(--surface-card)', borderColor: 'var(--border-default)', color: 'var(--text-primary)', opacity: faded ? 0.75 : 1 }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="whitespace-pre-wrap break-words font-medium" style={{ textDecoration: card.actionStatus === 'dropped' ? 'line-through' : undefined }}>{card.text}</p>
        <StatusPill status={card.actionStatus} />
      </div>

      {addresses && (
        <p className="text-[11px] mt-1 truncate" style={{ color: 'var(--text-tertiary)' }}>↳ {addresses}</p>
      )}

      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        <AvatarStack people={card.owners.map((o) => ({ name: o.name, avatarUrl: avatarOf(o.memberId) }))} size={20} />
        {card.dueDate && (
          <span style={{ color: overdue ? 'var(--color-danger-text)' : undefined }}>
            {formatRetroDate(card.dueDate, settings.dateFormat)}{overdue ? ` · ${t('retro.overdue')}` : ''}
          </span>
        )}
        {card.successMetric && (
          <span className="truncate max-w-full" title={card.successMetric}>
            {card.successMetric}{card.successTarget ? ` → ${card.successTarget}` : ''}
          </span>
        )}
      </div>

      <EntityLinkChips links={links} />

      {subActions.length > 0 && (
        <ul className="mt-2 space-y-1">
          {subActions.map((s) => (
            <li
              key={s.id}
              onClick={(e) => { e.stopPropagation(); onOpen(s.id) }}
              className="flex items-center gap-1.5 text-[12px] pl-2 hover:underline"
              style={{ borderLeft: '2px solid var(--border-default)', color: 'var(--text-secondary)', textDecoration: s.actionStatus === 'dropped' ? 'line-through' : undefined }}
            >
              <span aria-hidden>{s.actionStatus === 'done' ? '✓' : '○'}</span>
              <span className="truncate">{s.text}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 mt-2">
        <VoteButton {...vote} />
        {commentCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            <ChatBubbleIcon className="w-3 h-3" />{commentCount}
          </span>
        )}
      </div>
    </div>
  )
}
