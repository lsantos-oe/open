import { useState } from 'react'
import { MAX_TAGS, MAX_TAG_LENGTH, normalizeTags } from '@/utils/documentation'

interface Props {
  value: string[]
  onChange: (tags: string[]) => void
  /** Etiquetas já usadas em outros itens: aparecem como sugestão. */
  suggestions?: string[]
}

/** Etiquetas livres: Enter ou vírgula adiciona; × remove. */
export function TagInput({ value, onChange, suggestions = [] }: Props) {
  const [draft, setDraft] = useState('')

  function commit(raw: string) {
    const parts = raw.split(',')
    const next = normalizeTags([...value, ...parts])
    if (next.length !== value.length) onChange(next)
    setDraft('')
  }

  const remaining = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())).slice(0, 8)

  return (
    <div>
      <div
        className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 border"
        style={{ borderColor: 'var(--border-default)', background: 'var(--surface-input)', borderRadius: 'var(--radius-md)' }}
      >
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-[var(--radius-pill)]" style={{ background: 'var(--oe-primary-light)', color: 'var(--oe-primary)' }}>
            {t}
            <button type="button" aria-label={`Remover ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="leading-none hover:opacity-70">×</button>
          </span>
        ))}
        {value.length < MAX_TAGS && (
          <input
            value={draft}
            maxLength={MAX_TAG_LENGTH}
            onChange={(e) => (e.target.value.includes(',') ? commit(e.target.value) : setDraft(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); if (draft.trim()) commit(draft) }
              else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
            }}
            onBlur={() => { if (draft.trim()) commit(draft) }}
            placeholder={value.length ? '' : 'Digite e tecle Enter (ex.: Manual, Integração)'}
            className="flex-1 min-w-[140px] bg-transparent text-[13px] outline-none py-0.5"
            style={{ color: 'var(--text-primary)' }}
            aria-label="Adicionar etiqueta"
          />
        )}
      </div>
      {remaining.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Já usadas:</span>
          {remaining.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(normalizeTags([...value, s]))}
              className="text-[11px] px-2 py-0.5 rounded-[var(--radius-pill)] border hover:border-[var(--oe-primary)]"
              style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)', background: 'var(--surface-card)' }}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
