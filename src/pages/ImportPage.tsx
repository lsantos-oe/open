import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { useToastStore } from '@/stores/useToastStore'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { parseStagingFile, fold } from '@/utils/importStaging'
import { buildImportRows, rowCounts } from '@/utils/importReview'
import {
  ImportRows, RowAction, TaskScope, blockedRows, commitImport,
} from '@/utils/importCommit'
import {
  CLIENT_STATUS_LABELS, IMPORT_ENTITIES, ImportEntity, LAYOUTS, importFileName,
} from '@/utils/importLayouts'
import type { ListsData } from '@/utils/importTemplate'
import { COUNTRIES, findCountry } from '@/data/countries'
import { teamDirectoryAsTeamMembers } from '@/ai/tools/helpers'
import { ClientStatus, EntryStatus, IncidentStatus, ProjectStatus, RiskFlag, Probability } from '@/types'

const PROJECT_STATUSES: ProjectStatus[] = ['backlog', 'planning', 'in_progress', 'done']
const INCIDENT_STATUSES: IncidentStatus[] = ['open', 'in_progress', 'waiting_on_client', 'resolved', 'closed']
const TASK_STATUSES: EntryStatus[] = ['pending', 'todo', 'in_progress', 'validation', 'done', 'blocked']
const CLIENT_STATUSES: ClientStatus[] = ['pre_venda', 'implantacao', 'sustentacao_novos_projetos']
const PRIORITIES: Probability[] = ['low', 'medium', 'high']

type Choice = ImportEntity | 'tudo'

const CARDS: { id: Choice; title: string; description: string }[] = [
  { id: 'clientes', title: 'Clientes', description: 'Carteira: nome, país, status, responsável e notas.' },
  { id: 'projetos', title: 'Projetos', description: 'Projetos por cliente, com tipo, líder, status e go-live.' },
  { id: 'incidentes', title: 'Incidentes', description: 'Sustentação: prioridade, impacto, prazo e responsável.' },
  { id: 'tarefas', title: 'Tarefas', description: 'De projetos, de incidentes ou soltas, com responsável e datas.' },
  { id: 'tudo', title: 'Tudo em um arquivo', description: 'Todas as abas juntas — tarefas podem apontar para projetos criados no mesmo arquivo.' },
]

const fmtDate = (iso?: string) => (iso ? iso.split('-').reverse().join('/') : '')

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-2 py-1.5 text-[11.5px] font-[600] uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-default)' }}>
      {children}
    </th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-2 py-1.5 align-top" style={{ borderBottom: '1px solid var(--border-default)' }}>{children}</td>
}

/** Avisos da linha (erros de leitura em vermelho + observação de quem gerou o arquivo). */
function Notes({ errors, note }: { errors: string[]; note?: string }) {
  return (
    <div className="text-[11.5px] min-w-[140px]">
      {errors.map((e, i) => <div key={i} style={{ color: 'var(--color-danger-text)' }}>{e}</div>)}
      {note && <div style={{ color: 'var(--text-tertiary)' }}>{note}</div>}
    </div>
  )
}

const EMPTY: ImportRows = { clients: [], projects: [], incidents: [], tasks: [] }

