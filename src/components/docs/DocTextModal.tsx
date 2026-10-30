import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import DocField from '@/components/editor/DocField'
import { TagInput } from './TagInput'
import { AUDIENCE_LABEL, DocAudience, DocItem } from '@/utils/documentation'

interface Props {
  item: DocItem | null
  suggestions: string[]
  onClose: () => void
  /** Título, público e etiquetas (o texto em si é gravado pelo editor, ao vivo). */
  onSaveMeta: (item: DocItem, patch: { title: string; audience: DocAudience; tags: string[] }) => Promise<boolean>
}

const AUDIENCES: DocAudience[] = ['technical', 'executive', 'both']

/** Caixa de texto da documentação: editor de blocos com edição em conjunto (sem botão Salvar). */
export function DocTextModal({ item, suggestions, onClose, onSaveMeta }: Props) {
  const [title, setTitle] = useState('')
  const [audience, setAudience] = useState<DocAudience>('both')
  const [tags, setTags] = useState<string[]>([])

  useEffect(() => {
    if (!item) return
    setTitle(item.title)
    setAudience(item.audience)
    setTags(item.tags)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.key])

  if (!item) return null

  const dirty = title.trim() !== item.title || audience !== item.audience || tags.join('\u0000') !== item.tags.join('\u0000')

  return (
    <Modal
      open
      size="lg"
      title="Texto da documentação"
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto text-xs" style={{ color: 'var(--text-tertiary)' }}>O texto é salvo sozinho enquanto você escreve.</span>
          {dirty && (
            <Button variant="secondary" onClick={() => { setTitle(item.title); setAudience(item.audience); setTags(item.tags) }}>Desfazer</Button>
          )}
          <Button
            onClick={async () => { if (!dirty || await onSaveMeta(item, { title: title.trim() || item.title, audience, tags })) onClose() }}
          >
            {dirty ? 'Salvar e fechar' : 'Fechar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" aria-label="Título" style={{ fontWeight: 600, fontSize: 15 }} />
        <div className="flex flex-wrap items-start gap-4">
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
                  ? { background: 'var(--text-primary)', color: 'var(--surface-page)', borderColor: 'var(--text-primary)' }
                  : { background: 'var(--surface-card)', color: 'var(--text-secondary)', borderColor: 'var(--border-default)' }}
              >
                {AUDIENCE_LABEL[a]}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-[240px]"><TagInput value={tags} onChange={setTags} suggestions={suggestions} /></div>
        </div>
        <DocField kind="documentation.body" target={{ id: item.itemId! }} value={item.body} compact={false} minHeight={320} />
      </div>
    </Modal>
  )
}
