import * as XLSX from 'xlsx'
import { ProjectType, ProjectStatus, RiskFlag, IncidentStatus, Probability, EntryStatus } from '@/types'

// ─── row types ──────────────────────────────────────────────────────────────

export interface StagingProjectRow {
  rowIndex: number
  linhaOrigem: string
  cliente: string
  nome: string
  tipo: ProjectType
  pm: string
  status: ProjectStatus
  dataGoLive?: string
  descricao?: string
  linkReferencia?: string
  notas?: string
  observacaoIA?: string
  errors: string[]
}

export interface StagingIncidentRow {
  rowIndex: number
  linhaOrigem: string
  cliente: string
  titulo: string
  prioridade: Probability
  impacto: Probability
  prazo?: string
  status: IncidentStatus
  descricao?: string
  projetoRelacionado?: string
  linkEvidencia?: string
  notas?: string
  observacaoIA?: string
  errors: string[]
}

export interface StagingTaskRow {
  rowIndex: number
  linhaOrigem: string
  origemTipo: 'projeto' | 'incidente' | 'solta'
  origemNome?: string
  cliente?: string
  nome: string
  descricao?: string
  status: EntryStatus
  riskFlag: RiskFlag
  linkEvidencia?: string
  notas?: string
  responsavel?: string
  observacaoIA?: string
  errors: string[]
}

export interface StagingWorkbook {
  projetos: StagingProjectRow[]
  incidentes: StagingIncidentRow[]
  tarefas: StagingTaskRow[]
  sheetErrors: string[]
}

// ─── normalization helpers — tolerant of both the PT-BR labels the sheet
// shows the user and the raw enum values I generate myself when producing
// a staging file from a chat conversation ─────────────────────────────────

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase()
}

function mapEnum<T extends string>(raw: unknown, map: Record<string, T>, fallback: T): T {
  const key = norm(raw)
  return map[key] ?? fallback
}

const PRIORITY_MAP: Record<string, Probability> = {
  alta: 'high', high: 'high', '2': 'high',
  media: 'medium', média: 'medium', medium: 'medium', '1': 'medium',
  baixa: 'low', low: 'low', '0': 'low',
}

const PROJECT_STATUS_MAP: Record<string, ProjectStatus> = {
  backlog: 'backlog',
  planejamento: 'planning', planning: 'planning',
  'em andamento': 'in_progress', in_progress: 'in_progress',
  concluido: 'done', concluído: 'done', done: 'done',
}

const INCIDENT_STATUS_MAP: Record<string, IncidentStatus> = {
  aberto: 'open', open: 'open',
  'em andamento': 'in_progress', in_progress: 'in_progress',
  'aguardando cliente': 'waiting_on_client', waiting_on_client: 'waiting_on_client',
  resolvido: 'resolved', resolved: 'resolved',
  fechado: 'closed', closed: 'closed',
}

const ENTRY_STATUS_MAP: Record<string, EntryStatus> = {
  backlog: 'pending', pending: 'pending',
  'to do': 'todo', todo: 'todo', 'a fazer': 'todo',
  'em andamento': 'in_progress', in_progress: 'in_progress',
  'validacao/teste': 'validation', 'validação/teste': 'validation', validation: 'validation',
  concluido: 'done', concluído: 'done', done: 'done',
  bloqueado: 'blocked', blocked: 'blocked',
}

const PROJECT_TYPE_MAP: Record<string, ProjectType> = {
  'nova conta': 'nova_conta', nova_conta: 'nova_conta',
  'novo projeto': 'novo_projeto', novo_projeto: 'novo_projeto',
}

/** Priority has no dedicated field on Entry (only on Incident) — carried onto
 *  a task's riskFlag instead, so it still surfaces as the little risk dot. */
function priorityToRiskFlag(p: Probability): RiskFlag {
  if (p === 'high') return 'critical'
  if (p === 'medium') return 'warning'
  return 'none'
}

