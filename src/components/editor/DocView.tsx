import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { markdownToSafeHtml, OPEN_HOST } from '@/utils/docText'
import { MENTION_ROUTE, MentionKind } from '@/utils/mentions'
import { resolveDocFileUrl } from './fileStorage'
import './docView.css'

interface Props {
  markdown: string | undefined | null
  className?: string
  /** Mostrado quando não há texto. */
  empty?: string
  /** Tamanho da letra em px (padrão 13) — para comentários e células compactas. */
  fontSize?: number
}

const MENTION_LINK = new RegExp(`^${OPEN_HOST.replace(/[.]/g, '\\.')}(user|project|incident|client)/(.+)$`)

/** Leitura de um texto em Markdown (inclui o texto puro antigo): formatação, listas, tabelas, menções clicáveis
 *  e imagens do documento. O HTML passa por sanitizador — nada do texto vira script. */
export default function DocView({ markdown, className = '', empty, fontSize }: Props) {
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const html = useMemo(() => markdownToSafeHtml(markdown ?? '', { app: true }), [markdown])

  // Depois de inserir o HTML: menções viram chips (com clique), imagens do documento ganham a URL assinada.
  useEffect(() => {
    const root = ref.current
    if (!root) return
    root.querySelectorAll<HTMLAnchorElement>('a[href^="' + OPEN_HOST + '"]').forEach((a) => {
      const m = a.getAttribute('href')!.match(MENTION_LINK)
      if (!m) return
      const kind = m[1] as MentionKind
      const route = MENTION_ROUTE[kind](m[2])
      a.removeAttribute('href')
      a.className = `oe-mention oe-mention--${kind}`
      if (route) a.setAttribute('data-open-link', route)
    })
    let alive = true
    root.querySelectorAll<HTMLImageElement>('img[src^="' + OPEN_HOST + 'file/"]').forEach((img) => {
      const path = img.getAttribute('src')!.slice(OPEN_HOST.length + 'file/'.length)
      img.removeAttribute('src')
      resolveDocFileUrl('open:file/' + path)
        .then((url) => { if (alive) img.src = url })
        .catch(() => { if (alive) img.alt = img.alt || '[imagem indisponível]' })
    })
    return () => { alive = false }
  }, [html])

  if (!html) {
    return empty ? <p className={`text-sm ${className}`} style={{ color: 'var(--text-tertiary)' }}>{empty}</p> : null
  }
  return (
    <div
      ref={ref}
      className={`oe-doc ${className}`}
      style={fontSize ? { fontSize } : undefined}
      onClick={(e) => {
        const to = (e.target as HTMLElement).closest<HTMLElement>('[data-open-link]')?.dataset.openLink
        if (to) navigate(to)
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
