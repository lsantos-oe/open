import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useAiStore } from '@/stores/useAiStore'
import { useToastStore } from '@/stores/useToastStore'
import { DateFormat, Workdays, IncidentTemplate, Probability, IncidentStatus } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input, Field, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { UsersManagementPanel } from '@/pages/UsersPage'

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="bg-[var(--surface-card)] rounded-[var(--radius-lg)] border border-[var(--border-default)] p-6 mb-6">
      <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-1">{title}</h2>
      {description && <p className="text-xs text-[var(--text-tertiary)] mb-4">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </section>
  )
}

function ToggleGroup<T extends string>({
  value, onChange, options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-4 py-2 rounded-[var(--radius-lg)] text-sm font-medium border transition-colors ${
            value === opt.value
              ? 'bg-[var(--oe-primary)] text-white border-[var(--oe-primary)]'
              : 'bg-[var(--surface-card)] text-[var(--text-secondary)] border-[var(--border-strong)] hover:border-[var(--oe-primary)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

const HOMEPAGE_KEY = 'pb-default-project-tab'
const HOMEPAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'plan', label: 'Plano' },
  { value: 'kanban', label: 'Kanban' },
  { value: 'diary', label: 'Diário' },
]

type SettingsTab = 'general' | 'holidays' | 'templates' | 'users' | 'archived'
type ArchivedFilter = 'all' | 'project' | 'client' | 'incident'

export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { profile } = useAuthStore()
  const isAdmin = profile?.role === 'admin'
  const { hasKey, saving: savingAiKey, saveKey: saveAiKey, removeKey: removeAiKey } = useAiStore()
  const { addToast } = useToastStore()
  const [aiApiKey, setAiApiKey] = useState('')
  const {
    settings, updateSettings, addHoliday, removeHoliday,
    archivedProjects, archivedProjectsLoaded, loadArchivedProjects, unarchiveProject, hideProject,
    archivedClients, archivedClientsLoaded, loadArchivedClients, unarchiveClient,
    incidents, updateIncidentStatus,
    createIncidentTemplate, updateIncidentTemplate, deleteIncidentTemplate,
  } = useAppStore()

  useEffect(() => { loadArchivedProjects(); loadArchivedClients() }, [])

  const [tab, setTab] = useState<SettingsTab>('general')
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>('all')
  const [holidayDate, setHolidayDate] = useState('')
  const [holidayName, setHolidayName] = useState('')
  const [homepageTab, setHomepageTab] = useState(() => localStorage.getItem(HOMEPAGE_KEY) ?? 'overview')

  const [showIncidentTemplate, setShowIncidentTemplate] = useState(false)
  const [editIncidentTemplate, setEditIncidentTemplate] = useState<IncidentTemplate | null>(null)
  const [itName, setItName] = useState('')
  const [itPriority, setItPriority] = useState<Probability>('medium')
  const [itImpact, setItImpact] = useState<Probability>('medium')
  const [itTasks, setItTasks] = useState('')

  function changeHomepageTab(v: string) {
    setHomepageTab(v)
    localStorage.setItem(HOMEPAGE_KEY, v)
  }

  function handleAddHoliday() {
    if (!holidayDate) return
    addHoliday(holidayDate, holidayName.trim() || undefined)
    setHolidayDate('')
    setHolidayName('')
  }

  function changeLanguage(lang: 'pt' | 'en' | 'es') {
    i18n.changeLanguage(lang)
    updateSettings({ defaultLanguage: lang })
  }

  async function handleSaveAiKey() {
    const ok = await saveAiKey(aiApiKey)
    if (ok) {
      setAiApiKey('')
      addToast('Chave da API salva com sucesso', 'success')
    }
  }

  async function handleRemoveAiKey() {
    await removeAiKey()
    addToast('Chave da API removida', 'success')
  }

  function handleDeleteArchived(id: string, name: string) {
    if (!confirm(`Excluir "${name}" da lista de arquivados? O projeto some do sistema, mas os dados continuam no banco.`)) return
    hideProject(id)
  }

  function openAddIncidentTemplate() {
    setEditIncidentTemplate(null); setItName(''); setItPriority('medium'); setItImpact('medium'); setItTasks('')
    setShowIncidentTemplate(true)
  }

  function openEditIncidentTemplate(tpl: IncidentTemplate) {
    setEditIncidentTemplate(tpl); setItName(tpl.name); setItPriority(tpl.priority); setItImpact(tpl.impact)
    setItTasks(tpl.taskTitles.join('\n'))
    setShowIncidentTemplate(true)
  }

  function saveIncidentTemplate() {
    if (!itName.trim()) return
    const taskTitles = itTasks.split('\n').map((s) => s.trim()).filter(Boolean)
    if (editIncidentTemplate) {
      updateIncidentTemplate({ ...editIncidentTemplate, name: itName.trim(), priority: itPriority, impact: itImpact, taskTitles })
    } else {
      createIncidentTemplate({ name: itName.trim(), priority: itPriority, impact: itImpact, taskTitles })
    }
    setShowIncidentTemplate(false)
  }

  const closedIncidents = incidents.filter((i) => i.status === 'closed')
  const archivedCount = (archivedProjectsLoaded ? archivedProjects.length : 0)
    + (archivedClientsLoaded ? archivedClients.length : 0)
    + closedIncidents.length

  const TABS: { id: SettingsTab; label: string }[] = [
    { id: 'general', label: 'Geral' },
    { id: 'holidays', label: 'Feriados' },
    { id: 'templates', label: 'Templates' },
    ...(isAdmin ? [{ id: 'users' as const, label: 'Usuários' }] : []),
    { id: 'archived', label: `Arquivados${archivedCount ? ` (${archivedCount})` : ''}` },
  ]

  function reopenIncident(id: string) {
    updateIncidentStatus(id, 'open' as IncidentStatus)
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-6">{t('nav.settings')}</h1>

      <div className="flex gap-0 border-b mb-6" style={{ borderColor: 'var(--border-default)' }}>
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className="px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
            style={{
              borderBottomColor: tab === tb.id ? 'var(--oe-primary)' : 'transparent',
              color: tab === tb.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
              marginBottom: -1,
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <>
          <Section title="Idioma da interface">
            <ToggleGroup
              value={settings.defaultLanguage}
              onChange={changeLanguage}
              options={[
                { value: 'pt', label: '🇧🇷 Português' },
                { value: 'en', label: '🇺🇸 English' },
                { value: 'es', label: '🇪🇸 Español' },
              ]}
            />
          </Section>

          <Section title="Preferências pessoais" description="Salvas apenas neste navegador.">
            <p className="text-xs text-[var(--text-secondary)] mb-2">Página inicial ao abrir um projeto</p>
            <ToggleGroup
              value={homepageTab}
              onChange={changeHomepageTab}
              options={HOMEPAGE_OPTIONS}
            />
          </Section>

          <Section title="Formato de data">
            <ToggleGroup<DateFormat>
              value={settings.dateFormat}
              onChange={(v) => updateSettings({ dateFormat: v })}
              options={[
                { value: 'DD/MM/YYYY', label: 'DD/MM/AAAA (ex: 22/04/2026)' },
                { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (ex: 04/22/2026)' },
              ]}
            />
          </Section>

          <Section title="Dias úteis" description="Define quais dias são considerados dias úteis nos cálculos de prazo.">
            <ToggleGroup<Workdays>
              value={settings.workdays}
              onChange={(v) => updateSettings({ workdays: v })}
              options={[
                { value: 'mon-fri', label: 'Seg – Sex' },
                { value: 'mon-sat', label: 'Seg – Sáb' },
              ]}
            />
          </Section>

          {isAdmin && (
            <Section title="Assistente de IA" description="Chave da API da Anthropic (Claude) compartilhada por todo o time — não é por usuário.">
              {hasKey ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm" style={{ color: 'var(--color-success-text)' }}>Chave configurada ✓</span>
                  <Button variant="secondary" size="sm" onClick={handleRemoveAiKey} disabled={savingAiKey}>Remover chave</Button>
                </div>
              ) : (
                <Field label="API key da Anthropic">
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={aiApiKey}
                      onChange={(e) => setAiApiKey(e.target.value)}
                      placeholder="sk-ant-..."
                      className="flex-1"
                    />
                    <Button size="sm" onClick={handleSaveAiKey} disabled={!aiApiKey.trim() || savingAiKey}>
                      {savingAiKey ? 'Validando...' : 'Validar e salvar'}
                    </Button>
                  </div>
                </Field>
              )}
            </Section>
          )}
        </>
      )}

      {tab === 'holidays' && (
        <Section title="Feriados" description="Datas excluídas do cálculo de dias úteis.">
          <div className="flex gap-2 mb-4 flex-wrap">
            <Input
              type="date"
              value={holidayDate}
              onChange={(e) => setHolidayDate(e.target.value)}
              className="w-44"
            />
            <Input
              value={holidayName}
              onChange={(e) => setHolidayName(e.target.value)}
              placeholder="Nome (ex: Carnaval)"
              className="flex-1 min-w-[160px]"
              onKeyDown={(e) => e.key === 'Enter' && handleAddHoliday()}
            />
            <Button size="sm" onClick={handleAddHoliday} disabled={!holidayDate}>
              Adicionar
            </Button>
          </div>
          {settings.holidays.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">Nenhum feriado cadastrado.</p>
          ) : (
            <div className="space-y-1.5">
              {settings.holidays.map((date) => {
                const name = settings.holidayNames[date]
                return (
                  <div key={date} className="flex items-center justify-between py-1.5 px-3 bg-[var(--surface-subtle)] rounded-[var(--radius-lg)] border border-[var(--border-default)]">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-[var(--text-secondary)]">
                        {date.split('-').reverse().join('/')}
                      </span>
                      {name && <span className="text-sm text-[var(--text-secondary)]">{name}</span>}
                    </div>
                    <button onClick={() => removeHoliday(date)} className="text-[var(--text-tertiary)] hover:text-[var(--color-danger-text)] transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </Section>
      )}

      {tab === 'templates' && (
        <>
          <Section title="Templates de projeto" description="Estrutura de fases e entradas usada ao criar novos projetos.">
            <div className="space-y-3">
              {settings.templates.map((tpl) => (
                <div key={tpl.id} className="flex items-center justify-between p-3 bg-[var(--surface-subtle)] rounded-[var(--radius-lg)] border border-[var(--border-default)]">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{tpl.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      {tpl.phases.length} fases · {tpl.phases.reduce((n, p) => n + p.entries.length, 0)} entradas
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => navigate(`/settings/templates/${tpl.id}`)}
                  >
                    Editar template
                  </Button>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Templates de incidente" description="Prioridade/impacto padrão e tarefas que já nascem junto ao criar um incidente desse tipo.">
            <div className="space-y-3">
              {settings.incidentTemplates.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)]">Nenhum template de incidente ainda.</p>
              ) : (
                settings.incidentTemplates.map((tpl) => (
                  <div key={tpl.id} className="flex items-center justify-between p-3 bg-[var(--surface-subtle)] rounded-[var(--radius-lg)] border border-[var(--border-default)]">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{tpl.name}</p>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {tpl.taskTitles.length} tarefa{tpl.taskTitles.length !== 1 ? 's' : ''} padrão
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openEditIncidentTemplate(tpl)}>Editar</Button>
                      <Button size="sm" variant="secondary" onClick={() => deleteIncidentTemplate(tpl.id)}>Excluir</Button>
                    </div>
                  </div>
                ))
              )}
              <Button size="sm" onClick={openAddIncidentTemplate}>+ Template de incidente</Button>
            </div>
          </Section>
        </>
      )}

      {tab === 'users' && isAdmin && <UsersManagementPanel />}

      {tab === 'archived' && (
        <Section title="Arquivados" description="Projetos arquivados, clientes arquivados e incidentes fechados — restaure ou reabra a qualquer momento.">
          <div className="flex gap-2 mb-4 flex-wrap">
            {([['all', 'Todas'], ['project', 'Projetos'], ['client', 'Clientes'], ['incident', 'Incidentes']] as [ArchivedFilter, string][]).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setArchivedFilter(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-[var(--radius-pill)] border transition-colors ${
                  archivedFilter === v ? 'bg-[var(--oe-primary)] text-white border-[var(--oe-primary)]' : 'bg-[var(--surface-card)] text-[var(--text-secondary)] border-[var(--border-default)]'
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {!archivedProjectsLoaded || !archivedClientsLoaded ? (
            <p className="text-sm text-[var(--text-tertiary)]">Carregando...</p>
          ) : (
            <div className="space-y-1.5">
              {archivedFilter !== 'client' && archivedFilter !== 'incident' && archivedProjects.map((p) => (
                <div key={`project-${p.id}`} className="flex items-center justify-between py-2 px-3 bg-[var(--surface-subtle)] rounded-[var(--radius-lg)] border border-[var(--border-default)]">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{p.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">Projeto · {p.client} · {p.pm}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => unarchiveProject(p.id)}>Desarquivar</Button>
                    <Button size="sm" variant="secondary" onClick={() => handleDeleteArchived(p.id, p.name)}>Excluir</Button>
                  </div>
                </div>
              ))}

              {archivedFilter !== 'project' && archivedFilter !== 'incident' && archivedClients.map((c) => (
                <div key={`client-${c.id}`} className="flex items-center justify-between py-2 px-3 bg-[var(--surface-subtle)] rounded-[var(--radius-lg)] border border-[var(--border-default)]">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{c.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">Cliente</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => unarchiveClient(c.id)}>Restaurar</Button>
                </div>
              ))}

              {archivedFilter !== 'project' && archivedFilter !== 'client' && closedIncidents.map((i) => (
                <div key={`incident-${i.id}`} className="flex items-center justify-between py-2 px-3 bg-[var(--surface-subtle)] rounded-[var(--radius-lg)] border border-[var(--border-default)]">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{i.title}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">Incidente · Fechado</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => reopenIncident(i.id)}>Reabrir</Button>
                </div>
              ))}

              {archivedProjects.length === 0 && archivedClients.length === 0 && closedIncidents.length === 0 && (
                <p className="text-sm text-[var(--text-tertiary)]">Nada arquivado por aqui.</p>
              )}
            </div>
          )}
        </Section>
      )}

      <Modal
        open={showIncidentTemplate}
        title={editIncidentTemplate ? 'Editar template de incidente' : 'Novo template de incidente'}
        onClose={() => setShowIncidentTemplate(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowIncidentTemplate(false)}>Cancelar</Button>
            <Button onClick={saveIncidentTemplate} disabled={!itName.trim()}>É basicamente isso</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nome" required>
            <Input autoFocus value={itName} onChange={(e) => setItName(e.target.value)} placeholder="Ex: Erro de sincronização" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prioridade padrão">
              <Select value={itPriority} onChange={(e) => setItPriority(e.target.value as Probability)}>
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
              </Select>
            </Field>
            <Field label="Impacto padrão">
              <Select value={itImpact} onChange={(e) => setItImpact(e.target.value as Probability)}>
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
              </Select>
            </Field>
          </div>
          <Field label="Tarefas padrão" hint="Uma tarefa por linha — criadas automaticamente junto com o incidente.">
            <Textarea value={itTasks} onChange={(e) => setItTasks(e.target.value)} rows={5} placeholder={'Ex:\nInvestigar causa raiz\nAplicar correção\nValidar com o cliente'} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
