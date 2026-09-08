# Open — Documentação Funcional

> Levantamento fresco do estado atual do app, gerado em 2026-09-08 por auditoria direta do código (não confiar no `README.md` da raiz para funcionalidades/schema — ele descreve uma versão bem anterior, sem Carteira, Contatos, Sustentação, Usuários ou Assistente de IA). Esta doc é o ponto de partida para planejar melhorias de tracking de tarefas e projetos.

## Índice

1. [O que é o Open](#1-o-que-é-o-open)
2. [Modelo de domínio](#2-modelo-de-domínio)
3. [Funcionalidades por área](#3-funcionalidades-por-área)
4. [Arquitetura técnica](#4-arquitetura-técnica)
5. [Banco de dados — mapeamento completo](#5-banco-de-dados--mapeamento-completo)
6. [Regras de negócio chave](#6-regras-de-negócio-chave)
7. [Assistente de IA](#7-assistente-de-ia)
8. [Pontos de atenção conhecidos](#8-pontos-de-atenção-conhecidos)

---

## 1. O que é o Open

Ferramenta interna do time de Onboarding/Expansão (OE) da Ploomes para planejar, acompanhar e reportar projetos de implantação de clientes (Nova Conta / Novo Projeto), além de gerenciar a carteira de clientes, contatos e chamados de sustentação. Não é mais só uma ferramenta de projetos — hoje é um mini-CRM interno com quatro pilares:

- **Carteira** — cadastro de clientes (substitui texto livre).
- **Portfólio** — projetos com plano de fases/tarefas, baseline, riscos, delay log e diário.
- **Sustentação** — chamados/incidentes, reaproveitando o mesmo motor de tarefas dos projetos.
- **Tarefas** — visão cruzada de tudo (projeto + incidente + solta) num board só.

Mais um **Assistente de IA** embarcado (chat com tool-calling sobre os dados do app) e gestão de **Usuários** (papéis, convites).

**Stack**: React 18 + TypeScript (strict) + Vite + Tailwind + Zustand + react-router-dom + Supabase JS (Postgres, Auth, Storage, uma Edge Function). SPA client-only — não há backend próprio além dessa única Edge Function; toda regra de negócio roda no navegador.

**Auth**: Google OAuth via Supabase Auth, restrito ao domínio `@ploomes.com` (checado tanto no cliente quanto, hoje, no próprio trigger de criação de perfil no banco — ver §5). Acesso é `admin` ou `member`; admins podem gerenciar usuários e a chave do assistente de IA.

**Deploy**: Vercel (frontend, auto-deploy a partir do `main`) + Supabase (projeto `fgzxmcvvahoasisgoqjr`, região `sa-east-1`).

---

## 2. Modelo de domínio

```
Cliente (Carteira) ──N:N── Projeto ──1:N── Fase ──1:N── Tarefa (Entry) ──1:N── Subtarefa (1 nível)
   │                          │                              │
   ├──N:N── Contato           ├──1:N── Risco                 ├── Comentários
   ├──N:N── Incidente         ├──1:N── Delay Log             ├── Links
   └──1:N── Histórico CS      ├──1:N── Equipe (jsonb)        └── Anexos (tabela genérica)
                              └── Diário: Pontos em aberto, Reuniões, Histórico, Comentários

Incidente (Sustentação) ──1:N── Tarefa (Entry, mesmo motor acima, sem Fase/Reuniões)
                         ──1:N── Pontos em aberto, Histórico
                         ──N:N── Cliente, Projeto
                         ──1:N── Stakeholders

Tarefa solta = Entry sem projeto nem incidente, opcionalmente ligada a 1 Cliente

Usuário (profile) ── papel admin/member, ativo/revogado ── dono de: tarefas, incidentes, clientes (owners), notificações
```

O achado mais importante para quem vai mexer em tracking: **`Entry` (tarefa) é uma única entidade reaproveitada em 3 contextos** — dentro de um Projeto (com Fase), dentro de um Incidente (sem Fase), ou solta (sem nenhum dos dois, com `client_id` opcional). Todo o motor de datas/cascata/status/caminho-crítico é o mesmo código nos três casos (`dateEngine.ts`, `criticalPath.ts`, `statusCalc.ts` não sabem a diferença). Não existe uma constraint de banco garantindo que uma Entry tenha exatamente um escopo — é uma regra só de aplicação (ver §8).

### Entidades e campos principais (`src/types/index.ts`)

| Entidade | Campos-chave | Observações |
|---|---|---|
| `Client` | `name`, `country`, `ploomesLink`, `status` (`pre_venda`\|`implantacao`\|`sustentacao_novos_projetos`), `owners: EntryOwner[]`, `csHistory: ClientCsAssignment[]`, `archived` | Fonte única de clientes — não existe mais texto livre. |
| `ClientContact` | `name`, `role`, `email`, `phone`, `clientIds: string[]` | Base compartilhada — 1 contato pode servir vários clientes. |
| `Project` | `name`, `clientIds: string[]` (fonte real), `client`/`clientId` (**legado**, derivado de `clientIds[0]`), `pm`/`pmMemberId`, `devLead`, `type`, `status`, `baselineSetAt`, `phases`, `risks`, `delayLog`, `team`, `charter`, `openPoints`/`meetings`/`history` | `pm`/`devLead` texto livre coexistem com `*MemberId` (usuário real registrado). |
| `Phase` | `name`, `order`, `entries: Entry[]`, `isUnassigned?` | `isUnassigned` é uma fase "bucket" oculta, auto-criada, pra tarefas `hiddenFromPlan` sem fase real. |
| `Entry` (tarefa) | `type` (`task`\|`milestone`\|`meeting`), `owners: EntryOwner[]` (executor obrigatório + validador opcional), `status` (`pending`\|`in_progress`\|`validation`\|`done`\|`blocked`\|`overdue`), `statusOverride`, `plannedStart/End` ou `plannedDate`, `baselineStart/End/Date`, `actualStart/End`, `dependsOn: string[]`, `isCritical`, `hiddenFromPlan`, `clientId?` (só em tarefa solta), `subtasks`, `links`, `comments` | Ver §6 para as regras de status/cascata. |
| `Incident` | `title`, `owner`, `status` (`open`\|`in_progress`\|`waiting_on_client`\|`resolved`\|`closed`), `priority`/`impact`, `deadline`, `clientIds`, `projectIds`, `stakeholders`, `entries`, `openPoints`, `history` | Sem "Reuniões" (deliberado — só Projeto tem). |
| `Risk` | `probability`×`impact` → `score` (1–9), `status`, `linkedEntryIds`, `actionTasks` | Score calculado no cliente, não é coluna gerada no banco. |
| `DelayLogEntry` | `days`, `responsibility` (interno/cliente-negócio/cliente-TI/cliente-fornecedor), `type` (execução/definição/planejamento), `triggeredBy` (manual\|cascade) | Auto-criado pelo motor de cascata quando uma data planejada estoura. |
| `TeamMember` | `name`, `role`, `userId?` | Time do projeto — diferente da base global de Usuários. |
| `OpenPoint` / `MeetingLog` / `HistoryEntry` | — | O "Diário" — comum a Projeto e Incidente (Incidente não tem Reuniões). |
| `EntryOwner` | `type` (`member`\|`text`\|`contact`), `memberId?`, `contactId?`, `kind?` (`executor`\|`validator`) | **Identidade não é `id`** (gerado novo a cada atribuição) — a chave estável é `memberId`/`contactId`, ou o nome pra texto livre. Use `ownerKey()` (`utils/involvement.ts`), nunca compare por `.id`. |
| `FileAttachment` (Diário) vs. tabela `attachments` (nova) | — | Dois mecanismos de anexo distintos e não intercambiáveis — ver §8. |

---

## 3. Funcionalidades por área

### Barra superior e lateral (global)
- **Sidebar**: Início, Carteira, Contatos, Portfólio, Sustentação, Tarefas — depois Configurações e Guia. Painel de atalhos contextual (lista projetos quando você está em Portfólio/projeto; lista os 8 incidentes mais recentes quando está em Sustentação).
- **Topbar**: busca (`⌘K`, Command Palette — projetos, clientes, incidentes), botão **+ de criação rápida** (Nova tarefa/Novo incidente/Novo projeto/Novo contato/Novo cliente, cada um navega para `?new=1` na página certa), sino de notificações, menu de perfil.
- **Assistente de IA**: botão flutuante, só aparece se um admin já configurou a chave (ver §7).

### `/` — Dashboard
Página pessoal: KPIs (meus incidentes abertos, minhas tarefas pendentes, projetos ativos), banner de "vence em breve" (7 dias, inclui atrasados), listas "Minhas tarefas" e "Meus incidentes". Sem filtros nem criação — só leitura/navegação, escopado pelo usuário logado (`isEntryMine`/`isIncidentMine`).

### `/portfolio` — Portfólio (projetos)
Lista/kanban com um **dashboard PMO** embutido (KPIs por status, % atrasados, variância média, risco por severidade, carga por PM, clientes por status, projetos sem baseline, go-lives nos próximos 60 dias — tudo re-escopável por um filtro multi-cliente). Toolbar completa: busca, `ColumnsMenu`, `FilterMenu` (cliente/PM/status multi-select, tipo/dev em pills), toggle "Meus", toggle "Atrasados", colunas ordenáveis. Ações em massa (arquivar, trocar PM/cliente/status). Criação via template (Nova Conta / Novo Projeto). Export JSON (projeto único ou backup completo).

### `/projects/:id` — Workspace do Projeto
Casca com abas: **Overview** (dashboard de KPIs, campos editáveis de cliente/PM/dev lead, links de Proposta/Negócio Ploomes, notas autosave, **Anexos**, Charter, seção Equipe embutida), **Plano** (tabela de fases/tarefas com cascata de datas — ver §6), **Kanban** (board só desse projeto, + seção "tarefas internas" pras `hiddenFromPlan`), **Riscos**, **Diário** (Pontos em aberto / Reuniões / Delay Log / Histórico). Topo: renomear inline, badge de atrasado, status editável, **copiar link**, exportar relatório (HTML ou **link público compartilhável**, máx. 3 por projeto), exportar CSV (só na aba Plano), menu "mais" (importar atualização, exportar JSON, duplicar, arquivar).

### `/wallet` — Carteira (clientes)
Registro de clientes — fonte única usada em Projeto/Incidente. Lista/kanban por status, filtros (país, owner multi-select), colunas ordenáveis, ações em massa (trocar owner, arquivar), export CSV.

### `/wallet/:id` — Detalhe do cliente
Overview (país, status, owners, notas), Contatos (tabela + vincular existente ou criar novo), Histórico de CS (log cronológico de troca de responsável), Timeline (agrega o histórico de todos os projetos vinculados).

### `/contacts` — Contatos
Base global, N:N com clientes. Busca, `ColumnsMenu`, filtro por cliente vinculado, colunas ordenáveis, exclusão em massa. Sem kanban, sem CSV.

### `/support` — Sustentação (incidentes)
Lista/kanban de chamados. Criação exige cliente(s) e responsável (não dá mais pra criar incidente "solto"). Templates de incidente pré-preenchem prioridade/impacto e tarefas padrão. Filtros (cliente/responsável/status/prioridade multi-select), toggle "Meus", ações em massa (status/prioridade/responsável/vincular cliente), export CSV.

### `/support/:id` — Detalhe do incidente
Overview (responsável, status/prioridade/impacto, prazo, descrição, **Anexos**, clientes/projetos vinculados, stakeholders), aba Tarefas (kanban/tabela, reaproveita o motor de Entry), Diário (Pontos em aberto, Histórico — sem Reuniões). Copiar link.

### `/tasks` — Tarefas (visão cruzada)
Todo Entry com dono, vindo de projetos ativos + incidentes + tarefas soltas, num board só. Kanban drag-and-drop entre 5 status cruzando escopos, ou tabela ordenável. Filtros (origem/cliente/responsável/status multi-select + "só atrasadas"). Ações em massa (status/responsável) mesmo misturando origens. **Link compartilhável de tarefa** (`/tasks?entry=<id>` — funciona pra qualquer Entry de qualquer origem, a página resolve e abre o modal certo sozinha).

### `/settings` — Configurações
Abas: Geral (idioma, aba padrão ao abrir projeto, formato de data, dias úteis, **chave do Assistente de IA** — admin only), Feriados, Templates (projeto e incidente), Usuários (admin only, mesmo painel de `/users`), Arquivados (projetos/clientes/incidentes).

### `/users` — Usuários (admin only)
Papéis (admin/member), revogar/reativar acesso, convidar por e-mail com antecedência (nome/papel pré-aplicados no primeiro login). Acesso de fato continua controlado por domínio corporativo, não pelo convite.

### `/guide` — Guia
Documentação in-app em português simples, 7 seções (Carteira/Portfólio/Projeto/Sustentação/Tarefas/Configurações/Usuários) — mantida manualmente (não gerada do código), boa fonte secundária pra visão funcional mas vale sempre conferir contra o código.

### Componentes transversais
`MultiSelect` (filtro multi-valor custom), `FilterMenu`, `ColumnsMenu`/`useColumnVisibility`, `SortableHeader`/`useSort`, `ViewToggle` (lista/kanban, persistido por página), `MineToggle`, `SelectionBar` (ações em massa), `CopyLinkButton`, `OwnersField` (escolher pessoa: usuário registrado, contato de cliente, ou texto livre), `EntityAttachments` (anexos reais em Projeto/Incidente/Tarefa).

---

## 4. Arquitetura técnica

### Stores (Zustand)
| Store | Persiste? | Escopo |
|---|---|---|
| `useAppStore` | Parcial (só `templates`/`incidentTemplates`/`sidebarCollapsed` em localStorage) | Todo o domínio: projects, clients, contacts, incidents, standaloneTasks, teamDirectory, invitedUsers, notifications, settings |
| `useAuthStore` | Não | Sessão Supabase, `profile` |
| `useToastStore` | Não | Fila de toasts |
| `useAiStore` | Não | Chave compartilhada do assistente de IA |
| `useAiChatStore` | Não | Sessão de chat corrente |
| `useCommandPaletteStore` / `useOverlayStore` | Não | UI global |

**Padrão dominante**: `sync(asyncFn, revertFn?)` — atualiza o estado local (otimista) e dispara a escrita no Supabase em paralelo; se falhar, roda `revertFn` (quando fornecido) e mostra um toast. **Esse padrão não é uniforme** — ver §8 para onde isso quebra hoje.

### Motor de datas (`utils/dateEngine.ts`, `businessDays.ts`, `criticalPath.ts`)
Compartilhado por Projeto, Incidente e tarefas soltas (a interface `PhaseScope` permite empacotar a lista plana de Entries de um Incidente numa "fase sintética" e reusar o mesmo código). Ver §6 para as regras.

### i18n
pt (padrão)/en/es via `react-i18next`. `settings.defaultLanguage` muda a UI toda; `project.language` só afeta a tradução do **nome do template** no momento da criação do projeto — não retraduz depois.

---

## 5. Banco de dados — mapeamento completo

Schema reconstruído lendo as 26 migrations em `supabase/migrations/` (estado final, não changelog). **Modelo de RLS atual: compartilhado por todo o time autenticado** (`auth.role() = 'authenticated'`) na esmagadora maioria das tabelas — não há isolamento por projeto/cliente/dono. Exceções privadas de verdade: `notifications` (só o destinatário lê/marca como lida), `ai_conversations`/`ai_messages` (por usuário), `ai_shared_key` (ninguém lê direto, só via função). As 4 tabelas do Diário (`open_points`, `meeting_logs`, `history`, `diary_comments`) ainda carregam uma política antiga `created_by = auth.uid()` nunca removida — inofensiva, porque políticas RLS do mesmo comando são somadas com OR e a política nova (`authenticated`) já é mais ampla.

### Usuários e acesso
| Tabela | Colunas-chave | RLS |
|---|---|---|
| `profiles` | `id` (=auth.users.id), `name`, `email`, `role` (`admin`\|`member`), `active` | Select aberto pra todos autenticados (é o diretório do time); update só do próprio ou por admin |
| `invited_users` | `email` (unique), `name`, `role` | Admin-only (sem update — só listar/criar/excluir) |
| `notifications` | `user_id`, `message`, `link`, `read` | Privada por `user_id`; insert aberto a qualquer autenticado (pra poder notificar outra pessoa) |

Trigger `handle_new_user()` cria o `profile` no primeiro login, consome um `invited_users` pendente (nome/papel), e já marca `active=false` se o e-mail não for `@ploomes.com` (checagem redundante à do cliente, agora também no banco). Trigger `prevent_self_privilege_escalation()` bloqueia troca de `role`/`active` por quem não é admin.

### Carteira
| Tabela | Colunas-chave |
|---|---|
| `clients` | `name`, `country`, `ploomes_link`, `status`, `owners` (jsonb), `archived` |
| `contacts` (ex-`client_contacts`) | `name`, `role`, `email`, `phone` — vínculo com cliente saiu daqui |
| `contact_clients` | N:N `contact_id`↔`client_id` |
| `client_cs_history` | `client_id`, `owner` (jsonb), `assigned_at`, `note` — "CS atual" = maior `assigned_at` (calculado no cliente) |

### Projetos
| Tabela | Colunas-chave |
|---|---|
| `projects` | `name`, `client`/`client_id` (**legado**), `pm`/`pm_member_id`, `dev_lead`/`dev_lead_member_id`, `status`, `baseline_set_at`, `charter`/`team`/`links` (jsonb), `archived`, `hidden`, `proposal_link`, `deal_link` |
| `project_clients` | N:N `project_id`↔`client_id` — **fonte real** de clientes de um projeto |
| `phases` | `project_id`, `name`, `order`, `is_unassigned` |
| `entries` | ver abaixo — tabela compartilhada por Projeto/Incidente/solta |
| `comments` | `entry_id`, `project_id`, `text`, `author_*` |
| `risks` | `description`, `probability`, `impact`, `score`, `linked_entry_ids`/`action_tasks` (jsonb) |
| `delay_log` | `entry_id`, `days`, `responsibility`, `type`, `triggered_by` |

**`entries`** (o motor de tarefas — task/milestone/meeting): `project_id`+`phase_id` (tarefa de projeto) OU `incident_id` (tarefa de incidente) OU nenhum + `client_id` opcional (tarefa solta). Datas (`planned_start/end`, `planned_date`, `baseline_*`, `actual_*`), `depends_on`/`subtasks`/`owners`/`links` (jsonb), `status`, `status_override`, `is_critical`, `hidden_from_plan`, `description`. **Sem CHECK constraint garantindo um escopo só** — regra só na aplicação.

### Diário (Projeto e/ou Incidente)
| Tabela | Escopo | Colunas-chave |
|---|---|---|
| `open_points` | `project_id` OU `incident_id` | `title`, `status`, `priority`, `owner`/`owner_user_id`, `due_date`, `linked_entry_id`, `resolution_note` |
| `meeting_logs` | só `project_id` | `title`, `date`, `participants`/`items`/`attachments` (jsonb) — **Incidente não tem Reuniões** |
| `history` | `project_id` OU `incident_id` | `event`, `title`, `detail`, `attachments` (jsonb) |
| `diary_comments` | `project_id` OU `incident_id` | `parent_type`/`parent_id` (polimórfico: open_point\|meeting\|history) |

### Sustentação
| Tabela | Colunas-chave |
|---|---|
| `incidents` | `title`, `owner` (jsonb), `status`, `status_changed_at`, `resolved_at`, `priority`, `impact`, `deadline` |
| `incident_clients` / `incident_projects` | N:N |
| `incident_stakeholders` | `incident_id`, `owner` (jsonb) |

### Outras
| Tabela | Propósito |
|---|---|
| `settings` | Linha única (`key='config'`) — feriados, idioma, formato de data, dias úteis |
| `status_report_links` | Metadados dos links públicos de relatório (arquivo em si fica no bucket `status-reports`) |
| `attachments` | **Tabela genérica** `entity_type` (`project`\|`incident`\|`entry`) + `entity_id` (sem FK real — polimórfico) + `storage_path`/`name`/`size` — mecanismo novo, substitui o padrão antigo de `attachments jsonb` embutido |
| `ai_shared_key` | Singleton, chave criptografada (pgcrypto), ninguém lê direto |
| `ai_conversations` / `ai_messages` | Histórico de chat por usuário — **existem mas não são realmente usadas** pelo fluxo atual (ver §7) |

### Storage
| Bucket | Público? | Uso |
|---|---|---|
| `project-files` | Não | Anexos (tanto o mecanismo antigo do Diário quanto o novo `attachments`) |
| `status-reports` | **Sim** | Relatórios de status compartilháveis — link funciona sem login |

### Funções (RPCs, todas `security definer`)
| Função | Quem chama | Faz o quê |
|---|---|---|
| `ai_set_key(p_key)` / `ai_clear_key()` | `authenticated`, mas só executa se `profiles.role='admin'` | Grava/apaga a chave compartilhada (criptografada) |
| `ai_get_key()` | **Só `service_role`** (só a Edge Function) | Descriptografa e retorna a chave — nunca chega no navegador |
| `ai_has_key()` | `authenticated` | Só retorna um boolean (não vaza segredo) |

---

## 6. Regras de negócio chave

1. **Cascata de datas** — mudar o fim planejado de uma tarefa empurra toda tarefa dependente (direta ou transitiva) pra começar 1 dia útil depois, recalculando o fim de cada uma pela sua própria duração. Tarefa com `actualEnd` já preenchido nunca é arrastada — trabalho concluído é imutável.
2. **Status automático** — `pending`/`in_progress`/`overdue` são derivados só de datas; `done` vem de `actualEnd`; `status='blocked'` ou `statusOverride=true` (setado automaticamente em qualquer troca manual de status) trava o auto-cálculo.
3. **Baseline vs. planejado vs. real** — baseline é uma foto congelada pra medir variância; planejado é o cronograma vivo; real (`actualStart/End`) marca quando de fato começou/terminou e imobiliza a tarefa na cascata.
4. **Dependências** — só `dependsOn: string[]`, sem tipo (sempre fim-início), sem lag/lead, sem hard/soft. Ciclo é bloqueado na UI e na importação JSON.
5. **Dias úteis** — `settings.workdays` (seg-sex ou seg-sáb) + lista explícita de feriados; toda conta de prazo passa por `businessDays.ts`.
6. **Caminho crítico** — aproximação por caminho mais longo (dias corridos a partir da EFT de cada nó), não é CPM completo (sem slack/float).
7. **`hiddenFromPlan`** — some do Plano, mas continua no Kanban do projeto (seção "internas") e em `/tasks` se tiver dono — 3 telas tratam a mesma flag de 3 jeitos diferentes.
8. **Tipos de Entry** — `task` (início+fim, `durationDays`), `milestone` (data única, sem duração), `meeting` (data única + `durationHours`, pode ser filha de uma task/milestone via `parentEntryId`).
9. **Motor compartilhado** — o mesmo pipeline de cascata/status/caminho-crítico roda idêntico pra tarefas de Projeto, de Incidente e soltas (só muda o "escopo de fases" que é passado pra dentro).
10. **Identidade de dono** — `EntryOwner.id` é aleatório a cada atribuição; a chave estável é `memberId`/`contactId`/nome — sempre usar `ownerKey()`, nunca comparar por `.id`.

---

## 7. Assistente de IA

Chat flutuante (aparece só se um admin configurou a chave) que conversa em cima dos dados reais do app via tool-calling.

- **Provedor**: OpenRouter (não Anthropic direto), usando o endpoint compatível com a Anthropic Messages API (`/api/v1/messages`) — o `@anthropic-ai/sdk` continua funcionando sem troca de biblioteca, só muda `baseURL`/auth. Modelo: `anthropic/claude-sonnet-5`.
- **Chave**: uma só, compartilhada por todo o time (não é BYOK), criptografada no banco, decifrada só dentro da Edge Function `ai-chat` (nunca chega no navegador). Só admin configura/remove.
- **Segurança das escritas**: toda tool de escrita (`isWrite: true`) **nunca executa sozinha** — o modelo só pode montar um cartão de confirmação ("Estou prestes a... É basicamente isso?"); a ação real só roda quando o usuário clica Aprovar. Tools de leitura executam na hora. Limite de 8 turnos automáticos de leitura-em-cadeia por mensagem, pra não entrar em loop.
- **Tools** (27 no total, `src/ai/tools/`): busca (`find_client`/`find_contact`/`find_incident`/`find_project`/`find_user`, sempre com desambiguação obrigatória se houver mais de 1 resultado), leitura (`list_phases`/`list_tasks`/`list_incidents`/`list_projects`/`get_project_overview`/`generate_status_report_markdown`), escrita (criar/editar cliente, contato, projeto, incidente, tarefa; mover/reordenar/promover subtarefa; reatribuir todos os projetos de um PM pra outro; extrair itens de texto/imagem colada e propor criação em lote).
- **Multimodal**: aceita colar imagem/PDF (print de erro, e-mail, chat) — o modelo identifica tarefas/incidentes mencionados e propõe criação via o mesmo gate de confirmação.
- **Observação**: existem tabelas `ai_conversations`/`ai_messages` no banco (de uma versão anterior BYOK), mas o fluxo atual não parece persistir o histórico de chat nelas de forma ativa — vale confirmar antes de assumir que conversas ficam salvas entre sessões.

---

## 8. Pontos de atenção conhecidos

Achados relevantes pra quem for mexer em tracking — confirmados lendo o código, não suposição:

- **Anexos do Diário (Pontos em aberto/Reuniões) não persistem de verdade.** O upload vai pro Storage e aparece na tela, mas a ação da store (`addDiaryAttachment`/`removeDiaryAttachment`) nunca grava a referência no banco — some no próximo reload, e o arquivo fica órfão no Storage. O mecanismo novo (`EntityAttachments`, tabela `attachments`) resolve isso corretamente, mas só está plugado em Projeto/Incidente/Tarefa — não no Diário ainda.
- **Rollback inconsistente em `sync()`** — a maioria das ações reverte o estado otimista se a escrita falhar, mas várias não: todas as ações do Diário (exceto excluir o registro-pai), histórico de CS de cliente (`addCsAssignment`/`updateCsAssignment`), e a maior parte dos vínculos/status de Incidente (`updateIncidentStatus`, vincular/desvincular cliente ou projeto, adicionar/remover stakeholder). Uma escrita que falha nesses casos deixa o estado local errado na tela, só com um toast como aviso.
- **Templates (projeto e incidente) são só locais** — vivem em `localStorage`, não em Supabase. Editar um template não propaga pra outros usuários/dispositivos, mesmo tudo mais no app sendo compartilhado pelo time.
- **Sem tempo real** — nenhuma subscription do Supabase Realtime; mudanças de outra pessoa só aparecem depois de recarregar a página.
- **Sem constraint de banco pro "escopo único" de uma tarefa** (projeto+fase XOR incidente XOR solta) — é regra só de aplicação, nada impede uma linha inconsistente via SQL direto.
- **RLS é tudo-ou-nada por time** — qualquer autenticado lê e edita qualquer projeto/cliente/incidente. Não há isolamento por dono, por cliente, nem por PM.
- **Derivação de `Project.clientId`/`client` (legado) pode ficar fora de sincronia com `clientIds[0]`** num caso específico: o editor multi-cliente do Overview reordena a lista antes de recalcular esses campos legados, então reordenar (sem remover/re-adicionar) pode deixar o campo legado apontando pro cliente errado. Baixo risco (são campos só de exibição/legado), mas vale saber que existem em paralelo.
- **Bug de rota confirmado**: importar um projeto novo via JSON navega pra `` `/project/${id}` `` (singular) — a rota real é `/projects/:id` (plural). Provavelmente dá 404.
- **Dependências mortas**: `xlsx`, `jspdf`, `html2canvas` estão no `package.json` mas não são importadas em lugar nenhum — o export XLSX está implementado (`utils/exportXlsx.ts`) mas nenhum botão chama; o "relatório em PDF" é só HTML aberto numa aba/link público, nunca um PDF de verdade.
- **Dois `DelayModal` diferentes** (`PlanPage.tsx` e `DelayLogPage.tsx`, cada um local ao próprio arquivo) — o componente compartilhado `components/ui/DelayModal.tsx` não é usado por nenhum dos dois.
- **Promoção de item de reunião pra tarefa/ponto em aberto não está implementada** — os campos (`promotedToOpenPointId`/`promotedToEntryId`) e as strings de i18n existem, mas não há botão nenhum que dispare isso em `MeetingsTab.tsx`.
- **Eventos de histórico parcialmente cobertos** — `project_created`, `name_changed`, `status_changed`, `baseline_set`, `risk_added`, `delay_logged`, `member_added` são emitidos; `meeting_held` e `open_point_resolved` existem no tipo mas nunca são disparados.

---

*Gerado por auditoria de código em 2026-09-08. Para reconferir qualquer achado, os arquivos-fonte estão citados inline; nada aqui foi copiado do `README.md` antigo sem verificação.*
