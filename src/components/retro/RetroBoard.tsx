import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Retro, RetroCardKind, RetroLinkRef, RETRO_PHASES } from '@/types/retro'
import { isRetroConductor } from '@/utils/retro'
import { useRetroBoardStore } from '@/stores/useRetroBoardStore'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import RetroCardItem, { CARD_MAX_LENGTH } from './RetroCardItem'
import { EntityLinksPicker } from './EntityLinks'

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
  const { cards, authors, links, loading } = useRetroBoardStore()

  const revealed = RETRO_PHASES.indexOf(retro.phase) >= 2
  const collecting = retro.phase === 'collecting'
  const conductor = isRetroConductor(retro, userId)
  const participant = conductor || (!!userId && retro.participantIds.includes(userId))
  const canWrite = collecting && participant

  if (retro.phase === 'draft') {
    return <Banner>{t('retro.board_draft')}</Banner>
  }

  const kinds: RetroCardKind[] = revealed ? ['good', 'bad', 'action'] : ['good', 'bad']
  const banner = collecting
    ? conductor
      ? t('retro.board_collecting_conductor', { n: cards.length })
      : participant ? t('retro.board_collecting_participant') : t('retro.board_collecting_viewer')
    : null

  return (
    <div>
      {banner && <Banner>{banner}</Banner>}
      <div className={`grid grid-cols-1 gap-4 ${revealed ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        {kinds.map((kind) => {
          const laneCards = cards.filter((c) => c.kind === kind)
          const style = LANE_STYLE[kind]
          return (
            <section key={kind} className="min-w-0">
              <div
                className="flex items-center justify-between px-3 py-2 mb-2 text-xs font-[600]"
                style={{ background: style.bg, color: style.fg, borderRadius: 'var(--radius-md)' }}
              >
                <span>{t(`retro.lane_${kind}`)}</span>
                {(revealed || conductor) && <span className="font-normal">{laneCards.length}</span>}
              </div>
              <div className="space-y-2">
                {canWrite && kind !== 'action' && <AddCardForm retroId={retro.id} kind={kind} />}
                {kind === 'action' ? (
                  <p className="text-xs p-3 text-center" style={{ color: 'var(--text-tertiary)' }}>{t('retro.actionsSoon')}</p>
                ) : laneCards.length === 0 ? (
                  !loading && (
                    <p className="text-xs px-1 py-2" style={{ color: 'var(--text-tertiary)' }}>
                      {revealed ? t('retro.laneEmpty') : t('retro.cardsHiddenEmpty')}
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
                        canEditText={collecting && mine}
                        canLink={(collecting && mine) || (participant && (retro.phase === 'revealed' || retro.phase === 'discussing'))}
                        links={links.filter((l) => l.cardId === card.id)}
                        authorName={revealed && !retro.anonymous && authorId ? nameOf(authorId) : undefined}
                        secret={collecting && !mine}
                      />
                    )
                  })
                )}
              </div>
            </section>
          )
        })}
      </div>
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
