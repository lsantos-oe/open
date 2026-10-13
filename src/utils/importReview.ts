import type { Client, Incident, Project } from '@/types'
import type { ImportEntity } from './importLayouts'
import { StagingWorkbook, fold } from './importStaging'
import { matchClient, matchIncident, matchProject, matchTaskOrigin } from './importStagingMatch'
import type { ClientRowState, ImportRows, IncidentRowState, ProjectRowState, TaskRowState } from './importCommit'

/** Para qual cliente aponta o nome escrito na planilha: um existente, um que está sendo criado no mesmo arquivo
 *  (`batch:<nome>`), ou nenhum (o usuário escolhe na revisão). */
function resolveClientRef(name: string | undefined, existing: Client[], batchNames: Set<string>): string {
  if (!name?.trim()) return ''
  const found = matchClient(existing, name).match
  if (found) return found.id
  return batchNames.has(fold(name)) ? `batch:${fold(name)}` : ''
}

/** Monta as linhas da tela de revisão a partir da planilha lida, já com as sugestões (criar/atualizar) e as
 *  referências resolvidas. `entity` restringe o que entra (ao importar só "Clientes", as outras abas são ignoradas). */
export function buildImportRows(
  wb: StagingWorkbook,
  data: { clients: Client[]; projects: Project[]; incidents: Incident[] },
  entity: ImportEntity | 'tudo',
): ImportRows {
  const want = (e: ImportEntity) => entity === 'tudo' || entity === e
  const clients = data.clients.filter((c) => !c.archived)
  const sheet = {
    clientes: want('clientes') ? wb.clientes : [],
    projetos: want('projetos') ? wb.projetos : [],
    incidentes: want('incidentes') ? wb.incidentes : [],
    tarefas: want('tarefas') ? wb.tarefas : [],
  }
  // Clientes criados NESTE arquivo (nenhum existente com esse nome): projetos, incidentes e tarefas podem apontar para eles.
  const batchClientNames = new Set(sheet.clientes.filter((c) => c.nome.trim() && c.errors.length === 0 && !clients.some((x) => fold(x.name) === fold(c.nome))).map((c) => fold(c.nome)))

  const clientRows: ClientRowState[] = sheet.clientes.map((row) => {
    // Cliente: só casa nome IGUAL (sem acento/caixa). Casar por pedaço sugeriria "Atualizar" o cliente errado.
    const exact = clients.filter((c) => fold(c.name) === fold(row.nome))
    return {
      row,
      include: row.errors.length === 0,
      action: exact.length === 1 ? 'update' : 'create',
      matchClientId: exact.length === 1 ? exact[0].id : undefined,
      name: row.nome,
      status: row.status,
    }
  })

  const projectRows: ProjectRowState[] = sheet.projetos.map((row) => {
    const clientId = resolveClientRef(row.cliente, clients, batchClientNames)
    const m = clientId && !clientId.startsWith('batch:') ? matchProject(data.projects, row.nome, clientId) : { action: 'create' as const, match: undefined, candidates: [] }
    // "Atualizar" só é o padrão quando o nome é IGUAL. Nome só parecido ("Falha" × "Falha no webhook") sugere Criar, mas deixa
    // Atualizar disponível: atualizar o item errado por causa de uma coincidência de texto é pior do que criar um a mais.
    const exact = !!m.match && fold(m.match.name) === fold(row.nome)
    return {
      row, include: row.errors.length === 0, action: m.action === 'update' && exact ? 'update' : 'create', clientId,
      matchProjectId: m.match?.id, similarTo: m.match && !exact ? m.match.name : undefined, name: row.nome, status: row.status,
    }
  })

  const incidentRows: IncidentRowState[] = sheet.incidentes.map((row) => {
    const clientId = resolveClientRef(row.cliente, clients, batchClientNames)
    const m = clientId && !clientId.startsWith('batch:') ? matchIncident(data.incidents, row.titulo, clientId) : { action: 'create' as const, match: undefined, candidates: [] }
    const exact = !!m.match && fold(m.match.title) === fold(row.titulo)
    return {
      row, include: row.errors.length === 0, action: m.action === 'update' && exact ? 'update' : 'create', clientId,
      matchIncidentId: m.match?.id, similarTo: m.match && !exact ? m.match.title : undefined, title: row.titulo, status: row.status, priority: row.prioridade, impact: row.impacto,
    }
  })

  const taskRows: TaskRowState[] = sheet.tarefas.map((row) => {
    const origin = matchTaskOrigin(row, { projetos: sheet.projetos, incidentes: sheet.incidentes }, { projects: data.projects, incidents: data.incidents })
    let targetKey: string | undefined
    if (origin?.batchRow) targetKey = `batch:${fold('nome' in origin.batchRow ? origin.batchRow.nome : origin.batchRow.titulo)}`
    else if (origin?.match) targetKey = `existing:${origin.match.id}`
    return {
      row,
      include: row.errors.length === 0,
      scope: row.origemTipo,
      targetKey,
      clientId: resolveClientRef(row.cliente, clients, batchClientNames),
      name: row.nome,
      status: row.status,
      riskFlag: row.riskFlag,
      responsavel: row.responsavel ?? '',
    }
  })

  return { clients: clientRows, projects: projectRows, incidents: incidentRows, tasks: taskRows }
}

/** Quantas linhas cada entidade trouxe (para avisar quando a aba esperada veio vazia ou não existe). */
export function rowCounts(wb: StagingWorkbook) {
  return { clientes: wb.clientes.length, projetos: wb.projetos.length, incidentes: wb.incidentes.length, tarefas: wb.tarefas.length }
}
