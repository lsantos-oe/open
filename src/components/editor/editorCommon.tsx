import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core'
import * as locales from '@blocknote/core/locales'
import { BlockNoteView } from '@blocknote/mantine'
import { SuggestionMenuController, getDefaultReactSlashMenuItems } from '@blocknote/react'
import '@blocknote/mantine/style.css'
import './editor.css'
import { useAppStore } from '@/store/useAppStore'
import { MentionKind } from './schema'
import { parseMarkdownToBlocks } from './seed'

export interface EditorTemplate {
  title: string
  subtext?: string
  aliases?: string[]
  /** Markdown inserido no ponto do cursor quando o item do menu `/` é escolhido. */
  markdown: string
}

const CURSOR_COLORS = ['#D9530E', '#3568C4', '#1A8850', '#7C3AED', '#A8790A', '#D14343', '#0E7490', '#BE185D']
export const colorFor = (id: string) => CURSOR_COLORS[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % CURSOR_COLORS.length]

export function useDarkMode(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return dark
}

/** Textos do editor (menu, dicas) no idioma da interface. */
export function useEditorDictionary() {
  const { i18n } = useTranslation()
  const lang = (i18n.language || 'pt').slice(0, 2)
  return lang === 'en' ? locales.en : lang === 'es' ? locales.es : locales.pt
}

interface ExtrasOptions {
  templates?: EditorTemplate[]
  /** Menu `@` de menções (pessoas, projetos, incidentes, clientes). */
  mentions?: boolean
}

/** Comandos `/` (blocos padrão + destaque + modelos), menu `@` e clique em menções — iguais em qualquer editor. */
export function useEditorExtras(editor: any, { templates = [], mentions = true }: ExtrasOptions) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { teamDirectory, projects, incidents, clients } = useAppStore()

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

  return { slashItems, mentionItems: mentions ? mentionItems : null, onClick }
}

/** A caixa do editor propriamente dita (menus `/` e `@` incluídos). */
export function EditorFrame({ editor, extras, compact, minHeight }: {
  editor: any
  extras: ReturnType<typeof useEditorExtras>
  compact?: boolean
  minHeight?: number
}) {
  const dark = useDarkMode()
  return (
    <div
      className={`oe-editor${compact ? ' oe-editor--compact' : ''}`}
      style={minHeight ? { minHeight } : undefined}
      onClick={extras.onClick}
      // Clicar na área vazia da caixa (abaixo do último bloco) coloca o cursor no fim do texto.
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest('.bn-editor, .bn-side-menu, .bn-toolbar')) return
        e.preventDefault()
        const last = editor.document[editor.document.length - 1]
        if (last) editor.setTextCursorPosition(last, 'end')
        editor.focus()
      }}
    >
      <BlockNoteView editor={editor} theme={dark ? 'dark' : 'light'} slashMenu={false}>
        <SuggestionMenuController triggerCharacter="/" getItems={extras.slashItems} />
        {extras.mentionItems && <SuggestionMenuController triggerCharacter="@" getItems={extras.mentionItems} />}
      </BlockNoteView>
    </div>
  )
}
