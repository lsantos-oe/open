// Documentação web da API (/api/docs) — Scalar renderizando o OpenAPI gerado do modelo.
// O guia abaixo vira a introdução da página (cada "##" vira uma seção navegável).

export const GUIDE = `
A **Open API** expõe o Open (gestão de clientes, projetos, tarefas e incidentes do time de Operações Enterprise da Ploomes)
para integrações e **agentes de IA**. Ela segue o padrão **OData v4** — o mesmo da API do Ploomes CRM — e tem um
**servidor MCP** para conectar o Claude diretamente.

- **Base OData:** \`{{ROOT}}/odata/v1\`
- **Modelo (CSDL):** \`{{ROOT}}/odata/v1/$metadata\`
- **MCP (Claude):** \`{{ROOT}}/mcp\`
- **Este contrato (OpenAPI 3.2):** \`{{ROOT}}/openapi.json\`

> A API **não muda nada no app**: ela usa as mesmas tabelas, regras de acesso e gatilhos que a tela. Tudo que você criar
> aqui aparece no Open como se tivesse sido feito pela interface — com você como autor.

## Começando em 3 passos

**1. Pegue a sua User-Key** em [{{ROOT}}/minha-chave]({{ROOT}}/minha-chave) — entre com a mesma conta Google do Open e
clique em *Copiar*. É uma chave por pessoa (formato \`ouk_...\`), como a User-Key do Ploomes.

**2. Teste quem você é** — a chave vai no header \`User-Key\`:

\`\`\`bash
curl -H "User-Key: SUA_USER_KEY" {{ROOT}}/odata/v1/Me
\`\`\`

**3. Faça a primeira consulta** — minhas tarefas atrasadas:

\`\`\`bash
curl -G -H "User-Key: SUA_USER_KEY" "{{ROOT}}/odata/v1/Tasks" \
  --data-urlencode "\$filter=IsOverdue and Owners/any(o: o/UserId eq SEU_USER_ID)" \
  --data-urlencode "\$select=Id,Name,DueDate,Status" \
  --data-urlencode "\$expand=Project(\$select=Name)"
\`\`\`

Use o botão **Test Request** em qualquer operação desta página: informe a chave em *Authentication* (User-Key).

## Autenticação

Toda chamada à API OData exige o header **\`User-Key: <sua chave>\`** — o mesmo modelo da API do Ploomes. O MCP aceita
a mesma chave **ou** o login do conector do Claude (veja *MCP*). Só \`/health\`, \`/docs\`, \`/openapi.json\`,
\`/minha-chave\` e as rotas do login (\`/oauth/*\`, \`/.well-known/*\`) são abertos.

- **Uma chave por pessoa**, com **o mesmo acesso que ela tem no Open**: lê e grava o que pode na tela; funções de
  administrador só para quem é admin no app.
- **Onde pegar:** página [/minha-chave]({{ROOT}}/minha-chave) (login Google do Open). A chave pode ser vista e copiada de
  novo a qualquer momento — fica guardada **cifrada** no banco.
- **Trocar a chave:** botão *Gerar nova chave* na mesma página. A anterior para de funcionar **na hora** — atualize
  Claude, n8n e scripts.
- **Automações** (n8n, agentes autônomos): use a chave de um **usuário-robô** (ex.: \`open-bot@ploomes.com\`, que precisa
  existir no Open). Um admin gera com \`POST {{ROOT}}/admin/user-keys/rotate\` \`{"Email": "open-bot@ploomes.com"}\`.
- **Na API OData não use \`Authorization: Bearer\`** — ela responde 401 explicando que o header é \`User-Key\`.

**Segurança aplicada a cada requisição:** chave existente; conta **@ploomes.com** com acesso **ativo** no Open (usuário desligado perde
acesso na hora); limite de **120 requisições/minuto** por pessoa (\`429\` + \`Retry-After\`); auditoria de toda
chamada (sem o corpo). Nunca coloque a chave em URL, código versionado ou prints.

## Lendo dados (OData)

Cada recurso é um *entity set*: \`Clients\`, \`Contacts\`, \`Projects\`, \`Phases\`, \`Tasks\`, \`Comments\`, \`Incidents\`,
\`Risks\`, \`DelayLogs\`, \`OpenPoints\`, \`Meetings\`, \`History\`, \`Users\`, \`Notifications\`, \`CsAssignments\`,
\`IncidentStakeholders\`, \`ClientGroups\` (grupos de clientes) e \`DocumentationItems\` (documentação).

| Opção | Exemplo |
|---|---|
| \`$filter\` | \`Status eq 'InProgress' and DueDate lt 2026-11-01\` |
| \`$select\` | \`Id,Name,Status\` |
| \`$expand\` | \`Phases($orderby=Order;$expand=Tasks($select=Name,Status))\` (até 2 níveis) |
| \`$orderby\` | \`DueDate asc, Name desc\` |
| \`$top\` / \`$skip\` | padrão 50, máximo 200; siga \`@odata.nextLink\` |
| \`$count\` | \`$count=true\` → \`@odata.count\`; ou \`GET /Tasks/$count\` |
| \`$search\` | \`$search=kickoff acme\` (todas as palavras) |

**Operadores do \`$filter\`:** \`eq ne gt ge lt le in\`, \`and or not\`, parênteses; funções \`contains\`, \`startswith\`,
\`endswith\`, \`tolower\`, \`toupper\`, \`trim\`, \`length\`, \`year\`, \`month\`, \`day\`, \`now()\`, \`date()\`;
navegação (\`Project/Status eq 'InProgress'\`); coleções com \`any\`/\`all\`:

\`\`\`text
Owners/any(o: o/UserId eq 7f1c...-...)             -- pessoas por UserId (veja GET /Users)
Owners/any(o: o/Kind eq 'Validator' and o/UserId eq 7f1c...)
Clients/any(c: c/Name eq 'ACME')                    -- em Projects/Incidents
DependsOn/any(d: d eq 9a2b...)                      -- tarefas que dependem de outra
\`\`\`

**Enums** aceitam o nome (\`'InProgress'\`), o nome qualificado (\`Open.TaskStatus'InProgress'\`) ou o valor do app
(\`'in_progress'\`). Textos usam aspas simples (\`'d''Avila'\` escapa aspas). Guids e datas vão sem aspas.

**Campos calculados** (iguais aos da tela, no fuso de São Paulo): \`Tasks.IsOverdue\`, \`DaysOverdue\`, \`IsStalled\` (5+ dias
sem atividade), \`DueDate\`, \`Scope\`; \`Projects.Progress\`, \`OverdueCount\`, \`GoLiveDate\`, \`PlannedEnd\`, \`VarianceDays\`
e \`IsDelayed\` (os dois últimos não são filtráveis); \`Incidents.AgeDays\`, \`DaysInStatus\`, \`IsOverdue\`.

### Códigos curtos

Cada cliente, projeto, incidente, tarefa, contato, grupo, risco e item de documentação tem um **\`Code\`** legível: a
letra da entidade + ano com 2 dígitos + sequência de 6 dígitos — \`C26000123\`. **C** cliente, **P** projeto, **I** incidente,
**T** tarefa/marco/reunião, **K** contato, **G** grupo de clientes, **R** risco, **D** documentação. O código não muda e
convive com o \`Id\` (Guid), que continua sendo a chave. O link curto \`<app>/r/<código>\` abre o registro no app.

\`\`\`bash
# achar pelo código (qualquer entity set tem Code)
curl -G -H "User-Key: SUA_USER_KEY" "{{ROOT}}/odata/v1/Clients" --data-urlencode "\$filter=Code eq 'C26000123'"
# ou resolver sem saber o tipo: devolve o registro e o link do app
curl -H "User-Key: SUA_USER_KEY" "{{ROOT}}/odata/v1/Open.ResolveCode(code='D26000045')"
\`\`\`

### Grupos de clientes e documentação (somente leitura)

\`ClientGroups\` reúne 2 ou mais clientes (ex.: empresas do mesmo conglomerado): \`ClientIds\` são os membros e
\`ContactIds\` os contatos colocados **direto no grupo** — eles ficam ligados a **todos** os clientes membros. Um cliente
só participa de um grupo, salvo se a configuração do sistema permitir vários; com menos de 2 clientes o app só avisa
(\`BelowMinimum\`). Navegações: \`Clients\`, \`Contacts\`, \`Projects\`, \`Incidents\`, \`Documentation\`.

\`DocumentationItems\` traz links, arquivos e textos, cada um com público (\`Audience\`: Technical, Executive ou Both) e
\`Tags\`. \`Source=Direct\` são itens colocados direto na aba Documentação de um projeto ou cliente;
\`Source=Task\` são os links e anexos das tarefas de documentação do projeto (espelhados; \`TaskId\` aponta a tarefa).
Arquivos não são baixados pela API (\`HasFile\`): abra pelo link do app.

\`\`\`text
GET /ClientGroups?\$expand=Clients(\$select=Id,Name)            -- grupos com os membros
GET /ClientGroups(<id>)/Documentation?\$filter=Audience ne 'Technical'   -- documentação executiva do grupo
GET /DocumentationItems?\$filter=ProjectId eq <id> and Tags/any(t: tolower(t) eq 'api')
GET /Clients(<id>)/Groups                                     -- em que grupo o cliente está
\`\`\`

### Consultas longas: QUERY e $query

Filtros grandes ficam ilegíveis na URL. Mande as opções no corpo — mesmo resultado do GET:

\`\`\`bash
# padrão OData 4.01 (funciona em qualquer cliente)
curl -X POST {{ROOT}}/odata/v1/Tasks/\\$query -H "User-Key: SUA_USER_KEY" -H "Content-Type: application/json" \\
  -d '{"filter": "Scope eq '\\''Project'\\'' and IsOverdue", "select": "Id,Name,DueDate", "orderby": "DueDate", "top": 100}'

# método HTTP QUERY (rascunho IETF; alguns proxies ainda bloqueiam)
curl -X QUERY {{ROOT}}/odata/v1/Tasks -H "User-Key: SUA_USER_KEY" -H "Content-Type: application/json" -d '{"filter":"IsStalled"}'
\`\`\`

## Gravando dados

| Verbo | Rota | O quê |
|---|---|---|
| POST | \`/{Set}\` | cria (201 + \`Location\`) |
| PATCH | \`/{Set}({Id})\` | altera só os campos enviados |
| POST | \`/{Set}({Id})/Open.{Ação}\` | operação de negócio (mudar status, datas, vincular...) |
| POST | \`/Open.Intake\` | cadastro em lote (veja abaixo) |

Pessoas são referenciadas por **e-mail ou UserId** — nunca por nome:
\`"Owners": [{"Email": "bruno@ploomes.com", "Kind": "Executor"}, {"Email": "ana@ploomes.com", "Kind": "Validator"}]\`.
Contatos de cliente: \`{"ContactId": "..."}\`; texto livre: \`{"Name": "Fornecedor X"}\`.

**Regras de negócio aplicadas (as mesmas da tela):** toda tarefa tem executor; tarefa de projeto tem fase; fim ≥ início;
mudança de data **empurra as dependentes** em dias úteis (com feriados), recalcula caminho crítico e etapa automática;
mudar etapa preenche início/fim real; entrar em *Validation* avisa o validador; novos responsáveis são notificados (e
recebem DM no Discord, pelo gatilho do app); histórico do projeto/incidente é registrado; textos colaborativos
(Overview, Notes, Description de incidente) são substituídos com segurança.

**Cabeçalhos úteis:**

- \`Prefer: dry-run\` — executa tudo e **desfaz**: devolve o resultado como seria, sem gravar (\`@open.dryRun: true\`).
- \`Idempotency-Key: <uuid>\` — reenviar a mesma escrita não duplica (devolve a resposta original).
- \`If-Match: <ETag>\` — trava otimista: se alguém alterou o registro depois do seu GET, responde \`412\`.
- \`Prefer: return=minimal\` — PATCH responde 204 sem corpo.

**Exemplo — criar uma tarefa com dependência:**

\`\`\`bash
curl -X POST {{ROOT}}/odata/v1/Tasks -H "User-Key: SUA_USER_KEY" -H "Content-Type: application/json" \\
  -H "Idempotency-Key: 6f1d2c1e-tarefa-levantamento" \\
  -d '{"Name":"Levantamento de requisitos","ProjectId":"...","PhaseId":"...",
       "Owners":[{"Email":"bruno@ploomes.com"}],"PlannedStart":"2026-11-03","DurationDays":5,"DependsOn":["..."]}'
\`\`\`

**Exemplo — adiar uma entrega registrando o atraso:**

\`\`\`bash
curl -X POST "{{ROOT}}/odata/v1/Tasks(ID)/Open.ChangeDates" -H "User-Key: SUA_USER_KEY" -H "Content-Type: application/json" \\
  -d '{"PlannedEnd":"2026-11-14","Delay":{"Description":"Cliente atrasou os acessos","Responsibility":"ClientIt","Type":"Execution"}}'
\`\`\`

A resposta lista \`AffectedTaskIds\` (as dependentes que foram empurradas) e \`DelayDays\` (dias úteis).

**Não disponível nesta versão:** apagar projetos/tarefas/clientes (use \`Open.Archive\` onde existir), editar subtarefas,
anexos e retrospectivas.

## Intake: cadastrar demandas em lote

Feito para agentes de IA transformarem um e-mail, ata ou planilha em registros. Envie uma lista de itens
(\`Client\`, \`Project\` com fases e tarefas, \`Incident\`, \`Task\`) ligados por \`Ref\`:

\`\`\`json
{
  "DryRun": true,
  "Items": [
    {"Kind": "Client", "Ref": "c1", "Name": "ACME Ltda", "Country": "BR", "Status": "Implantacao"},
    {"Kind": "Project", "Ref": "p1", "Name": "Implantação ACME", "Pm": {"Email": "ana@ploomes.com"},
     "ClientRefs": ["c1"], "StartDate": "2026-11-03",
     "Phases": [{"Name": "Kickoff", "Tasks": [{"Ref": "t1", "Name": "Reunião de kickoff", "Type": "Meeting"}]},
                {"Name": "Configuração", "Tasks": [{"Ref": "t2", "Name": "Configurar funis", "DurationDays": 5, "DependsOn": ["t1"]}]}]},
    {"Kind": "Incident", "Title": "Integração parada", "Priority": "High", "Impact": "High",
     "Owner": {"Email": "bruno@ploomes.com"}, "ClientRefs": ["c1"]}
  ]
}
\`\`\`

1. **\`DryRun: true\` (padrão)** simula tudo e devolve o \`Plan\` (o que será criado, reaproveitado ou é ambíguo) e um
   \`Summary\` em português ("Estou prestes a criar...") para mostrar à pessoa.
2. Clientes/projetos com **o mesmo nome** são reaproveitados; nomes **parecidos** viram \`Ambiguous\` com \`Candidates\`
   — informe \`Id\` de um candidato ou \`ForceCreate: true\`.
3. Confirmado, repita com **\`DryRun: false\`** e um \`Idempotency-Key\`. Tudo é gravado numa transação: ou entra tudo,
   ou nada. A resposta traz os Ids e os links do app.

Com \`StartDate\`, as datas das tarefas são calculadas pelas durações (dias úteis) e dependências. Com \`TemplateId\`
(veja *Templates*), a estrutura vem do template.

## MCP (Claude)

O endpoint \`{{ROOT}}/mcp\` é um servidor **MCP Streamable HTTP**. Ele oferece as mesmas operações desta API como
*tools* (\`search\`, \`odata_query\`, \`list_tasks\`, \`create_task\`, \`intake_preview\`, \`intake_commit\`...; e, para grupos e documentação,
\`list_client_groups\`, \`get_client_group\`, \`list_documentation\` e \`resolve_code\`), *resources*
(\`open://projects/{id}\`, \`open://guide/model\`...) e *prompts* (\`cadastrar_demanda\`, \`status_report\`, \`minha_semana\`...).

**Plugin do Open (recomendado):** instale o plugin no Claude e, na aba **Conectores**, clique em **Vincular** → entre com
o Google do Open → **Permitir**. Sem chave: o Claude recebe um acesso seu, que expira e se renova sozinho (OAuth 2.1),
e pode ser desligado em [/minha-chave]({{ROOT}}/minha-chave) → *Desconectar apps*. No Claude Code: \`/mcp\` → **open** →
**Authenticate**. O plugin também traz uma skill e comandos prontos (\`/open:minha-semana\`, \`/open:status-projeto\`...).

**Claude Code com a chave** (sem o plugin):

\`\`\`bash
claude mcp add --transport http open {{ROOT}}/mcp --header "User-Key: SUA_USER_KEY"
\`\`\`

As tools de escrita simulam por padrão (\`dryRun: true\`) e só gravam quando chamadas de novo com \`dryRun: false\` —
o Claude mostra o resumo e pede sua confirmação antes.

## Erros

Formato OData: \`{"error": {"code", "message", "target", "details", "innererror": {"requestId"}}}\`.

| Status | Quando |
|---|---|
| 400 | sintaxe de \`$filter\`, payload inválido (\`details\` traz cada campo) |
| 401 | User-Key ausente, inválida ou trocada (ou uso de Bearer na API OData); no MCP, login expirado |
| 403 | usuário desativado ou ação só de administrador |
| 404 | registro não existe (ou você não tem acesso) |
| 409 | regra de negócio (dependência circular, intake ambíguo...) |
| 412 | \`If-Match\` desatualizado |
| 422 | \`Idempotency-Key\` reutilizada com outro corpo |
| 429 | limite de requisições (\`Retry-After\`) |
| 503 | escrita temporariamente desligada |

## Glossário

| Enum | Valores |
|---|---|
| TaskStatus | Pending (Backlog), Todo, InProgress, Validation, Done, Blocked |
| TaskType | Task, Milestone (marco), Meeting (reunião) |
| TaskScope | Project, Incident, Standalone (avulsa) |
| ProjectStatus | Backlog, Planning, InProgress, Done |
| ClientStatus | PreVenda, Implantacao, SustentacaoNovosProjetos |
| IncidentStatus | Open, InProgress, WaitingOnClient, Resolved, Closed |
| Level (prioridade/impacto) | Low, Medium, High |
| DocKind | Link, File, Text |
| DocAudience | Technical, Executive, Both |
| DocSource | Direct, Task |
| RiskFlag | None, Warning, Critical |

*Atraso não é etapa*: uma tarefa em qualquer etapa pode estar atrasada (\`IsOverdue\`). Datas são \`YYYY-MM-DD\`;
"hoje" é calculado no fuso de São Paulo.
`;

