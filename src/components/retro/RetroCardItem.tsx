import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RetroCard } from '@/types/retro'
import { useRetroBoardStore } from '@/stores/useRetroBoardStore'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'

export const CARD_MAX_LENGTH = 500

interface Props {
  card: RetroCard
  mine: boolean
  /** Só o autor edita/exclui, e só enquanto a urna está aberta. */
  editable: boolean
  /** Se o autor deve aparecer (retro não anônima, já revelada). */
  authorName?: string
  /** O condutor vendo, antes da revelação, o card de outra pessoa. */
  secret?: boolean
}

export default function RetroCardItem({ card, mine, editable, authorName, secret }: Props) {
  const { t } = useTranslation()
  const { updateCard, deleteCard } = useRetroBoardStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(card.text)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!draft.trim() || busy) return
    setBusy(true)
    const ok = await updateCard(card.id, draft)
    setBusy(false)
    if (ok) setEditing(false)
  }

  async function remove() {
    if (!window.confirm(t('retro.deleteCardConfirm'))) return
    setBusy(true)
    await deleteCard(card.id)
    setBusy(false)
  }

  return (
    <div
      className="p-2.5 text-[13px] rounded-[var(--radius-md)] border"
      style={{ background: 'var(--surface-card)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
    >
      {editing ? (
        <div className="space-y-2">
          <Textarea value={draft} maxLength={CARD_MAX_LENGTH} autoFocus onChange={(e) => setDraft(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="xs" onClick={() => { setEditing(false); setDraft(card.text) }}>{t('retro.cancel')}</Button>
            <Button size="xs" onClick={save} disabled={!draft.trim() || busy}>{t('retro.saveCard')}</Button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words">{card.text}</p>
          <div className="flex items-center justify-between gap-2 mt-1.5 min-h-[18px]">
            <span className="text-[10.5px]" style={{ color: 'var(--text-tertiary)' }}>
              {authorName ?? (mine ? t('retro.mineBadge') : secret ? t('retro.secretBadge') : '')}
              {authorName && mine ? ` · ${t('retro.mineBadge')}` : ''}
            </span>
            {editable && mine && (
              <span className="flex gap-2 text-[11px]">
                <button onClick={() => setEditing(true)} className="hover:underline" style={{ color: 'var(--text-tertiary)' }}>{t('retro.editCard')}</button>
                <button onClick={remove} disabled={busy} className="hover:underline" style={{ color: 'var(--color-danger-text)' }}>{t('retro.deleteCard')}</button>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
