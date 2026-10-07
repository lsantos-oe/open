import { useState } from 'react'

interface Props {
  count: number
  voted: boolean
  /** Pode clicar (participante, fase certa e, para bom/ruim, ainda com votos). */
  disabled: boolean
  title?: string
  onToggle: () => Promise<unknown>
}

/** Apoio/voto num card: mostra a contagem para todos; só participantes clicam. */
export default function VoteButton({ count, voted, disabled, title, onToggle }: Props) {
  const [busy, setBusy] = useState(false)
  async function click(e: React.MouseEvent) {
    e.stopPropagation()
    if (busy || disabled) return
    setBusy(true)
    await onToggle()
    setBusy(false)
  }
  return (
    <button
      type="button"
      onClick={click}
      disabled={busy || disabled}
      title={title}
      className="inline-flex items-center gap-1 text-[11.5px] px-2 py-[2px] transition-colors"
      style={{
        borderRadius: 'var(--radius-pill)',
        border: '1px solid',
        borderColor: voted ? 'var(--oe-primary)' : 'var(--border-default)',
        background: voted ? 'var(--oe-primary-light, var(--surface-subtle))' : 'transparent',
        color: voted ? 'var(--oe-primary)' : 'var(--text-secondary)',
        fontWeight: voted ? 600 : 400,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled && !voted ? 0.7 : 1,
      }}
    >
      <span aria-hidden>▲</span>
      <span>{count}</span>
    </button>
  )
}
