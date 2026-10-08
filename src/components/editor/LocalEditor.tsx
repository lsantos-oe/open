import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateBlockNote } from '@blocknote/react'
import { legacyTextToMarkdown } from '@/utils/docText'
import { schema } from './schema'
import { resolveDocFileUrl, uploadDocFile } from './fileStorage'
import { normalizeExportedMarkdown, prepareBlocksForExport } from './markdown'
import { parseMarkdownToBlocks } from './seed'
import { EditorFrame, EditorTemplate, useEditorDictionary, useEditorExtras } from './editorCommon'

export interface LocalEditorProps {
  /** Markdown (ou texto puro antigo) inicial. Só é lido na montagem: para trocar o texto, troque a `key`. */
  initialMarkdown: string
  /** Recebe o Markdown a cada edição. O formulário que hospeda decide quando gravar (botão Salvar). */
  onChange: (markdown: string) => void
  templates?: EditorTemplate[]
  /** Menu `@` de menções. Desligue onde a menção não faz sentido (ex.: o texto não gera notificação). */
  mentions?: boolean
  compact?: boolean
  minHeight?: number
  autoFocus?: boolean
  /** Pasta das imagens coladas/enviadas no storage. */
  uploadScope?: string
}

/** Editor de blocos sem colaboração, para campos dentro de formulários com "Salvar". Mesmo visual, mesmos
 *  comandos `/`, mesmas menções e imagens do editor colaborativo — só não há documento vivo no banco. */
export default function LocalEditor({
  initialMarkdown, onChange, templates, mentions = true, compact = true, minHeight, autoFocus, uploadScope = 'local',
}: LocalEditorProps) {
  const { t } = useTranslation()
  const dictionary = useEditorDictionary()
  const [ready, setReady] = useState(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const initialRef = useRef(initialMarkdown)

  const editor = useCreateBlockNote({
    schema,
    dictionary,
    uploadFile: (file: File) => uploadDocFile(uploadScope, file),
    resolveFileUrl: resolveDocFileUrl,
  })

  const toMarkdown = async () =>
    normalizeExportedMarkdown(await editor.blocksToMarkdownLossy(prepareBlocksForExport(editor.document))).trimEnd()

  useEffect(() => {
    let cancelled = false
    let last = ''
    let seq = 0
    let off: (() => void) | undefined
    void (async () => {
      const blocks = await parseMarkdownToBlocks(editor, legacyTextToMarkdown(initialRef.current))
      if (cancelled) return
      if (blocks.length > 0) editor.replaceBlocks(editor.document, blocks)
      last = await toMarkdown() // o texto semeado não conta como edição
      if (cancelled) return
      off = editor.onChange(async () => {
        const mine = ++seq
        const md = await toMarkdown()
        if (mine !== seq || md === last) return // só a resposta mais recente vale
        last = md
        onChangeRef.current(md)
      })
      setReady(true)
      if (autoFocus) editor.focus()
    })()
    return () => { cancelled = true; off?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  const extras = useEditorExtras(editor, { templates, mentions })

  // O editor fica sempre montado (precisa estar na tela para receber o texto semeado); enquanto a semente
  // não entra, uma cobertura bloqueia a digitação para nada se perder.
  return (
    <div style={{ position: 'relative' }}>
      <EditorFrame editor={editor} extras={extras} compact={compact} minHeight={minHeight ?? 72} />
      {!ready && (
        <div
          className="absolute inset-0 flex items-center justify-center text-xs rounded-[var(--radius-md)]"
          style={{ background: 'var(--surface-input)', color: 'var(--text-tertiary)' }}
        >
          {t('editor.loadingField')}
        </div>
      )}
    </div>
  )
}
