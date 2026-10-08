/** Campos de texto que são documentos colaborativos (editor de blocos com várias pessoas ao mesmo tempo).
 *  Espelha collab_field_doc() da migration 20261013: tabela/coluna onde fica a projeção em Markdown e as
 *  partes do id do documento ("<prefixo>_<uuid>_<campo>"). */
export type DocFieldKind =
  | 'incident.description'
  | 'client.notes'
  | 'project.overview'
  | 'meeting.notes'
  | 'openpoint.description'
  | 'history.detail'

export const DOC_FIELDS: Record<DocFieldKind, { table: string; column: string; prefix: string; field: string }> = {
  'incident.description': { table: 'incidents', column: 'description', prefix: 'incident', field: 'description' },
  'client.notes': { table: 'clients', column: 'notes', prefix: 'client', field: 'notes' },
  'project.overview': { table: 'projects', column: 'overview', prefix: 'project', field: 'overview' },
  'meeting.notes': { table: 'meeting_logs', column: 'notes', prefix: 'diary', field: 'meeting_notes' },
  'openpoint.description': { table: 'open_points', column: 'description', prefix: 'diary', field: 'op_description' },
  'history.detail': { table: 'history', column: 'detail', prefix: 'diary', field: 'history_detail' },
}

export function docIdFor(kind: DocFieldKind, id: string): string {
  const f = DOC_FIELDS[kind]
  return `${f.prefix}_${id}_${f.field}`
}
