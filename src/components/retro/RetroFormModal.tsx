import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useRetroStore } from '@/stores/useRetroStore'
import { Retro, RetroInput } from '@/types/retro'
import { formatRetroDate } from '@/utils/retro'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Field } from '@/components/ui/Input'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { MultiSelect } from '@/components/ui/MultiSelect'

interface Props {
  open: boolean
  onClose: () => void
  /** Presente = edição; ausente = criação. */
  retro?: Retro
  onSaved?: (id: string) => void
}

const today = () => new Date().toISOString().split('T')[0]

/** Retros que dependem (direta ou indiretamente) desta — vincular uma delas como "anterior" fecharia um ciclo. */
function descendantIds(retros: Retro[], rootId: string): Set<string> {
  const out = new Set<string>()
  let frontier = [rootId]
  while (frontier.length > 0) {
    const next = retros.filter((r) => r.previousRetroId && frontier.includes(r.previousRetroId) && !out.has(r.id))
    next.forEach((r) => out.add(r.id))
    frontier = next.map((r) => r.id)
  }
  return out
}

export default function RetroFormModal({ open, onClose, retro, onSaved }: Props) {
  const { t } = useTranslation()
  const { teamDirectory, settings } = useAppStore()
  const { user, profile } = useAuthStore()
  const { retros, createRetro, updateRetro } = useRetroStore()
  const isAdmin = profile?.role === 'admin'
  const editing = !!retro
  const locked = !!retro && retro.phase !== 'draft'

  const [title, setTitle] = useState(retro?.title ?? '')
  const [retroDate, setRetroDate] = useState(retro?.retroDate ?? today())
  const [periodStart, setPeriodStart] = useState(retro?.periodStart ?? '')
  const [periodEnd, setPeriodEnd] = useState(retro?.periodEnd ?? '')
  const [conductorId, setConductorId] = useState(retro?.conductorId ?? '')
  const [participantIds, setParticipantIds] = useState<string[]>(retro?.participantIds ?? (user ? [user.id] : []))
  const [recordingLink, setRecordingLink] = useState(retro?.recordingLink ?? '')
  const [previousRetroId, setPreviousRetroId] = useState(retro?.previousRetroId ?? '')
  const [anonymous, setAnonymous] = useState(retro?.anonymous ?? true)
  const [votesPerPerson, setVotesPerPerson] = useState(retro?.votesPerPerson ?? 5)
  const [saving, setSaving] = useState(false)

  const people = useMemo(
    () => teamDirectory.filter((p) => p.active).map((p) => ({ id: p.id, label: p.name ?? p.email ?? '—', sublabel: p.name ? p.email ?? undefined : undefined })),
    [teamDirectory],
  )

  const previousOptions = useMemo(() => {
    const blocked = retro ? descendantIds(retros, retro.id) : new Set<string>()
    return retros
      .filter((r) => r.id !== retro?.id && !blocked.has(r.id))
      .map((r) => ({ id: r.id, label: r.title, sublabel: formatRetroDate(r.retroDate, settings.dateFormat) }))
  }, [retros, retro, settings.dateFormat])

  const periodInvalid = !!periodStart && !!periodEnd && periodEnd < periodStart
  const canSave = title.trim().length > 0 && !!retroDate && !periodInvalid && votesPerPerson >= 0 && !saving
  const conductorLocked = locked && !isAdmin

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    const input: RetroInput = {
      title,
      retroDate,
      periodStart: periodStart || undefined,
      periodEnd: periodEnd || undefined,
      recordingLink: recordingLink || undefined,
      conductorId: conductorId || undefined,
      anonymous,
      votesPerPerson,
      previousRetroId: previousRetroId || undefined,
      participantIds,
    }
    const id = retro ? (await updateRetro(retro.id, input) ? retro.id : null) : await createRetro(input)
    setSaving(false)
    if (id) {
      onSaved?.(id)
      onClose()
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('retro.editTitle') : t('retro.newTitle')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('retro.cancel')}</Button>
          <Button onClick={handleSave} disabled={!canSave}>{editing ? t('retro.save') : t('retro.create')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('retro.fieldTitle')} required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('retro.titlePlaceholder')} autoFocus />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label={t('retro.fieldDate')} required>
            <Input type="date" value={retroDate} onChange={(e) => setRetroDate(e.target.value)} />
          </Field>
          <Field label={t('retro.fieldPeriodStart')}>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </Field>
          <Field label={t('retro.fieldPeriodEnd')}>
            <Input type="date" value={periodEnd} min={periodStart || undefined} onChange={(e) => setPeriodEnd(e.target.value)} />
          </Field>
        </div>
        {periodInvalid && (
          <p className="text-xs" style={{ color: 'var(--color-danger-text)' }}>{t('retro.fieldPeriodEnd')} &lt; {t('retro.fieldPeriodStart')}</p>
        )}

        <Field label={t('retro.fieldConductor')} hint={t('retro.conductorHint')}>
          <SearchableSelect
            value={conductorId}
            onChange={setConductorId}
            options={people}
            emptyOptionLabel={t('retro.noConductor')}
            disabled={conductorLocked}
          />
        </Field>

        <Field label={t('retro.fieldParticipants')}>
          <MultiSelect values={participantIds} onChange={setParticipantIds} options={people} placeholder={t('retro.participantsPlaceholder')} />
        </Field>

        <Field label={t('retro.fieldRecording')}>
          <Input type="url" value={recordingLink} onChange={(e) => setRecordingLink(e.target.value)} placeholder="https://..." />
        </Field>

        <Field label={t('retro.fieldPrevious')} hint={t('retro.previousHint')}>
          <SearchableSelect
            value={previousRetroId}
            onChange={setPreviousRetroId}
            options={previousOptions}
            emptyOptionLabel={t('retro.noPrevious')}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t('retro.fieldAnonymous')} hint={t('retro.anonymousHint')}>
            <label className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={anonymous} disabled={locked} onChange={(e) => setAnonymous(e.target.checked)} />
              {anonymous ? t('retro.anonymousYes') : t('retro.anonymousNo')}
            </label>
          </Field>
          <Field label={t('retro.fieldVotes')} hint={t('retro.votesHint')}>
            <Input type="number" min={0} max={50} value={votesPerPerson} onChange={(e) => setVotesPerPerson(Math.max(0, Number(e.target.value) || 0))} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
