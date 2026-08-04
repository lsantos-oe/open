import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore, DiaryScope } from '@/store/useAppStore'
import { HistoryEntry, HistoryEventType } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Field } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { ClockIcon } from '@/components/ui/icons'
import DiaryComments from '@/components/diary/DiaryComments'
import { formatDistanceToNow } from 'date-fns'
import { ptBR, enUS, es, type Locale } from 'date-fns/locale'

const LOCALES: Record<string, Locale> = { pt: ptBR, en: enUS, es }

const EVENT_ICONS: Record<HistoryEventType, string> = {
  project_created: '🚀',
  name_changed: '✏️',
  status_changed: '🔄',
  baseline_set: '📌',
  risk_added: '⚠️',
  delay_logged: '⏱️',
  member_added: '👤',
  meeting_held: '📅',
  open_point_resolved: '✅',
  note: '📝',
}

interface Props {
  scope: DiaryScope
  history: HistoryEntry[]
}

export default function HistoryTab({ scope, history }: Props) {
  const { t, i18n } = useTranslation()
  const { addHistoryEntry, updateHistoryEntry, deleteHistoryEntry } = useAppStore()

  const [showAddNote, setShowAddNote] = useState(false)
  const [editEntry, setEditEntry] = useState<HistoryEntry | null>(null)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteDetail, setNoteDetail] = useState('')
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())

  const locale = LOCALES[i18n.language] ?? enUS

  const sorted = [...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  function toggleComments(id: string) {
    setExpandedComments((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleAddNote() {
    if (!noteTitle.trim()) return
    addHistoryEntry(scope, {
      event: 'note',
      title: noteTitle.trim(),
      detail: noteDetail || undefined,
      isManualNote: true,
    })
    setNoteTitle('')
    setNoteDetail('')
    setShowAddNote(false)
  }

  function handleSaveEdit() {
    if (!editEntry || !noteTitle.trim()) return
    updateHistoryEntry(scope, editEntry.id, {
      title: noteTitle.trim(),
      detail: noteDetail || undefined,
    })
    setEditEntry(null)
  }

  function openEditNote(entry: HistoryEntry) {
    setNoteTitle(entry.title)
    setNoteDetail(entry.detail ?? '')
    setEditEntry(entry)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{history.length} {t('diary.history').toLowerCase()}</p>
        <Button onClick={() => { setNoteTitle(''); setNoteDetail(''); setShowAddNote(true) }}>
          {t('diary.addNote')}
        </Button>
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon={<ClockIcon className="w-9 h-9" />} title={t('diary.noHistory')} />
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div
            className="absolute left-4 top-0 bottom-0 w-px"
            style={{ background: 'var(--border-default)' }}
          />

          <div className="space-y-3 pl-10">
            {sorted.map((entry) => (
              <div key={entry.id} className="relative">
                {/* Icon */}
                <div
                  className="absolute -left-10 w-8 h-8 rounded-[var(--radius-pill)] flex items-center justify-center text-base"
                  style={{ background: 'var(--surface-card)', border: '2px solid var(--border-default)' }}
                >
                  {EVENT_ICONS[entry.event]}
                </div>

                <div
                  className="p-3 rounded-[var(--radius-lg)]"
                  style={{ background: 'var(--surface-card)', border: '1px solid var(--border-default)' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-subtle)', color: 'var(--text-tertiary)' }}>
                          {t(`diary.ev${entry.event.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`)}
                        </span>
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{entry.title}</span>
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true, locale })}
                        </span>
                      </div>
                      {entry.detail && (
                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{entry.detail}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggleComments(entry.id)}
                        className="text-xs px-2 py-1 rounded transition-colors"
                        style={{ color: 'var(--text-tertiary)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                      >
                        💬 {entry.comments.length > 0 ? entry.comments.length : ''}
                      </button>
                      {entry.isManualNote && (
                        <>
                          <button
                            onClick={() => openEditNote(entry)}
                            className="text-xs px-2 py-1 rounded"
                            style={{ color: 'var(--text-tertiary)' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                          >
                            {t('actions.edit')}
                          </button>
                          <button
                            onClick={() => { if (confirm(t('diary.deleteConfirm'))) deleteHistoryEntry(scope, entry.id) }}
                            className="text-xs px-2 py-1 rounded"
                            style={{ color: 'var(--color-danger-text)' }}
                          >
                            {t('actions.delete')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {expandedComments.has(entry.id) && (
                    <DiaryComments
                      scope={scope}
                      parentType="history"
                      parentId={entry.id}
                      comments={entry.comments}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Note Modal */}
      <Modal
        open={showAddNote}
        title={t('diary.historyNoteAdd')}
        onClose={() => setShowAddNote(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddNote(false)}>{t('actions.cancel')}</Button>
            <Button onClick={handleAddNote} disabled={!noteTitle.trim()}>{t('actions.confirm')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('diary.historyNoteTitle')} required>
            <Input autoFocus value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
          </Field>
          <Field label={t('diary.historyNoteDetail')}>
            <textarea
              value={noteDetail}
              onChange={(e) => setNoteDetail(e.target.value)}
              rows={3}
              className="block w-full rounded-[var(--radius-md)] border px-3 py-2 text-sm focus:outline-none focus:ring-1"
              style={{ borderColor: 'var(--border-default)', background: 'var(--surface-input)', color: 'var(--text-primary)', resize: 'none' }}
            />
          </Field>
        </div>
      </Modal>

      {/* Edit Note Modal */}
      <Modal
        open={!!editEntry}
        title={t('diary.editNote')}
        onClose={() => setEditEntry(null)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditEntry(null)}>{t('actions.cancel')}</Button>
            <Button onClick={handleSaveEdit} disabled={!noteTitle.trim()}>{t('actions.save')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('diary.historyNoteTitle')} required>
            <Input autoFocus value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
          </Field>
          <Field label={t('diary.historyNoteDetail')}>
            <textarea
              value={noteDetail}
              onChange={(e) => setNoteDetail(e.target.value)}
              rows={3}
              className="block w-full rounded-[var(--radius-md)] border px-3 py-2 text-sm focus:outline-none focus:ring-1"
              style={{ borderColor: 'var(--border-default)', background: 'var(--surface-input)', color: 'var(--text-primary)', resize: 'none' }}
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
