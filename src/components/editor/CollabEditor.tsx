import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import * as Y from 'yjs'
import { BlockNoteEditor, filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core'
import { blocksToYDoc, withCollaboration } from '@blocknote/core/yjs'
import * as locales from '@blocknote/core/locales'
import { BlockNoteView } from '@blocknote/mantine'
import { SuggestionMenuController, getDefaultReactSlashMenuItems, useCreateBlockNote } from '@blocknote/react'
import '@blocknote/mantine/style.css'
import './editor.css'
import { useAppStore } from '@/store/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { COLLAB_FRAGMENT, SupabaseCollab } from './SupabaseCollab'
import { MentionKind, schema } from './schema'
import { resolveDocFileUrl, uploadDocFile } from './fileStorage'
import { useCollabPresence } from './useCollabPresence'
import { normalizeExportedMarkdown, prepareBlocksForExport } from './markdown'
import { parseMarkdownToBlocks } from './seed'

export interface EditorTemplate {
  title: string
  subtext?: string
  aliases?: string[]
  /** Markdown inserido no ponto do cursor quando o item do menu `/` é escolhido. */
  markdown: string
}

export interface CollabEditorProps {
  /** "<tipo>_<uuid>_<campo>", ex.: project_3f2a…_charter */
  docId: string
  /** Markdown que semeia o documento na primeira abertura (só usado se o documento ainda não existe). */
  seedMarkdown: string
  /** Recebe o Markdown atual (com debounce) — é a projeção que relatórios, exportações e a IA leem. */
  onMarkdownChange?: (markdown: string) => void
  templates?: EditorTemplate[]
}

const CURSOR_COLORS = ['#D9530E', '#3568C4', '#1A8850', '#7C3AED', '#A8790A', '#D14343', '#0E7490', '#BE185D']
const colorFor = (id: string) => CURSOR_COLORS[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % CURSOR_COLORS.length]

function useDarkMode(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return dark
}

/** Abre (ou recria) a conexão colaborativa e só monta o editor quando o documento está pronto. */
export default function CollabEditor(props: CollabEditorProps) {
  const { t } = useTranslation()
  const userId = useAuthStore((s) => s.user?.id)
  const [collab, setCollab] = useState<SupabaseCollab | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [wasReset, setWasReset] = useState(false)
  const [generation, setGeneration] = useState(0)
  const seedRef = useRef(props.seedMarkdown)
  seedRef.current = props.seedMarkdown

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const c = new SupabaseCollab(props.docId, userId)
    setStatus('loading'); setWasReset(false); setCollab(null)
    c.onReset = () => setWasReset(true)

    // Semente: Markdown → blocos → Yjs. Só roda se o documento ainda não existe no banco.
    const seed = async () => {
      const headless = BlockNoteEditor.create({ schema })
      const blocks = await parseMarkdownToBlocks(headless, seedRef.current || '')
      const ydoc = blocksToYDoc(headless, blocks, COLLAB_FRAGMENT)
      return Y.encodeStateAsUpdate(ydoc)
    }
    c.connect(seed).then(() => {
      if (cancelled) return
      setStatus(c.status === 'error' ? 'error' : 'ready')
      setCollab(c)
    })
    return () => { cancelled = true; void c.destroy() }
  }, [props.docId, userId, generation])

  if (status === 'loading') return <p className="text-xs py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>{t('editor.loading')}</p>
  if (status === 'error' || !collab) {
    return (
      <p className="text-xs p-3 rounded-[var(--radius-md)]" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-text)' }}>
        {t('editor.error')}{' '}
        <button type="button" className="underline" onClick={() => setGeneration((g) => g + 1)}>{t('editor.retry')}</button>
      </p>
    )
  }

  return (
    <div>
      {wasReset && (
        <p className="text-xs p-2.5 mb-2 rounded-[var(--radius-md)]" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' }}>
          {t('editor.replaced')}{' '}
          <button type="button" className="underline font-medium" onClick={() => setGeneration((g) => g + 1)}>{t('editor.reload')}</button>
        </p>
      )}
      <EditorBody collab={collab} {...props} />
    </div>
  )
}

