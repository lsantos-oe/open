import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/useAuthStore'
import { useOverlayStore } from '@/stores/useOverlayStore'
import { Entry } from '@/types'
import EntryComments from './EntryComments'

interface Props {
  projectId: string
  entry: Entry
  onClose: () => void
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function CommentsPanel({ projectId, entry, onClose }: Props) {
  const { t } = useTranslation()
  const { user, profile } = useAuthStore()
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    useOverlayStore.getState().openSidePanel()
    return () => useOverlayStore.getState().closeSidePanel()
  }, [])

  // Resolve creator name for audit footer
  const creatorName = entry.createdById && entry.createdById === user?.id
    ? (profile?.name ?? user?.email ?? null)
    : null

  const updaterName = entry.updatedById && entry.updatedById === user?.id
    ? (profile?.name ?? user?.email ?? null)
    : null

  const panel = (
    <div className="fixed inset-y-0 right-0 w-96 bg-[var(--surface-card)] shadow-2xl border-l border-[var(--border-default)] z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--border-default)]">
        <div className="min-w-0">
          <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wide font-semibold mb-0.5">Comentários</p>
          <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">{entry.name}</h3>
        </div>
        <button
          onClick={onClose}
          className="ml-3 shrink-0 w-7 h-7 flex items-center justify-center rounded-[var(--radius-md)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Conversa em cadeia: a lista rola e a caixa de comentar fica fixa embaixo */}
      <div className="flex-1 min-h-0 px-5 py-4">
        <EntryComments entryId={entry.id} scope={{ type: 'project', projectId }} fill />
      </div>

      {/* Entry audit footer */}
      {(entry.createdAt || entry.updatedAt) && (
        <div
          className="px-5 py-2.5 space-y-0.5"
          style={{ borderTop: '0.5px solid var(--border-default)', background: 'var(--surface-subtle)' }}
        >
          {entry.createdAt && (
            <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
              {t('audit.createdBy')}
              {creatorName ? ` ${creatorName}` : ''}
              {' '}{t('audit.at')} {formatDate(entry.createdAt)}
            </p>
          )}
          {entry.updatedAt && entry.updatedAt !== entry.createdAt && (
            <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
              {t('audit.updatedAt')}
              {updaterName ? ` ${t('audit.by')} ${updaterName}` : ''}
              {' '}{t('audit.at')} {formatDate(entry.updatedAt)}
            </p>
          )}
        </div>
      )}

    </div>
  )

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      {panel}
    </>,
    document.body,
  )
}
