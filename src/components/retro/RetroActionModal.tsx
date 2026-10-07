import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAppStore } from '@/store/useAppStore'
import { useRetroBoardStore } from '@/stores/useRetroBoardStore'
import { useRetroStore } from '@/stores/useRetroStore'
import { teamDirectoryAsTeamMembers } from '@/ai/tools/helpers'
import { Retro, RetroActionStatus, RetroLinkRef } from '@/types/retro'
import { ACTION_STATUSES, REVIEW_OUTCOME_STYLE, canEngageAction, voteCounts } from '@/utils/retroBoard'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea, Field } from '@/components/ui/Input'
import OwnersField from '@/components/plan/OwnersField'
import { EntityLinksPicker } from './EntityLinks'
import VoteButton from './VoteButton'

interface Props {
  retro: Retro
  cardId: string
  userId?: string
  isAdmin?: boolean
  nameOf: (userId?: string) => string
  /** Participante em fase que aceita novas subações/votos (urna fechada ou discussão). */
  interactionOpen: boolean
  /** Pode criar subações (urna fechada/discussão e, se a retro restringe, só o condutor). */
  canCreateActions: boolean
  onOpenAction: (id: string) => void
  onClose: () => void
}

const sameRefs = (a: RetroLinkRef[], b: RetroLinkRef[]) =>
  a.length === b.length && a.every((x) => b.some((y) => y.type === x.type && y.id === x.id))

