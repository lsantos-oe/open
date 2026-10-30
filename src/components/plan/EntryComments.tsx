import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore, CommentScope } from '@/store/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import type { Entry, EntryComment } from '@/types'
import { buildThreads, MentionRef, timeAgo } from '@/utils/commentThread'
import DocView from '@/components/editor/DocView'
import CommentComposer from './CommentComposer'

const AVATAR_COLORS = ['#D9530E', '#3568C4', '#1A8850', '#7C3AED', '#A8790A', '#D14343', '#0E7490', '#BE185D']
const colorFor = (s: string) => AVATAR_COLORS[[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_COLORS.length]
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'

function Avatar({ name, src, size }: { name: string; src?: string; size: number }) {
  if (src) return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <span
      style={{
        width: size, height: size, borderRadius: '50%', background: colorFor(name), color: 'white', fontSize: size * 0.4, fontWeight: 600,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >
      {initials(name)}
    </span>
  )
}

const linkBtn: React.CSSProperties = { fontSize: 11.5, fontWeight: 500, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }

interface Props {
  /** A tarefa é lida do store pelo id (o objeto que chega ao modal é uma cópia e não acompanha comentários novos). */
  entryId: string
  scope: CommentScope
  /** Altura máxima da lista de comentários (rola por dentro; a caixa de comentar fica fixa embaixo). */
  maxListHeight?: number
  /** Preenche o espaço do contêiner (painel lateral): a lista rola e a caixa de comentar fica fixa embaixo. */
  fill?: boolean
}

/** Conversa de uma tarefa, em cadeia: comentários com autor e data, respostas, menções (@, com aviso), edição e exclusão. */
function findEntry(state: ReturnType<typeof useAppStore.getState>, id: string): Entry | undefined {
  const inList = (list: Entry[]) => list.find((e) => e.id === id)
  for (const p of state.projects) for (const ph of p.phases) { const e = inList(ph.entries); if (e) return e }
  for (const i of state.incidents) { const e = inList(i.entries); if (e) return e }
  return inList(state.standaloneTasks)
}

export default function EntryComments({ entryId, scope, maxListHeight = 340, fill }: Props) {
  const entry = useAppStore((s) => findEntry(s, entryId))
  if (!entry) return null
  return <Conversation entry={entry} scope={scope} maxListHeight={maxListHeight} fill={!!fill} />
}

function Conversation({ entry, scope, maxListHeight, fill }: { entry: Entry; scope: CommentScope; maxListHeight: number; fill: boolean }) {
  const { addEntryComment, editEntryComment, deleteEntryComment, subscribeEntryComments } = useAppStore()
  const user = useAuthStore((s) => s.user)
  const isAdmin = useAuthStore((s) => s.profile?.role === 'admin')
  const [replyTo, setReplyTo] = useState<{ rootId: string; target: EntryComment } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const threads = useMemo(() => buildThreads(entry.comments), [entry.comments])
  const total = entry.comments.length

  // Comentários de outras pessoas chegam sozinhos enquanto a tarefa está aberta.
  useEffect(() => subscribeEntryComments(entry.id), [entry.id, subscribeEntryComments])

  // Abre rolado até o fim (o mais recente) e acompanha comentários novos.
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [entry.id, total])

  const canEdit = (c: EntryComment) => (c.authorId ? c.authorId === user?.id : true)
  const canDelete = (c: EntryComment) => canEdit(c) || isAdmin

  function send(markdown: string, parentId?: string) {
    addEntryComment(scope, entry.id, { text: markdown, parentId })
    setReplyTo(null)
  }

  function renderComment(c: EntryComment, rootId: string, isReply: boolean) {
    const editing = editingId === c.id
    return (
      <div key={c.id} style={{ display: 'flex', gap: 8 }}>
        <Avatar name={c.author} src={c.authorAvatar} size={isReply ? 24 : 30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <CommentComposer
              initialMarkdown={c.text}
              submitLabel="Salvar"
              autoFocus
              onCancel={() => setEditingId(null)}
              onSubmit={(md) => { editEntryComment(entry.id, c.id, md); setEditingId(null) }}
            />
          ) : (
            <>
              <div style={{ background: 'var(--surface-subtle)', borderRadius: 14, padding: '7px 12px', display: 'inline-block', maxWidth: '100%' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{c.author}</div>
                <DocView markdown={c.text} fontSize={13} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3, paddingLeft: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }} title={new Date(c.createdAt).toLocaleString()}>
                  {timeAgo(c.createdAt)}
                </span>
                {c.updatedAt && <span style={{ fontSize: 11.5, color: 'var(--text-disabled)' }} title={`Editado em ${new Date(c.updatedAt).toLocaleString()}`}>editado</span>}
                <button type="button" style={linkBtn} onClick={() => setReplyTo({ rootId, target: c })}>Responder</button>
                {canEdit(c) && <button type="button" style={linkBtn} onClick={() => setEditingId(c.id)}>Editar</button>}
                {canDelete(c) && (
                  <button
                    type="button"
                    style={{ ...linkBtn, color: 'var(--color-danger-text)' }}
                    onClick={() => {
                      const hasReplies = !isReply && entry.comments.some((x) => x.parentId === c.id)
                      if (window.confirm(hasReplies ? 'Apagar este comentário e as respostas dele?' : 'Apagar este comentário?')) deleteEntryComment(entry.id, c.id)
                    }}
                  >
                    Excluir
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <section aria-label="Comentários" style={fill ? { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } : undefined}>
      <h3 style={{ fontSize: 11.5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-tertiary)', marginBottom: 10 }}>
        Comentários{total > 0 ? ` (${total})` : ''}
      </h3>

      <div ref={listRef} style={{ ...(fill ? { flex: 1, minHeight: 0 } : { maxHeight: maxListHeight }), overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingRight: 4, marginBottom: 12 }}>
        {threads.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-disabled)', padding: '6px 0' }}>Nenhum comentário ainda. Comece a conversa abaixo — use @ para mencionar alguém.</p>
        )}
        {threads.map(({ root, replies }) => (
          <div key={root.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {renderComment(root, root.id, false)}
            {(replies.length > 0 || replyTo?.rootId === root.id) && (
              <div style={{ marginLeft: 38, display: 'flex', flexDirection: 'column', gap: 8, borderLeft: '2px solid var(--border-default)', paddingLeft: 10 }}>
                {replies.map((r) => renderComment(r, root.id, true))}
                {replyTo?.rootId === root.id && (
                  <CommentComposer
                    key={replyTo.target.id}
                    // Responder a uma resposta menciona quem você está respondendo (como numa rede social).
                    prefillMention={replyTo.target.id !== root.id && replyTo.target.authorId ? { id: replyTo.target.authorId, name: replyTo.target.author } as MentionRef : undefined}
                    placeholder={`Responder a ${replyTo.target.author}…`}
                    submitLabel="Responder"
                    autoFocus
                    onCancel={() => setReplyTo(null)}
                    onSubmit={(md) => send(md, root.id)}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <CommentComposer placeholder="Escreva um comentário… use @ para mencionar alguém" onSubmit={(md) => send(md)} />
      <p style={{ fontSize: 11.5, color: 'var(--text-disabled)', marginTop: 4, paddingLeft: 6 }}>Enter envia · Shift+Enter quebra a linha</p>
    </section>
  )
}
