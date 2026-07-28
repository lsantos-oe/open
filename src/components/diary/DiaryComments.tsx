import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore, DiaryScope } from '@/store/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { DiaryComment } from '@/types'
import { Input, Field } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { formatDistanceToNow } from 'date-fns'
import { ptBR, enUS, es, type Locale } from 'date-fns/locale'

const LOCALES: Record<string, Locale> = { pt: ptBR, en: enUS, es }

interface Props {
  scope: DiaryScope
  parentType: 'open_point' | 'meeting' | 'history'
  parentId: string
  comments: DiaryComment[]
}

export default function DiaryComments({ scope, parentType, parentId, comments }: Props) {
  const { t, i18n } = useTranslation()
  const { addDiaryComment, deleteDiaryComment } = useAppStore()
  const { profile } = useAuthStore()
  const [text, setText] = useState('')
  const [author, setAuthor] = useState(profile?.name ?? '')
  const [adding, setAdding] = useState(false)

  function handleAdd() {
    if (!text.trim() || !author.trim()) return
    addDiaryComment(scope, parentType, parentId, { author: author.trim(), text: text.trim() })
    setText('')
    setAdding(false)
  }

  const locale = LOCALES[i18n.language] ?? enUS

  return (
    <div className="mt-3">
      <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-tertiary)' }}>{t('diary.comments')}</p>
      <div className="space-y-2">
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2 group">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
              style={{ background: 'var(--surface-subtle)', color: 'var(--text-tertiary)' }}
            >
              {c.author.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{c.author}</span>
                <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                  {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true, locale })}
                </span>
                <button
                  onClick={() => deleteDiaryComment(scope, parentType, parentId, c.id)}
                  className="ml-auto text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--color-danger-text)' }}
                >
                  ×
                </button>
              </div>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{c.text}</p>
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="mt-2 space-y-2">
          <Field label={t('diary.commentAuthor')}>
            <Input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder={t('diary.commentAuthor')}
            />
          </Field>
          <Field label={t('diary.commentText')}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              className="block w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1"
              style={{
                borderColor: 'var(--border-default)',
                background: 'var(--surface-input)',
                color: 'var(--text-primary)',
                resize: 'none',
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd() } }}
            />
          </Field>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setAdding(false)}>{t('actions.cancel')}</Button>
            <Button onClick={handleAdd} disabled={!text.trim() || !author.trim()}>{t('actions.add')}</Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 text-xs"
          style={{ color: 'var(--text-tertiary)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--oe-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        >
          + {t('diary.addComment')}
        </button>
      )}
    </div>
  )
}