export const TAG_DOCS: Record<string, string> = {
  "Autenticação":
    "Header `User-Key` (como na API do Ploomes), a sua chave e o modelo OData ($metadata). O MCP também aceita o login OAuth do conector do Claude (`/oauth/*`).",
  Tasks:
    "Mude a etapa com `Open.SetStatus` e as datas com `Open.ChangeDates` (cascata nas dependentes). PATCH também aceita `Status` e datas, com as mesmas regras.",
  Projects: "POST aceita a estrutura completa (Phases → Tasks com Ref/DependsOn) ou um `TemplateId` + `StartDate`.",
  Incidents: "Status muda por `Open.SetStatus` (ou PATCH Status) e avisa owner e stakeholders.",
  ClientGroups:
    "Somente leitura. Contatos em `ContactIds` ficam ligados a todos os clientes membros. Um cliente só em um grupo, salvo configuração. Veja *Grupos de clientes e documentação* na introdução.",
  DocumentationItems:
    "Somente leitura. `Source=Direct` (aba do projeto/cliente) ou `Task` (links e anexos das tarefas de documentação). Público: Technical, Executive, Both.",
};

/** Ícone do Open (mesmo do app: public/favicon.svg). */
const OPEN_ICON_PATH =
  "M50 0C77.61 0 100 22.39 100 50C100 77.61 77.61 100 50 100C22.39 100 0 77.61 0 50C0 22.39 22.39 0 50 0ZM50 20C33.43 20 20 33.43 20 50C20 66.57 33.43 80 50 80C64.5 80 76.5 69.7 79.3 56L40 56C38 56 36 54 36 52L36 44C36 42 38 40 40 40L79.3 40C76.5 28.3 64.5 20 50 20Z";
