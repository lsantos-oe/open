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
        className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <SearchIcon />
      </span>
      <input
        {...rest}
        className={`w-full text-[13px] border border-[var(--border-default)] pl-8 pr-3 py-1.5 rounded-[var(--radius-md)] outline-none focus:border-[var(--oe-primary)] focus:ring-1 focus:ring-[var(--oe-primary)] transition-colors ${className}`}
        style={{
          background: 'var(--surface-input)',
          color: 'var(--text-primary)',
          ...style,
        }}
      />
    </div>
  )
}
