import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { MeetingLog, MeetingItem, Phase, TeamMember, EntryOwner } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select, Field } from '@/components/ui/Input'
import DiaryComments from '@/components/diary/DiaryComments'
import FileAttachments from '@/components/diary/FileAttachments'
import OwnersField from '@/components/plan/OwnersField'

interface Props {
  projectId: string
  meetings: MeetingLog[]
  phases: Phase[]
  teamMembers: TeamMember[]
}

interface MeetingForm {
  title: string
  date: string
  notes: string
}

function emptyMeetingForm(): MeetingForm {
  return { title: '', date: new Date().toISOString().slice(0, 10), notes: '' }
}

const ITEM_TYPE_ICONS: Record<MeetingItem['type'], string> = { action: '⚡', decision: '✅', info: 'ℹ️' }

export default function MeetingsTab({ projectId, meetings, phases, teamMembers }: Props) {
  const { t } = useTranslation()
  const { addMeetingLog, updateMeetingLog, deleteMeetingLog, addMeetingItem, updateMeetingItem, deleteMeetingItem, addDiaryAttachment, removeDiaryAttachment } = useAppStore()

  const [showAdd, setShowAdd] = useState(false)
  const [editMeeting, setEditMeeting] = useState<MeetingLog | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [form, setForm] = useState<MeetingForm>(emptyMeetingForm())
  const [participants, setParticipants] = useState<EntryOwner[]>([])
  const [newItemText, setNewItemText] = useState<Record<string, string>>({})
  const [newItemType, setNewItemType] = useState<Record<string, MeetingItem['type']>>({})

  const sortedMeetings = [...meetings].sort((a, b) => b.date.localeCompare(a.date))

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function openAdd() {
    setForm(emptyMeetingForm())
    setParticipants([])
    setShowAdd(true)
  }

  function openEdit(m: MeetingLog) {
    setForm({
      title: m.title,
      date: m.date,
      notes: m.notes ?? '',
    })
    setParticipants(m.participants)
    setEditMeeting(m)
  }

  function handleSaveAdd() {
    if (!form.title.trim() || !form.date) return
    addMeetingLog(projectId, {
      title: form.title.trim(),
      date: form.date,
      participants,
      notes: form.notes || undefined,
      items: [],
    })
    setShowAdd(false)
  }

  function handleSaveEdit() {
    if (!editMeeting || !form.title.trim() || !form.date) return
    updateMeetingLog(projectId, editMeeting.id, {
      title: form.title.trim(),
      date: form.date,
      participants,
      notes: form.notes || undefined,
    })
    setEditMeeting(null)
  }

  function handleAddItem(meetingId: string) {
    const text = newItemText[meetingId]?.trim()
    if (!text) return
    addMeetingItem(projectId, meetingId, {
      text,
      done: false,
      type: newItemType[meetingId] ?? 'action',
    })
    setNewItemText((prev) => ({ ...prev, [meetingId]: '' }))
  }

  function set<K extends keyof MeetingForm>(k: K, v: MeetingForm[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function MeetingFormFields() {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('diary.meetingTitle')} required className="col-span-2">
            <Input autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} />
          </Field>
          <Field label={t('diary.meetingDate')} required>
            <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label={t('diary.meetingAttendees')} className="col-span-2">
            <OwnersField owners={participants} onChange={setParticipants} teamMembers={teamMembers} />
          </Field>
          <Field label={t('diary.meetingNotes')} className="col-span-2">
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={4}
              className="block w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1"
              style={{ borderColor: 'var(--border-default)', background: 'var(--surface-input)', color: 'var(--text-primary)', resize: 'none' }}
            />
          </Field>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{meetings.length} {t('diary.meetings').toLowerCase()}</p>
        <Button onClick={openAdd}>{t('diary.addMeeting')}</Button>
      </div>

      {sortedMeetings.length === 0 ? (
        <p className="text-sm text-center py-12" style={{ color: 'var(--text-tertiary)' }}>{t('diary.noMeetings')}</p>
      ) : (
        <div className="space-y-3">
          {sortedMeetings.map((m) => {
            const isOpen = expanded.has(m.id)
            const doneCount = m.items.filter((i) => i.done).length
            return (
              <div
                key={m.id}
                className="border rounded-lg overflow-hidden"
                style={{ borderColor: 'var(--border-default)', background: 'var(--surface-card)' }}
              >
                {/* Header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
                  style={{ background: 'var(--surface-subtle)' }}
                  onClick={() => toggleExpanded(m.id)}
                >
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{m.date}</span>
                  <span className="font-medium text-sm flex-1" style={{ color: 'var(--text-primary)' }}>{m.title}</span>
                  {m.items.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-card)', color: 'var(--text-tertiary)' }}>
                      {doneCount}/{m.items.length}
                    </span>
                  )}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => openEdit(m)}
                      className="text-xs px-2 py-1 rounded"
                      style={{ color: 'var(--text-tertiary)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                    >
                      {t('actions.edit')}
                    </button>
                    <button
                      onClick={() => { if (confirm(t('diary.deleteConfirm'))) deleteMeetingLog(projectId, m.id) }}
                      className="text-xs px-2 py-1 rounded"
                      style={{ color: 'var(--color-danger-text)' }}
                    >
                      {t('actions.delete')}
                    </button>
                  </div>
                  <svg
                    className="w-4 h-4 transition-transform"
                    style={{ color: 'var(--text-tertiary)', transform: isOpen ? 'rotate(180deg)' : '' }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Expanded body */}
                {isOpen && (
                  <div className="px-4 py-4 space-y-4">
                    {m.participants.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {m.participants.map((p) => (
                          <span
                            key={p.id}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ background: 'var(--oe-primary-light)', color: 'var(--oe-primary)' }}
                          >
                            {p.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {m.notes && (
                      <div className="p-3 rounded-lg text-sm whitespace-pre-wrap" style={{ background: 'var(--surface-subtle)', color: 'var(--text-secondary)' }}>
                        {m.notes}
                      </div>
                    )}

                    {/* Items */}
                    <div>
                      <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-tertiary)' }}>{t('diary.meetingItems')}</p>
                      <div className="space-y-1">
                        {m.items.map((item) => (
                          <div key={item.id} className="flex items-start gap-2 p-2 rounded group" style={{ background: 'var(--surface-subtle)' }}>
                            <input
                              type="checkbox"
                              checked={item.done}
                              onChange={() => updateMeetingItem(projectId, m.id, item.id, { done: !item.done })}
                              className="mt-0.5 rounded"
                            />
                            <span className="text-xs shrink-0" title={item.type}>{ITEM_TYPE_ICONS[item.type]}</span>
                            <span
                              className="text-sm flex-1"
                              style={{ color: 'var(--text-secondary)', textDecoration: item.done ? 'line-through' : 'none', opacity: item.done ? 0.6 : 1 }}
                            >
                              {item.text}
                            </span>
                            {item.responsible && (
                              <span className="text-xs shrink-0" style={{ color: 'var(--text-tertiary)' }}>{item.responsible}</span>
                            )}
                            <button
                              onClick={() => deleteMeetingItem(projectId, m.id, item.id)}
                              className="opacity-0 group-hover:opacity-100 text-xs transition-opacity"
                              style={{ color: 'var(--color-danger-text)' }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Add item inline */}
                      <div className="flex gap-2 mt-2">
                        <Select
                          value={newItemType[m.id] ?? 'action'}
                          onChange={(e) => setNewItemType((prev) => ({ ...prev, [m.id]: e.target.value as MeetingItem['type'] }))}
                          className="w-32 shrink-0"
                        >
                          <option value="action">{t('diary.itemTypeAction')}</option>
                          <option value="decision">{t('diary.itemTypeDecision')}</option>
                          <option value="info">{t('diary.itemTypeInfo')}</option>
                        </Select>
                        <Input
                          value={newItemText[m.id] ?? ''}
                          onChange={(e) => setNewItemText((prev) => ({ ...prev, [m.id]: e.target.value }))}
                          placeholder={t('diary.itemText')}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddItem(m.id) }}
                        />
                        <Button onClick={() => handleAddItem(m.id)}>{t('diary.addItem')}</Button>
                      </div>
                    </div>

                    <FileAttachments
                      scopeId={projectId}
                      parentId={m.id}
                      attachments={m.attachments}
                      onAdd={(att) => addDiaryAttachment({ type: 'project', id: projectId }, 'meeting', m.id, att)}
                      onRemove={(id) => removeDiaryAttachment({ type: 'project', id: projectId }, 'meeting', m.id, id)}
                    />
                    <DiaryComments
                      scope={{ type: 'project', id: projectId }}
                      parentType="meeting"
                      parentId={m.id}
                      comments={m.comments}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add Modal */}
      <Modal
        open={showAdd}
        title={t('diary.addMeeting')}
        onClose={() => setShowAdd(false)}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAdd(false)}>{t('actions.cancel')}</Button>
            <Button onClick={handleSaveAdd} disabled={!form.title.trim() || !form.date}>{t('actions.confirm')}</Button>
          </>
        }
      >
        <MeetingFormFields />
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={!!editMeeting}
        title={t('diary.editMeeting')}
        onClose={() => setEditMeeting(null)}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditMeeting(null)}>{t('actions.cancel')}</Button>
            <Button onClick={handleSaveEdit} disabled={!form.title.trim() || !form.date}>{t('actions.save')}</Button>
          </>
        }
      >
        <MeetingFormFields />
      </Modal>
    </div>
  )
}
