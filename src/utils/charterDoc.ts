import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import { ProjectCharter } from '@/types'

/** As seções do charter, na ordem do documento. A chave é a mesma do formato antigo (campos separados). */
export const CHARTER_SECTIONS = ['objectives', 'scope', 'outOfScope', 'successCriteria', 'constraints', 'assumptions'] as const
export type CharterSection = (typeof CHARTER_SECTIONS)[number]

/** Template de um charter novo: um título por seção (o texto vem de charter.<chave> no idioma da interface). */
export function charterTemplateMarkdown(label: (section: CharterSection) => string): string {
  return CHARTER_SECTIONS.map((s) => `## ${label(s)}`).join('\n\n') + '\n'
}

/** Formato antigo (6 campos de texto) → documento. Mesma regra da migration 20261012: só seções preenchidas,
 *  quebras de linha viram hard breaks do Markdown para o texto continuar igual ao que era exibido. */
export function legacyCharterToMarkdown(
  charter: Partial<ProjectCharter> | undefined,
  label: (section: CharterSection) => string,
): string {
  if (!charter) return ''
  return CHARTER_SECTIONS
    .filter((s) => (charter[s] ?? '').trim())
    .map((s) => `## ${label(s)}\n\n${(charter[s] as string).trim().replace(/\n/g, '  \n')}`)
    .join('\n\n')
}

/** Markdown → HTML seguro para os relatórios (que são gerados como string e depois impressos/publicados).
 *  HTML cru no texto é descartado e o resultado passa pelo sanitizador. Menções viram texto simples e
 *  imagens do documento (open:file/…) viram uma nota, porque a URL assinada expira e não cabe num relatório estático. */
export function markdownToSafeHtml(markdown: string): string {
  if (!markdown.trim()) return ''
  const prepared = markdown
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

/** Substitui o corpo de uma seção `## Título` do documento (ou a acrescenta no fim se não existir).
 *  `headings`: títulos aceitos para a mesma seção (ex.: o mesmo texto em pt/en/es — o documento pode ter
 *  sido criado em outro idioma). `write`: título usado ao criar a seção. A seção vai até o próximo `#`/`##`.
 *  Idempotente: aplicar o mesmo texto duas vezes dá o mesmo documento. */
export function upsertMarkdownSection(markdown: string, headings: string[], write: string, body: string): string {
  const accepted = new Set(headings.map((h) => h.trim().toLowerCase()))
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const isTitle = (line: string) => /^#{1,2}\s+\S/.test(line)
  const titleOf = (line: string) => line.replace(/^#{1,2}\s+/, '').trim().toLowerCase()
  const newBody = body.trim().replace(/\n/g, '  \n')

  const start = lines.findIndex((l) => /^##\s+\S/.test(l) && accepted.has(titleOf(l)))
  if (start === -1) {
    const base = markdown.trimEnd()
    return `${base}${base ? '\n\n' : ''}## ${write}\n\n${newBody}\n`
  }
  let end = start + 1
  while (end < lines.length && !isTitle(lines[end])) end++
  const replaced = [...lines.slice(0, start + 1), '', newBody, ''].concat(lines.slice(end))
  return replaced.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
