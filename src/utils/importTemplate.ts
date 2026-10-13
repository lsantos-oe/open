import {
  EntityLayout, GENERAL_RULES, IMPORT_ENTITIES, ImportEntity, LAYOUTS, LayoutColumn, MATCHING_RULES, MAX_ROWS, RefList,
  CLIENT_STATUS_LABELS, INCIDENT_STATUS_LABELS, LEVEL_LABELS, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, TASK_ORIGIN_LABELS, TASK_STATUS_LABELS,
} from './importLayouts'

// Monta o .xlsx de modelo: uma aba por entidade (cabeçalhos, listas suspensas, validações), uma aba de instruções
// (passo a passo + tabela de colunas) e uma aba "Listas" com as opções e o que já existe no Open. O exceljs é pesado
// e só serve aqui: entra por import() dinâmico, fora do bundle principal.

/** O que já existe no Open — alimenta as listas suspensas (cliente, responsável, projeto…). */
export interface ListsData {
  clients: string[]
  users: string[]
  projects: string[]
  incidents: string[]
  countries: string[]
}

const COLOR_REQUIRED = 'FFD9530E'
const COLOR_OPTIONAL = 'FF5B6472'
const COLOR_HEAD_TEXT = 'FFFFFFFF'
const COLOR_BAND = 'FFF3F0EC'

const REF_LABEL: Record<RefList, string> = {
  clients: 'Clientes',
  users: 'Usuários (responsáveis)',
  projects: 'Projetos',
  incidents: 'Incidentes',
  countries: 'Países',
  origins: 'Projetos e incidentes',
}
const REF_ORDER: RefList[] = ['clients', 'users', 'projects', 'incidents', 'origins', 'countries']

const uniqueSorted = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))

const colLetter = (n: number) => { let s = ''; for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s; return s }

/** Tira apóstrofos/aspas que quebrariam a fórmula inline da lista. */
const inlineList = (options: string[]) => `"${options.map((o) => o.replace(/"/g, '').replace(/,/g, ' ')).join(',')}"`

function kindLabel(c: LayoutColumn): string {
  switch (c.kind) {
    case 'date': return 'Data (DD/MM/AAAA)'
    case 'number': return 'Número'
    case 'enum': return 'Escolha na lista'
    case 'ref': return 'Lista do Open (pode digitar outro)'
    case 'longtext': return 'Texto longo'
    default: return 'Texto'
  }
}

export interface BuiltTemplate { blob: Blob; fileName: string }

