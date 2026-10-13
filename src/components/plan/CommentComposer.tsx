import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { activeMention, decodeMentions, encodeMentions, MentionRef } from '@/utils/commentThread'
import { applyMarkdownShortcut } from '@/utils/markdownShortcuts'

interface Props {
  /** Texto inicial em Markdown (editar um comentário) — as menções voltam a ser "@Nome" para editar. */
  initialMarkdown?: string
  /** Menção já inserida (responder a alguém): "@Nome " no começo. */
  prefillMention?: MentionRef
  placeholder?: string
  submitLabel?: string
  autoFocus?: boolean
  /** Esc / botão Cancelar (respostas e edição). */
  onCancel?: () => void
  /** Recebe o Markdown final, com as menções já como links [@Nome](open:user/<id>). */
  onSubmit: (markdown: string) => void
}

/** Caixa de comentário estilo rede social: Enter envia, Shift+Enter quebra linha, "@" abre a lista de pessoas. */
export default function CommentComposer({ initialMarkdown, prefillMention, placeholder, submitLabel = 'Comentar', autoFocus, onCancel, onSubmit }: Props) {
  const teamDirectory = useAppStore((s) => s.teamDirectory)
  const initial = useMemo(() => {
    if (initialMarkdown) return decodeMentions(initialMarkdown)
    if (prefillMention) return { text: `@${prefillMention.name} `, picked: [prefillMention] }
    return { text: '', picked: [] as MentionRef[] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [text, setText] = useState(initial.text)
  const [picked, setPicked] = useState<MentionRef[]>(initial.picked)
  const [caret, setCaret] = useState(initial.text.length)
  const [menuIndex, setMenuIndex] = useState(0)
  const ref = useRef<HTMLTextAreaElement>(null)

  const mention = activeMention(text, caret)
  const options = useMemo(() => {
    if (!mention) return []
    const q = mention.query.trim().toLowerCase()
    return teamDirectory
      .filter((p) => p.active && (p.name ?? p.email ?? '').toLowerCase().includes(q))
      .map((p) => ({ id: p.id, name: p.name ?? p.email ?? '—', email: p.name ? p.email : null }))
      .sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q) || a.name.localeCompare(b.name))
      .slice(0, 6)
  }, [mention?.query, mention !== null, teamDirectory]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cresce com o texto (até um limite) e foca ao abrir uma resposta/edição.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])
  useEffect(() => {
    if (autoFocus) {
      const el = ref.current
      el?.focus()
      el?.setSelectionRange(el.value.length, el.value.length)
    }
  }, [autoFocus])
  useEffect(() => { setMenuIndex(0) }, [mention?.query])

  function choose(opt: { id: string; name: string }) {
    if (!mention) return
    const next = `${text.slice(0, mention.start)}@${opt.name} ${text.slice(caret)}`
    const pos = mention.start + opt.name.length + 2
    setText(next)
    setPicked((p) => (p.some((x) => x.id === opt.id) ? p : [...p, { id: opt.id, name: opt.name }]))
    setCaret(pos)
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(pos, pos) })
  }

  function submit() {
    const body = encodeMentions(text, picked).trim()
    if (!body) return
    onSubmit(body)
    if (!initialMarkdown) { setText(''); setPicked([]); setCaret(0) }
  }

  const menuOpen = options.length > 0

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        <textarea
          ref={ref}
          value={text}
          rows={1}
          placeholder={placeholder}
          onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart) }}
          onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
          onKeyDown={(e) => {
            if (menuOpen) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setMenuIndex((i) => (i + 1) % options.length); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setMenuIndex((i) => (i - 1 + options.length) % options.length); return }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(options[menuIndex]); return }
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setCaret(0); return }
            }
            if (applyMarkdownShortcut(e, (v) => setText(v))) return
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); return }
            if (e.key === 'Escape' && onCancel) { e.stopPropagation(); onCancel() }
          }}
          style={{
            flex: 1, fontSize: 13, lineHeight: 1.45, minHeight: 34, maxHeight: 160, resize: 'none', overflowY: 'auto',
            border: '1px solid var(--border-default)', borderRadius: 18, padding: '7px 12px',
            color: 'var(--text-primary)', background: 'var(--surface-input)', outline: 'none',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--oe-primary)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
        />
        {onCancel && (
          <button type="button" onClick={onCancel} style={{ fontSize: 12, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 4px' }}>
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim()}
          style={{
            fontSize: 12, fontWeight: 500, background: 'var(--oe-primary)', color: 'white', border: 'none', cursor: 'pointer',
            borderRadius: 16, padding: '7px 14px', opacity: text.trim() ? 1 : 0.4, whiteSpace: 'nowrap',
          }}
        >
          {submitLabel}
        </button>
      </div>

      {menuOpen && (
        <div
          role="listbox"
          style={{
            position: 'absolute', left: 0, bottom: '100%', marginBottom: 4, minWidth: 220, maxWidth: 320, zIndex: 20,
            background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)', overflow: 'hidden', padding: 4,
          }}
        >
          {options.map((o, i) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={i === menuIndex}
              onMouseDown={(e) => { e.preventDefault(); choose(o) }}
              onMouseEnter={() => setMenuIndex(i)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 12.5, border: 'none', cursor: 'pointer',
                borderRadius: 'var(--radius-sm, 4px)', color: 'var(--text-primary)', background: i === menuIndex ? 'var(--surface-subtle)' : 'transparent',
              }}
            >
              {o.name}
              {o.email && <span style={{ color: 'var(--text-tertiary)', marginLeft: 6, fontSize: 11 }}>{o.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
