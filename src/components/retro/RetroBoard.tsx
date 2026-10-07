import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Retro, RetroCard, RetroCardKind, RetroLinkRef, RETRO_PHASES } from '@/types/retro'
import { canManageRetro, isRetroConductor } from '@/utils/retro'
import { sortByVotes, voteCounts, votesUsed } from '@/utils/retroBoard'
import { useAuthStore } from '@/stores/useAuthStore'
import { useRetroBoardStore } from '@/stores/useRetroBoardStore'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import RetroCardItem, { CARD_MAX_LENGTH } from './RetroCardItem'
import { EntityLinksPicker } from './EntityLinks'
import RetroActionCard from './RetroActionCard'
import RetroActionModal from './RetroActionModal'
import RetroFollowUpPanel from './RetroFollowUpPanel'

interface Props {
  retro: Retro
  userId?: string
  nameOf: (userId?: string) => string
}

const LANE_STYLE: Record<RetroCardKind, { bg: string; fg: string }> = {
  good: { bg: 'var(--color-success-bg)', fg: 'var(--color-success-text)' },
  bad: { bg: 'var(--color-danger-bg)', fg: 'var(--color-danger-text)' },
  action: { bg: 'var(--color-violet-bg)', fg: 'var(--color-violet-text)' },
}

function AddCardForm({ retroId, kind }: { retroId: string; kind: 'good' | 'bad' }) {
  const { t } = useTranslation()
  const addCard = useRetroBoardStore((s) => s.addCard)
  const [text, setText] = useState('')
  const [links, setLinks] = useState<RetroLinkRef[]>([])
  const [sending, setSending] = useState(false)

  async function send() {
    if (!text.trim() || sending) return
    setSending(true)
    const ok = await addCard(retroId, kind, text, links)
    setSending(false)
    if (ok) { setText(''); setLinks([]) }
  }

  return (
    <div className="space-y-1.5">
      <Textarea
        value={text}
        rows={2}
        maxLength={CARD_MAX_LENGTH}
        placeholder={t(kind === 'good' ? 'retro.addGood' : 'retro.addBad')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
      />
      <EntityLinksPicker value={links} onChange={setLinks} />
      <div className="flex justify-end">
        <Button size="xs" onClick={send} disabled={!text.trim() || sending}>{t('retro.sendCard')}</Button>
      </div>
    </div>
  )
}

export default function RetroBoard({ retro, userId, nameOf }: Props) {
  const { t } = useTranslation()
  const { cards: allCards, authors, links, votes, comments, loading, toggleVote, addAction } = useRetroBoardStore()
  // O store também guarda as ações das retros anteriores (follow-up); as raias mostram só as desta retro.
  const cards = allCards.filter((c) => c.retroId === retro.id)
  const isAdmin = useAuthStore((s) => s.profile?.role === 'admin')
  const [openActionId, setOpenActionId] = useState<string | null>(null)
  const [newAction, setNewAction] = useState('')

  const revealed = RETRO_PHASES.indexOf(retro.phase) >= 2
  const collecting = retro.phase === 'collecting'
  const conductor = isRetroConductor(retro, userId)
  const participant = conductor || (!!userId && retro.participantIds.includes(userId))
  const canWrite = collecting && participant
  // Votar e criar ações só com a urna fechada/em discussão (o banco também exige isso).
  const interactionOpen = participant && (retro.phase === 'revealed' || retro.phase === 'discussing')
  const canReview = (participant || canManageRetro(retro, userId, isAdmin)) && retro.phase !== 'closed'

  const followUp = retro.previousRetroId ? (
    <RetroFollowUpPanel retro={retro} canReview={canReview} onOpenAction={setOpenActionId} />
  ) : null

  const actionModal = openActionId && (
    <RetroActionModal
      key={openActionId}
      retro={retro}
      cardId={openActionId}
      userId={userId}
      isAdmin={isAdmin}
      nameOf={nameOf}
      interactionOpen={interactionOpen}
      onOpenAction={setOpenActionId}
      onClose={() => setOpenActionId(null)}
    />
  )

  if (retro.phase === 'draft') {
    return <div>{followUp}<Banner>{t('retro.board_draft')}</Banner>{actionModal}</div>
  }

  // Reaberta: a urna voltou a 'collecting', mas o que já foi revelado continua visível a todos.
  const reopened = collecting && !!retro.revealedAt
  const showActions = revealed || cards.some((c) => c.kind === 'action')
  const kinds: RetroCardKind[] = showActions ? ['good', 'bad', 'action'] : ['good', 'bad']
  const pendingCount = cards.filter((c) => !c.revealedAt).length
  const banner = collecting
    ? reopened
      ? t('retro.board_reopened')
      : conductor
        ? t('retro.board_collecting_conductor', { n: pendingCount })
        : participant ? t('retro.board_collecting_participant') : t('retro.board_collecting_viewer')
    : null

  const counts = voteCounts(votes)
  const votesLeft = Math.max(0, retro.votesPerPerson - votesUsed(votes, allCards, userId))
  const voteFor = (card: RetroCard) => {
    const voted = votes.some((v) => v.cardId === card.id && v.userId === userId)
    const noVotesLeft = card.kind !== 'action' && !voted && votesLeft <= 0
    return {
      count: counts.get(card.id) ?? 0,
      voted,
      disabled: !interactionOpen || noVotesLeft,
      title: !interactionOpen ? t('retro.voteClosed') : noVotesLeft ? t('retro.voteLimitReached') : voted ? t('retro.voteRemove') : t('retro.voteBtn'),
      onToggle: () => toggleVote(card.id),
    }
  }

  const actions = cards.filter((c) => c.kind === 'action')
  const parentOf = (c: RetroCard) => (c.parentCardId ? cards.find((x) => x.id === c.parentCardId) : undefined)
  // Ação "de topo": endereça um card bom/ruim ou nada. Sub-ação: filha de outra ação.
  const topActions = sortByVotes(actions.filter((a) => parentOf(a)?.kind !== 'action'), counts)

  async function createTopAction() {
    if (!newAction.trim()) return
    const id = await addAction(retro.id, newAction)
    if (id) { setNewAction(''); setOpenActionId(id) }
  }

  return (
    <div>
      {followUp}
      {banner && <Banner>{banner}</Banner>}
      {interactionOpen && retro.votesPerPerson > 0 && (
        <p className="text-xs mb-3" style={{ color: votesLeft === 0 ? 'var(--color-warning-text)' : 'var(--text-tertiary)' }}>
          {votesLeft === 0 ? t('retro.votesNone', { max: retro.votesPerPerson }) : t('retro.votesLeft', { n: votesLeft, max: retro.votesPerPerson })}
        </p>
      )}
      <div className={`grid grid-cols-1 gap-4 ${showActions ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        {kinds.map((kind) => {
          const laneCards = kind === 'action' ? [] : sortByVotes(cards.filter((c) => c.kind === kind), counts)
          const style = LANE_STYLE[kind]
          const laneCount = kind === 'action' ? topActions.length : laneCards.length
          return (
            <section key={kind} className="min-w-0">
              <div
                className="flex items-center justify-between px-3 py-2 mb-2 text-xs font-[600]"
                style={{ background: style.bg, color: style.fg, borderRadius: 'var(--radius-md)' }}
              >
                <span>{t(`retro.lane_${kind}`)}</span>
                {(revealed || conductor || reopened) && <span className="font-normal">{laneCount}</span>}
              </div>
              <div className="space-y-2">
                {canWrite && kind !== 'action' && <AddCardForm retroId={retro.id} kind={kind} />}

                {kind === 'action' ? (
                  <>
                    {interactionOpen && (
                      <div className="flex gap-1.5">
                        <Input
                          value={newAction}
                          maxLength={CARD_MAX_LENGTH}
                          placeholder={t('retro.newActionPlaceholder')}
                          onChange={(e) => setNewAction(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') createTopAction() }}
                        />
                        <Button size="xs" onClick={createTopAction} disabled={!newAction.trim()}>{t('retro.createAction')}</Button>
                      </div>
                    )}
                    {topActions.length === 0 ? (
                      !loading && <p className="text-xs px-1 py-2" style={{ color: 'var(--text-tertiary)' }}>{interactionOpen ? t('retro.actionsLaneHint') : t('retro.actionsEmpty')}</p>
                    ) : (
                      topActions.map((a) => (
                        <RetroActionCard
                          key={a.id}
                          card={a}
                          subActions={actions.filter((x) => x.parentCardId === a.id)}
                          links={links.filter((l) => l.cardId === a.id)}
                          addresses={parentOf(a)?.text}
                          commentCount={comments.filter((c) => c.cardId === a.id).length}
                          vote={voteFor(a)}
                          onOpen={setOpenActionId}
                        />
                      ))
                    )}
                  </>
                ) : laneCards.length === 0 ? (
                  !loading && (
                    <p className="text-xs px-1 py-2" style={{ color: 'var(--text-tertiary)' }}>
                      {revealed || reopened ? t('retro.laneEmpty') : t('retro.cardsHiddenEmpty')}
                    </p>
                  )
                ) : (
                  laneCards.map((card) => {
                    const authorId = authors[card.id]
                    const mine = !!userId && authorId === userId
                    return (
                      <RetroCardItem
                        key={card.id}
                        card={card}
                        mine={mine}
                        canEditText={collecting && mine && !card.revealedAt}
                        canLink={(collecting && mine) || (participant && (retro.phase === 'revealed' || retro.phase === 'discussing'))}
                        links={links.filter((l) => l.cardId === card.id)}
                        authorName={!!card.revealedAt && !retro.anonymous && authorId ? nameOf(authorId) : undefined}
                        secret={!card.revealedAt && !mine}
                        vote={card.revealedAt ? voteFor(card) : undefined}
                        actions={card.revealedAt ? {
                          count: actions.filter((a) => a.parentCardId === card.id).length,
                          canAdd: interactionOpen,
                          onCreate: async (text) => { const id = await addAction(retro.id, text, card.id); if (id) setOpenActionId(id) },
                        } : undefined}
                      />
                    )
                  })
                )}
              </div>
            </section>
          )
        })}
      </div>

      {actionModal}
    </div>
  )
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs mb-4 px-3 py-2.5 rounded-[var(--radius-md)]" style={{ background: 'var(--surface-subtle)', color: 'var(--text-secondary)' }}>
      {children}
    </p>
  )
}
