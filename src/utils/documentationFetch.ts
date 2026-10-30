import { supabase } from '@/lib/supabase'
import type { Project } from '@/types'
import { asAudience, AttachmentRowLite, DocItemRow, DocMeta, documentationEntries, fileKey } from '@/utils/documentation'

// Busca da documentação no banco (itens diretos, anexos das tarefas de documentação e a classificação dos espelhados).
// Usada pela aba Documentação e pelo assistente de IA, para os dois verem exatamente os mesmos itens.

/** De onde vêm os itens: um projeto, um conjunto de clientes (cliente ou grupo) ou tudo. */
export type DocSource =
  | { kind: 'project'; projectId: string; projects: Project[] }
  | { kind: 'clients'; clientIds: string[]; projects: Project[] }
  | { kind: 'all'; projects: Project[] }

export interface DocData {
  rows: DocItemRow[]
  attachments: AttachmentRowLite[]
  meta: Record<string, DocMeta>
}

/** Filtros `in (...)` longos estouram o tamanho da URL: busca em lotes. */
const BATCH = 80
const batches = <T,>(items: T[]): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += BATCH) out.push(items.slice(i, i + BATCH))
  return out
}

/** Uma consulta de cada vez (o supabase-js disputa o lock da sessão quando várias começam juntas). */
export async function fetchDocumentation(source: DocSource): Promise<DocData> {
  const { projects } = source
  const projectIds = projects.map((p) => p.id)
  const docEntryIds = projects.flatMap((p) => documentationEntries(p).map((e) => e.id))

  const rows: DocItemRow[] = []
  const add = (data: unknown) => rows.push(...((data ?? []) as DocItemRow[]))
  if (source.kind === 'project') {
    const own = await supabase.from('documentation_items').select('*').eq('project_id', source.projectId)
    if (own.error) throw new Error(own.error.message)
    add(own.data)
  } else if (source.kind === 'all') {
    const all = await supabase.from('documentation_items').select('*')
    if (all.error) throw new Error(all.error.message)
    add(all.data)
  } else {
    if (source.clientIds.length > 0) {
      const own = await supabase.from('documentation_items').select('*').in('client_id', source.clientIds)
      if (own.error) throw new Error(own.error.message)
      add(own.data)
    }
    for (const ids of batches(projectIds)) {
      const fromProjects = await supabase.from('documentation_items').select('*').in('project_id', ids)
      if (fromProjects.error) throw new Error(fromProjects.error.message)
      add(fromProjects.data)
    }
  }

  const attachments: AttachmentRowLite[] = []
  for (const ids of batches(docEntryIds)) {
    const att = await supabase.from('attachments').select('id, entity_id, storage_path, name, size, uploaded_by, created_at')
      .eq('entity_type', 'entry').in('entity_id', ids)
    if (att.error) throw new Error(att.error.message)
    attachments.push(...((att.data ?? []) as AttachmentRowLite[]))
  }

  // Classificação dos itens espelhados: chaves dos anexos + dos links (que vêm da memória).
  const linkKeys = projects.flatMap((p) => documentationEntries(p).flatMap((e) => (e.links ?? []).map((l) => `entry-link:${e.id}:${l.id}`)))
  const keys = [...linkKeys, ...attachments.map((a) => fileKey(a.id))]
  const meta: Record<string, DocMeta> = {}
  for (const ks of batches(keys)) {
    // Todo item espelhado precisa de uma linha de classificação para ter código curto: o banco cria as que faltam.
    await supabase.rpc('documentation_ensure_codes', { p_keys: ks })   // sem a migration de códigos, segue sem código
    const m = await supabase.from('documentation_meta').select('*').in('source_key', ks)
    if (m.error) throw new Error(m.error.message)
    for (const r of (m.data ?? []) as { source_key: string; audience: string; tags: string[] | null; code?: string | null }[]) {
      meta[r.source_key] = { audience: asAudience(r.audience), tags: r.tags ?? [], code: r.code ?? undefined }
    }
  }
  return { rows, attachments, meta }
}