export default function RetroActionModal({ retro, cardId, userId, isAdmin, nameOf, interactionOpen, canCreateActions, onOpenAction, onClose }: Props) {
  const { t } = useTranslation()
  const { teamDirectory, contacts } = useAppStore()
  const retros = useRetroStore((st) => st.retros)
  const { cards, links, votes, comments, reviews, updateAction, setCardLinks, addAction, addComment, deleteComment, deleteCard, toggleVote } = useRetroBoardStore()

  const card = cards.find((c) => c.id === cardId)
  const teamMembers = useMemo(() => teamDirectoryAsTeamMembers(teamDirectory), [teamDirectory])
  const cardLinkRefs = useMemo<RetroLinkRef[]>(
    () => links.filter((l) => l.cardId === cardId).map((l) => ({ type: l.type, id: l.id })),
    [links, cardId],
  )

  // Rascunho local: os campos só vão ao banco em "Salvar" (cada ação tem muitos campos de texto livre).
  const [draft, setDraft] = useState(() => card && ({
    text: card.text, description: card.description ?? '', owners: card.owners, involved: card.involved,
    successMetric: card.successMetric ?? '', successTarget: card.successTarget ?? '', successResult: card.successResult ?? '',
    dueDate: card.dueDate ?? '', actionStatus: card.actionStatus as RetroActionStatus, resolutionNote: card.resolutionNote ?? '',
  }))
  const [draftLinks, setDraftLinks] = useState<RetroLinkRef[]>(cardLinkRefs)
  const [subText, setSubText] = useState('')
  const [commentText, setCommentText] = useState('')
  const [busy, setBusy] = useState(false)

  if (!card || !draft) return null // a ação foi excluída (por mim ou por outra pessoa)

  const canEdit = canEngageAction(retro, card, userId, isAdmin, retros)
  // Ação de uma retro anterior (follow-up): editar/comentar vale, mas voto e subações ficam na retro de origem.
  const foreign = card.retroId !== retro.id
  const history = reviews.filter((r) => r.cardId === card.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const retroTitle = (id: string) => retros.find((r) => r.id === id)?.title ?? '—'
  const canDelete = !!userId && (isAdmin || retro.createdBy === userId || retro.conductorId === userId)
  const counts = voteCounts(votes)
  const subActions = cards.filter((c) => c.parentCardId === card.id && c.kind === 'action')
  const parent = card.parentCardId ? cards.find((c) => c.id === card.parentCardId) : undefined
  const myComments = comments.filter((c) => c.cardId === card.id)
  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => setDraft((d) => d && { ...d, [k]: v })
  const dirty =
    draft.text !== card.text || draft.description !== (card.description ?? '') ||
    JSON.stringify(draft.owners) !== JSON.stringify(card.owners) || JSON.stringify(draft.involved) !== JSON.stringify(card.involved) ||
    draft.successMetric !== (card.successMetric ?? '') || draft.successTarget !== (card.successTarget ?? '') || draft.successResult !== (card.successResult ?? '') ||
    draft.dueDate !== (card.dueDate ?? '') || draft.actionStatus !== card.actionStatus || draft.resolutionNote !== (card.resolutionNote ?? '') ||
    !sameRefs(draftLinks, cardLinkRefs)

  async function save() {
    if (!canEdit || busy || !draft!.text.trim()) return
    setBusy(true)
    let ok = await updateAction(card!.id, { ...draft! })
    if (ok && !sameRefs(draftLinks, cardLinkRefs)) ok = await setCardLinks(card!.id, card!.retroId, draftLinks)
    setBusy(false)
    if (ok) onClose()
  }

  async function addSub() {
    if (!subText.trim()) return
    const id = await addAction(card!.retroId, subText, card!.id)
    if (id) setSubText('')
  }

  async function sendComment() {
    if (!commentText.trim()) return
    if (await addComment(card!.id, card!.retroId, commentText)) setCommentText('')
  }

  async function remove() {
    if (!window.confirm(t('retro.deleteActionConfirm'))) return
    if (await deleteCard(card!.id)) onClose()
  }

  const showResolution = draft.actionStatus === 'done' || draft.actionStatus === 'dropped'

  return (
    <Modal
      open
      onClose={onClose}
      title={t('retro.actionTitle')}
      size="xl"
      footer={
        <>
          {canDelete && <Button variant="danger" size="sm" className="mr-auto" onClick={remove}>{t('retro.deleteAction')}</Button>}
          <Button variant="ghost" onClick={onClose}>{t('retro.close')}</Button>
          {canEdit && <Button onClick={save} disabled={!dirty || busy || !draft.text.trim()}>{t('retro.saveAction')}</Button>}
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <div className="space-y-4 min-w-0">
          {!canEdit && (
            <p className="text-xs px-3 py-2 rounded-[var(--radius-md)]" style={{ background: 'var(--surface-subtle)', color: 'var(--text-secondary)' }}>{t('retro.actionReadOnly')}</p>
          )}
          {foreign && (
            <p className="text-xs px-3 py-2 rounded-[var(--radius-md)]" style={{ background: 'var(--color-info-bg)', color: 'var(--color-info-text)' }}>
              {t('retro.foreignAction', { title: retroTitle(card.retroId) })} — {t('retro.foreignActionHint')}
            </p>
          )}
          {parent && (
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {t('retro.addressesCard')}: <span style={{ color: 'var(--text-secondary)' }}>“{parent.text}”</span>
            </p>
          )}

          <Field label={t('retro.actionText')} required>
            <Textarea value={draft.text} disabled={!canEdit} onChange={(e) => set('text', e.target.value)} />
          </Field>
          <Field label={t('retro.actionDescription')}>
            <Textarea value={draft.description} disabled={!canEdit} onChange={(e) => set('description', e.target.value)} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('retro.status')}>
              <Select value={draft.actionStatus} disabled={!canEdit} onChange={(e) => set('actionStatus', e.target.value as RetroActionStatus)}>
                {ACTION_STATUSES.map((s) => <option key={s} value={s}>{t(`retro.actionStatus_${s}`)}</option>)}
              </Select>
            </Field>
            <Field label={t('retro.dueDate')}>
              <Input type="date" value={draft.dueDate} disabled={!canEdit} onChange={(e) => set('dueDate', e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('retro.owners')}>
              {canEdit
                ? <OwnersField owners={draft.owners} onChange={(o) => set('owners', o)} teamMembers={teamMembers} kind="executor" />
                : <span className="text-[13px]">{draft.owners.map((o) => o.name).join(', ') || t('retro.noOwner')}</span>}
            </Field>
            <Field label={t('retro.involved')}>
              {canEdit
                ? <OwnersField owners={draft.involved} onChange={(o) => set('involved', o)} teamMembers={teamMembers} contacts={contacts} />
                : <span className="text-[13px]">{draft.involved.map((o) => o.name).join(', ') || '—'}</span>}
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label={t('retro.successMetric')} hint={t('retro.successMetricHint')}>
              <Input value={draft.successMetric} disabled={!canEdit} onChange={(e) => set('successMetric', e.target.value)} />
            </Field>
            <Field label={t('retro.successTarget')}>
              <Input value={draft.successTarget} disabled={!canEdit} onChange={(e) => set('successTarget', e.target.value)} />
            </Field>
            <Field label={t('retro.successResult')}>
              <Input value={draft.successResult} disabled={!canEdit} onChange={(e) => set('successResult', e.target.value)} />
            </Field>
          </div>

          {(showResolution || draft.resolutionNote) && (
            <Field label={t('retro.resolutionNote')} hint={t('retro.resolutionHint')}>
              <Textarea value={draft.resolutionNote} disabled={!canEdit} onChange={(e) => set('resolutionNote', e.target.value)} />
            </Field>
          )}

          {canEdit && (
            <Field label={t('retro.linksPlaceholder')}>
              <EntityLinksPicker value={draftLinks} onChange={setDraftLinks} />
            </Field>
          )}

          <section>
            <h3 className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('retro.subActions')}</h3>
            {subActions.length === 0 && <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>{t('retro.noSubActions')}</p>}
            <ul className="space-y-1 mb-2">
              {subActions.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => onOpenAction(s.id)} className="text-[13px] text-left hover:underline" style={{ color: 'var(--text-primary)' }}>
                    <span aria-hidden>{s.actionStatus === 'done' ? '✓ ' : '○ '}</span>{s.text}
                    <span className="ml-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{t(`retro.actionStatus_${s.actionStatus}`)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {canCreateActions && !foreign && (
              <div className="flex gap-2">
                <Input value={subText} placeholder={t('retro.addSubAction')} onChange={(e) => setSubText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addSub() }} />
                <Button size="sm" variant="secondary" onClick={addSub} disabled={!subText.trim()}>{t('retro.createAction')}</Button>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4 min-w-0">
          <div className="flex items-center gap-2">
            <VoteButton
              count={counts.get(card.id) ?? 0}
              voted={votes.some((v) => v.cardId === card.id && v.userId === userId)}
              disabled={foreign || !interactionOpen || !userId || !retro.participantIds.concat(retro.conductorId ?? retro.createdBy).includes(userId)}
              title={t('retro.voteBtn')}
              onToggle={() => toggleVote(card.id)}
            />
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('retro.supports')}</span>
          </div>

          {history.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('retro.reviewHistory')}</h3>
              <ul className="space-y-2">
                {history.map((r) => (
                  <li key={r.id} className="text-[12.5px]">
                    <span className="inline-block px-1.5 py-[1px] text-[10.5px] font-[500]" style={{ ...REVIEW_OUTCOME_STYLE[r.outcome], borderRadius: 'var(--radius-pill)' }}>
                      {t(`retro.outcomeDone_${r.outcome}`)}
                    </span>
                    <span className="ml-1.5 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{t('retro.reviewedIn', { title: retroTitle(r.retroId) })}</span>
                    {r.result && <p className="mt-0.5" style={{ color: 'var(--text-primary)' }}>{t('retro.successResult')}: {r.result}</p>}
                    {r.note && <p className="mt-0.5 whitespace-pre-wrap break-words" style={{ color: 'var(--text-secondary)' }}>{r.note}</p>}
                    <p className="text-[10.5px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      {t('retro.reviewedByAt', { name: nameOf(r.reviewedBy), when: formatDistanceToNow(new Date(r.createdAt), { addSuffix: true, locale: ptBR }) })}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('retro.comments')}</h3>
            {myComments.length === 0 && <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>{t('retro.noComments')}</p>}
            <ul className="space-y-2 mb-2">
              {myComments.map((c) => (
                <li key={c.id} className="text-[12.5px] p-2 rounded-[var(--radius-md)]" style={{ background: 'var(--surface-subtle)' }}>
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>{nameOf(c.authorId)}</span>
                    <span className="text-[10.5px]" style={{ color: 'var(--text-tertiary)' }}>
                      {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap break-words">{c.text}</p>
                  {(c.authorId === userId || isAdmin) && (
                    <button type="button" onClick={() => deleteComment(c.id)} className="text-[10.5px] mt-1 hover:underline" style={{ color: 'var(--color-danger-text)' }}>{t('retro.deleteComment')}</button>
                  )}
                </li>
              ))}
            </ul>
            {canEdit && (
              <div className="space-y-1.5">
                <Textarea rows={2} value={commentText} placeholder={t('retro.commentPlaceholder')} onChange={(e) => setCommentText(e.target.value)} />
                <div className="flex justify-end"><Button size="xs" onClick={sendComment} disabled={!commentText.trim()}>{t('retro.sendComment')}</Button></div>
              </div>
            )}
          </section>
        </aside>
      </div>
    </Modal>
  )
}
