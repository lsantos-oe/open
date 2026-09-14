import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { useToastStore } from '@/stores/useToastStore'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import {
  parseStagingFile, StagingWorkbook, StagingProjectRow, StagingIncidentRow, StagingTaskRow,
} from '@/utils/importStaging'
import { matchClient, matchProject, matchIncident, matchTaskOrigin } from '@/utils/importStagingMatch'
import { Entry, EntryStatus, IncidentStatus, ProjectStatus, RiskFlag, Probability } from '@/types'

type RowAction = 'create' | 'update' | 'skip'
type TaskScope = 'projeto' | 'incidente' | 'solta'

interface ProjectRowState {
  row: StagingProjectRow
  include: boolean
  action: RowAction
  clientId: string
  matchProjectId?: string
  name: string
  status: ProjectStatus
}

interface IncidentRowState {
  row: StagingIncidentRow
  include: boolean
  action: RowAction
  clientId: string
  matchIncidentId?: string
  title: string
  status: IncidentStatus
  priority: Probability
}

interface TaskRowState {
  row: StagingTaskRow
  include: boolean
  scope: TaskScope
  targetKey?: string // `existing:<id>` or `batch:<linha_origem>`
  clientId: string
  name: string
  status: EntryStatus
  riskFlag: RiskFlag
  responsavel: string
}

const PROJECT_STATUSES: ProjectStatus[] = ['backlog', 'planning', 'in_progress', 'done']
const INCIDENT_STATUSES: IncidentStatus[] = ['open', 'in_progress', 'waiting_on_client', 'resolved', 'closed']
const TASK_STATUSES: EntryStatus[] = ['pending', 'todo', 'in_progress', 'validation', 'done', 'blocked']
const PRIORITIES: Probability[] = ['low', 'medium', 'high']

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-2 py-1.5 text-[11px] font-[600] uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-default)' }}>
      {children}
    </th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-2 py-1.5 align-top" style={{ borderBottom: '1px solid var(--border-default)' }}>{children}</td>
}

