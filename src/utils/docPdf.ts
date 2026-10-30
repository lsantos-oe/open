import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

// Texto de um PDF, página a página. Carregado só quando alguém pede para ler um PDF (a biblioteca é grande).
// Na função do Discord este arquivo é trocado por docPdfUnavailable.ts (ver scripts/build-discord-ai.mjs).

const MAX_PAGES = 300

export async function pdfToText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  // O pdf.js toma posse do buffer: passa uma cópia.
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise
  try {
    const pages: string[] = []
    const total = Math.min(doc.numPages, MAX_PAGES)
    for (let i = 1; i <= total; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      let text = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        text += item.str + (item.hasEOL ? '\n' : ' ')
      }
      const t = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
      if (t) pages.push(`[página ${i}]\n${t}`)
    }
    if (doc.numPages > MAX_PAGES) pages.push(`[… o PDF tem ${doc.numPages} páginas; só as ${MAX_PAGES} primeiras foram lidas]`)
    return pages.join('\n\n')
  } finally {
    void doc.destroy()
  }
}
