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
  /** Background behind the tab row — must match whatever wraps this component
   *  or the sticky strip shows as a seam of mismatched color (surface-page's
   *  cream tint vs. a surface-card white parent, for example). Defaults to
   *  surface-page for the uncontrolled anchor-scroll usage. */
  background?: string
}

/** Row of tab-like links — either a controlled exclusive tab switcher (pass
 *  `active`) or an uncontrolled anchor nav that smooth-scrolls to a `#id`
 *  section on the same page, tracking clicks itself. */
export function AnchorNav({ items, onNavigate, active: controlledActive, background = 'var(--surface-page)' }: Props) {
  const [uncontrolledActive, setUncontrolledActive] = useState(items[0]?.id)
  const active = controlledActive ?? uncontrolledActive

  function handleClick(id: string) {
    setUncontrolledActive(id)
    onNavigate(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div
      className="flex flex-wrap gap-1 sticky z-[2] py-2"
      style={{ top: 0, background }}
      role="tablist"
    >
      {items.map((item) => {
        const on = active === item.id
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={on}
            onClick={() => handleClick(item.id)}
            className="px-3 py-1.5 text-[13px] font-medium rounded-[var(--radius-pill)] transition-colors whitespace-nowrap hover:text-[var(--text-primary)]"
            style={{
              color: on ? 'var(--text-primary)' : 'var(--text-tertiary)',
              background: on ? 'var(--surface-subtle)' : 'transparent',
            }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
