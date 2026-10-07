/** O BlockNote exporta alguns blocos (imagem com legenda, vídeo, áudio) como HTML cru dentro do Markdown.
 *  HTML cru se perde na leitura (react-markdown o ignora), no relatório (é sanitizado) e na reimportação —
 *  então aqui eles voltam a ser Markdown comum: imagens viram ![legenda](url), mídia vira link. */
export function normalizeExportedMarkdown(markdown: string): string {
  const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? ''
  const esc = (s: string) => s.replace(/[[\]]/g, '\\$&')
  return markdown
    // <figure><img src="X"><figcaption>C</figcaption></figure>  →  ![C](X)
    .replace(/<figure>\s*(<img\b[^>]*>)\s*(?:<figcaption>([\s\S]*?)<\/figcaption>)?\s*<\/figure>/g,
      (_m, img: string, cap?: string) => `![${esc((cap ?? '').trim())}](${attr(img, 'src')})`)
    // <figure><video|audio src="X" ...></video><figcaption>C</figcaption></figure>  →  [C](X)
    .replace(/<figure>\s*(<(video|audio)\b[^>]*>)\s*<\/\2>\s*(?:<figcaption>([\s\S]*?)<\/figcaption>)?\s*<\/figure>/g,
      (_m, tag: string, kind: string, cap?: string) => `[${esc((cap ?? '').trim() || (kind === 'video' ? 'vídeo' : 'áudio'))}](${attr(tag, 'src')})`)
    // <video|audio src="X" controls></video>  →  [vídeo|áudio](X)
    .replace(/<(video|audio)\b([^>]*)>\s*<\/\1>/g,
      (_m, kind: string, rest: string) => `[${kind === 'video' ? 'vídeo' : 'áudio'}](${attr(rest, 'src')})`)
    // <img src="X"> solto  →  ![](X)
    .replace(/<img\b[^>]*>/g, (img) => `![${esc(attr(img, 'alt'))}](${attr(img, 'src')})`)
}

type Blk = { type: string; props?: Record<string, unknown>; content?: unknown; children?: Blk[] }

/** Antes de exportar para Markdown: o destaque (callout) vira citação iniciada por "[!INFO] " (ou WARNING,
 *  SUCCESS, DANGER). Assim o tipo sobrevive no texto e seed.ts restaura o destaque ao reabrir o documento. */
export function prepareBlocksForExport<T extends Blk>(blocks: T[]): T[] {
  return blocks.map((b) => {
    const children = b.children ? prepareBlocksForExport(b.children) : b.children
    if (b.type !== 'callout') return { ...b, children }
    const marker = { type: 'text', text: `[!${String(b.props?.kind ?? 'info').toUpperCase()}] `, styles: {} }
    const content = Array.isArray(b.content) ? [marker, ...b.content] : [marker]
    return { ...b, type: 'quote', props: { ...b.props }, content, children }
  })
}
