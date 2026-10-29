import type { Entry, Project } from '@/types'

// Documentação de projetos e clientes: tipos e regras puras (sem rede), para a aba e para os testes.

export type DocKind = 'link' | 'file' | 'text'
/** Para quem o documento serve. "Ambos" = técnico e executivo. */
export type DocAudience = 'technical' | 'executive' | 'both'

export const AUDIENCE_LABEL: Record<DocAudience, string> = {
  technical: 'Técnico',
  executive: 'Executivo',
  both: 'Técnico e executivo',
}

export const KIND_LABEL: Record<DocKind, string> = { link: 'Link', file: 'Arquivo', text: 'Texto' }

/** Tamanho máximo de arquivo (anexos de tarefa e documentação). */
export const DOC_MAX_FILE_BYTES = 25 * 1024 * 1024

export const MAX_TAGS = 12
export const MAX_TAG_LENGTH = 30

/** Nomes que identificam uma tarefa de documentação (pt, en, es), sem acento e sem diferenciar maiúsculas. */
export function isDocumentationName(name: string | undefined | null): boolean {
  if (!name) return false
  const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
  return n === 'documentacao' || n === 'documentation' || n === 'documentacion'
}

/** Um item de documentação, venha de onde vier (direto na aba, ou espelhado de uma tarefa). */
export interface DocItem {
  /** Estável e único: 'item:<id>' (direto), 'entry-link:<tarefa>:<link>' ou 'entry-file:<anexo>' (espelhados). */
  key: string
  source: 'direct' | 'task'
  kind: DocKind
  title: string
  url?: string
  storagePath?: string
  fileName?: string
  fileSize?: number
  /** Markdown da caixa de texto. */
  body?: string
  audience: DocAudience
  tags: string[]
  projectId?: string
  projectName?: string
  /** Item direto de um cliente (não de um projeto). */
  clientId?: string
  /** Itens espelhados: a tarefa onde o link ou arquivo mora. */
  entryId?: string
  entryName?: string
  /** Itens diretos: id da linha em documentation_items. */
  itemId?: string
  createdBy?: string
  createdAt?: string
}

export interface DocMeta { audience: DocAudience; tags: string[] }

export interface AttachmentRowLite {
  id: string
  entity_id: string
  storage_path: string
  name: string
  size: number | null
  uploaded_by: string | null
  created_at: string | null
}

export interface DocItemRow {
  id: string
  project_id: string | null
  client_id: string | null
  kind: DocKind
  title: string
  url: string | null
  storage_path: string | null
  file_name: string | null
  file_size: number | null
  body: string | null
  audience: DocAudience
  tags: string[] | null
  created_by: string | null
  created_at: string | null
}

export const linkKey = (entryId: string, linkId: string) => `entry-link:${entryId}:${linkId}`
export const fileKey = (attachmentId: string) => `entry-file:${attachmentId}`

const AUDIENCES: DocAudience[] = ['technical', 'executive', 'both']
export const asAudience = (v: unknown): DocAudience => (AUDIENCES.includes(v as DocAudience) ? (v as DocAudience) : 'both')

/** Etiquetas: sem espaços nas pontas, sem repetir (ignora maiúsculas), curtas e em número limitado. */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const t = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH)
    const k = t.toLowerCase()
    if (!t || seen.has(k)) continue
    seen.add(k)
    out.push(t)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

/** Tarefas de documentação do projeto (todas as fases). */
export function documentationEntries(project: Project): Entry[] {
  return project.phases.flatMap((ph) => ph.entries.filter((e) => e.isDocumentation && e.type === 'task'))
}

export function directFromRow(row: DocItemRow, projectName?: string): DocItem {
  return {
    key: `item:${row.id}`,
    source: 'direct',
    kind: row.kind,
    title: row.title,
    url: row.url ?? undefined,
    storagePath: row.storage_path ?? undefined,
    fileName: row.file_name ?? undefined,
    fileSize: row.file_size ?? undefined,
    body: row.body ?? undefined,
    audience: asAudience(row.audience),
    tags: row.tags ?? [],
    projectId: row.project_id ?? undefined,
    projectName,
    clientId: row.client_id ?? undefined,
    itemId: row.id,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at ?? undefined,
  }
}

