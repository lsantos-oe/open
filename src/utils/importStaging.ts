import * as XLSX from 'xlsx'
import { ProjectType, ProjectStatus, RiskFlag, IncidentStatus, Probability, EntryStatus, ClientStatus } from '@/types'
import { COUNTRIES } from '@/data/countries'

// ─── row types ──────────────────────────────────────────────────────────────

export interface StagingClientRow {
  rowIndex: number
  linhaOrigem: string
  nome: string
  /** Código do país (ex.: BR) — a planilha aceita o nome ("Brasil") ou o código. */
  pais?: string
  status: ClientStatus
  linkPloomes?: string
  notas?: string
  /** Responsável (CS) — nome de um usuário do Open. */
  responsavel?: string
  observacaoIA?: string
  errors: string[]
}

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
  /** Responsável pelo incidente — nome de um usuário do Open. */
  responsavel?: string
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
  /** Planejamento (opcional): datas AAAA-MM-DD, duração em dias úteis e nome da fase (só tarefas de projeto). */
  inicio?: string
  fim?: string
  duracaoDias?: number
  fase?: string
  observacaoIA?: string
  errors: string[]
}

export interface StagingWorkbook {
  clientes: StagingClientRow[]
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

/** Sem acento, sem caixa, separadores viram "_": "Pré-venda" e "pre_venda" são a mesma coisa. */
export function fold(v: unknown): string {
  return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function mapEnum<T extends string>(raw: unknown, map: Record<string, T>, fallback: T): T {
  const key = fold(raw)
  if (!key) return fallback
  for (const [k, v] of Object.entries(map)) if (fold(k) === key) return v
  return fallback
}

const CLIENT_STATUS_MAP: Record<string, ClientStatus> = {
  'pré-venda': 'pre_venda', 'pre venda': 'pre_venda', pre_venda: 'pre_venda',
  implantação: 'implantacao', implantacao: 'implantacao',
  'sustentação e novos projetos': 'sustentacao_novos_projetos', sustentação: 'sustentacao_novos_projetos',
  sustentacao_novos_projetos: 'sustentacao_novos_projetos',
}

/** Nome ("Brasil") ou código ("BR") → código do país; vazio se não reconhece. */
function parseCountry(raw: unknown): string | undefined {
  const v = fold(raw)
  if (!v) return undefined
  return COUNTRIES.find((c) => fold(c.name) === v || fold(c.code) === v)?.code
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

/** Acha a coluna pelo nome do cabeçalho, ignorando caixa, acento e separadores ("Data go-live" = data_go_live). */
function col(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    for (const rk of Object.keys(row)) {
      if (fold(rk) === fold(k)) return row[rk]
    }
  }
  return undefined
}

function parseIntCell(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined
}

function parseClientRow(row: Record<string, unknown>, i: number): StagingClientRow {
  const errors: string[] = []
  const nome = str(col(row, 'nome', 'cliente'))
  if (!nome) errors.push('Nome do cliente vazio')
  const paisRaw = str(col(row, 'pais'))
  const pais = parseCountry(paisRaw)
  if (paisRaw && !pais) errors.push(`País não reconhecido: "${paisRaw}"`)
  return {
    rowIndex: i,
    linhaOrigem: str(col(row, 'linha_origem')),
    nome,
    pais,
    status: mapEnum(col(row, 'status'), CLIENT_STATUS_MAP, 'sustentacao_novos_projetos'),
    linkPloomes: str(col(row, 'link_ploomes')) || undefined,
    notas: str(col(row, 'notas')) || undefined,
    responsavel: str(col(row, 'responsavel')) || undefined,
    observacaoIA: str(col(row, 'observacao_ia')) || undefined,
    errors,
  }
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
    responsavel: str(col(row, 'responsavel')) || undefined,
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
  const origemTipoRaw = fold(col(row, 'origem_tipo'))
  const origemTipo: StagingTaskRow['origemTipo'] =
    origemTipoRaw === 'incidente' ? 'incidente' : origemTipoRaw === 'solta' ? 'solta' : 'projeto'
  const origemNome = str(col(row, 'origem_nome')) || undefined
  if (origemTipo !== 'solta' && !origemNome) errors.push('origem_nome vazio para uma tarefa de projeto/incidente')
  const priority = mapEnum(col(row, 'prioridade_ref', 'prioridade'), PRIORITY_MAP, 'medium')
  const inicio = parseDateCell(col(row, 'inicio'))
  const fim = parseDateCell(col(row, 'fim'))
  if (inicio && fim && fim < inicio) errors.push('Fim anterior ao início')
  const inicioRaw = str(col(row, 'inicio')), fimRaw = str(col(row, 'fim'))
  if ((inicioRaw && !inicio) || (fimRaw && !fim)) errors.push('Data em formato não reconhecido (use DD/MM/AAAA)')
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
    inicio,
    fim,
    duracaoDias: parseIntCell(col(row, 'duracao_dias')),
    fase: str(col(row, 'fase')) || undefined,
    observacaoIA: str(col(row, 'observacao_ia')) || undefined,
    errors,
  }
}

// ─── entry point ────────────────────────────────────────────────────────────

/** Lê o conteúdo de um .xlsx (modelo do Open preenchido ou arquivo de staging gerado em conversa). */
export function parseStagingBuffer(buf: ArrayBuffer): StagingWorkbook {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })

  const sheetErrors: string[] = []
  const clientesWs = findSheet(wb, 'Clientes', 'Clients')
  const projetosWs = findSheet(wb, 'Projetos', 'Projects')
  const incidentesWs = findSheet(wb, 'Incidentes', 'Incidents')
  const tarefasWs = findSheet(wb, 'Tarefas', 'Tasks')

  if (!clientesWs && !projetosWs && !incidentesWs && !tarefasWs) {
    sheetErrors.push('Nenhuma aba reconhecida — esperado pelo menos uma de: Clientes, Projetos, Incidentes, Tarefas')
  }

  return {
    clientes: clientesWs ? sheetRows(clientesWs).map(parseClientRow) : [],
    projetos: projetosWs ? sheetRows(projetosWs).map(parseProjectRow) : [],
    incidentes: incidentesWs ? sheetRows(incidentesWs).map(parseIncidentRow) : [],
    tarefas: tarefasWs ? sheetRows(tarefasWs).map(parseTaskRow) : [],
    sheetErrors,
  }
}

export async function parseStagingFile(file: File): Promise<StagingWorkbook> {
  return parseStagingBuffer(await file.arrayBuffer())
}
