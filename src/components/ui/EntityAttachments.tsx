import { useState, useRef, useEffect, useCallback, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/useAuthStore'
import { useToastStore } from '@/stores/useToastStore'
import { FileAttachment } from '@/types'
import { ImageIcon, FileIcon, NoteIcon, SpreadsheetIcon, ArchiveIcon, PaperclipIcon } from '@/components/ui/icons'

const BUCKET = 'project-files'
const SIGNED_URL_TTL = 60 * 60 * 24 * 7 // 7 days
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB — keeps this "small attachments only", not a document repository

type EntityType = 'project' | 'incident' | 'entry'

interface Props {
  entityType: EntityType
  entityId: string
}

interface AttachmentRow {
  id: string
  storage_path: string
  name: string
  size: number | null
}

function formatBytes(bytes?: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(name: string): ReactNode {
  const ext = name.split('.').pop()?.toLowerCase()
  const cls = 'w-4 h-4'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext ?? '')) return <ImageIcon className={cls} />
  if (['pdf'].includes(ext ?? '')) return <FileIcon className={cls} />
  if (['doc', 'docx'].includes(ext ?? '')) return <NoteIcon className={cls} />
  if (['xls', 'xlsx', 'csv'].includes(ext ?? '')) return <SpreadsheetIcon className={cls} />
  if (['zip', 'rar', '7z'].includes(ext ?? '')) return <ArchiveIcon className={cls} />
  return <PaperclipIcon className={cls} />
}

/** Small-file attachments on a Project, Incident, or Entry (task) — a real
 *  `attachments` DB row per file (not inline JSONB), so unlike the older
 *  diary FileAttachments.tsx (Meetings/Open Points), this one actually
 *  survives a reload. Self-fetching: owns its own list instead of taking it
 *  as a controlled prop, since there's no parent object in the store holding
 *  it for these three entity types. */
export function EntityAttachments({ entityType, entityId }: Props) {
  const { user } = useAuthStore()
  const { addToast } = useToastStore()
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('attachments')
        .select('id, storage_path, name, size')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: true })
      if (error) throw new Error(error.message)

      const rows = (data ?? []) as AttachmentRow[]
      const withUrls = await Promise.all(rows.map(async (row) => {
        const { data: urlData } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, SIGNED_URL_TTL)
        return {
          id: row.id,
          name: row.name,
          url: urlData?.signedUrl ?? '',
          size: row.size ?? undefined,
          uploadedAt: '',
        } as FileAttachment
      }))
      setAttachments(withUrls)
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erro ao carregar anexos')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId])

  useEffect(() => { load() }, [load])

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    const tooLarge = list.find((f) => f.size > MAX_FILE_SIZE)
    if (tooLarge) {
      addToast(`"${tooLarge.name}" passa de ${formatBytes(MAX_FILE_SIZE)} — anexe um arquivo menor.`)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setUploading(true)
    try {
      for (const file of list) {
        const path = `${entityType}/${entityId}/${Date.now()}_${file.name}`
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
        if (uploadError) throw new Error(uploadError.message)

        const { error: insertError } = await supabase.from('attachments').insert({
          entity_type: entityType,
          entity_id: entityId,
          storage_path: path,
          name: file.name,
          size: file.size,
          uploaded_by: user?.id,
        })
        if (insertError) throw new Error(insertError.message)
      }
      await load()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erro ao enviar arquivo')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleRemove(att: FileAttachment) {
    const prev = attachments
    setAttachments((cur) => cur.filter((a) => a.id !== att.id))
    try {
      const { data } = await supabase.from('attachments').select('storage_path').eq('id', att.id).single()
      const { error: dbError } = await supabase.from('attachments').delete().eq('id', att.id)
      if (dbError) throw new Error(dbError.message)
      if (data?.storage_path) await supabase.storage.from(BUCKET).remove([data.storage_path])
    } catch (err) {
      setAttachments(prev)
      addToast(err instanceof Error ? err.message : 'Erro ao remover arquivo')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
          Anexos {attachments.length > 0 && `(${attachments.length})`}
        </p>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading || loading}
          className="text-xs transition-colors disabled:opacity-50"
          style={{ color: 'var(--oe-primary)' }}
        >
          {uploading ? 'Enviando...' : '+ Anexar'}
        </button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      </div>

      {!loading && attachments.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>Nenhum anexo ainda.</p>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-md)] group"
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
              {!!att.size && (
                <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{formatBytes(att.size)}</span>
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
