import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Field } from '@/components/ui/Input'
import { TagInput } from './TagInput'
import { AUDIENCE_LABEL, DOC_MAX_FILE_BYTES, DocAudience, DocItem, DocKind, formatBytes } from '@/utils/documentation'

export interface DocItemValues {
  kind: DocKind
  title: string
  url: string
  file: File | null
  audience: DocAudience
  tags: string[]
}

interface Props {
  open: boolean
  onClose: () => void
  /** Novo item (tipo escolhido pelo botão) ou edição de um existente. */
  mode: { type: 'create'; kind: DocKind } | { type: 'edit'; item: DocItem }
  suggestions: string[]
  onSubmit: (values: DocItemValues) => Promise<boolean>
}

const AUDIENCES: DocAudience[] = ['technical', 'executive', 'both']

function normalizeUrl(raw: string): string {
  const v = raw.trim()
  return v && !/^[a-z][a-z0-9+.-]*:/i.test(v) ? `https://${v}` : v
}

function isValidUrl(raw: string): boolean {
  try { const u = new URL(normalizeUrl(raw)); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false }
}

/** Criar (link, arquivo ou texto) ou editar a classificação de um item. */
export function DocItemModal({ open, onClose, mode, suggestions, onSubmit }: Props) {
  const kind: DocKind = mode.type === 'create' ? mode.kind : mode.item.kind
  const editing = mode.type === 'edit' ? mode.item : null
  const mirrored = editing?.source === 'task'

  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [audience, setAudience] = useState<DocAudience>('both')
  const [tags, setTags] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setTitle(editing?.title ?? '')
    setUrl(editing?.url ?? '')
    setFile(null)
    setAudience(editing?.audience ?? 'both')
    setTags(editing?.tags ?? [])
    setError('')
    setBusy(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.key, kind])

  function pickFile(f: File | null) {
    setError('')
    if (f && f.size > DOC_MAX_FILE_BYTES) { setError(`"${f.name}" passa de ${formatBytes(DOC_MAX_FILE_BYTES)}. Escolha um arquivo menor.`); return }
    setFile(f)
    if (f && !title.trim()) setTitle(f.name)
  }

  const needsTitle = kind !== 'file' || !!editing
  const valid =
    (!needsTitle || mirrored || title.trim().length > 0) &&
    (kind !== 'link' || mirrored || isValidUrl(url)) &&
    (kind !== 'file' || !!editing || !!file)

  async function submit() {
    if (!valid || busy) return
    setBusy(true)
    const ok = await onSubmit({ kind, title: title.trim(), url: kind === 'link' ? normalizeUrl(url) : '', file, audience, tags })
    setBusy(false)
    if (ok) onClose()
  }

  const heading = editing
    ? (mirrored ? 'Classificar documento' : 'Editar documento')
    : kind === 'link' ? 'Novo link' : kind === 'file' ? 'Novo arquivo' : 'Novo texto'

  return (
    <Modal
      open={open}
      title={heading}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={!valid || busy}>{busy ? 'Salvando…' : editing ? 'Salvar' : kind === 'text' ? 'Criar e escrever' : 'Adicionar'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {mirrored && (
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Este documento mora na tarefa "{editing?.entryName}". Aqui você só define o público e as etiquetas; para trocar ou remover o conteúdo, use a tarefa.
          </p>
        )}

        {!mirrored && (kind !== 'file' || editing) && (
          <Field label="Título" required>
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'text' ? 'Ex.: Arquitetura da integração' : 'Ex.: Manual do administrador'} />
          </Field>
        )}

        {!mirrored && kind === 'link' && (
          <Field label="Endereço (URL)" required>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." inputMode="url" />
            {url.trim() && !isValidUrl(url) && <p className="text-xs mt-1" style={{ color: 'var(--color-danger-text)' }}>Informe um endereço http ou https.</p>}
          </Field>
        )}

        {!editing && kind === 'file' && (
          <>
            <Field label="Arquivo" required hint={`Até ${formatBytes(DOC_MAX_FILE_BYTES)}.`}>
              <input ref={fileRef} type="file" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} className="block w-full text-[13px]" style={{ color: 'var(--text-secondary)' }} />
            </Field>
            <Field label="Título" hint="Se ficar em branco, usa o nome do arquivo.">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={file?.name ?? 'Nome que vai aparecer na lista'} />
            </Field>
          </>
        )}

        <Field label="Para quem">
          <div className="flex gap-1.5" role="radiogroup" aria-label="Público do documento">
            {AUDIENCES.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={audience === a}
                onClick={() => setAudience(a)}
                className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border transition-colors"
                style={audience === a
                  ? { background: 'var(--oe-primary)', color: 'white', borderColor: 'var(--oe-primary)' }
                  : { background: 'var(--surface-card)', color: 'var(--text-secondary)', borderColor: 'var(--border-default)' }}
              >
                {AUDIENCE_LABEL[a]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Etiquetas">
          <TagInput value={tags} onChange={setTags} suggestions={suggestions} />
        </Field>

        {error && <p className="text-xs" role="alert" style={{ color: 'var(--color-danger-text)' }}>{error}</p>}
      </div>
    </Modal>
  )
}
