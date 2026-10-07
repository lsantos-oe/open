import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RetroCard, RetroCardLink, RetroLinkRef } from '@/types/retro'
import { useRetroBoardStore } from '@/stores/useRetroBoardStore'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { EntityLinkChips, EntityLinksPicker } from './EntityLinks'
import VoteButton from './VoteButton'

export const CARD_MAX_LENGTH = 500

interface Props {
  card: RetroCard
  mine: boolean
  /** Editar o texto / excluir: só o autor, e só enquanto a urna está aberta. */
  canEditText: boolean
  /** Alterar os vínculos: o autor na coleta, ou qualquer participante depois da revelação. */
  canLink: boolean
  links: RetroCardLink[]
  /** Se o autor deve aparecer (retro não anônima, já revelada). */
  authorName?: string
  /** O condutor vendo, antes da revelação, o card de outra pessoa. */
  secret?: boolean
  /** Voto/apoio — só depois da revelação. */
  vote?: { count: number; voted: boolean; disabled: boolean; title?: string; onToggle: () => Promise<unknown> }
  /** Ações que endereçam este card + criação rápida de uma nova. */
  actions?: { count: number; canAdd: boolean; onCreate: (text: string) => Promise<void> }
}

const sameRefs = (a: RetroLinkRef[], b: RetroLinkRef[]) =>
  a.length === b.length && a.every((x) => b.some((y) => y.type === x.type && y.id === x.id))

export default function RetroCardItem({ card, mine, canEditText, canLink, links, authorName, secret, vote, actions }: Props) {
  const { t } = useTranslation()
  const { updateCard, deleteCard, setCardLinks } = useRetroBoardStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(card.text)
  const currentRefs = useMemo<RetroLinkRef[]>(() => links.map((l) => ({ type: l.type, id: l.id })), [links])
  const [draftLinks, setDraftLinks] = useState<RetroLinkRef[]>(currentRefs)
  const [busy, setBusy] = useState(false)
  const [addingAction, setAddingAction] = useState(false)
  const [actionText, setActionText] = useState('')

  async function createAction() {
    if (!actionText.trim() || !actions) return
    setBusy(true)
    await actions.onCreate(actionText)
    setBusy(false)
    setActionText('')
    setAddingAction(false)
  }

  function startEditing() {
    setDraft(card.text)
    setDraftLinks(currentRefs)
    setEditing(true)
  }

  async function save() {
    if (busy || (canEditText && !draft.trim())) return
    setBusy(true)
    let ok = true
    if (canEditText && draft.trim() !== card.text) ok = await updateCard(card.id, draft)
    if (ok && canLink && !sameRefs(draftLinks, currentRefs)) ok = await setCardLinks(card.id, card.retroId, draftLinks)
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
          {canEditText ? (
            <Textarea value={draft} maxLength={CARD_MAX_LENGTH} autoFocus onChange={(e) => setDraft(e.target.value)} />
          ) : (
            <p className="whitespace-pre-wrap break-words">{card.text}</p>
          )}
          {canLink && <EntityLinksPicker value={draftLinks} onChange={setDraftLinks} />}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="xs" onClick={() => setEditing(false)}>{t('retro.cancel')}</Button>
            <Button size="xs" onClick={save} disabled={busy || (canEditText && !draft.trim())}>{t('retro.saveCard')}</Button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words">{card.text}</p>
          <EntityLinkChips links={currentRefs} />
          {(vote || actions) && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {vote && <VoteButton {...vote} />}
              {actions && actions.count > 0 && (
                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {actions.count === 1 ? t('retro.actionsCountOne') : t('retro.actionsCount', { n: actions.count })}
                </span>
              )}
              {actions?.canAdd && !addingAction && (
                <button type="button" onClick={() => setAddingAction(true)} className="text-[11px] hover:underline" style={{ color: 'var(--oe-primary)' }}>
                  {t('retro.addAction')}
                </button>
              )}
            </div>
          )}
          {addingAction && (
            <div className="flex gap-1.5 mt-2">
              <Input
                autoFocus
                value={actionText}
                maxLength={CARD_MAX_LENGTH}
                placeholder={t('retro.newActionFor')}
                onChange={(e) => setActionText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') createAction(); if (e.key === 'Escape') setAddingAction(false) }}
              />
              <Button size="xs" onClick={createAction} disabled={!actionText.trim() || busy}>{t('retro.createAction')}</Button>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 mt-1.5 min-h-[18px]">
            <span className="text-[10.5px]" style={{ color: 'var(--text-tertiary)' }}>
              {authorName ?? (mine ? t('retro.mineBadge') : secret ? t('retro.secretBadge') : '')}
              {authorName && mine ? ` · ${t('retro.mineBadge')}` : ''}
            </span>
            {(canEditText || canLink) && (
              <span className="flex gap-2 text-[11px]">
                <button onClick={startEditing} className="hover:underline" style={{ color: 'var(--text-tertiary)' }}>
                  {canEditText ? t('retro.editCard') : t('retro.editLinks')}
                </button>
                {canEditText && (
                  <button onClick={remove} disabled={busy} className="hover:underline" style={{ color: 'var(--color-danger-text)' }}>{t('retro.deleteCard')}</button>
                )}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
