import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useToastStore } from '@/stores/useToastStore'
import {
  asAudience, AttachmentRowLite, directFromRow, DocAudience, DocItem, DocItemRow, DocMeta, documentationEntries,
  DOC_MAX_FILE_BYTES, fileKey, formatBytes, mirroredFiles, mirroredLinks, normalizeTags, safeFileName, sortDocItems,
} from '@/utils/documentation'

const BUCKET = 'project-files'

export type DocScope = { kind: 'project'; id: string } | { kind: 'client'; id: string } | { kind: 'group'; id: string }

export interface NewDocInput {
  title: string
  audience: DocAudience
  tags: string[]
}

/** Documentação de um projeto ou de um cliente.
 *
 *  • Projeto: itens colocados direto na aba + links e arquivos das tarefas de documentação do projeto (espelhados:
 *    o conteúdo continua na tarefa).
 *  • Cliente: itens do próprio cliente + tudo da documentação dos projetos ligados a ele.
 *  • Grupo: o mesmo, somado para todos os clientes membros (só leitura: itens novos entram no cliente ou no projeto).
 *
 *  Os links vêm ao vivo da memória do app; o resto (itens diretos, anexos, classificação) é buscado ao abrir e
 *  atualizado quando outra pessoa mexe (Realtime). */
export function useDocumentation(scope: DocScope) {
  const allProjects = useAppStore((s) => s.projects)
  const teamDirectory = useAppStore((s) => s.teamDirectory)
  const userId = useAuthStore((s) => s.user?.id)
  const addToast = useToastStore((s) => s.addToast)

  const group = useAppStore((s) => (scope.kind === 'group' ? s.clientGroups.find((g) => g.id === scope.id) : undefined))
  /** Clientes cujos itens diretos entram (cliente: ele; grupo: os membros). */
  const clientIds = useMemo(
    () => (scope.kind === 'client' ? [scope.id] : scope.kind === 'group' ? group?.clientIds ?? [] : []),
    [scope.kind, scope.id, group],
  )
  const clientsKey = clientIds.join(',')
  const projects = useMemo(
    () => (scope.kind === 'project'
      ? allProjects.filter((p) => p.id === scope.id)
      : allProjects.filter((p) => !p.archived && p.clientIds.some((c) => clientIds.includes(c)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allProjects, scope.kind, scope.id, clientsKey],
  )
  const projectNames = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects])
  const docEntryIds = useMemo(() => projects.flatMap((p) => documentationEntries(p).map((e) => e.id)), [projects])
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects])
  const idsKey = `${clientsKey}|${projectIds.join(',')}|${docEntryIds.join(',')}`

  const [rows, setRows] = useState<DocItemRow[]>([])
  const [attachments, setAttachments] = useState<AttachmentRowLite[]>([])
  const [meta, setMeta] = useState<Record<string, DocMeta>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const load = useCallback(async () => {
    try {
      // Uma consulta de cada vez (o supabase-js disputa o lock da sessão quando várias começam juntas).
      const itemRows: DocItemRow[] = []
      if (scope.kind === 'project') {
        const own = await supabase.from('documentation_items').select('*').eq('project_id', scope.id)
        if (own.error) throw new Error(own.error.message)
        itemRows.push(...((own.data ?? []) as DocItemRow[]))
      } else if (clientIds.length > 0) {
        const own = await supabase.from('documentation_items').select('*').in('client_id', clientIds)
        if (own.error) throw new Error(own.error.message)
        itemRows.push(...((own.data ?? []) as DocItemRow[]))
      }
      if (scope.kind !== 'project' && projectIds.length > 0) {
        const fromProjects = await supabase.from('documentation_items').select('*').in('project_id', projectIds)
        if (fromProjects.error) throw new Error(fromProjects.error.message)
        itemRows.push(...((fromProjects.data ?? []) as DocItemRow[]))
      }

      let attRows: AttachmentRowLite[] = []
      if (docEntryIds.length > 0) {
        const att = await supabase.from('attachments').select('id, entity_id, storage_path, name, size, uploaded_by, created_at')
          .eq('entity_type', 'entry').in('entity_id', docEntryIds)
        if (att.error) throw new Error(att.error.message)
        attRows = (att.data ?? []) as AttachmentRowLite[]
      }

      // Classificação dos itens espelhados: chaves dos anexos + dos links (que vêm da memória).
      const linkKeys = projects.flatMap((p) => documentationEntries(p).flatMap((e) => (e.links ?? []).map((l) => `entry-link:${e.id}:${l.id}`)))
      const keys = [...linkKeys, ...attRows.map((a) => fileKey(a.id))]
      const metaMap: Record<string, DocMeta> = {}
      if (keys.length > 0) {
        // Todo item espelhado precisa de uma linha de classificação para ter código curto: o banco cria as que faltam.
        await supabase.rpc('documentation_ensure_codes', { p_keys: keys })   // sem a migration de códigos, segue sem código
        const m = await supabase.from('documentation_meta').select('*').in('source_key', keys)
        if (m.error) throw new Error(m.error.message)
        for (const r of (m.data ?? []) as { source_key: string; audience: string; tags: string[] | null; code?: string | null }[]) {
          metaMap[r.source_key] = { audience: asAudience(r.audience), tags: r.tags ?? [], code: r.code ?? undefined }
        }
      }
      if (!alive.current) return
      setRows(itemRows)
      setAttachments(attRows)
      setMeta(metaMap)
      setError(null)
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Erro ao carregar a documentação.')
    } finally {
      if (alive.current) setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.kind, scope.id, idsKey])

  useEffect(() => { setLoading(true); void load() }, [load])

  // Outra pessoa adicionou/removeu/reclassificou: recarrega (com um respiro, para juntar rajadas).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => { void load() }, 400) }
    const channel = supabase
      .channel(`documentation:${scope.kind}:${scope.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documentation_items' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documentation_meta' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attachments' }, refresh)
      .subscribe()
    return () => { clearTimeout(timer); void supabase.removeChannel(channel) }
  }, [scope.kind, scope.id, load])

  const personName = useCallback((id?: string) => (id ? teamDirectory.find((p) => p.id === id)?.name ?? undefined : undefined), [teamDirectory])

  const items = useMemo(() => {
    const direct = rows.map((r) => directFromRow(r, r.project_id ? projectNames.get(r.project_id) : undefined))
    return sortDocItems([...direct, ...mirroredLinks(projects, meta), ...mirroredFiles(projects, attachments, meta)])
  }, [rows, projects, attachments, meta, projectNames])

  const fail = (e: unknown, what: string) => {
    addToast(`${what}: ${e instanceof Error ? e.message : 'erro inesperado'}`)
    return false
  }

  // Grupo é só leitura: quem adiciona escolhe o cliente (ou o projeto) onde o item vai morar.
  const scopeCols = scope.kind === 'project' ? { project_id: scope.id, client_id: null } : { client_id: scope.id, project_id: null }
  const readOnlyScope = scope.kind === 'group'

  const addLink = useCallback(async (input: NewDocInput & { url: string }): Promise<boolean> => {
    if (readOnlyScope) return false
    const { error: e } = await supabase.from('documentation_items').insert({
      ...scopeCols, kind: 'link', title: input.title.trim(), url: input.url.trim(), audience: input.audience, tags: normalizeTags(input.tags), created_by: userId,
    })
    if (e) return fail(e, 'Não foi possível adicionar o link')
    await load()
    return true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.kind, scope.id, userId, load])

  const addFile = useCallback(async (input: NewDocInput & { file: File }): Promise<boolean> => {
    if (readOnlyScope) return false
    if (input.file.size > DOC_MAX_FILE_BYTES) return fail(new Error(`"${input.file.name}" passa de ${formatBytes(DOC_MAX_FILE_BYTES)}`), 'Arquivo grande demais')
    const path = `documentation/${scope.kind}/${scope.id}/${uuid()}_${safeFileName(input.file.name)}`
    const up = await supabase.storage.from(BUCKET).upload(path, input.file, { upsert: false })
    if (up.error) return fail(up.error, 'Não foi possível enviar o arquivo')
    const { error: e } = await supabase.from('documentation_items').insert({
      ...scopeCols, kind: 'file', title: input.title.trim() || input.file.name, storage_path: path, file_name: input.file.name, file_size: input.file.size,
      audience: input.audience, tags: normalizeTags(input.tags), created_by: userId,
    })
    if (e) {
      await supabase.storage.from(BUCKET).remove([path])   // não deixa arquivo órfão
      return fail(e, 'Não foi possível registrar o arquivo')
    }
    await load()
    return true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.kind, scope.id, userId, load])

  /** Cria a caixa de texto vazia e devolve o id, para abrir o editor. */
  const addText = useCallback(async (input: NewDocInput): Promise<string | null> => {
    if (readOnlyScope) return null
    const { data, error: e } = await supabase.from('documentation_items').insert({
      ...scopeCols, kind: 'text', title: input.title.trim(), body: '', audience: input.audience, tags: normalizeTags(input.tags), created_by: userId,
    }).select('id').single()
    if (e || !data) { fail(e ?? new Error('sem resposta'), 'Não foi possível criar o texto'); return null }
    await load()
    return (data as { id: string }).id
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.kind, scope.id, userId, load])

  /** Título, link, público e etiquetas. Itens espelhados só têm público e etiquetas (o conteúdo é da tarefa). */
  const updateItem = useCallback(async (item: DocItem, patch: { title?: string; url?: string; audience: DocAudience; tags: string[] }): Promise<boolean> => {
    const tags = normalizeTags(patch.tags)
    if (item.source === 'task') {
      const { error: e } = await supabase.from('documentation_meta').upsert({
        source_key: item.key, audience: patch.audience, tags, updated_by: userId, updated_at: new Date().toISOString(),
      })
      if (e) return fail(e, 'Não foi possível salvar')
      setMeta((m) => ({ ...m, [item.key]: { audience: patch.audience, tags, code: m[item.key]?.code } }))
      return true
    }
    const fields: Record<string, unknown> = { audience: patch.audience, tags }
    if (patch.title !== undefined && patch.title.trim()) fields.title = patch.title.trim()
    if (item.kind === 'link' && patch.url !== undefined && patch.url.trim()) fields.url = patch.url.trim()
    const { error: e } = await supabase.from('documentation_items').update(fields).eq('id', item.itemId!)
    if (e) return fail(e, 'Não foi possível salvar')
    setRows((rs) => rs.map((r) => (r.id === item.itemId ? { ...r, ...fields, audience: patch.audience, tags } as DocItemRow : r)))
    return true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  /** Só itens diretos: o que mora numa tarefa se remove na tarefa. */
  const removeItem = useCallback(async (item: DocItem): Promise<boolean> => {
    if (item.source !== 'direct' || !item.itemId) return false
    const prev = rows
    setRows((rs) => rs.filter((r) => r.id !== item.itemId))
    const { error: e } = await supabase.from('documentation_items').delete().eq('id', item.itemId)
    if (e) { setRows(prev); return fail(e, 'Não foi possível remover') }
    if (item.kind === 'file' && item.storagePath) await supabase.storage.from(BUCKET).remove([item.storagePath])
    return true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  /** Abre um arquivo (link assinado de curta duração, gerado na hora). */
  const openFile = useCallback(async (item: DocItem) => {
    if (!item.storagePath) return
    const { data, error: e } = await supabase.storage.from(BUCKET).createSignedUrl(item.storagePath, 60 * 10, { download: false })
    if (e || !data?.signedUrl) { fail(e ?? new Error('link indisponível'), 'Não foi possível abrir o arquivo'); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { items, loading, error, reload: load, personName, projects, clientIds, addLink, addFile, addText, updateItem, removeItem, openFile }
}
