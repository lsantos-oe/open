# Open API (OData v4) + MCP

API para integrações e agentes de IA acessarem o Open, no padrão **OData v4** (o mesmo da API do Ploomes CRM), mais um
**servidor MCP** para conectar o Claude e um **plugin do Claude** pronto para o time. Roda como a Supabase Edge Function
`api`, publicada no endereço do próprio app: `https://openploo.vercel.app/api`.

> **Documentação interativa** (todas as rotas, exemplos e "Try it"): `https://openploo.vercel.app/api/docs`
> — gerada automaticamente do modelo (`/api/openapi.json`, OpenAPI 3.2 — inclui o método QUERY —, renderizado com Scalar).

- [Princípios](#princípios)
- [Arquitetura](#arquitetura)
- [Rodando localmente](#rodando-localmente)
- [Deploy](#deploy)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Segurança](#segurança)
- [Testes](#testes)
- [Guia rápido de uso](#guia-rápido-de-uso)
- [MCP e plugin do Claude](./mcp.md)
- [Estendendo a API](#estendendo-a-api)

## Princípios

1. **Não altera o app.** Nenhum arquivo de `src/` nem tabela/policy/função/trigger existente é modificado. O que é novo no
   banco vive no schema `open_api` (User-Keys, login OAuth do conector, auditoria, idempotência, rate limit, templates),
   que não é exposto pelo PostgREST nem acessível por `anon`/`authenticated`. Única alteração fora da pasta da API: novas
   regras no `vercel.json` (encaminham `/api/*` e a descoberta OAuth para a função).
2. **Como o usuário.** Toda leitura/escrita roda numa transação com `set local role authenticated` + as claims de quem
   está chamando (dono da User-Key ou do login do conector). O RLS, o `auth.uid()` e os triggers do app (notificações, menções, fila do Discord, documentos colaborativos)
   funcionam exatamente como na tela — e com a autoria certa.
3. **Mesmas regras da tela.** As funções puras do app (`dateEngine`, `statusCalc`, `criticalPath`, `businessDays`,
   `signals`, `projectStats`) são **copiadas** para `supabase/functions/api/domain/` por `tools/sync-domain.ts`, com o
   hash da origem. O CI falha se o app mudar e a cópia não for refeita.
4. **Transação única.** Cada escrita (inclusive um projeto inteiro com fases e tarefas, ou um intake com vários itens)
   grava tudo ou nada.

## Arquitetura

```
supabase/functions/api/
  index.ts            entrada (Deno.serve) + descoberta OAuth na raiz do domínio
  app.ts              Hono: CORS, auth, rate limit, auditoria, erros; rotas /odata/v1, /mcp, /oauth, /docs, /openapi.json
  docs.ts             guia + página Scalar
  keypage.ts          página /minha-chave (ver, copiar e trocar a User-Key; desconectar apps)
  oauthpage.ts        telas do "Vincular" (login e consentimento)
  lib/                config, db (withUser), auth (User-Key, sessão, token OAuth), userkeys (Vault), oauth (servidor
                      OAuth 2.1), context (hoje em SP, settings), errors, idempotency
  odata/
    edm.ts            tipos do modelo, enums e tipos complexos
    entities.ts       entity sets ↔ tabelas do app (colunas, calculados, navegações)
    filter.ts         lexer/parser de $filter, $orderby, $expand, $select...
    sql.ts            AST → SQL parametrizado (whitelist do modelo)
    read.ts           coleção, entidade, navegação, $expand (lateral join), paginação, serialização
    actions.ts        catálogo de escritas (POST/PATCH) e actions/functions OData
    router.ts         roteamento OData (GET/POST/PATCH/DELETE/QUERY, $query, $count, $metadata)
    csdl.ts           $metadata (CSDL XML)
    openapi.ts        OpenAPI 3.2
  services/           regras de negócio: tasks, projects, clients, incidents, diary, intake, search, insights,
                      templates, shared
  mcp/                servidor MCP (tools, resources, prompts) e textos
  domain/             cópia gerada das funções puras do app (não editar)
  tools/              sync-domain.ts, issue-user-key.ts, test-local.ts, stress.ts
  tests/              unitários (odata.test.ts) e integração (api, mcp, oauth, security, fidelity, concurrency)
supabase/migrations/20261021190000_open_api_schema.sql
claude-plugin/        plugin do Claude (conector + skill + comandos) — veja mcp.md
vercel.json           /api/* e /.well-known/* (OAuth) → função
```

## Rodando localmente

Pré-requisitos: [Deno 2](https://deno.com) e acesso a um banco de **staging** (nunca produção).

```bash
cd supabase/functions/api
# arquivo de ambiente FORA do repositório, ex.: ../../../../staging/api.env
#   API_DB_URL=postgresql://postgres.<ref>:<senha>@aws-0-<região>.pooler.supabase.com:5432/postgres
#   API_TOKEN_PEPPER=qualquer-coisa-local
#   APP_URL=http://localhost:5173
#   PORT=8787
#   API_PUBLIC_URL=http://localhost:8787/api
deno run -A --watch --env-file=<caminho>/api.env index.ts
# sua User-Key (o usuário precisa existir em profiles):
deno run -A --env-file=<caminho>/api.env tools/issue-user-key.ts --email voce@ploomes.com
```

Abra `http://localhost:8787/api/docs`.

## Deploy

> **Nunca use `supabase db push` neste projeto**: o histórico de migrations do banco não bate com o repositório e o push
> tentaria reaplicar tudo. Aplique só a migration nova, revisada, pelo SQL editor ou `psql -f`.

1. Banco: aplicar `supabase/migrations/20261021190000_open_api_schema.sql` (cria apenas o schema `open_api`).
2. Secrets da função:
   ```bash
   npx supabase secrets set --project-ref <ref> API_TOKEN_PEPPER=<aleatório-longo> \
     API_PUBLIC_URL=https://openploo.vercel.app/api APP_URL=https://openploo.vercel.app API_WRITE_ENABLED=false
   ```
   (`SUPABASE_DB_URL`, `SUPABASE_URL` e `SUPABASE_ANON_KEY` já são injetadas pelo Supabase.)
3. Função (o gateway não valida JWT; a função valida a `User-Key` ou o token OAuth):
   ```bash
   npx supabase functions deploy api --no-verify-jwt --project-ref <ref>
   ```
   Recomendado ao mantenedor: adicionar `[functions.api] verify_jwt = false` em `supabase/config.toml` para deploys futuros
   não esquecerem a flag (não foi feito aqui para não alterar arquivos existentes).
4. **Endereço público do Open** (esconde o provedor): o `vercel.json` encaminha `https://openploo.vercel.app/api/*` para a
   função (o merge na `main` publica isso). Configure também:
   - em Authentication → URL Configuration → Redirect URLs: `https://openploo.vercel.app/api/minha-chave` e
     `https://openploo.vercel.app/api/oauth/callback` (login do "Vincular" do conector do Claude);
   - o `vercel.json` também encaminha três endereços de descoberta OAuth na raiz do domínio
     (`/.well-known/oauth-authorization-server/api`, `/.well-known/openid-configuration/api`,
     `/.well-known/oauth-protected-resource/api/*`) — os apps do Claude procuram o servidor de login ali.
   A página `/minha-chave` não carrega biblioteca nem endereço do provedor de login: o navegador fala só com
   `/api/auth/google` e `/api/user-key`. (Durante o login Google o navegador ainda passa pelo domínio do provedor, como no
   login do próprio app; esconder isso exige domínio próprio de autenticação.)
5. Rollout: comece com `API_WRITE_ENABLED=false` (só leitura), libere escrita para pilotos, depois para o time.
   Rollback: `API_WRITE_ENABLED=false` ou remover a função — o app não lê `open_api`.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `SUPABASE_DB_URL` / `API_DB_URL` | sim | Postgres (pooler). Na Edge Function vem do Supabase; local usa `API_DB_URL`. |
| `API_TOKEN_PEPPER` | sim | Segredo misturado ao hash das User-Keys. Trocar invalida todas (cada pessoa gera de novo). |
| `APP_URL` | não | URL do app para links (padrão `https://openploo.vercel.app`). |
| `API_WRITE_ENABLED` | não | `false` = somente leitura (kill switch). |
| `API_ALLOWED_ORIGINS` | não | CORS para browsers (vírgula). Vazio = nenhum (agentes não precisam). |
| `API_RATE_LIMIT` | não | Requisições/minuto por pessoa (padrão 120). |
| `API_PUBLIC_URL` | sim (produção) | URL pública: `https://openploo.vercel.app/api`. Links `@odata.*`, docs, OpenAPI e a página usam este endereço. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | sim (login) | Usadas só no servidor para o login Google (página `/minha-chave` e "Vincular"); injetadas na Edge Function. Nunca vão para o navegador. |

## Segurança

- **Header `User-Key`** (como na API do Ploomes): uma chave por pessoa (`ouk_` + 40 caracteres), com o mesmo acesso dela
  no Open (admin só para admins do app). Busca por hash; valor **cifrado no Supabase Vault** para a pessoa ver de novo em
  `/minha-chave`. Trocar a chave invalida a anterior na hora. Na API OData, `Authorization: Bearer` é recusado com
  orientação.
- **OAuth 2.1 só no MCP** (botão "Vincular" do conector/plugin do Claude): registro dinâmico de cliente (ou CIMD),
  PKCE S256 obrigatório, código de uso único (5 min), access token opaco de 1 h e refresh rotativo de 30 dias (reuso de
  refresh já trocado revoga a família), tokens presos ao recurso `…/api/mcp` e guardados só como hash
  (`open_api.oauth_*`). A pessoa entra com o login Google do Open (ou a própria User-Key) e aprova numa tela de
  consentimento; "Desconectar apps" em `/minha-chave` revoga tudo. O token OAuth não abre a API OData.
- Automações usam a chave de um usuário-robô (admin gera em `POST /admin/user-keys/rotate`).
- A cada requisição: dono ativo em `profiles` (usuário desligado perde acesso na hora, mesmo que o RLS do app não cheque
  isso), rate limit e auditoria em `open_api.request_log` (sem corpo; retenção de 90 dias).
- SQL sempre parametrizado; identificadores só do modelo (whitelist). Payloads validados com zod (`strict`).
- Escrita: `Prefer: dry-run`, `Idempotency-Key`, `If-Match` (ETag = `xmin`), sem DELETE de entidades de negócio.
- MCP: conteúdo do Open devolvido entre `<open_data>` (defesa contra prompt injection), escritas simulam por padrão.

## Testes

### Bateria completa com um comando (recomendado)

```bash
cd supabase/functions/api
deno run -A --env-file=<caminho>/api.env tools/test-local.ts        # tudo
deno run -A --env-file=<caminho>/api.env tools/test-local.ts mcp    # só os arquivos com "mcp" no nome
```

O `test-local.ts`:

1. **recusa a URL de produção** (os testes gravam dados);
2. aplica o seed de teste (`tests/fixtures/seed.sql`: usuários Ana/admin, Bruno, Carla/inativa, cliente, projeto, fases,
   tarefas e incidente fictícios — idempotente);
3. gera User-Keys para os usuários de teste (admin, membro, inativo, chave trocada);
4. sobe a API numa porta livre;
5. roda todos os `tests/*.test.ts`;
6. troca as chaves de teste e derruba a API.

| Arquivo | O que valida |
|---|---|
| `odata.test.ts` | parser de `$filter`/`$expand`, tradução para SQL, proteção contra injeção, `$metadata`, OpenAPI (sem banco) |
| `security.test.ts` | header `User-Key` (ausente, Bearer, formato, inexistente, trocada), usuário inativo, a chave age como a pessoa, funções de admin, chave de usuário-robô, página `/minha-chave`, CORS, injeção via HTTP, isolamento de notificações |
| `api.test.ts` | todos os entity sets e navegações, paginação, QUERY/`$query`, busca; cada módulo (clientes, contatos, projetos profundos, fases, tarefas com validações/cascata/status/comentários/ETag, incidentes, diário, riscos, notificações, templates, intake) e cabeçalhos (`dry-run`, `Idempotency-Key`, `return=minimal`) |
| `mcp.test.ts` | handshake, catálogo de tools (schema, descrição, anotações), **todas** as tools de leitura, escrita com prévia → gravação, idempotência, intake, resources, prompts e autocompletar |
| `fidelity.test.ts` | direto no banco: autoria nos gatilhos do app (Discord, comentários, histórico), `created_at` preservado, nada fora do escopo alterado, dry-run sem rastro, schema `open_api` inacessível ao app |
| `oauth.test.ts` | login do conector: descoberta, registro, PKCE, código de uso único, consentimento (sessão Google ou User-Key), renovação rotativa com detecção de reuso, revogação, "desconectar apps", redirect não registrado, recurso errado |
| `concurrency.test.ts` | escritas simultâneas: mesma `Idempotency-Key` cria uma vez só; 15 criações na mesma fase sem ordem repetida; cascatas simultâneas no mesmo projeto terminam consistentes (sem deadlock); `If-Match` concorrente (1 grava, 4 recebem 412); intake/POST simultâneo do mesmo cliente não duplica |

Também valida, quando `SUPABASE_URL`/`SUPABASE_ANON_KEY` estão no ambiente, o fluxo com sessão de login (página
`/minha-chave` e aprovação do "Vincular") usando login por senha temporária nos usuários fictícios, e o **rate limit**
(429 + `Retry-After`) com uma usuária dedicada.

### Carga e estresse

```bash
deno run -A --env-file=<caminho>/api.env tools/stress.ts --duration 30 --concurrency 10 --report stress-report.md
```

Sobe a API sem rate limit, roda 4 cenários (leitura OData, escrita OData com cascatas concorrentes, MCP, misto) com N
usuários virtuais por D segundos e gera um relatório com vazão, latência p50/p95/p99 por cenário e por operação, erros
por status e uma **checagem de consistência** dos dados depois da carga (cascata respeitada, nenhuma tarefa órfã, nenhum
5xx, nenhuma reserva de idempotência presa). Rode contra o staging; produção é bloqueada.

> Rodando a API na máquina local contra um banco em outra região, cada ida ao banco paga a latência de rede — os
> números refletem isso. Para medir o desempenho real, rode o estresse contra a Edge Function publicada no staging.

### Concorrência: garantias implementadas

- **Trava por escopo** (`pg_advisory_xact_lock` por projeto/incidente/avulsas): escritas que recalculam a agenda do
  mesmo projeto são serializadas — uma cascata não sobrescreve a outra. Ordem fixa de travas (escopo → linha) evita
  deadlock.
- **Trava por nome** em criação de cliente/projeto (intake) e contato (e-mail): o banco do app não tem índice único;
  criações simultâneas do mesmo nome não duplicam (o intake reaproveita, o POST direto recebe 400).
- **Idempotência atômica**: a `Idempotency-Key` é reservada antes de executar; envios simultâneos com a mesma chave
  resultam em uma criação e respostas `409 IdempotencyInProgress`/replay para os demais.
- **ETag (`If-Match`)** checado com a linha travada (`for update`).

### Testando o MCP manualmente

1. Suba a API: `deno run -A --watch --env-file=<caminho>/api.env index.ts`
2. Pegue a User-Key: `deno run -A --env-file=<caminho>/api.env tools/issue-user-key.ts --email ana.teste@ploomes.com`
3. **MCP Inspector** (interface web para listar e chamar tools/resources/prompts):
   ```bash
   npx @modelcontextprotocol/inspector
   ```
   Transport *Streamable HTTP*, URL `http://localhost:8787/api/mcp`, header `User-Key: <chave>`.
4. **No Claude Code**, apontando para a API local:
   ```bash
   claude mcp add --transport http open-local http://localhost:8787/api/mcp --header "User-Key: <chave>"
   ```
   Peça, por exemplo: *"liste minhas tarefas atrasadas no Open"* ou *"cadastre um projeto de implantação para o cliente ACME
   Teste com kickoff na segunda que vem"* — o Claude deve mostrar a prévia e pedir confirmação antes de gravar.

### Outros comandos

```bash
deno test -A tests/odata.test.ts            # só unitários (sem banco)
deno run -A tools/sync-domain.ts --check    # domain/ em dia com src/
deno check index.ts && deno lint
```

## Guia rápido de uso

```bash
UK=ouk_...   # pegue em /api/minha-chave
BASE=https://openploo.vercel.app/api/odata/v1

# quem sou eu
curl -H "User-Key: $UK" $BASE/Me

# projetos em andamento com saúde
curl -G -H "User-Key: $UK" "$BASE/Projects" \
  --data-urlencode "\$filter=Status eq 'InProgress' and not Archived" \
  --data-urlencode "\$select=Id,Name,Progress,OverdueCount,IsDelayed,GoLiveDate"

# minhas tarefas atrasadas
curl -G -H "User-Key: $UK" "$BASE/Tasks" \
  --data-urlencode "\$filter=IsOverdue and Owners/any(o: o/UserId eq <meu-id>)"

# mudar etapa
curl -X POST -H "User-Key: $UK" -H "Content-Type: application/json" \
  "$BASE/Tasks(<id>)/Open.SetStatus" -d '{"Status":"Validation"}'

# cadastrar demandas em lote (simula; repita com "DryRun": false para gravar)
curl -X POST -H "User-Key: $UK" -H "Content-Type: application/json" "$BASE/Open.Intake" -d @intake.json
```

Referência completa (todas as entidades, campos, enums, actions, erros e exemplos): página `/api/docs`.

## Estendendo a API

- **Nova entidade/campo:** declare em `odata/entities.ts` (colunas reais do banco). `$metadata`, OpenAPI, `$filter` e o
  `describe_model` do MCP passam a enxergar automaticamente.
- **Nova escrita/action:** implemente em `services/` (zod + `Ctx`), registre em `odata/actions.ts` (`WRITES`/`ACTIONS`)
  e, se fizer sentido para agentes, em `mcp/server.ts`.
- **Regra do app mudou:** rode `deno task sync-domain` e revise o diff de `domain/`.
