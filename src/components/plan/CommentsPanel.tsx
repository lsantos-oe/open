import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useOverlayStore } from '@/stores/useOverlayStore'
import { Entry, EntryComment } from '@/types'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'

interface Props {
  projectId: string
  entry: Entry
  onClose: () => void
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
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

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '?'
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-purple-500', 'bg-teal-500', 'bg-orange-500',
  'bg-pink-500', 'bg-indigo-500', 'bg-green-500', 'bg-red-500',
]

function hashColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

interface AvatarProps { author: string; currentAuthorName: string | null; avatarUrl: string | null }

function CommentAvatar({ author, currentAuthorName, avatarUrl }: AvatarProps) {
  const isCurrentUser = currentAuthorName && author === currentAuthorName
  if (isCurrentUser && avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={author}
        style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  return (
    <div className={`w-8 h-8 rounded-[var(--radius-pill)] shrink-0 flex items-center justify-center text-xs font-bold text-white ${hashColor(author)}`}>
      {getInitials(author)}
    </div>
  )
}

export default function CommentsPanel({ projectId, entry, onClose }: Props) {
  const { t } = useTranslation()
  const { addComment, removeComment } = useAppStore()
  const { user, profile } = useAuthStore()
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const currentAuthorName = profile?.name ?? user?.email ?? null

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entry.comments.length])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    useOverlayStore.getState().openSidePanel()
    return () => useOverlayStore.getState().closeSidePanel()
  }, [])

  function handleSubmit() {
    if (!text.trim()) return
    addComment(projectId, entry.id, {
      author: currentAuthorName ?? 'Anônimo',
      text: text.trim(),
      createdAt: new Date().toISOString(),
    })
    setText('')
  }

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

      {/* Comment list */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {entry.comments.length === 0 && (
          <div className="text-center py-12 text-[var(--text-tertiary)]">
            <div className="text-3xl mb-2">💬</div>
            <p className="text-sm">Nenhum comentário ainda.</p>
          </div>
        )}
        {entry.comments.map((c: EntryComment) => (
          <div key={c.id} className="flex gap-3 group">
            <CommentAvatar
              author={c.author}
              currentAuthorName={currentAuthorName}
              avatarUrl={profile?.avatar_url ?? null}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-sm font-medium text-[var(--text-secondary)]">{c.author}</span>
                <span className="text-xs text-[var(--text-tertiary)]">{formatTime(c.createdAt)}</span>
              </div>
              <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{c.text}</p>
            </div>
            <button
              onClick={() => removeComment(projectId, entry.id, c.id)}
              className="opacity-0 group-hover:opacity-100 text-[var(--text-disabled)] hover:text-[var(--color-danger-text)] transition-opacity shrink-0 mt-1"
              title="Excluir"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Entry audit footer */}
      {(entry.createdAt || entry.updatedAt) && (
        <div
          className="px-5 py-2.5 space-y-0.5"
          style={{ borderTop: '0.5px solid var(--border-default)', background: 'var(--surface-subtle)' }}
        >
          {entry.createdAt && (
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              {t('audit.createdBy')}
              {creatorName ? ` ${creatorName}` : ''}
              {' '}{t('audit.at')} {formatDate(entry.createdAt)}
            </p>
          )}
          {entry.updatedAt && entry.updatedAt !== entry.createdAt && (
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              {t('audit.updatedAt')}
              {updaterName ? ` ${t('audit.by')} ${updaterName}` : ''}
              {' '}{t('audit.at')} {formatDate(entry.updatedAt)}
            </p>
          )}
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-[var(--border-default)] px-5 py-4 space-y-3">
        {currentAuthorName && (
          <p className="text-xs text-[var(--text-tertiary)]">
            Comentando como <span className="font-medium text-[var(--text-secondary)]">{currentAuthorName}</span>
          </p>
        )}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escreva um comentário…"
          rows={3}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit() }}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--text-tertiary)]">Ctrl+Enter para enviar</span>
          <Button size="sm" onClick={handleSubmit} disabled={!text.trim()}>Enviar</Button>
        </div>
      </div>
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
