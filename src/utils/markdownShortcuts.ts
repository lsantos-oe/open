import type { KeyboardEvent } from 'react'

const WRAP: Record<string, string> = { b: '**', i: '*', e: '`' }

/** Atalhos de formatação para caixas de texto simples (comentários): Ctrl/Cmd+B negrito, +I itálico,
 *  +E código, +K link. Quem escreve vê a marcação — ela vira formatação quando o comentário é exibido.
 *  Devolve true se tratou a tecla (o chamador não deve fazer mais nada com ela). */
export function applyMarkdownShortcut(e: KeyboardEvent<HTMLTextAreaElement>, setValue: (next: string) => void): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return false
  const key = e.key.toLowerCase()
  if (!(key in WRAP) && key !== 'k') return false
  e.preventDefault()

  const el = e.currentTarget
  const { selectionStart: from, selectionEnd: to, value } = el
  const selected = value.slice(from, to)

  let insert: string
  let selFrom: number
  let selTo: number
  if (key === 'k') {
    const label = selected || 'texto'
    insert = `[${label}](https://)`
    // seleciona a URL para já poder colar/escrever o endereço
    selFrom = from + label.length + 3
    selTo = selFrom + 'https://'.length
  } else {
    const mark = WRAP[key]
    insert = `${mark}${selected}${mark}`
    selFrom = from + mark.length
    selTo = selFrom + selected.length
  }
  setValue(value.slice(0, from) + insert + value.slice(to))
  // O textarea é controlado: a seleção só pode ser restaurada depois que o React regrava o valor.
  requestAnimationFrame(() => { el.focus(); el.setSelectionRange(selFrom, selTo) })
  return true
}
