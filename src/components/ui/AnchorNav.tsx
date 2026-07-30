import { useState } from 'react'

export interface AnchorItem {
  id: string
  label: string
}

interface Props {
  items: AnchorItem[]
  onNavigate: (id: string) => void
}

/** Row of anchor links that smooth-scroll to a `#id` section on the same page,
 *  used by detail pages instead of exclusive tabs (see CollapsibleSection). */
export function AnchorNav({ items, onNavigate }: Props) {
  const [active, setActive] = useState(items[0]?.id)

  function handleClick(id: string) {
    setActive(id)
    onNavigate(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div
      className="flex gap-5 sticky z-[2]"
      style={{ borderBottom: '1px solid var(--border-default)', top: 0, background: 'var(--surface-page)' }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => handleClick(item.id)}
          className="pb-2.5 text-[13px] font-medium transition-colors"
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