/** Links das tarefas de documentação dos projetos, ao vivo a partir do que está na memória. */
export function mirroredLinks(projects: Project[], meta: Record<string, DocMeta>): DocItem[] {
  const items: DocItem[] = []
  for (const p of projects) {
    for (const e of documentationEntries(p)) {
      for (const l of e.links ?? []) {
        const key = linkKey(e.id, l.id)
        const m = meta[key]
        items.push({
          key, source: 'task', kind: 'link', title: l.label?.trim() || l.url, url: l.url,
          audience: m?.audience ?? 'both', tags: m?.tags ?? [],
          projectId: p.id, projectName: p.name, entryId: e.id, entryName: e.name,
          createdAt: e.createdAt,
        })
      }
    }
  }
  return items
}

/** Anexos das tarefas de documentação (linhas da tabela attachments). Só os de tarefas ainda marcadas. */
export function mirroredFiles(projects: Project[], rows: AttachmentRowLite[], meta: Record<string, DocMeta>): DocItem[] {
  const owner = new Map<string, { project: Project; entry: Entry }>()
  for (const p of projects) for (const e of documentationEntries(p)) owner.set(e.id, { project: p, entry: e })
  const items: DocItem[] = []
  for (const r of rows) {
    const o = owner.get(r.entity_id)
    if (!o) continue
    const key = fileKey(r.id)
    const m = meta[key]
    items.push({
      key, source: 'task', kind: 'file', title: r.name, storagePath: r.storage_path, fileName: r.name, fileSize: r.size ?? undefined,
      audience: m?.audience ?? 'both', tags: m?.tags ?? [],
      projectId: o.project.id, projectName: o.project.name, entryId: o.entry.id, entryName: o.entry.name,
      createdBy: r.uploaded_by ?? undefined, createdAt: r.created_at ?? undefined,
    })
  }
  return items
}

/** Mais recentes primeiro; sem data, no fim, por título. */
export function sortDocItems(items: DocItem[]): DocItem[] {
  return [...items].sort((a, b) => {
    const da = a.createdAt ?? '', db = b.createdAt ?? ''
    if (da !== db) return da < db ? 1 : -1
    return a.title.localeCompare(b.title, 'pt-BR')
  })
}

export interface DocFilters {
  query: string
  audience: DocAudience | 'all'
  kind: DocKind | 'all'
  tag: string | null
}

export const EMPTY_FILTERS: DocFilters = { query: '', audience: 'all', kind: 'all', tag: null }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Filtro de público: "técnico" mostra técnico e ambos; "executivo" mostra executivo e ambos. */
export function filterDocItems(items: DocItem[], f: DocFilters): DocItem[] {
  const q = fold(f.query.trim())
  return items.filter((it) => {
    if (f.kind !== 'all' && it.kind !== f.kind) return false
    if (f.audience !== 'all' && it.audience !== 'both' && it.audience !== f.audience) return false
    if (f.tag && !it.tags.some((t) => t.toLowerCase() === f.tag!.toLowerCase())) return false
    if (q) {
      const hay = fold([it.title, it.url ?? '', it.fileName ?? '', it.body ?? '', it.tags.join(' '), it.entryName ?? '', it.projectName ?? ''].join(' '))
      if (!hay.includes(q)) return false
    }
    return true
  })
}

/** Etiquetas em uso, da mais usada para a menos (desempate por nome). */
export function tagCounts(items: DocItem[]): { tag: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>()
  for (const it of items) {
    for (const t of it.tags) {
      const k = t.toLowerCase()
      const cur = counts.get(k)
      if (cur) cur.count++
      else counts.set(k, { tag: t, count: 1 })
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'pt-BR'))
}

/** Prévia curta de um texto em Markdown (sem marcas). */
export function textPreview(markdown: string | undefined, max = 160): string {
  if (!markdown) return ''
  const plain = markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')       // [texto](url) → texto
    .replace(/(^|\n)\s*#{1,6}\s*/g, '$1')            // títulos
    .replace(/[*_`~]+/g, '')                          // negrito, itálico, código
    .replace(/(^|\n)\s*[>|*-]+\s*/g, '$1')           // citação, listas e tabelas no começo da linha
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Nome seguro para o caminho no armazenamento. */
export function safeFileName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-120) || 'arquivo'
}
