import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, BadgeVariant } from '@/components/ui/Badge'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CodeBadge } from '@/components/ui/CodeBadge'
import { normalizeCode } from '@/utils/codes'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { LinkIcon, FileIcon, NoteIcon, PlusIcon, SearchIcon } from '@/components/ui/icons'
import { useEntryOpenerStore } from '@/stores/useEntryOpenerStore'
import { useAppStore } from '@/store/useAppStore'
import { DocScope, useDocumentation } from '@/hooks/useDocumentation'
import { DocItemModal, DocItemValues } from './DocItemModal'
import { DocTextModal } from './DocTextModal'
import {
  AUDIENCE_LABEL, DocAudience, DocFilters, DocItem, DocKind, EMPTY_FILTERS, filterDocItems, formatBytes, KIND_LABEL, tagCounts, textPreview,
} from '@/utils/documentation'

interface Props {
  scope: DocScope
}

const AUDIENCE_STYLE: Record<DocAudience, BadgeVariant> = { technical: 'blue', executive: 'violet', both: 'gray' }

const KIND_ICON: Record<DocKind, ReactNode> = {
  link: <LinkIcon className="w-4 h-4" />,
  file: <FileIcon className="w-4 h-4" />,
  text: <NoteIcon className="w-4 h-4" />,
}

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '')

