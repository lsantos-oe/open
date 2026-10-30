import { useState } from 'react'
import { useEntityCode } from '@/hooks/useEntityCode'
import { codeLink, CodeTable } from '@/utils/codes'

/** Código curto da coisa (ex.: C26000123). Clique copia o código; o botão ao lado copia o link curto. */
export function CodeBadge({ code, className = '' }: { code?: string; className?: string }) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  if (!code) return null
  const copy = async (what: 'code' | 'link') => {
    try { await navigator.clipboard.writeText(what === 'code' ? code : codeLink(code)) } catch { return }
    setCopied(what)
    setTimeout(() => setCopied(null), 1600)
  }
  const btn = 'px-1.5 py-0.5 text-[11.5px] rounded-[var(--radius-sm)] transition-colors hover:bg-[var(--surface-subtle)]'
  return (
    <span className={`inline-flex items-center gap-0.5 shrink-0 ${className}`}>
      <button type="button" onClick={() => void copy('code')} className={`${btn} font-mono`} style={{ color: copied === 'code' ? 'var(--color-success-text)' : 'var(--text-tertiary)' }} title="Copiar o ID">
        {copied === 'code' ? 'ID copiado' : code}
      </button>
      <button type="button" onClick={() => void copy('link')} className={btn} style={{ color: copied === 'link' ? 'var(--color-success-text)' : 'var(--text-tertiary)' }} title="Copiar o link curto" aria-label={`Copiar o link de ${code}`}>
        {copied === 'link' ? 'link copiado' : 'link'}
      </button>
    </span>
  )
}

/** Igual ao CodeBadge, buscando o código pelo uuid (para telas que só têm o id). */
export function EntityCode({ table, id, className }: { table: CodeTable; id: string | undefined; className?: string }) {
  const code = useEntityCode(table, id)
  return <CodeBadge code={code} className={className} />
}

/** Botão só com o ícone de link: copia o link curto do item. O ID aparece na dica (e na barra de endereço). */
export function CodeLink({ code, className = '' }: { code?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  if (!code) return null
  const copy = async () => {
    try { await navigator.clipboard.writeText(codeLink(code)) } catch { return }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  const label = copied ? 'Link copiado' : `Copiar link (${code})`
  return (
    <button
      type="button" onClick={() => void copy()} title={label} aria-label={label}
      className={`inline-flex items-center justify-center h-7 w-7 rounded-full transition-colors hover:bg-[var(--surface-subtle)] shrink-0 ${className}`}
      style={{ color: copied ? 'var(--color-success-text)' : 'var(--text-tertiary)' }}
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
        </svg>
      )}
    </button>
  )
}

export function EntityCodeLink({ table, id, className }: { table: CodeTable; id: string | undefined; className?: string }) {
  const code = useEntityCode(table, id)
  return <CodeLink code={code} className={className} />
}
