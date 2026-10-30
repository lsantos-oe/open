import { InputHTMLAttributes } from 'react'
import { SearchIcon } from './icons'

interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  wrapperClassName?: string
}

/** Shared search field — icon + flex-fill with a sane min-width, never a
 *  fixed pixel width. Used across every list page's toolbar. */
export function SearchInput({ wrapperClassName = '', className = '', style, ...rest }: SearchInputProps) {
  return (
    <div className={`relative flex-1 min-w-[160px] ${wrapperClassName}`}>
      <span
        className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <SearchIcon />
      </span>
      <input
        {...rest}
        className={`w-full h-8 text-[13px] border border-transparent pl-9 pr-4 rounded-[var(--radius-pill)] outline-none focus:border-[var(--text-tertiary)] transition-colors ${className}`}
        style={{
          background: 'var(--surface-subtle)',
          color: 'var(--text-primary)',
          ...style,
        }}
      />
    </div>
  )
}
