import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { FileAttachment } from '@/types'
import { useToastStore } from '@/stores/useToastStore'

const BUCKET = 'project-files'

interface Props {
  scopeId: string
  parentId: string
  attachments: FileAttachment[]
  onAdd: (attachment: FileAttachment) => void
  onRemove: (attachmentId: string) => void
}

function formatBytes(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext ?? '')) return '🖼️'
  if (['pdf'].includes(ext ?? '')) return '📄'
  if (['doc', 'docx'].includes(ext ?? '')) return '📝'
  if (['xls', 'xlsx', 'csv'].includes(ext ?? '')) return '📊'
  if (['zip', 'rar', '7z'].includes(ext ?? '')) return '🗜️'
  return '📎'
}

export default function FileAttachments({ scopeId, parentId, attachments, onAdd, onRemove }: Props) {
  const { t } = useTranslation()
  const { addToast } = useToastStore()
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const ts = Date.now()
        const path = `${scopeId}/${parentId}/${ts}_${file.name}`
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { upsert: false })
        if (uploadError) throw new Error(uploadError.message)

        const { data: urlData } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(path, 60 * 60 * 24 * 7) // 7 days
        if (!urlData?.signedUrl) throw new Error('Could not generate signed URL')

        const attachment: FileAttachment = {
          id: path,
          name: file.name,
          url: urlData.signedUrl,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        }
        onAdd(attachment)
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erro ao enviar arquivo')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleRemove(att: FileAttachment) {
    try {
      const { error } = await supabase.storage.from(BUCKET).remove([att.id])
      if (error) throw new Error(error.message)
      onRemove(att.id)
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erro ao remover arquivo')
    }
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
          Anexos {attachments.length > 0 && `(${attachments.length})`}
        </p>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="text-xs transition-colors disabled:opacity-50"
          style={{ color: 'var(--oe-primary)' }}
        >
          {uploading ? 'Enviando...' : '+ Anexar'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md group"
              style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-default)' }}
            >
              <span className="text-sm">{fileIcon(att.name)}</span>
              <a
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs max-w-[140px] truncate"
                style={{ color: 'var(--oe-primary)' }}
                title={att.name}
              >
                {att.name}
              </a>
              {att.size && (
                <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                  {formatBytes(att.size)}
                </span>
              )}
              <button
                onClick={() => handleRemove(att)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-xs ml-0.5"
                style={{ color: 'var(--color-danger-text)' }}
                title="Remover"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
