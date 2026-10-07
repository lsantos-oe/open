import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRetroBoardStore } from '@/stores/useRetroBoardStore'
import { RetroCard, RetroReview, RetroReviewOutcome } from '@/types/retro'
import { REVIEW_OUTCOMES, REVIEW_OUTCOME_STYLE } from '@/utils/retroBoard'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Field } from '@/components/ui/Input'

interface Props {
  /** A ação (de uma retro anterior) que está sendo revisada. */
  card: RetroCard
  /** A retro de follow-up em que a revisão é registrada (a que está aberta na tela). */
  retroId: string
  existing?: RetroReview
  onClose: () => void
}

export default function RetroReviewDialog({ card, retroId, existing, onClose }: Props) {
  const { t } = useTranslation()
  const reviewAction = useRetroBoardStore((s) => s.reviewAction)
  const [outcome, setOutcome] = useState<RetroReviewOutcome>(existing?.outcome ?? (card.actionStatus === 'dropped' ? 'dropped' : card.actionStatus === 'done' ? 'resolved' : 'carried'))
  const [result, setResult] = useState(existing?.result ?? card.successResult ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const ok = await reviewAction(card.id, retroId, outcome, note, result)
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('retro.reviewTitle')}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('retro.cancel')}</Button>
          <Button onClick={save} disabled={saving}>{t('retro.saveReview')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{card.text}</p>
          {(card.successMetric || card.successTarget) && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              {t('retro.successMetric')}: {card.successMetric}{card.successTarget ? ` → ${card.successTarget}` : ''}
            </p>
          )}
        </div>

        <Field label={t('retro.reviewOutcome')}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {REVIEW_OUTCOMES.map((o) => {
              const active = outcome === o
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOutcome(o)}
                  className="text-left p-2.5 text-[12.5px] border transition-colors"
                  style={{
                    borderRadius: 'var(--radius-md)',
                    borderColor: active ? REVIEW_OUTCOME_STYLE[o].color : 'var(--border-default)',
                    background: active ? REVIEW_OUTCOME_STYLE[o].background : 'transparent',
                    color: active ? REVIEW_OUTCOME_STYLE[o].color : 'var(--text-secondary)',
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {t(`retro.outcome_${o}`)}
                </button>
              )
            })}
          </div>
          <p className="text-[11.5px] mt-1.5" style={{ color: 'var(--text-tertiary)' }}>{t(`retro.outcomeHint_${outcome}`)}</p>
        </Field>

        <Field label={t('retro.successResult')}>
          <Input value={result} onChange={(e) => setResult(e.target.value)} />
        </Field>
        <Field label={t('retro.reviewNote')} hint={t('retro.reviewNoteHint')}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