export default function ImportPage() {
  const { t } = useTranslation()
  const { addToast } = useToastStore()
  const [searchParams] = useSearchParams()
  const store = useAppStore()
  const { clients, projects, incidents, teamDirectory, settings } = store

  const initial = searchParams.get('entity')
  const [choice, setChoice] = useState<Choice>(([...IMPORT_ENTITIES, 'tudo'] as string[]).includes(initial ?? '') ? (initial as Choice) : 'projetos')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [rows, setRows] = useState<ImportRows>(EMPTY)
  const [committing, setCommitting] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const activeClients = useMemo(() => clients.filter((c) => !c.archived), [clients])
  const hasRows = rows.clients.length + rows.projects.length + rows.incidents.length + rows.tasks.length > 0

  // ── modelo (.xlsx) ─────────────────────────────────────────────────────────

  async function downloadTemplate() {
    setDownloading(true)
    try {
      const lists: ListsData = {
        clients: activeClients.map((c) => c.name),
        users: teamDirectory.filter((p) => p.active).map((p) => p.name ?? p.email ?? '').filter(Boolean),
        projects: projects.filter((p) => !p.archived).map((p) => p.name),
        incidents: incidents.map((i) => i.title),
        countries: COUNTRIES.map((c) => c.name),
      }
      // exceljs é pesado: só é baixado quando alguém pede o modelo.
      const { buildImportTemplate } = await import('@/utils/importTemplate')
      const { blob, fileName: name } = await buildImportTemplate(choice === 'tudo' ? [...IMPORT_ENTITIES] : [choice], lists, importFileName(choice))
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (err) {
      addToast(err instanceof Error ? `Não foi possível gerar o modelo: ${err.message}` : 'Não foi possível gerar o modelo.')
    } finally {
      setDownloading(false)
    }
  }

  // ── planilha preenchida ────────────────────────────────────────────────────

  async function handleFile(file: File) {
    setFileName(file.name)
    try {
      const wb = await parseStagingFile(file)
      const errors = [...wb.sheetErrors]
      const counts = rowCounts(wb)
      if (choice !== 'tudo' && errors.length === 0 && counts[choice] === 0) {
        errors.push(`Nenhuma linha encontrada na aba "${LAYOUTS[choice].sheet}". Use o modelo baixado nesta tela e preencha a partir da linha 2.`)
      }
      setParseErrors(errors)
      setRows(buildImportRows(wb, { clients, projects, incidents }, choice))
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erro ao ler o arquivo')
    }
  }

  function reset() {
    setFileName('')
    setParseErrors([])
    setRows(EMPTY)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // O menu "Importar" do topo navega para /import?entity=...: se a página já estiver aberta, acompanha a escolha.
  const entityParam = searchParams.get('entity')
  useEffect(() => {
    if (entityParam && ([...IMPORT_ENTITIES, 'tudo'] as string[]).includes(entityParam) && entityParam !== choice) {
      setChoice(entityParam as Choice)
      reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityParam])

  function pickChoice(c: Choice) {
    if (c === choice) return
    setChoice(c)
    reset()
  }

  // ── commit ─────────────────────────────────────────────────────────────────

  const blocked = blockedRows(rows)
  const blockedCount = blocked.projects.length + blocked.incidents.length + blocked.tasks.length
  const includedCount =
    rows.clients.filter((r) => r.include && r.action !== 'skip').length +
    rows.projects.filter((r) => r.include && r.action !== 'skip').length +
    rows.incidents.filter((r) => r.include && r.action !== 'skip').length +
    rows.tasks.filter((r) => r.include).length

  function commit() {
    if (blockedCount > 0) {
      addToast('Existem linhas incluídas sem cliente ou origem resolvida — ajuste antes de importar.')
      return
    }
    setCommitting(true)
    try {
      const s = useAppStore.getState()
      const summary = commitImport(rows, {
        clients: s.clients, projects: s.projects, incidents: s.incidents,
        teamMembers: teamDirectoryAsTeamMembers(s.teamDirectory),
        defaultLanguage: settings.defaultLanguage,
        createClient: s.createClient, updateClient: s.updateClient,
        createProject: s.createProject, updateProject: s.updateProject,
        createIncident: s.createIncident, updateIncident: s.updateIncident,
        addEntry: s.addEntry, addUnassignedEntry: s.addUnassignedEntry, addIncidentEntry: s.addIncidentEntry, addStandaloneTask: s.addStandaloneTask, updateEntry: s.updateEntry,
        getProject: (id) => useAppStore.getState().projects.find((p) => p.id === id),
      })
      const parts = [
        summary.clients.created + summary.clients.updated ? `${summary.clients.created} cliente(s) criado(s), ${summary.clients.updated} atualizado(s)` : '',
        summary.projects.created + summary.projects.updated ? `${summary.projects.created} projeto(s) criado(s), ${summary.projects.updated} atualizado(s)` : '',
        summary.incidents.created + summary.incidents.updated ? `${summary.incidents.created} incidente(s) criado(s), ${summary.incidents.updated} atualizado(s)` : '',
        summary.tasks.created ? `${summary.tasks.created} tarefa(s) criada(s)` : '',
      ].filter(Boolean)
      addToast(`Importação concluída: ${parts.join(' · ') || 'nada a gravar'}.`, 'success')
      reset()
    } finally {
      setCommitting(false)
    }
  }

  // ── helpers de edição de linha ─────────────────────────────────────────────

  const patch = <K extends keyof ImportRows>(key: K, i: number, change: Partial<ImportRows[K][number]>) =>
    setRows((r) => ({ ...r, [key]: r[key].map((x, xi) => (xi === i ? { ...x, ...change } : x)) }) as ImportRows)

  /** Seletor de cliente: existentes, os criados neste arquivo e (se a planilha trouxe um nome novo) "criar agora". */
  // Função de render (não um componente): um componente declarado aqui dentro mudaria de identidade a cada render.
  function clientSelect(value: string, sheetName: string | undefined, onChange: (v: string) => void) {
    const batch = rows.clients.filter((c) => c.include && c.action === 'create' && c.name.trim())
    const canCreate = !!sheetName?.trim() && !activeClients.some((c) => fold(c.name) === fold(sheetName))
    return (
      <Select className="!py-1 !text-[13px] min-w-[150px]" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{sheetName ? `⚠ ${sheetName} (escolha)` : '— escolha —'}</option>
        {canCreate && <option value={`new:${sheetName!.trim()}`}>+ Criar cliente “{sheetName!.trim()}”</option>}
        {batch.map((c) => <option key={c.name} value={`batch:${fold(c.name)}`}>(novo neste arquivo) {c.name}</option>)}
        {activeClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
    )
  }

  const actionSelect = (value: RowAction, canUpdate: boolean, onChange: (a: RowAction) => void) => (
    <Select className="!py-1 !text-[13px] min-w-[96px]" value={value} onChange={(e) => onChange(e.target.value as RowAction)}>
      <option value="create">Criar</option>
      <option value="update" disabled={!canUpdate}>Atualizar</option>
      <option value="skip">Ignorar</option>
    </Select>
  )

  const card = CARDS.find((c) => c.id === choice)!

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-5">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{t('bulkImport.title', 'Importação em massa')}</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Escolha o que importar, baixe o modelo em Excel (com todas as colunas, listas de opções e instruções), preencha e envie de volta.
          Nada é gravado antes da revisão.
        </p>
      </div>

      {/* 1) O que importar */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
        {CARDS.map((c) => {
          const active = c.id === choice
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => pickChoice(c.id)}
              aria-pressed={active}
              className="text-left p-3 rounded-[var(--radius-lg)] border-2 transition-colors"
              style={{
                borderColor: active ? 'var(--oe-primary)' : 'var(--border-default)',
                background: active ? 'var(--color-info-bg)' : 'var(--surface-card)',
              }}
            >
              <p className="text-sm font-semibold" style={{ color: active ? 'var(--text-primary)' : 'var(--text-primary)' }}>{c.title}</p>
              <p className="text-[11.5px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{c.description}</p>
            </button>
          )
        })}
      </div>

      {/* 2) Modelo e envio */}
      <section
        className="mb-6 p-4 rounded-[var(--radius-lg)] border grid grid-cols-1 md:grid-cols-2 gap-4"
        style={{ background: 'var(--surface-card)', borderColor: 'var(--border-default)' }}
      >
        <div>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>1. Baixe o modelo de {card.title.toLowerCase()}</p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
            Planilha pronta, com todas as colunas, listas suspensas (clientes, responsáveis, projetos e status que já existem no Open) e uma aba de instruções.
          </p>
          <Button variant="secondary" size="sm" onClick={downloadTemplate} disabled={downloading}>
            {downloading ? 'Gerando…' : '↓ Baixar modelo (.xlsx)'}
          </Button>
        </div>
        <div>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>2. Envie a planilha preenchida</p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
            {choice === 'tudo' ? 'Aceita as abas Clientes, Projetos, Incidentes e Tarefas (também arquivos de staging gerados em conversa).' : `Lê a aba "${LAYOUTS[choice as ImportEntity].sheet}". Você revisa cada linha antes de gravar.`}
          </p>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
            <Button size="sm" onClick={() => fileInputRef.current?.click()}>{fileName || 'Escolher arquivo .xlsx'}</Button>
            {hasRows && <Button variant="ghost" size="sm" onClick={reset}>{t('bulkImport.clear', 'Limpar')}</Button>}
          </div>
        </div>
      </section>

      {parseErrors.length > 0 && (
        <div className="mb-4 p-3 text-xs rounded-[var(--radius-md)]" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-text)' }}>
          {parseErrors.join(' — ')}
        </div>
      )}

      {!hasRows && parseErrors.length === 0 && (
        <div className="text-sm text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
          {t('bulkImport.empty', 'Nenhum arquivo carregado ainda.')}
        </div>
      )}

      {/* Clientes */}
      {rows.clients.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
            Clientes ({rows.clients.filter((r) => r.include).length}/{rows.clients.length})
          </h2>
          <div className="oe-card overflow-x-auto">
            <table className="w-full text-[13px]" style={{ background: 'var(--surface-card)' }}>
              <thead><tr><Th>{' '}</Th><Th>Ação</Th><Th>Nome</Th><Th>País</Th><Th>Status</Th><Th>Responsável</Th><Th>Avisos</Th></tr></thead>
              <tbody>
                {rows.clients.map((r, i) => (
                  <tr key={i}>
                    <Td><input type="checkbox" checked={r.include} onChange={(e) => patch('clients', i, { include: e.target.checked })} /></Td>
                    <Td>{actionSelect(r.action, !!r.matchClientId, (action) => patch('clients', i, { action }))}</Td>
                    <Td><Input className="!py-1 !text-[13px] min-w-[200px]" value={r.name} onChange={(e) => patch('clients', i, { name: e.target.value })} /></Td>
                    <Td>{findCountry(r.row.pais)?.name ?? <span style={{ color: 'var(--text-disabled)' }}>—</span>}</Td>
                    <Td>
                      <Select className="!py-1 !text-[13px]" value={r.status} onChange={(e) => patch('clients', i, { status: e.target.value as ClientStatus })}>
                        {CLIENT_STATUSES.map((s, k) => <option key={s} value={s}>{CLIENT_STATUS_LABELS[k]}</option>)}
                      </Select>
                    </Td>
                    <Td>{r.row.responsavel ?? <span style={{ color: 'var(--text-disabled)' }}>—</span>}</Td>
                    <Td><Notes errors={r.row.errors} note={r.action === 'update' ? 'Já existe: será atualizado (notas são anexadas).' : r.row.observacaoIA} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Projetos */}
      {rows.projects.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
            Projetos ({rows.projects.filter((r) => r.include).length}/{rows.projects.length})
          </h2>
          <div className="oe-card overflow-x-auto">
            <table className="w-full text-[13px]" style={{ background: 'var(--surface-card)' }}>
              <thead><tr><Th>{' '}</Th><Th>Ação</Th><Th>Cliente</Th><Th>Nome</Th><Th>Status</Th><Th>Avisos</Th></tr></thead>
              <tbody>
                {rows.projects.map((r, i) => (
                  <tr key={i}>
                    <Td><input type="checkbox" checked={r.include} onChange={(e) => patch('projects', i, { include: e.target.checked })} /></Td>
                    <Td>{actionSelect(r.action, !!r.matchProjectId, (action) => patch('projects', i, { action }))}</Td>
                    <Td>{clientSelect(r.clientId, r.row.cliente, (clientId) => patch('projects', i, { clientId }))}</Td>
                    <Td><Input className="!py-1 !text-[13px] min-w-[180px]" value={r.name} onChange={(e) => patch('projects', i, { name: e.target.value })} /></Td>
                    <Td>
                      <Select className="!py-1 !text-[13px]" value={r.status} onChange={(e) => patch('projects', i, { status: e.target.value as ProjectStatus })}>
                        {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                      </Select>
                    </Td>
                    <Td><Notes errors={r.row.errors} note={r.action === 'update' ? 'Já existe: status atualizado e texto anexado às anotações.' : r.similarTo ? `Parecido com “${r.similarTo}” — marque Atualizar se for o mesmo.` : r.row.observacaoIA} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Incidentes */}
      {rows.incidents.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
            Incidentes ({rows.incidents.filter((r) => r.include).length}/{rows.incidents.length})
          </h2>
          <div className="oe-card overflow-x-auto">
            <table className="w-full text-[13px]" style={{ background: 'var(--surface-card)' }}>
              <thead><tr><Th>{' '}</Th><Th>Ação</Th><Th>Cliente</Th><Th>Título</Th><Th>Prioridade</Th><Th>Status</Th><Th>Responsável</Th><Th>Avisos</Th></tr></thead>
              <tbody>
                {rows.incidents.map((r, i) => (
                  <tr key={i}>
                    <Td><input type="checkbox" checked={r.include} onChange={(e) => patch('incidents', i, { include: e.target.checked })} /></Td>
                    <Td>{actionSelect(r.action, !!r.matchIncidentId, (action) => patch('incidents', i, { action }))}</Td>
                    <Td>{clientSelect(r.clientId, r.row.cliente, (clientId) => patch('incidents', i, { clientId }))}</Td>
                    <Td><Input className="!py-1 !text-[13px] min-w-[180px]" value={r.title} onChange={(e) => patch('incidents', i, { title: e.target.value })} /></Td>
                    <Td>
                      <Select className="!py-1 !text-[13px]" value={r.priority} onChange={(e) => patch('incidents', i, { priority: e.target.value as Probability })}>
                        {PRIORITIES.map((p) => <option key={p} value={p}>{t(`risk.${p}`)}</option>)}
                      </Select>
                    </Td>
                    <Td>
                      <Select className="!py-1 !text-[13px]" value={r.status} onChange={(e) => patch('incidents', i, { status: e.target.value as IncidentStatus })}>
                        {INCIDENT_STATUSES.map((s) => <option key={s} value={s}>{t(`incident.status_${s}`)}</option>)}
                      </Select>
                    </Td>
                    <Td>{r.row.responsavel ?? <span style={{ color: 'var(--text-disabled)' }}>—</span>}</Td>
                    <Td><Notes errors={r.row.errors} note={r.action === 'update' ? 'Já existe: status/prioridade atualizados e texto anexado à descrição.' : r.similarTo ? `Parecido com “${r.similarTo}” — marque Atualizar se for o mesmo.` : r.row.observacaoIA} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Tarefas */}
      {rows.tasks.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
            Tarefas ({rows.tasks.filter((r) => r.include).length}/{rows.tasks.length})
          </h2>
          <div className="oe-card overflow-x-auto">
            <table className="w-full text-[13px]" style={{ background: 'var(--surface-card)' }}>
              <thead><tr><Th>{' '}</Th><Th>Origem</Th><Th>Nome</Th><Th>Responsável</Th><Th>Status</Th><Th>Prioridade</Th><Th>Plano</Th><Th>Avisos</Th></tr></thead>
              <tbody>
                {rows.tasks.map((r, i) => {
                  const originLabel = r.scope === 'solta'
                    ? 'Tarefa solta'
                    : r.targetKey
                      ? (r.targetKey.startsWith('batch:') ? `(neste arquivo) ${r.row.origemNome}` : r.row.origemNome)
                      : `⚠ não encontrado: ${r.row.origemNome ?? '—'}`
                  const plan = [r.row.inicio || r.row.fim ? `${fmtDate(r.row.inicio) || '…'} → ${fmtDate(r.row.fim) || '…'}` : '', r.row.duracaoDias !== undefined ? `${r.row.duracaoDias}d` : '', r.row.fase ? `fase: ${r.row.fase}` : ''].filter(Boolean).join(' · ')
                  return (
                    <tr key={i}>
                      <Td><input type="checkbox" checked={r.include} onChange={(e) => patch('tasks', i, { include: e.target.checked })} /></Td>
                      <Td>
                        <div className="flex flex-col gap-1 min-w-[170px]">
                          <Select className="!py-1 !text-[13px]" value={r.scope} onChange={(e) => patch('tasks', i, { scope: e.target.value as TaskScope })}>
                            <option value="projeto">Projeto</option>
                            <option value="incidente">Incidente</option>
                            <option value="solta">Tarefa solta</option>
                          </Select>
                          <span style={{ color: r.scope !== 'solta' && !r.targetKey ? 'var(--color-danger-text)' : 'var(--text-tertiary)' }}>{originLabel}</span>
                          {r.scope === 'solta' && clientSelect(r.clientId, r.row.cliente, (clientId) => patch('tasks', i, { clientId }))}
                        </div>
                      </Td>
                      <Td><Input className="!py-1 !text-[13px] min-w-[180px]" value={r.name} onChange={(e) => patch('tasks', i, { name: e.target.value })} /></Td>
                      <Td><Input className="!py-1 !text-[13px] min-w-[120px]" value={r.responsavel} onChange={(e) => patch('tasks', i, { responsavel: e.target.value })} placeholder="—" /></Td>
                      <Td>
                        <Select className="!py-1 !text-[13px]" value={r.status} onChange={(e) => patch('tasks', i, { status: e.target.value as EntryStatus })}>
                          {TASK_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                        </Select>
                      </Td>
                      <Td>
                        <Select
                          className="!py-1 !text-[13px]"
                          value={r.riskFlag === 'critical' ? 'high' : r.riskFlag === 'warning' ? 'medium' : 'low'}
                          onChange={(e) => {
                            const v = e.target.value as Probability
                            patch('tasks', i, { riskFlag: (v === 'high' ? 'critical' : v === 'medium' ? 'warning' : 'none') as RiskFlag })
                          }}
                        >
                          {PRIORITIES.map((p) => <option key={p} value={p}>{t(`risk.${p}`)}</option>)}
                        </Select>
                      </Td>
                      <Td><span className="text-[11.5px]" style={{ color: 'var(--text-tertiary)' }}>{plan || '—'}</span></Td>
                      <Td><Notes errors={r.row.errors} note={r.row.observacaoIA} /></Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {hasRows && (
        <div className="sticky bottom-4 flex items-center justify-between p-3 rounded-[var(--radius-lg)] border shadow-[var(--shadow-md)]" style={{ background: 'var(--surface-card)', borderColor: 'var(--border-default)' }}>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {includedCount} itens marcados para importação
            {blockedCount > 0 && (
              <span style={{ color: 'var(--color-danger-text)' }}> — {blockedCount} bloqueados (cliente/origem não resolvidos)</span>
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
