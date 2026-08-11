import { useState, CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardIcon } from './icons'

interface Props {
  url: string
  size?: 'xs' | 'sm'
  className?: string
  style?: CSSProperties
}

export function CopyLinkButton({ url, size = 'sm', className = '', style }: Props) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 transition-colors ${className}`}
      style={{
        fontSize: size === 'xs' ? 11 : 12,
        padding: size === 'xs' ? '4px 8px' : '5px 10px',
        borderRadius: 'var(--radius-md)',
        color: copied ? 'var(--color-success-text)' : 'var(--text-tertiary)',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        ...style,
      }}
      onMouseEnter={(e) => { if (!copied) { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--surface-subtle)' } }}
      onMouseLeave={(e) => { if (!copied) { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.background = 'transparent' } }}
    >
      <ClipboardIcon className={size === 'xs' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      {copied ? t('report.linkCopied') : t('report.linkCopy')}
    </button>
  )
}
