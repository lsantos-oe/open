// Texto de arquivos da documentação, para o assistente de IA ler e responder sobre eles.
// Texto puro, Word (.docx), PowerPoint (.pptx), planilhas e PDF. Imagens e formatos antigos (.doc, .ppt) não são lidos.

export type ExtractResult = { ok: true; text: string; format: string } | { ok: false; reason: string }

export interface ExtractOptions {
  /** Leitor de PDF (padrão: pdf.js, carregado sob demanda). Os testes trocam por um falso. */
  pdf?: (bytes: Uint8Array) => Promise<string>
}

const PLAIN = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log', 'yaml', 'yml', 'xml', 'ini', 'sql'])
const HTML = new Set(['html', 'htm'])
const SHEET = new Set(['xlsx', 'xlsm', 'xls', 'ods'])

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })

const extOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '')
const tidy = (s: string) => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

function htmlToText(html: string): string {
  return tidy(decodeEntities(
    html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6])>/gi, '\n').replace(/<[^>]+>/g, ' '),
  ))
}

/** Texto do XML do Word: parágrafos viram linhas, células de tabela viram colunas separadas por tabulação. */
function wordXmlToText(xml: string): string {
  return tidy(decodeEntities(
    xml.replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<\/w:tc>/g, '\t').replace(/<[^>]+>/g, ''),
  ))
}

async function docxText(bytes: Uint8Array): Promise<string> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(bytes)
  const main = zip.file('word/document.xml')
  if (!main) throw new Error('Não é um .docx válido.')
  return wordXmlToText(await main.async('string'))
}

async function pptxText(bytes: Uint8Array): Promise<string> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(bytes)
  const slides = Object.keys(zip.files)
    .map((n) => ({ n, i: /^ppt\/slides\/slide(\d+)\.xml$/.exec(n)?.[1] }))
    .filter((s): s is { n: string; i: string } => !!s.i)
    .sort((a, b) => Number(a.i) - Number(b.i))
  if (slides.length === 0) throw new Error('Não é um .pptx válido.')
  const out: string[] = []
  for (const s of slides) {
    const xml = await zip.file(s.n)!.async('string')
    const text = tidy(decodeEntities(xml.replace(/<\/a:p>/g, '\n').replace(/<[^>]+>/g, '')))
    out.push(`[slide ${s.i}]\n${text}`)
  }
  return out.join('\n\n')
}

async function sheetText(bytes: Uint8Array): Promise<string> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(bytes, { type: 'array' })
  return wb.SheetNames.map((name) => `[planilha ${name}]\n${XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false }).trim()}`).join('\n\n')
}

export function isReadableFile(name: string): boolean {
  const e = extOf(name)
  return PLAIN.has(e) || HTML.has(e) || SHEET.has(e) || e === 'docx' || e === 'pptx' || e === 'pdf'
}

export async function extractText(fileName: string, bytes: Uint8Array, opts: ExtractOptions = {}): Promise<ExtractResult> {
  const ext = extOf(fileName)
  try {
    let text: string
    if (PLAIN.has(ext)) text = new TextDecoder('utf-8').decode(bytes).trim()
    else if (HTML.has(ext)) text = htmlToText(new TextDecoder('utf-8').decode(bytes))
    else if (ext === 'docx') text = await docxText(bytes)
    else if (ext === 'pptx') text = await pptxText(bytes)
    else if (SHEET.has(ext)) text = await sheetText(bytes)
    else if (ext === 'pdf') text = await (opts.pdf ?? (async (b) => (await import('@/utils/docPdf')).pdfToText(b)))(bytes)
    else return { ok: false, reason: `Não consigo ler arquivos .${ext || 'sem extensão'}. Dá para ler texto, Word (.docx), PowerPoint (.pptx), planilhas e PDF.` }
    if (!text.trim()) {
      return { ok: false, reason: ext === 'pdf' ? 'O PDF não tem texto selecionável (provavelmente é uma digitalização/imagem).' : 'O arquivo não tem texto.' }
    }
    return { ok: true, text, format: ext }
  } catch (e) {
    return { ok: false, reason: `Não consegui ler o arquivo: ${e instanceof Error ? e.message : 'erro desconhecido'}.` }
  }
}