export async function buildImportTemplate(entities: ImportEntity[], lists: ListsData, fileName: string): Promise<BuiltTemplate> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Open'
  wb.created = new Date()

  const chosen = IMPORT_ENTITIES.filter((e) => entities.includes(e)).map((e) => LAYOUTS[e])

  // ── 1) Instruções ──────────────────────────────────────────────────────────
  const inst = wb.addWorksheet('Instruções', { properties: { tabColor: { argb: COLOR_REQUIRED } } })
  inst.columns = [{ width: 26 }, { width: 14 }, { width: 74 }, { width: 34 }, { width: 30 }]
  let row = 1
  const put = (cells: (string | undefined)[], style?: { bold?: boolean; size?: number; fill?: string; color?: string; wrap?: boolean }) => {
    const r = inst.getRow(row++)
    cells.forEach((v, i) => {
      const c = r.getCell(i + 1)
      c.value = v ?? ''
      c.alignment = { vertical: 'top', wrapText: style?.wrap ?? true }
      c.font = { bold: style?.bold, size: style?.size, color: style?.color ? { argb: style.color } : undefined }
      if (style?.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } }
    })
    return r
  }
  const merged = (text: string, style: Parameters<typeof put>[1]) => {
    const r = put([text], { ...style, wrap: true })
    inst.mergeCells(r.number, 1, r.number, 5)
    r.height = Math.max(18, Math.ceil(text.length / 150) * 16)
  }

  merged(chosen.length === 1 ? `Open — modelo de importação: ${chosen[0].title}` : 'Open — modelo de importação (todas as entidades)', { bold: true, size: 16 })
  merged('Preencha a(s) aba(s) ao lado, salve como .xlsx e envie em Open → Importação em massa. Nada é gravado antes de você revisar e confirmar.', { color: 'FF5B6472' })
  row++
  merged('Como usar', { bold: true, size: 12 })
  ;[
    '1. Preencha a aba da entidade (uma linha por item), a partir da linha 2.',
    '2. Use as listas suspensas sempre que houver a seta na célula.',
    '3. Salve o arquivo como .xlsx.',
    '4. No Open, abra Importação em massa, escolha a entidade e envie a planilha.',
    '5. Revise cada linha (Criar / Atualizar / Ignorar), ajuste o que precisar e confirme.',
  ].forEach((t) => merged(t, {}))
  row++
  merged('Regras gerais', { bold: true, size: 12 })
  GENERAL_RULES.forEach((t) => merged(`• ${t}`, {}))
  row++
  merged('Como o Open reconhece o que já existe', { bold: true, size: 12 })
  MATCHING_RULES.forEach((t) => merged(`• ${t}`, {}))

  for (const layout of chosen) {
    row++
    merged(`Aba "${layout.sheet}" — ${layout.title}`, { bold: true, size: 13, fill: COLOR_BAND })
    merged(layout.summary, {})
    layout.notes.forEach((t) => merged(`• ${t}`, {}))
    put(['Coluna', 'Obrigatória?', 'O que preencher', 'Valores aceitos', 'Exemplo'], { bold: true, fill: COLOR_OPTIONAL, color: COLOR_HEAD_TEXT })
    for (const c of layout.columns) {
      const accepted = c.kind === 'enum' ? (c.options ?? []).join(' · ') : kindLabel(c)
      const r = put([c.key, c.required ? 'Sim' : 'Não', c.description, accepted, c.example])
      r.getCell(1).font = { bold: true }
      if (c.required) r.getCell(2).font = { bold: true, color: { argb: COLOR_REQUIRED } }
    }
  }

  // ── 2) Abas de dados ───────────────────────────────────────────────────────
  // A aba "Listas" é criada depois, mas as validações precisam dos intervalos dela: calculamos antes.
  const refRanges = new Map<RefList, string>()
  const refValues: Record<RefList, string[]> = {
    clients: uniqueSorted(lists.clients),
    users: uniqueSorted(lists.users),
    projects: uniqueSorted(lists.projects),
    incidents: uniqueSorted(lists.incidents),
    countries: uniqueSorted(lists.countries),
    origins: uniqueSorted([...lists.projects, ...lists.incidents]),
  }
  REF_ORDER.forEach((ref, i) => {
    const n = refValues[ref].length
    if (n > 0) refRanges.set(ref, `Listas!$${colLetter(i + 1)}$2:$${colLetter(i + 1)}$${n + 1}`)
  })

  for (const layout of chosen) addDataSheet(wb, layout, refRanges)

  // ── 3) Listas ──────────────────────────────────────────────────────────────
  const ls = wb.addWorksheet('Listas', { properties: { tabColor: { argb: COLOR_OPTIONAL } } })
  REF_ORDER.forEach((ref, i) => {
    const c = ls.getColumn(i + 1)
    c.width = 34
    const head = ls.getCell(1, i + 1)
    head.value = REF_LABEL[ref]
    head.font = { bold: true, color: { argb: COLOR_HEAD_TEXT } }
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_OPTIONAL } }
    refValues[ref].forEach((v, r) => { ls.getCell(r + 2, i + 1).value = v })
  })
  const enums: [string, string[]][] = [
    ['Status do cliente', CLIENT_STATUS_LABELS], ['Tipo do projeto', PROJECT_TYPE_LABELS], ['Status do projeto', PROJECT_STATUS_LABELS],
    ['Prioridade / impacto', LEVEL_LABELS], ['Status do incidente', INCIDENT_STATUS_LABELS], ['Status da tarefa', TASK_STATUS_LABELS], ['Origem da tarefa', TASK_ORIGIN_LABELS],
  ]
  enums.forEach(([title, values], i) => {
    const colIdx = REF_ORDER.length + 2 + i
    ls.getColumn(colIdx).width = 28
    const head = ls.getCell(1, colIdx)
    head.value = title
    head.font = { bold: true, color: { argb: COLOR_HEAD_TEXT } }
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_REQUIRED } }
    values.forEach((v, r) => { ls.getCell(r + 2, colIdx).value = v })
  })
  ls.views = [{ state: 'frozen', ySplit: 1 }]

  const buffer = await wb.xlsx.writeBuffer()
  return {
    fileName,
    blob: new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  }
}

