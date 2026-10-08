import type { BlockNoteEditor, PartialBlock } from '@blocknote/core'
import type { CalloutKind, EditorSchema } from './schema'
import { CALLOUT_KINDS } from './schema'

// O parser de Markdown do BlockNote descarta links de protocolo desconhecido (open:...), o que transformaria
// as menções em texto puro. Trocamos o protocolo por um host de mentira antes de parsear e restauramos depois.
const FAKE_HOST = 'https://open.invalid/'
const OPEN_LINK = /\]\(open:(user|project|incident|client)\/([^)\s]+)\)/g
const FAKE_LINK = /^https:\/\/open\.invalid\/(user|project|incident|client)\/(.+)$/
const CALLOUT_MARKER = new RegExp(`^\\[!(${CALLOUT_KINDS.map((k) => k.toUpperCase()).join('|')})\\]\\s*`)

type AnyBlock = PartialBlock<any, any, any>

// O parser de Markdown do BlockNote lê "<algo>" como tag HTML e a descarta (e "\\<" deixa uma barra sobrando), o que
// apagaria textos como "erro <timeout> no endpoint". "<" que começa algo parecido com tag vira um caractere de uso
// privado antes de parsear e volta a "<" nos textos depois. Autolinks (<https://...>) seguem sendo links.
const LT_PLACEHOLDER = '\uE000'
const TAG_LIKE_LT = /\\?<(?!https?:\/\/|mailto:)(?=[A-Za-z/!?])/g

// Quebra forçada do Markdown ("a  \nb"): o parser a entrega como <br> seguido do "\n" do fonte, que vira um espaço
// no início da linha seguinte. Em Markdown espaços no começo dessa linha já seriam descartados, então some junto.
function restoreText<T>(node: T): T {
  if (typeof node === 'string') return node.replaceAll(LT_PLACEHOLDER, '<').replaceAll('\n ', '\n') as T
  if (Array.isArray(node)) {
    const items = node.map(restoreText) as any[]
    // A quebra pode terminar um trecho estilizado ("negrito\n") e o espaço sobrante abrir o seguinte (" resto").
    for (let i = 1; i < items.length; i++) {
      if (items[i]?.type === 'text' && items[i - 1]?.type === 'text' && items[i - 1].text.endsWith('\n') && items[i].text.startsWith(' ')) {
        items[i] = { ...items[i], text: items[i].text.slice(1) }
      }
    }
    return items as T
  }
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node as object).map(([k, v]) => [k, restoreText(v)])) as T
  }
  return node
}

function restoreInline(content: unknown): unknown {
  if (!Array.isArray(content)) return content
  return content.map((node: any) => {
    if (node?.type === 'link' && typeof node.href === 'string') {
      const m = node.href.match(FAKE_LINK)
      if (m) {
        const label = (node.content ?? []).map((c: any) => c.text ?? '').join('').replace(/^@/, '')
        return { type: 'mention', props: { kind: m[1], id: m[2], label } }
      }
    }
    return node
  })
}

/** Quote cujo texto começa com "[!INFO]" (o formato em que o destaque é exportado) volta a ser callout. */
function restoreCallout(block: AnyBlock): AnyBlock {
  if (block.type !== 'quote' || !Array.isArray(block.content)) return block
  const first = block.content[0] as any
  if (first?.type !== 'text') return block
  const m = String(first.text).match(CALLOUT_MARKER)
  if (!m) return block
  const rest = String(first.text).slice(m[0].length).replace(/^\n+/, '')
  const content = [{ ...first, text: rest }, ...block.content.slice(1)].filter((c: any) => c.type !== 'text' || c.text !== '')
  return { ...block, type: 'callout', props: { ...(block.props as object), kind: m[1].toLowerCase() as CalloutKind }, content } as AnyBlock
}

function restoreBlock(block: AnyBlock): AnyBlock {
  const withInline = { ...block, content: restoreInline(block.content), children: block.children?.map(restoreBlock) } as AnyBlock
  return restoreCallout(withInline)
}

/** Markdown → blocos do editor, devolvendo menções (chips) e destaques que o Markdown só representa como link/citação. */
export async function parseMarkdownToBlocks(editor: BlockNoteEditor<any, any, any>, markdown: string): Promise<AnyBlock[]> {
  const prepared = (markdown || '')
    .replace(OPEN_LINK, (_m, kind: string, id: string) => `](${FAKE_HOST}${kind}/${id})`)
    .replace(TAG_LIKE_LT, LT_PLACEHOLDER)
  const blocks = (await editor.tryParseMarkdownToBlocks(prepared)) as AnyBlock[]
  return blocks.map((b) => restoreText(restoreBlock(b)))
}

export type { EditorSchema }