const FAVICON = `data:image/svg+xml,${
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="#E65100" fill-rule="evenodd" d="${OPEN_ICON_PATH}"/></svg>`)
}`;

/** Identidade visual do app (src/index.css): laranja OE, neutros quentes, barra lateral escura, cantos 10/14px. */
const APP_THEME_CSS = `
:root { --scalar-custom-header-height: 56px; }
.light-mode, .dark-mode {
  --scalar-font: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
  --scalar-radius: 6px; --scalar-radius-lg: 10px; --scalar-radius-xl: 14px;
  --scalar-sidebar-background-1: #18140F;
  --scalar-sidebar-color-1: #FFFFFF;
  --scalar-sidebar-color-2: rgba(255,255,255,0.6);
  --scalar-sidebar-color-active: #FFFFFF;
  --scalar-sidebar-border-color: rgba(255,255,255,0.08);
  --scalar-sidebar-item-hover-background: rgba(255,255,255,0.06);
  --scalar-sidebar-item-hover-color: #FFFFFF;
  --scalar-sidebar-item-active-background: rgba(255,255,255,0.09);
  --scalar-sidebar-search-background: rgba(255,255,255,0.06);
  --scalar-sidebar-search-border-color: rgba(255,255,255,0.08);
  --scalar-sidebar-search-color: rgba(255,255,255,0.6);
}
.light-mode {
  --scalar-color-1: #1C1815; --scalar-color-2: #5A5347; --scalar-color-3: #8A8177;
  --scalar-color-accent: #D9530E;
  --scalar-background-1: #FBFAF8; --scalar-background-2: #FFFFFF; --scalar-background-3: #F5F2EE;
  --scalar-background-accent: #FBEAE0;
  --scalar-border-color: #E8E3DC;
  --scalar-color-green: #1A8850; --scalar-color-red: #D14343; --scalar-color-yellow: #A8790A;
  --scalar-color-blue: #3568C4; --scalar-color-orange: #D9530E; --scalar-color-purple: #5B21B6;
}
.dark-mode {
  --scalar-color-1: #F2EEE8; --scalar-color-2: #C7BFB2; --scalar-color-3: #93897B;
  --scalar-color-accent: #E8642A;
  --scalar-background-1: #131110; --scalar-background-2: #1C1815; --scalar-background-3: #292319;
  --scalar-background-accent: rgba(217, 83, 14, 0.18);
  --scalar-border-color: #322C24;
  --scalar-color-green: #3FBE80; --scalar-color-red: #E5716A; --scalar-color-yellow: #D6A93B;
  --scalar-color-blue: #6C97DE; --scalar-color-orange: #E8642A; --scalar-color-purple: #A78BFA;
}
/* Respostas: só as abas por código de status (painel da direita), sem a lista repetida na coluna da esquerda. */
/* (classe repetida para vencer o "block!" do próprio Scalar) */
.operation-details div:has(> .responses-title--tree),
.responses-title--tree.responses-title--tree.responses-title--tree,
.responses-list--tree.responses-list--tree.responses-list--tree { display: none !important; }
/* Sem propaganda do Scalar (gerar SDK/MCP deles): o MCP do Open já está em /api/mcp. */
.explore-scalar.explore-scalar, .generate-sdk-button.generate-sdk-button, .selected-client-action.selected-client-action { display: none !important; }
/* Campo da chave: sem o texto de brincadeira que o Scalar põe como placeholder. */
.scalar-app input[type="password"]::placeholder { color: transparent; }
`;

export function docsHtml(root: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Open API — Documentação</title>
  <meta name="description" content="Documentação da Open API (OData v4) e do servidor MCP." />
  <link rel="icon" href="${FAVICON}" />
  <style>
    :root { --oe:#D9530E; --bar:#18140F; --bar-text:rgba(255,255,255,0.72); --bar-line:rgba(255,255,255,0.08); }
    body { margin: 0; }
    .oe-bar { position: fixed; top: 0; left: 0; right: 0; height: 56px; z-index: 1000; display: flex; align-items: center;
      gap: 16px; padding: 0 16px; background: var(--bar); border-bottom: 1px solid var(--bar-line);
      font: 14px/1 -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; color: #fff; box-sizing: border-box; }
    .oe-brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 16px; color: #fff; text-decoration: none; }
    .oe-brand small { font-weight: 500; font-size: 13px; color: var(--bar-text); padding-left: 10px; border-left: 1px solid var(--bar-line); }
    .oe-links { display: flex; gap: 4px; margin-left: auto; align-items: center; }
    .oe-links a, .oe-theme { color: var(--bar-text); text-decoration: none; padding: 8px 12px; border-radius: 10px;
      border: 1px solid transparent; background: none; font: inherit; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
    .oe-links a:hover, .oe-theme:hover { color: #fff; background: rgba(255,255,255,0.08); }
    .oe-links a.primary { background: var(--oe); color: #fff; }
    .oe-links a.primary:hover { background: #B8440A; }
    .oe-theme { border-color: var(--bar-line); }
    .oe-theme svg { width: 16px; height: 16px; }
    @media (max-width: 640px) { .oe-brand small, .oe-hide-sm { display: none; } }
  </style>
</head>
<body>
  <header class="oe-bar">
    <a class="oe-brand" href="${root}/docs">
<span style="font-weight:800;letter-spacing:-0.01em">op<span style="color:var(--oe)">en</span></span> <small>API e MCP</small>
    </a>
    <nav class="oe-links">
      <a class="oe-hide-sm" href="${root}/openapi.json" target="_blank" rel="noopener">OpenAPI</a>
      <a class="primary" href="${root}/minha-chave">Minha chave</a>
      <button class="oe-theme" id="oe-theme" type="button" aria-label="Alternar tema claro/escuro" title="Alternar tema claro/escuro">
        <svg id="oe-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        <svg id="oe-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
        <span id="oe-theme-label">Tema</span>
      </button>
    </nav>
  </header>
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.75.1/dist/browser/standalone.js"></script>
  <script>
    // Tema: o escolhido fica salvo neste navegador; na primeira visita segue o sistema.
    let saved = null;
    try { saved = localStorage.getItem('colorMode'); } catch (e) {}
    const startDark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    function paint(dark) {
      document.body.classList.toggle('dark-mode', dark);
      document.body.classList.toggle('light-mode', !dark);
      document.getElementById('oe-icon-sun').style.display = dark ? '' : 'none';
      document.getElementById('oe-icon-moon').style.display = dark ? 'none' : '';
      document.getElementById('oe-theme-label').textContent = dark ? 'Claro' : 'Escuro';
      try { localStorage.setItem('colorMode', dark ? 'dark' : 'light'); } catch (e) {}
    }
    Scalar.createApiReference('#app', {
      url: ${JSON.stringify(`${root}/openapi.json`)},
      theme: 'none',
      layout: 'modern',
      darkMode: startDark,
      hideDarkModeToggle: true,
      customCss: ${JSON.stringify(APP_THEME_CSS)},
      withDefaultFonts: false,
      showSidebar: true,
      defaultOpenAllTags: false,
      operationsSorter: 'method',
      documentDownloadType: 'json',
      defaultHttpClient: { targetKey: 'shell', clientKey: 'curl' },
      authentication: { preferredSecurityScheme: 'userKey' },
      agent: { disabled: true },
      showDeveloperTools: 'never',
      hideClientButton: false,
      metaData: { title: 'Open API — Documentação' },
    })
    paint(startDark);
    document.getElementById('oe-theme').addEventListener('click', () => paint(!document.body.classList.contains('dark-mode')));
  </script>
</body>
</html>`;
}