function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div className="flex rounded-[var(--radius-md)] border overflow-hidden" style={{ borderColor: 'var(--border-default)' }} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className="px-3 py-1.5 text-xs font-medium transition-colors"
          style={value === o.value
            ? { background: 'var(--oe-primary)', color: 'white' }
            : { background: 'var(--surface-card)', color: 'var(--text-secondary)' }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Aba Documentação de um projeto ou de um cliente: links, arquivos e caixas de texto, com público
 *  (técnico/executivo) e etiquetas. Os links e arquivos das tarefas de documentação aparecem aqui sozinhos. */
export default function DocumentationPanel({ scope }: Props) {
  const navigate = useNavigate()
  const openEntry = useEntryOpenerStore((s) => s.open)
  const doc = useDocumentation(scope)
  const clients = useAppStore((s) => s.clients)
  const readOnly = scope.kind === 'group'
  const [filters, setFilters] = useState<DocFilters>(EMPTY_FILTERS)
  const [creating, setCreating] = useState<DocKind | null>(null)
  const [editing, setEditing] = useState<DocItem | null>(null)
  const [textKey, setTextKey] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  // Link curto de um item (…?doc=D-2026-000123): rola até ele, destaca e, se for texto, abre.
  const [searchParams, setSearchParams] = useSearchParams()
  const docParam = searchParams.get('doc')
  const [highlight, setHighlight] = useState<string | null>(null)
  const handled = useRef<string | null>(null)
  useEffect(() => {
    if (!docParam || handled.current === docParam || doc.loading) return
    const target = doc.items.find((i) => i.code === normalizeCode(docParam))
    if (!target) return
    handled.current = docParam
    setFilters(EMPTY_FILTERS)
    setHighlight(target.key)
    if (target.kind === 'text') setTextKey(target.key)
    setTimeout(() => document.getElementById(`doc-${target.code}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80)
    setTimeout(() => setHighlight(null), 4000)
    const next = new URLSearchParams(searchParams); next.delete('doc'); setSearchParams(next, { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docParam, doc.items, doc.loading])

  const suggestions = useMemo(() => tagCounts(doc.items).map((t) => t.tag), [doc.items])
  const visible = useMemo(() => filterDocItems(doc.items, filters), [doc.items, filters])
  const textItem = textKey ? doc.items.find((i) => i.key === textKey) ?? null : null
  const hasFilters = filters.query || filters.audience !== 'all' || filters.kind !== 'all' || filters.tag

  // Cliente: uma seção para o que é do próprio cliente e uma por projeto. Projeto: lista única.
  const sections = useMemo(() => {
    if (scope.kind === 'project') return [{ id: 'all', title: '', projectId: undefined as string | undefined, clientId: undefined as string | undefined, items: visible }]
    const out: { id: string; title: string; projectId?: string; clientId?: string; items: DocItem[] }[] = []
    if (scope.kind === 'client') {
      const own = visible.filter((i) => !i.projectId)
      if (own.length) out.push({ id: 'client', title: 'Do cliente', items: own })
    } else {
      // Grupo: uma seção por cliente membro, com o que foi adicionado direto nele.
      for (const cid of doc.clientIds) {
        const items = visible.filter((i) => !i.projectId && i.clientId === cid)
        if (items.length) out.push({ id: `client:${cid}`, title: `Cliente · ${clients.find((c) => c.id === cid)?.name ?? '—'}`, clientId: cid, items })
      }
    }
    for (const p of doc.projects) {
      const items = visible.filter((i) => i.projectId === p.id)
      if (items.length) out.push({ id: p.id, title: p.name, projectId: p.id, items })
    }
    return out
  }, [scope.kind, visible, doc.projects, doc.clientIds, clients])

  async function handleCreate(v: DocItemValues): Promise<boolean> {
    if (v.kind === 'link') return doc.addLink({ title: v.title, url: v.url, audience: v.audience, tags: v.tags })
    if (v.kind === 'file' && v.file) return doc.addFile({ title: v.title, file: v.file, audience: v.audience, tags: v.tags })
    if (v.kind === 'text') {
      const id = await doc.addText({ title: v.title, audience: v.audience, tags: v.tags })
      if (!id) return false
      setTextKey(`item:${id}`)
      return true
    }
    return false
  }

  function openItem(item: DocItem) {
    if (item.kind === 'link' && item.url) window.open(item.url, '_blank', 'noopener,noreferrer')
    else if (item.kind === 'file') void doc.openFile(item)
    else if (item.kind === 'text') setTextKey(item.key)
  }

  function originOf(item: DocItem): string {
    if (item.source === 'task') return `Tarefa "${item.entryName}"`
    if (scope.kind !== 'project') return item.projectId ? 'Adicionado na aba do projeto' : 'Adicionado no cliente'
    return 'Adicionado nesta aba'
  }

  const subtitle = scope.kind === 'project'
    ? 'Links e arquivos das tarefas de documentação do projeto aparecem aqui sozinhos, junto com o que for adicionado direto nesta aba.'
    : scope.kind === 'group'
      ? 'Reúne a documentação de todos os clientes do grupo e dos projetos deles. Para adicionar algo novo, use a aba Documentação do cliente ou do projeto.'
      : 'Reúne a documentação dos projetos do cliente, além do que for adicionado direto no cliente.'

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Documentação {doc.items.length > 0 && <span className="text-sm font-normal" style={{ color: 'var(--text-tertiary)' }}>({doc.items.length})</span>}
          </h2>
          <p className="text-[13px] mt-0.5 max-w-2xl" style={{ color: 'var(--text-tertiary)' }}>{subtitle}</p>
        </div>
        {!readOnly && <div className="flex gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={() => setCreating('link')}><PlusIcon className="w-3.5 h-3.5" />Link</Button>
          <Button variant="secondary" size="sm" onClick={() => setCreating('file')}><PlusIcon className="w-3.5 h-3.5" />Arquivo</Button>
          <Button size="sm" onClick={() => setCreating('text')}><PlusIcon className="w-3.5 h-3.5" />Texto</Button>
        </div>}
      </div>

      {doc.items.length > 0 && (
        <div className="space-y-2.5 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={filters.query} onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))} placeholder="Buscar na documentação…" aria-label="Buscar na documentação" wrapperClassName="max-w-sm" />
            <Segmented
              label="Público"
              value={filters.audience}
              onChange={(audience) => setFilters((f) => ({ ...f, audience }))}
              options={[{ value: 'all', label: 'Todos' }, { value: 'technical', label: 'Técnico' }, { value: 'executive', label: 'Executivo' }]}
            />
            <Segmented
              label="Tipo"
              value={filters.kind}
              onChange={(kind) => setFilters((f) => ({ ...f, kind }))}
              options={[{ value: 'all', label: 'Tudo' }, { value: 'link', label: 'Links' }, { value: 'file', label: 'Arquivos' }, { value: 'text', label: 'Textos' }]}
            />
            {hasFilters && <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>Limpar filtros</Button>}
          </div>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Etiquetas:</span>
              {suggestions.map((t) => {
                const active = filters.tag?.toLowerCase() === t.toLowerCase()
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilters((f) => ({ ...f, tag: active ? null : t }))}
                    className="text-[11px] px-2 py-0.5 rounded-[var(--radius-pill)] border transition-colors"
                    style={active
                      ? { background: 'var(--oe-primary)', color: 'white', borderColor: 'var(--oe-primary)' }
                      : { background: 'var(--surface-card)', color: 'var(--text-secondary)', borderColor: 'var(--border-default)' }}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {doc.error && (
        <p className="text-sm mb-3" role="alert" style={{ color: 'var(--color-danger-text)' }}>
          {doc.error} <button className="underline" onClick={() => void doc.reload()}>Tentar de novo</button>
        </p>
      )}

      {doc.loading && doc.items.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Carregando…</p>
      ) : doc.items.length === 0 ? (
        <EmptyState
          icon={<FileIcon className="w-9 h-9" />}
          title="Nenhum documento ainda"
          description={scope.kind === 'project'
            ? 'Adicione um link, arquivo ou texto aqui, ou use os links e anexos da tarefa de documentação do projeto.'
            : scope.kind === 'group'
              ? 'Quando os clientes do grupo ou os projetos deles tiverem documentação, ela aparece aqui.'
              : 'Adicione um link, arquivo ou texto, ou documente os projetos do cliente: o que for colocado na tarefa de documentação aparece aqui.'}
          action={readOnly ? undefined : { label: 'Adicionar um texto', onClick: () => setCreating('text') }}
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={<SearchIcon className="w-9 h-9" />} title="Nada encontrado com esses filtros" action={{ label: 'Limpar filtros', onClick: () => setFilters(EMPTY_FILTERS) }} />
      ) : (
        <div className="space-y-6">
          {sections.map((sec) => (
            <section key={sec.id} aria-label={sec.title || 'Documentos'}>
              {sec.title && (
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>{sec.title}</h3>
                  <span className="text-[11px]" style={{ color: 'var(--text-disabled)' }}>{sec.items.length}</span>
                  {sec.projectId && (
                    <button className="text-[11px] underline" style={{ color: 'var(--oe-primary)' }} onClick={() => navigate(`/projects/${sec.projectId}`)}>Abrir projeto</button>
                  )}
                  {sec.clientId && (
                    <button className="text-[11px] underline" style={{ color: 'var(--oe-primary)' }} onClick={() => navigate(`/wallet/${sec.clientId}`)}>Abrir cliente</button>
                  )}
                </div>
              )}
              <ul className="space-y-2">
                {sec.items.map((item) => (
                  <DocRow
                    key={item.key}
                    item={item}
                    highlighted={highlight === item.key}
                    origin={originOf(item)}
                    author={doc.personName(item.createdBy)}
                    onOpen={() => openItem(item)}
                    onEdit={() => setEditing(item)}
                    onOpenTask={item.entryId ? () => openEntry(item.entryId!) : undefined}
                    onRemove={item.source === 'direct' && !readOnly ? () => setConfirmRemove(item.key) : undefined}
                    confirmingRemove={confirmRemove === item.key}
                    onConfirmRemove={async () => { setConfirmRemove(null); await doc.removeItem(item) }}
                    onCancelRemove={() => setConfirmRemove(null)}
                    onTag={(tag) => setFilters((f) => ({ ...f, tag }))}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Novo item */}
      <DocItemModal
        open={creating !== null}
        onClose={() => setCreating(null)}
        mode={{ type: 'create', kind: creating ?? 'link' }}
        suggestions={suggestions}
        onSubmit={handleCreate}
      />

      {/* Editar link/arquivo ou classificar um item espelhado */}
      {editing && editing.kind !== 'text' && (
        <DocItemModal
          open
          onClose={() => setEditing(null)}
          mode={{ type: 'edit', item: editing }}
          suggestions={suggestions}
          onSubmit={(v) => doc.updateItem(editing, { title: v.title, url: v.url, audience: v.audience, tags: v.tags })}
        />
      )}

      {/* Texto: editor + classificação */}
      {(textItem || (editing && editing.kind === 'text')) && (
        <DocTextModal
          item={textItem ?? editing}
          suggestions={suggestions}
          onClose={() => { setTextKey(null); setEditing(null) }}
          onSaveMeta={(item, patch) => doc.updateItem(item, patch)}
        />
      )}
    </div>
  )
}

function DocRow({
  item, highlighted, origin, author, onOpen, onEdit, onOpenTask, onRemove, confirmingRemove, onConfirmRemove, onCancelRemove, onTag,
}: {
  item: DocItem
  highlighted?: boolean
  origin: string
  author?: string
  onOpen: () => void
  onEdit: () => void
  onOpenTask?: () => void
  onRemove?: () => void
  confirmingRemove: boolean
  onConfirmRemove: () => void
  onCancelRemove: () => void
  onTag: (tag: string) => void
}) {
  const aud = AUDIENCE_STYLE[item.audience]
  const meta = [origin, author, fmtDate(item.createdAt), item.kind === 'file' ? formatBytes(item.fileSize) : ''].filter(Boolean).join(' · ')
  const preview = item.kind === 'text' ? textPreview(item.body) : item.kind === 'link' ? item.url : item.fileName !== item.title ? item.fileName : ''

  return (
    <li
      id={item.code ? `doc-${item.code}` : undefined}
      className="flex items-start gap-3 p-3 border transition-shadow"
      style={{
        background: 'var(--surface-card)', borderColor: highlighted ? 'var(--oe-primary)' : 'var(--border-default)', borderRadius: 'var(--radius-lg)',
        boxShadow: highlighted ? '0 0 0 3px var(--oe-primary-light)' : undefined,
      }}
    >
      <span
        className="w-9 h-9 shrink-0 flex items-center justify-center"
        style={{ background: 'var(--oe-primary-light)', color: 'var(--oe-primary)', borderRadius: 'var(--radius-md)' }}
        title={KIND_LABEL[item.kind]}
        aria-label={KIND_LABEL[item.kind]}
      >
        {KIND_ICON[item.kind]}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onOpen} className="text-sm font-medium text-left hover:underline min-w-0 truncate" style={{ color: 'var(--text-primary)', maxWidth: '100%' }}>
            {item.title}
          </button>
          <Badge variant={aud} size="sm">{AUDIENCE_LABEL[item.audience]}</Badge>
        </div>
        {preview && <p className="text-[12.5px] mt-0.5 line-clamp-2 break-words" style={{ color: 'var(--text-tertiary)' }}>{preview}</p>}
        <p className="text-[11.5px] mt-1 flex flex-wrap items-center gap-x-1" style={{ color: 'var(--text-tertiary)' }}>
          <span>{meta}</span>
          {item.code && <CodeBadge code={item.code} />}
        </p>
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {item.tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onTag(t)}
                className="text-[11px] px-2 py-0.5 rounded-[var(--radius-pill)] border hover:border-[var(--oe-primary)]"
                style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)', background: 'var(--surface-subtle)' }}
                title={`Filtrar por "${t}"`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {confirmingRemove ? (
          <>
            <span className="text-xs mr-1" style={{ color: 'var(--text-secondary)' }}>Remover?</span>
            <Button variant="danger" size="xs" onClick={onConfirmRemove}>Sim</Button>
            <Button variant="ghost" size="xs" onClick={onCancelRemove}>Não</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="xs" onClick={onOpen}>{item.kind === 'text' ? 'Abrir' : item.kind === 'file' ? 'Baixar' : 'Abrir'}</Button>
            <Button variant="ghost" size="xs" onClick={onEdit}>{item.source === 'task' ? 'Classificar' : 'Editar'}</Button>
            {onOpenTask && <Button variant="ghost" size="xs" onClick={onOpenTask}>Tarefa</Button>}
            {onRemove && <Button variant="ghost" size="xs" onClick={onRemove} aria-label={`Remover ${item.title}`}>Remover</Button>}
          </>
        )}
      </div>
    </li>
  )
}