function parseDateCell(val: unknown): string | undefined {
  if (val === undefined || val === null || val === '') return undefined
  if (val instanceof Date) {
    return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`
  }
  const s = String(val).trim()
  if (!s) return undefined
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // DD/MM/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return undefined // left blank rather than guessing — see plan's "lição do teste real"
}

function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v).trim()
}

// ─── sheet readers ──────────────────────────────────────────────────────────

function findSheet(wb: XLSX.WorkBook, ...names: string[]): XLSX.WorkSheet | undefined {
  const lower = names.map((n) => n.toLowerCase())
  const sheetName = wb.SheetNames.find((n) => lower.includes(n.trim().toLowerCase()))
  return sheetName ? wb.Sheets[sheetName] : undefined
}

function sheetRows(ws: XLSX.WorkSheet): Record<string, unknown>[] {
  return XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]
}

function col(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    for (const rk of Object.keys(row)) {
      if (rk.trim().toLowerCase() === k.toLowerCase()) return row[rk]
    }
  }
  return undefined
}

function parseProjectRow(row: Record<string, unknown>, i: number): StagingProjectRow {
  const errors: string[] = []
  const nome = str(col(row, 'nome'))
  const cliente = str(col(row, 'cliente'))
  if (!nome) errors.push('Nome do projeto vazio')
  if (!cliente) errors.push('Cliente vazio')
  return {
    rowIndex: i,
    linhaOrigem: str(col(row, 'linha_origem')),
    cliente,
    nome,
    tipo: mapEnum(col(row, 'tipo'), PROJECT_TYPE_MAP, 'novo_projeto'),
    pm: str(col(row, 'pm')),
    status: mapEnum(col(row, 'status'), PROJECT_STATUS_MAP, 'backlog'),
    dataGoLive: parseDateCell(col(row, 'data_go_live')),
    descricao: str(col(row, 'descricao')) || undefined,
    linkReferencia: str(col(row, 'link_referencia')) || undefined,
    notas: str(col(row, 'notas')) || undefined,
    observacaoIA: str(col(row, 'observacao_ia')) || undefined,
    errors,
  }
}

function parseIncidentRow(row: Record<string, unknown>, i: number): StagingIncidentRow {
  const errors: string[] = []
  const titulo = str(col(row, 'titulo'))
  const cliente = str(col(row, 'cliente'))
  if (!titulo) errors.push('Título vazio')
  if (!cliente) errors.push('Cliente vazio')
  return {
    rowIndex: i,
    linhaOrigem: str(col(row, 'linha_origem')),
    cliente,
    titulo,
    prioridade: mapEnum(col(row, 'prioridade'), PRIORITY_MAP, 'medium'),
    impacto: mapEnum(col(row, 'impacto'), PRIORITY_MAP, 'medium'),
    prazo: parseDateCell(col(row, 'prazo')),
    status: mapEnum(col(row, 'status'), INCIDENT_STATUS_MAP, 'open'),
    descricao: str(col(row, 'descricao')) || undefined,
    projetoRelacionado: str(col(row, 'projeto_relacionado')) || undefined,
    linkEvidencia: str(col(row, 'link_evidencia')) || undefined,
    notas: str(col(row, 'notas')) || undefined,
    observacaoIA: str(col(row, 'observacao_ia')) || undefined,
    errors,
  }
}

function parseTaskRow(row: Record<string, unknown>, i: number): StagingTaskRow {
  const errors: string[] = []
  const nome = str(col(row, 'nome'))
  if (!nome) errors.push('Nome da tarefa vazio')
  const origemTipoRaw = norm(col(row, 'origem_tipo'))
  const origemTipo: StagingTaskRow['origemTipo'] =
    origemTipoRaw === 'incidente' ? 'incidente' : origemTipoRaw === 'solta' ? 'solta' : 'projeto'
  const origemNome = str(col(row, 'origem_nome')) || undefined
  if (origemTipo !== 'solta' && !origemNome) errors.push('origem_nome vazio para uma tarefa de projeto/incidente')
  const priority = mapEnum(col(row, 'prioridade_ref'), PRIORITY_MAP, 'medium')
  return {
    rowIndex: i,
    linhaOrigem: str(col(row, 'linha_origem')),
    origemTipo,
    origemNome,
    cliente: str(col(row, 'cliente')) || undefined,
    nome,
    descricao: str(col(row, 'descricao')) || undefined,
    status: mapEnum(col(row, 'status'), ENTRY_STATUS_MAP, 'pending'),
    riskFlag: priorityToRiskFlag(priority),
    linkEvidencia: str(col(row, 'link_evidencia')) || undefined,
    notas: str(col(row, 'notas')) || undefined,
    responsavel: str(col(row, 'responsavel')) || undefined,
    observacaoIA: str(col(row, 'observacao_ia')) || undefined,
    errors,
  }
}

// ─── entry point ────────────────────────────────────────────────────────────

export async function parseStagingFile(file: File): Promise<StagingWorkbook> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })

  const sheetErrors: string[] = []
  const projetosWs = findSheet(wb, 'Projetos', 'Projects')
  const incidentesWs = findSheet(wb, 'Incidentes', 'Incidents')
  const tarefasWs = findSheet(wb, 'Tarefas', 'Tasks')

  if (!projetosWs && !incidentesWs && !tarefasWs) {
    sheetErrors.push('Nenhuma aba reconhecida — esperado pelo menos uma de: Projetos, Incidentes, Tarefas')
  }

  return {
    projetos: projetosWs ? sheetRows(projetosWs).map(parseProjectRow) : [],
    incidentes: incidentesWs ? sheetRows(incidentesWs).map(parseIncidentRow) : [],
    tarefas: tarefasWs ? sheetRows(tarefasWs).map(parseTaskRow) : [],
    sheetErrors,
  }
}
