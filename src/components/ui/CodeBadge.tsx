import { useState } from 'react'
import { useEntityCode } from '@/hooks/useEntityCode'
import { codeLink, CodeTable } from '@/utils/codes'

/** Código curto da coisa (ex.: C-2026-000123). Clique copia o código; o botão ao lado copia o link curto. */
export function CodeBadge({ code, className = '' }: { code?: string; className?: string }) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  if (!code) return null
  const copy = async (what: 'code' | 'link') => {
    try { await navigator.clipboard.writeText(what === 'code' ? code : codeLink(code)) } catch { return }
    setCopied(what)
    setTimeout(() => setCopied(null), 1600)
  }
  const btn = 'px-1.5 py-0.5 text-[11px] rounded-[var(--radius-sm)] transition-colors hover:bg-[var(--surface-subtle)]'
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
