import { useState } from 'react'

export interface AnchorItem {
  id: string
  label: string
}

interface Props {
  items: AnchorItem[]
  onNavigate: (id: string) => void
  /** Controlled active id — pass the page's own tab state so the underline
   *  stays in sync when the active tab changes from elsewhere (e.g. a "go to
   *  risk" link switching tabs programmatically). Omit to fall back to
   *  tracking clicks internally (used where this still scrolls to an #id
   *  section instead of switching an exclusive tab). */
  active?: string
}

/** Row of tab-like links — either a controlled exclusive tab switcher (pass
 *  `active`) or an uncontrolled anchor nav that smooth-scrolls to a `#id`
 *  section on the same page, tracking clicks itself. */
export function AnchorNav({ items, onNavigate, active: controlledActive }: Props) {
  const [uncontrolledActive, setUncontrolledActive] = useState(items[0]?.id)
  const active = controlledActive ?? uncontrolledActive

  function handleClick(id: string) {
    setUncontrolledActive(id)
    onNavigate(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div
      className="flex gap-6 sticky z-[2]"
      style={{ borderBottom: '1px solid var(--border-default)', top: 0, background: 'var(--surface-page)' }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => handleClick(item.id)}
          className="pb-3 text-[13px] font-medium transition-colors"
          style={{
            color: active === item.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
            borderBottom: active === item.id ? '2px solid var(--oe-primary)' : '2px solid transparent',
            marginBottom: -1,
            background: 'none',
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