// Limites do Excel: título do aviso ≤ 32 caracteres, mensagem ≤ 255 e lista inline ≤ 255 — acima disso o Excel
// considera o arquivo corrompido e oferece "reparar".
// O exceljs suporta validação de dados em runtime, mas os tipos dele não declaram a propriedade.
function addValidation(ws: import('exceljs').Worksheet, range: string, validation: Record<string, unknown>) {
  (ws as unknown as { dataValidations: { add: (range: string, v: unknown) => void } }).dataValidations.add(range, validation)
}

function addDataSheet(wb: import('exceljs').Workbook, layout: EntityLayout, refRanges: Map<RefList, string>) {
  const ws = wb.addWorksheet(layout.sheet, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = layout.columns.map((c) => ({ key: c.key, width: c.width }))
  const last = MAX_ROWS + 1

  layout.columns.forEach((c, i) => {
    const head = ws.getCell(1, i + 1)
    head.value = c.key
    head.font = { bold: true, color: { argb: COLOR_HEAD_TEXT } }
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.required ? COLOR_REQUIRED : COLOR_OPTIONAL } }
    head.alignment = { vertical: 'middle', horizontal: 'left' }
    head.note = `${c.required ? 'OBRIGATÓRIO. ' : ''}${c.description}${c.example ? `\nExemplo: ${c.example}` : ''}`

    const colL = colLetter(i + 1)
    const range = `${colL}2:${colL}${last}`
    const column = ws.getColumn(i + 1)
    if (c.kind === 'date') column.numFmt = 'dd/mm/yyyy'
    if (c.kind === 'longtext') column.alignment = { wrapText: true, vertical: 'top' }

    if (c.kind === 'enum' && c.options) {
      addValidation(ws, range, {
        type: 'list', allowBlank: true, formulae: [inlineList(c.options)],
        showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Valor inválido', error: `Escolha uma das opções da lista: ${c.options.join(', ')}.`,
      })
    } else if (c.kind === 'ref' && c.refList && refRanges.has(c.refList)) {
      addValidation(ws, range, {
        type: 'list', allowBlank: true, formulae: [refRanges.get(c.refList)!],
        showErrorMessage: true, errorStyle: 'warning', errorTitle: 'Não está na lista', error: 'Esse valor não está na lista do Open. Tudo bem se for um item novo — a tela de revisão vai pedir para você confirmar.',
      })
    } else if (c.kind === 'date') {
      addValidation(ws, range, {
        type: 'date', operator: 'greaterThan', allowBlank: true, formulae: [new Date(2000, 0, 1)],
        showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Data inválida', error: 'Use uma data no formato DD/MM/AAAA (ou deixe em branco).',
      })
    } else if (c.kind === 'number') {
      addValidation(ws, range, {
        type: 'whole', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0],
        showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Número inválido', error: 'Use um número inteiro (dias úteis) ou deixe em branco.',
      })
    }
  })
  ws.getRow(1).height = 22
}