function EditorBody({ collab, onMarkdownChange, templates = [], docId }: CollabEditorProps & { collab: SupabaseCollab }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const dark = useDarkMode()
  const { profile, user } = useAuthStore()
  const { teamDirectory, projects, incidents, clients } = useAppStore()
  const people = useCollabPresence(collab.awareness)

  const lang = (i18n.language || 'pt').slice(0, 2)
  const dictionary = lang === 'en' ? locales.en : lang === 'es' ? locales.es : locales.pt

  // Nesta versão do BlockNote a colaboração é opt-in: sem withCollaboration o editor ignora o Yjs
  // (e abriria vazio, sem sincronizar nada).
  const editor = useCreateBlockNote(
    withCollaboration({
      schema,
      dictionary,
      collaboration: {
        fragment: collab.doc.getXmlFragment(COLLAB_FRAGMENT),
        provider: { awareness: collab.awareness },
        user: { id: user?.id, name: profile?.name ?? profile?.email ?? '—', color: colorFor(user?.id ?? 'x') },
        showCursorLabels: 'activity',
      },
      uploadFile: (file: File) => uploadDocFile(docId, file),
      resolveFileUrl: resolveDocFileUrl,
    }),
    [collab],
  )

  // Projeção para Markdown: remonta o texto que os outros sistemas leem. Dispara tanto para edição
  // local quanto remota, então o último a gravar sempre grava o documento já convergido.
  useEffect(() => {
    if (!onMarkdownChange) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let last: string | undefined
    let dirty = false
    const run = async () => {
      dirty = false
      const md = normalizeExportedMarkdown(await editor.blocksToMarkdownLossy(prepareBlocksForExport(editor.document))).trimEnd()
      if (md !== last) { last = md; onMarkdownChange(md) }
    }
    const off = editor.onChange(() => {
      dirty = true
      clearTimeout(timer)
      timer = setTimeout(() => { void run() }, 1500)
    })
    return () => {
      clearTimeout(timer)
      off?.()
      if (dirty) void run() // não perde a última digitação ao sair da tela
    }
  }, [editor, onMarkdownChange])

  const slashItems = useMemo(
    () => async (query: string) => {
      const callout = {
        title: t('editor.callout'),
        subtext: t('editor.calloutHint'),
        aliases: ['callout', 'destaque', 'aviso', 'nota', 'alert'],
        group: t('editor.groupExtras'),
        icon: <span style={{ fontWeight: 700 }}>i</span>,
        onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'callout' }),
      }
      const tpl = templates.map((tp) => ({
        title: tp.title,
        subtext: tp.subtext,
        aliases: tp.aliases,
        group: t('editor.groupTemplates'),
        icon: <span style={{ fontWeight: 700 }}>¶</span>,
        onItemClick: async () => {
          const blocks = await parseMarkdownToBlocks(editor, tp.markdown)
          const current = editor.getTextCursorPosition().block
          editor.insertBlocks(blocks, current, 'after')
        },
      }))
      return filterSuggestionItems([...getDefaultReactSlashMenuItems(editor), callout, ...tpl], query)
    },
    [editor, templates, t],
  )

  const mentionItems = useMemo(
    () => async (query: string) => {
      const insert = (kind: MentionKind, id: string, label: string) => {
        editor.insertInlineContent([{ type: 'mention', props: { kind, id, label } }, ' '])
      }
      const all = [
        ...teamDirectory.filter((p) => p.active).map((p) => ({ kind: 'user' as const, id: p.id, label: p.name ?? p.email ?? '—', group: t('editor.mentionPeople') })),
        ...projects.filter((p) => !p.archived && !p.hidden).map((p) => ({ kind: 'project' as const, id: p.id, label: p.name, group: t('editor.mentionProjects') })),
        ...incidents.map((i) => ({ kind: 'incident' as const, id: i.id, label: i.title, group: t('editor.mentionIncidents') })),
        ...clients.filter((c) => !c.archived).map((c) => ({ kind: 'client' as const, id: c.id, label: c.name, group: t('editor.mentionClients') })),
      ]
      const q = query.trim().toLowerCase()
      return all
        .filter((m) => !q || m.label.toLowerCase().includes(q))
        .slice(0, 12)
        .map((m) => ({ title: m.label, group: m.group, onItemClick: () => insert(m.kind, m.id, m.label) }))
    },
    [editor, teamDirectory, projects, incidents, clients, t],
  )

  // Clique numa menção de projeto/incidente/cliente abre a página (o Router está aqui, não dentro do editor).
  function onClick(e: React.MouseEvent) {
    const target = (e.target as HTMLElement).closest('[data-open-link]') as HTMLElement | null
    const to = target?.dataset.openLink
    if (to) navigate(to)
  }

  return (
    <div>
      <div className="oe-editor__bar">
        <span>{t('editor.hint')}</span>
        {people.length > 0 && (
          <span className="oe-editor__people" title={people.map((p) => p.name).join(', ')}>
            {people.map((p) => <span key={p.clientId} className="oe-editor__dot" style={{ background: p.color }} />)}
            {t('editor.editingNow', { names: people.map((p) => p.name.split(' ')[0]).join(', ') })}
          </span>
        )}
      </div>
      <div className="oe-editor" onClick={onClick}>
        <BlockNoteView editor={editor} theme={dark ? 'dark' : 'light'} slashMenu={false}>
          <SuggestionMenuController triggerCharacter="/" getItems={slashItems} />
          <SuggestionMenuController triggerCharacter="@" getItems={mentionItems} />
        </BlockNoteView>
      </div>
    </div>
  )
}
