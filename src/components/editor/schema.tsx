import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, defaultProps } from '@blocknote/core'
import { createReactBlockSpec, createReactInlineContentSpec } from '@blocknote/react'

/** Para onde cada tipo de menção leva (o clique é tratado por quem hospeda o editor, que tem o Router). */
export const MENTION_ROUTE: Record<MentionKind, (id: string) => string> = {
  user: () => '', // pessoas não têm página própria
  project: (id) => `/projects/${id}`,
  incident: (id) => `/support/${id}`,
  client: (id) => `/wallet/${id}`,
}

export type MentionKind = 'user' | 'project' | 'incident' | 'client'

/** Link Markdown de uma menção: [@Nome](open:user/<id>) — é isso que o banco lê para notificar. */
export function mentionHref(kind: MentionKind, id: string): string {
  return `open:${kind}/${id}`
}

const mention = createReactInlineContentSpec(
  {
    type: 'mention',
    propSchema: {
      kind: { default: 'user' as MentionKind, values: ['user', 'project', 'incident', 'client'] as const },
      id: { default: '' },
      label: { default: '' },
    },
    content: 'none',
  } as const,
  {
    render: ({ inlineContent }) => {
      const { kind, id, label } = inlineContent.props
      const route = MENTION_ROUTE[kind as MentionKind](id)
      return (
        <span
          className={`oe-mention oe-mention--${kind}`}
          data-open-link={route || undefined}
        >
          {kind === 'user' ? '@' : ''}{label}
        </span>
      )
    },
    // Na exportação para Markdown vira um link comum: [@Nome](open:user/<id>)
    toExternalHTML: ({ inlineContent }) => {
      const { kind, id, label } = inlineContent.props
      return <a href={mentionHref(kind as MentionKind, id)}>{kind === 'user' ? '@' : ''}{label}</a>
    },
  },
)

export const CALLOUT_KINDS = ['info', 'warning', 'success', 'danger'] as const
export type CalloutKind = (typeof CALLOUT_KINDS)[number]
const CALLOUT_ICON: Record<CalloutKind, string> = { info: 'i', warning: '!', success: '✓', danger: '✕' }

const callout = createReactBlockSpec(
  {
    type: 'callout',
    propSchema: {
      textAlignment: defaultProps.textAlignment,
      textColor: defaultProps.textColor,
      kind: { default: 'info' as CalloutKind, values: CALLOUT_KINDS },
    },
    content: 'inline',
  } as const,
  {
    render: ({ block, editor, contentRef }) => {
      const kind = block.props.kind as CalloutKind
      return (
        <div className={`oe-callout oe-callout--${kind}`}>
          <button
            type="button"
            contentEditable={false}
            className="oe-callout__icon"
            title="Trocar o tipo do destaque"
            onClick={() => {
              const next = CALLOUT_KINDS[(CALLOUT_KINDS.indexOf(kind) + 1) % CALLOUT_KINDS.length]
              editor.updateBlock(block, { props: { kind: next } })
            }}
          >
            {CALLOUT_ICON[kind]}
          </button>
          <div className="oe-callout__body" ref={contentRef} />
        </div>
      )
    },
    // Markdown não tem "destaque": sai como citação. O marcador do tipo ("[!INFO] ") é inserido por
    // prepareBlocksForExport antes de exportar — colocá-lo aqui, em volta do contentRef, faz o BlockNote perder o texto.
    toExternalHTML: ({ contentRef }) => <blockquote ref={contentRef} />,
  },
)

export const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, callout: callout() },
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention },
})

export type EditorSchema = typeof schema
