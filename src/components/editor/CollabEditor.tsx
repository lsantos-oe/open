import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as Y from 'yjs'
import { BlockNoteEditor } from '@blocknote/core'
import { blocksToYDoc, withCollaboration } from '@blocknote/core/yjs'
import { useCreateBlockNote } from '@blocknote/react'
import { useAuthStore } from '@/stores/useAuthStore'
import { COLLAB_FRAGMENT, SupabaseCollab } from './SupabaseCollab'
import { schema } from './schema'
import { resolveDocFileUrl, uploadDocFile } from './fileStorage'
import { useCollabPresence } from './useCollabPresence'
import { normalizeExportedMarkdown, prepareBlocksForExport } from './markdown'
import { parseMarkdownToBlocks } from './seed'
import { EditorFrame, EditorTemplate, colorFor, useEditorDictionary, useEditorExtras } from './editorCommon'

export type { EditorTemplate }

export interface CollabEditorProps {
  /** "<tipo>_<uuid>_<campo>", ex.: project_3f2a…_charter */
  docId: string
  /** Markdown que semeia o documento na primeira abertura (só usado se o documento ainda não existe). */
  seedMarkdown: string
  /** Busca o texto mais recente da coluna no momento de semear (a memória desta tela pode estar defasada).
   *  Devolve undefined para usar `seedMarkdown`. Só roda quando o documento ainda não existe no banco. */
  fetchSeed?: () => Promise<string | undefined>
  /** Recebe o Markdown atual (com debounce) — é a projeção que relatórios, exportações e a IA leem. */
  onMarkdownChange?: (markdown: string) => void
  templates?: EditorTemplate[]
  /** Visual enxuto (sem a dica do menu `/`), para campos dentro de painéis e modais. */
  compact?: boolean
  minHeight?: number
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
  const fetchSeedRef = useRef(props.fetchSeed)
  fetchSeedRef.current = props.fetchSeed

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const c = new SupabaseCollab(props.docId, userId)
    setStatus('loading'); setWasReset(false); setCollab(null)
    c.onReset = () => setWasReset(true)

    // Semente: Markdown → blocos → Yjs. Só roda se o documento ainda não existe no banco.
    const seed = async () => {
      const headless = BlockNoteEditor.create({ schema })
      const fresh = await fetchSeedRef.current?.().catch(() => undefined)
      const blocks = await parseMarkdownToBlocks(headless, fresh ?? seedRef.current ?? '')
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

function EditorBody({ collab, onMarkdownChange, templates = [], docId, compact, minHeight }: CollabEditorProps & { collab: SupabaseCollab }) {
  const { t } = useTranslation()
  const { profile, user } = useAuthStore()
  const people = useCollabPresence(collab.awareness)
  const dictionary = useEditorDictionary()

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

  const extras = useEditorExtras(editor, { templates })

  return (
    <div>
      <div className="oe-editor__bar">
        <span>{compact ? '' : t('editor.hint')}</span>
        {people.length > 0 && (
          <span className="oe-editor__people" title={people.map((p) => p.name).join(', ')}>
            {people.map((p) => <span key={p.clientId} className="oe-editor__dot" style={{ background: p.color }} />)}
            {t('editor.editingNow', { names: people.map((p) => p.name.split(' ')[0]).join(', ') })}
          </span>
        )}
      </div>
      <EditorFrame editor={editor} extras={extras} compact={compact} minHeight={minHeight} />
    </div>
  )
}