export default function ImportPage() {
  const { t } = useTranslation()
  const { addToast } = useToastStore()
  const {
    clients, projects, incidents, settings,
    createProject, updateProject, createIncident, updateIncident,
    addUnassignedEntry, addIncidentEntry, addStandaloneTask, updateEntry,
  } = useAppStore()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [projectRows, setProjectRows] = useState<ProjectRowState[]>([])
  const [incidentRows, setIncidentRows] = useState<IncidentRowState[]>([])
  const [taskRows, setTaskRows] = useState<TaskRowState[]>([])
  const [committing, setCommitting] = useState(false)

  const activeClients = clients.filter((c) => !c.archived)

  function buildState(wb: StagingWorkbook) {
    const pRows: ProjectRowState[] = wb.projetos.map((row) => {
      const clientMatch = matchClient(activeClients, row.cliente)
      const clientId = clientMatch.match?.id ?? ''
      const projMatch = clientId ? matchProject(projects, row.nome, clientId) : { action: 'create' as const, candidates: [] }
      return {
        row,
        include: row.errors.length === 0,
        action: projMatch.action === 'update' ? 'update' : 'create',
        clientId,
        matchProjectId: projMatch.match?.id,
        name: row.nome,
        status: row.status,
      }
    })

    const iRows: IncidentRowState[] = wb.incidentes.map((row) => {
      const clientMatch = matchClient(activeClients, row.cliente)
      const clientId = clientMatch.match?.id ?? ''
      const incMatch = clientId ? matchIncident(incidents, row.titulo, clientId) : { action: 'create' as const, candidates: [] }
      return {
        row,
        include: row.errors.length === 0,
        action: incMatch.action === 'update' ? 'update' : 'create',
        clientId,
        matchIncidentId: incMatch.match?.id,
        title: row.titulo,
        status: row.status,
        priority: row.prioridade,
      }
    })

    const tRows: TaskRowState[] = wb.tarefas.map((row) => {
      let targetKey: string | undefined
      const origin = matchTaskOrigin(row, { projetos: wb.projetos, incidentes: wb.incidentes }, { projects, incidents })
      if (origin?.batchRow) targetKey = `batch:${origin.batchRow.linhaOrigem}`
      else if (origin?.match) targetKey = `existing:${origin.match.id}`
      const clientMatch = row.cliente ? matchClient(activeClients, row.cliente) : undefined
      return {
        row,
        include: row.errors.length === 0,
        scope: row.origemTipo,
        targetKey,
        clientId: clientMatch?.match?.id ?? '',
        name: row.nome,
        status: row.status,
        riskFlag: row.riskFlag,
        responsavel: row.responsavel ?? '',
      }
    })

    setProjectRows(pRows)
    setIncidentRows(iRows)
    setTaskRows(tRows)
  }

  async function handleFile(file: File) {
    setFileName(file.name)
    try {
      const wb = await parseStagingFile(file)
      setParseErrors(wb.sheetErrors)
      buildState(wb)
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erro ao ler o arquivo')
    }
  }

  function reset() {
    setFileName('')
    setParseErrors([])
    setProjectRows([])
    setIncidentRows([])
    setTaskRows([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const blockedProjects = projectRows.filter((r) => r.include && !r.clientId)
  const blockedIncidents = incidentRows.filter((r) => r.include && !r.clientId)
  const blockedTasks = taskRows.filter((r) => r.include && r.scope !== 'solta' && !r.targetKey)

  const includedCount =
    projectRows.filter((r) => r.include).length +
    incidentRows.filter((r) => r.include).length +
    taskRows.filter((r) => r.include).length

  async function commit() {
    if (blockedProjects.length || blockedIncidents.length || blockedTasks.length) {
      addToast('Existem linhas incluídas sem cliente ou origem resolvida — ajuste antes de importar.')
      return
    }
    setCommitting(true)
    try {
      const projLinhaToId = new Map<string, string>()
      const incLinhaToId = new Map<string, string>()

      for (const r of projectRows) {
        if (!r.include) continue
        if (r.action === 'update' && r.matchProjectId) {
          updateProject(r.matchProjectId, {
            status: r.status,
            overview: [r.row.descricao, r.row.linkReferencia, r.row.notas].filter(Boolean).join('\n\n') || undefined,
          })
          projLinhaToId.set(r.row.linhaOrigem, r.matchProjectId)
        } else {
          const id = createProject({
            name: r.name,
            type: r.row.tipo,
            pm: r.row.pm,
            language: settings.defaultLanguage,
            clientIds: [r.clientId],
          })
          if (r.status !== 'planning') updateProject(id, { status: r.status })
          const overview = [r.row.descricao, r.row.linkReferencia, r.row.notas].filter(Boolean).join('\n\n')
          if (overview) updateProject(id, { overview })
          if (r.row.dataGoLive) {
            const created = useAppStore.getState().projects.find((p) => p.id === id)
            const milestones = created?.phases.flatMap((ph) => ph.entries.filter((e) => e.type === 'milestone')) ?? []
            const goLive = milestones.find((e) => e.name.toLowerCase().includes('go live') || e.name.toLowerCase().includes('go-live'))
            if (goLive) updateEntry(id, goLive.id, { plannedDate: r.row.dataGoLive })
          }
          projLinhaToId.set(r.row.linhaOrigem, id)
        }
      }

      for (const r of incidentRows) {
        if (!r.include) continue
        const description = [r.row.descricao, r.row.linkEvidencia, r.row.notas].filter(Boolean).join('\n\n') || undefined
        if (r.action === 'update' && r.matchIncidentId) {
          updateIncident(r.matchIncidentId, { status: r.status, priority: r.priority, impact: r.priority, description })
          incLinhaToId.set(r.row.linhaOrigem, r.matchIncidentId)
        } else {
          const relatedProjectId = r.row.projetoRelacionado ? projLinhaToId.get(r.row.projetoRelacionado) : undefined
          const id = createIncident({
            title: r.title,
            description,
            priority: r.priority,
            impact: r.priority,
            deadline: r.row.prazo,
            clientIds: [r.clientId],
            projectIds: relatedProjectId ? [relatedProjectId] : undefined,
          })
          if (r.status !== 'open') updateIncident(id, { status: r.status })
          incLinhaToId.set(r.row.linhaOrigem, id)
        }
      }

      for (const r of taskRows) {
        if (!r.include) continue
        const description = [r.row.descricao, r.row.linkEvidencia, r.row.notas].filter(Boolean).join('\n\n') || undefined
        const entry: Omit<Entry, 'id' | 'isCritical' | 'comments' | 'links' | 'subtasks'> = {
          type: 'task',
          name: r.name,
          description,
          responsible: r.responsavel,
          dependsOn: [],
          riskFlag: r.riskFlag,
          status: r.status,
          order: 0,
          clientId: r.scope === 'solta' ? (r.clientId || undefined) : undefined,
        }
        if (r.scope === 'solta') {
          addStandaloneTask(entry)
        } else if (r.scope === 'projeto' && r.targetKey) {
          const id = r.targetKey.startsWith('batch:') ? projLinhaToId.get(r.targetKey.slice(6)) : r.targetKey.slice(9)
          if (id) addUnassignedEntry(id, entry)
        } else if (r.scope === 'incidente' && r.targetKey) {
          const id = r.targetKey.startsWith('batch:') ? incLinhaToId.get(r.targetKey.slice(6)) : r.targetKey.slice(9)
          if (id) addIncidentEntry(id, entry)
        }
      }

      addToast(`Importação concluída: ${includedCount} itens processados.`, 'success')
      reset()
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{t('bulkImport.title', 'Importação em massa')}</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {t('bulkImport.subtitle', 'Suba uma planilha de staging (Projetos/Incidentes/Tarefas) para revisar e importar para o Open.')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
            {fileName || t('bulkImport.chooseFile', 'Escolher arquivo .xlsx')}
          </Button>
          {(projectRows.length > 0 || incidentRows.length > 0 || taskRows.length > 0) && (
            <Button variant="ghost" size="sm" onClick={reset}>{t('bulkImport.clear', 'Limpar')}</Button>
          )}
        </div>
      </div>

      {parseErrors.length > 0 && (
        <div className="mb-4 p-3 text-xs rounded-[var(--radius-md)]" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-text)' }}>
          {parseErrors.join(' — ')}
        </div>
      )}

      {projectRows.length === 0 && incidentRows.length === 0 && taskRows.length === 0 && (
        <div className="text-sm text-center py-16" style={{ color: 'var(--text-tertiary)' }}>
          {t('bulkImport.empty', 'Nenhum arquivo carregado ainda.')}
        </div>
      )}

      {projectRows.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
            Projetos ({projectRows.filter((r) => r.include).length}/{projectRows.length})
          </h2>
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border" style={{ borderColor: 'var(--border-default)' }}>
            <table className="w-full text-[12px]" style={{ background: 'var(--surface-card)' }}>
              <thead><tr>
                <Th>{" "}</Th><Th>Linha</Th><Th>Ação</Th><Th>Cliente</Th><Th>Nome</Th><Th>Status</Th><Th>Nota</Th>
              </tr></thead>
              <tbody>
                {projectRows.map((r, i) => (
                  <tr key={i}>
                    <Td><input type="checkbox" checked={r.include} onChange={(e) => setProjectRows((rows) => rows.map((x, xi) => xi === i ? { ...x, include: e.target.checked } : x))} /></Td>
                    <Td>{r.row.linhaOrigem}</Td>
                    <Td>
                      <Select className="!py-1 !text-[12px]" value={r.action} onChange={(e) => setProjectRows((rows) => rows.map((x, xi) => xi === i ? { ...x, action: e.target.value as RowAction } : x))}>
                        <option value="create">Criar</option>
                        <option value="update" disabled={!r.matchProjectId}>Atualizar</option>
                        <option value="skip">Ignorar</option>
                      </Select>
                    </Td>
                    <Td>
                      <Select className="!py-1 !text-[12px] min-w-[140px]" value={r.clientId} onChange={(e) => setProjectRows((rows) => rows.map((x, xi) => xi === i ? { ...x, clientId: e.target.value } : x))}>
                        <option value="">{r.row.cliente || '—'}</option>
                        {activeClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                    </Td>
                    <Td><Input className="!py-1 !text-[12px] min-w-[180px]" value={r.name} onChange={(e) => setProjectRows((rows) => rows.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))} /></Td>
                    <Td>
                      <Select className="!py-1 !text-[12px]" value={r.status} onChange={(e) => setProjectRows((rows) => rows.map((x, xi) => xi === i ? { ...x, status: e.target.value as ProjectStatus } : x))}>
                        {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                      </Select>
                    </Td>
                    <Td><span style={{ color: 'var(--text-tertiary)' }}>{r.row.observacaoIA}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {incidentRows.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
            Incidentes ({incidentRows.filter((r) => r.include).length}/{incidentRows.length})
          </h2>
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border" style={{ borderColor: 'var(--border-default)' }}>
            <table className="w-full text-[12px]" style={{ background: 'var(--surface-card)' }}>
              <thead><tr>
                <Th>{" "}</Th><Th>Linha</Th><Th>Ação</Th><Th>Cliente</Th><Th>Título</Th><Th>Prioridade</Th><Th>Status</Th><Th>Nota</Th>
              </tr></thead>
              <tbody>
                {incidentRows.map((r, i) => (
                  <tr key={i}>
                    <Td><input type="checkbox" checked={r.include} onChange={(e) => setIncidentRows((rows) => rows.map((x, xi) => xi === i ? { ...x, include: e.target.checked } : x))} /></Td>
                    <Td>{r.row.linhaOrigem}</Td>
                    <Td>
                      <Select className="!py-1 !text-[12px]" value={r.action} onChange={(e) => setIncidentRows((rows) => rows.map((x, xi) => xi === i ? { ...x, action: e.target.value as RowAction } : x))}>
                        <option value="create">Criar</option>
                        <option value="update" disabled={!r.matchIncidentId}>Atualizar</option>
                        <option value="skip">Ignorar</option>
                      </Select>
                    </Td>
                    <Td>
                      <Select className="!py-1 !text-[12px] min-w-[140px]" value={r.clientId} onChange={(e) => setIncidentRows((rows) => rows.map((x, xi) => xi === i ? { ...x, clientId: e.target.value } : x))}>
                        <option value="">{r.row.cliente || '—'}</option>
                        {activeClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                    </Td>
                    <Td><Input className="!py-1 !text-[12px] min-w-[180px]" value={r.title} onChange={(e) => setIncidentRows((rows) => rows.map((x, xi) => xi === i ? { ...x, title: e.target.value } : x))} /></Td>
                    <Td>
                      <Select className="!py-1 !text-[12px]" value={r.priority} onChange={(e) => setIncidentRows((rows) => rows.map((x, xi) => xi === i ? { ...x, priority: e.target.value as Probability } : x))}>
                        {PRIORITIES.map((p) => <option key={p} value={p}>{t(`risk.${p}`)}</option>)}
                      </Select>
                    </Td>
                    <Td>
                      <Select className="!py-1 !text-[12px]" value={r.status} onChange={(e) => setIncidentRows((rows) => rows.map((x, xi) => xi === i ? { ...x, status: e.target.value as IncidentStatus } : x))}>
                        {INCIDENT_STATUSES.map((s) => <option key={s} value={s}>{t(`incident.status_${s}`)}</option>)}
                      </Select>
                    </Td>
                    <Td><span style={{ color: 'var(--text-tertiary)' }}>{r.row.observacaoIA}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {taskRows.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
            Tarefas ({taskRows.filter((r) => r.include).length}/{taskRows.length})
          </h2>
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border" style={{ borderColor: 'var(--border-default)' }}>
            <table className="w-full text-[12px]" style={{ background: 'var(--surface-card)' }}>
              <thead><tr>
                <Th>{" "}</Th><Th>Linha</Th><Th>Origem</Th><Th>Nome</Th><Th>Responsável</Th><Th>Status</Th><Th>Prioridade</Th><Th>Nota</Th>
              </tr></thead>
              <tbody>
                {taskRows.map((r, i) => {
                  const originLabel = r.scope === 'solta'
                    ? 'Tarefa solta'
                    : r.targetKey
                      ? (r.targetKey.startsWith('batch:') ? `(novo neste lote) ${r.row.origemNome}` : r.row.origemNome)
                      : `⚠ não encontrado: ${r.row.origemNome}`
                  return (
                    <tr key={i}>
                      <Td><input type="checkbox" checked={r.include} onChange={(e) => setTaskRows((rows) => rows.map((x, xi) => xi === i ? { ...x, include: e.target.checked } : x))} /></Td>
                      <Td>{r.row.linhaOrigem}</Td>
                      <Td>
                        <div className="flex flex-col gap-1 min-w-[160px]">
                          <Select className="!py-1 !text-[12px]" value={r.scope} onChange={(e) => setTaskRows((rows) => rows.map((x, xi) => xi === i ? { ...x, scope: e.target.value as TaskScope } : x))}>
                            <option value="projeto">Projeto</option>
                            <option value="incidente">Incidente</option>
                            <option value="solta">Tarefa solta</option>
                          </Select>
                          <span style={{ color: r.scope !== 'solta' && !r.targetKey ? 'var(--color-danger-text)' : 'var(--text-tertiary)' }}>{originLabel}</span>
                        </div>
                      </Td>
                      <Td><Input className="!py-1 !text-[12px] min-w-[180px]" value={r.name} onChange={(e) => setTaskRows((rows) => rows.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))} /></Td>
                      <Td><Input className="!py-1 !text-[12px] min-w-[120px]" value={r.responsavel} onChange={(e) => setTaskRows((rows) => rows.map((x, xi) => xi === i ? { ...x, responsavel: e.target.value } : x))} placeholder="—" /></Td>
                      <Td>
                        <Select className="!py-1 !text-[12px]" value={r.status} onChange={(e) => setTaskRows((rows) => rows.map((x, xi) => xi === i ? { ...x, status: e.target.value as EntryStatus } : x))}>
                          {TASK_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                        </Select>
                      </Td>
                      <Td>
                        <Select
                          className="!py-1 !text-[12px]"
                          value={r.riskFlag === 'critical' ? 'high' : r.riskFlag === 'warning' ? 'medium' : 'low'}
                          onChange={(e) => {
                            const v = e.target.value as Probability
                            const flag: RiskFlag = v === 'high' ? 'critical' : v === 'medium' ? 'warning' : 'none'
                            setTaskRows((rows) => rows.map((x, xi) => xi === i ? { ...x, riskFlag: flag } : x))
                          }}
                        >
                          {PRIORITIES.map((p) => <option key={p} value={p}>{t(`risk.${p}`)}</option>)}
                        </Select>
                      </Td>
                      <Td><span style={{ color: 'var(--text-tertiary)' }}>{r.row.observacaoIA}</span></Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(projectRows.length > 0 || incidentRows.length > 0 || taskRows.length > 0) && (
        <div className="sticky bottom-4 flex items-center justify-between p-3 rounded-[var(--radius-lg)] border shadow-[var(--shadow-md)]" style={{ background: 'var(--surface-card)', borderColor: 'var(--border-default)' }}>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {includedCount} itens marcados para importação
            {(blockedProjects.length + blockedIncidents.length + blockedTasks.length) > 0 && (
              <span style={{ color: 'var(--color-danger-text)' }}> — {blockedProjects.length + blockedIncidents.length + blockedTasks.length} bloqueados (cliente/origem não resolvidos)</span>
            )}
          </span>
          <Button onClick={commit} disabled={committing || includedCount === 0}>
            {committing ? 'Importando...' : `Importar ${includedCount} itens`}
          </Button>
        </div>
      )}
    </div>
  )
}
