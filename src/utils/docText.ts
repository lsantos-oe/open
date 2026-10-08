import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'

/** Host de mentira que carrega os links internos (open:...) pelo sanitizador, que só aceita http(s). */
export const OPEN_HOST = 'https://open.invalid/'

/** Texto puro (como os campos eram antes do editor de blocos) → Markdown que se lê igual: toda quebra de linha
 *  vira quebra forçada e "<" é escapado (senão "<timeout>" seria tomado por HTML e sumiria).
 *  Idempotente para o que já é Markdown: blocos de código ficam intactos e "\<" não é escapado de novo. */
export function legacyTextToMarkdown(text: string | undefined | null): string {
  if (!text) return ''
  let inFence = false
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line, i, all) => {
      if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return line }
      if (inFence) return line
      // "<" dentro de `código` já é literal; fora dele é escapado.
      const escaped = line.split(/(`[^`]*`)/).map((part, k) => (k % 2 === 1 ? part : part.replace(/(?<!\\)</g, '\\<'))).join('')
      const next = all[i + 1]
      const needsBreak = escaped.trim() !== '' && next !== undefined && next.trim() !== '' && !/ {2}$|\\$/.test(escaped)
      return needsBreak ? `${escaped}  ` : escaped
    })
    .join('\n')
}

export interface SafeHtmlOptions {
  /** Dentro do app: mantém menções e imagens do documento como links do host de mentira (o DocView os resolve).
   *  Sem isso (relatórios estáticos): menções viram texto e imagens do documento viram uma nota. */
  app?: boolean
}

/** Markdown → HTML seguro. HTML cru no texto é descartado e o resultado passa pelo sanitizador.
 *  Nos relatórios, menções viram texto simples e imagens do documento (open:file/…) viram uma nota, porque
 *  a URL assinada expira e não cabe num relatório estático. */
export function markdownToSafeHtml(markdown: string, { app = false }: SafeHtmlOptions = {}): string {
  if (!markdown.trim()) return ''
  // O destaque do editor sai como citação iniciada por "[!INFO]": na leitura fica só a citação.
  const source = legacyTextToMarkdown(markdown).replace(/^(\s*(?:>\s*)+)\[!(?:INFO|WARNING|SUCCESS|DANGER)\]\s*/gim, '$1')
  const prepared = app
    ? source
        .replace(/\]\(open:(user|project|incident|client|file)\/([^)\s]*)\)/g, `](${OPEN_HOST}$1/$2)`)
    : source
        .replace(/!\[([^\]]*)\]\(open:file\/[^)]*\)/g, (_m, alt: string) => `*[imagem${alt ? `: ${alt}` : ''}]*`)
        .replace(/\[([^\]]*)\]\(open:(?:user|project|incident|client)\/[^)]*\)/g, '$1')
  return String(
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype) // allowDangerousHtml desligado: HTML cru do texto é ignorado
      .use(rehypeSanitize)
      .use(rehypeStringify)
      .processSync(prepared),
  )
}

/** Markdown → uma linha de texto, para células de tabela e prévias truncadas. */
export function markdownToPlainText(markdown: string | undefined | null): string {
  if (!markdown) return ''
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_m, alt: string) => (alt ? `[${alt}]` : '[imagem]'))
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/\\(.)/g, '$1')
    .replace(/\s*\n\s*/g, ' ')
    .trim()
}

/** Markdown de um campo-documento para sair do app (relatório em Markdown, exportações): mantém a formatação e
 *  troca os links internos (open:...), que fora do Open não levam a lugar nenhum, por texto. */
export function markdownForExport(markdown: string | undefined | null): string {
  if (!markdown) return ''
  return markdown
    .replace(/!\[([^\]]*)\]\(open:file\/[^)]*\)/g, (_m, alt: string) => `*[imagem${alt ? `: ${alt}` : ''}]*`)
    .replace(/\[([^\]]*)\]\(open:(?:user|project|incident|client)\/[^)]*\)/g, '$1')
}

/** Uma linha para célula de tabela Markdown: sem quebras de linha e com "|" escapado. */
export function markdownTableCell(markdown: string | undefined | null): string {
  return markdownToPlainText(markdownForExport(markdown)).replace(/\|/g, '\\|')
}
