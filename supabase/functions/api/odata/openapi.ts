// OpenAPI 3.2 gerado a partir do modelo OData (entities + actions). Alimenta a documentação web (/api/docs),
// coleções do Postman e o scan do OWASP ZAP. 3.2 porque é a versão que tem a operação HTTP QUERY.
import { Complex, type ComplexType, type EdmPrim, Enums, type EntitySet, type EnumType, type Prop } from "./edm.ts";
import { SETS } from "./entities.ts";
import { type ActionDef, ACTIONS, WRITES } from "./actions.ts";
import { GUIDE, TAG_DOCS } from "../docs.ts";
import { config } from "../lib/config.ts";

// deno-lint-ignore no-explicit-any
type Json = Record<string, any>;

const PRIM: Record<EdmPrim, Json> = {
  "Edm.Guid": { type: "string", format: "uuid" },
  "Edm.String": { type: "string" },
  "Edm.Boolean": { type: "boolean" },
  "Edm.Int32": { type: "integer", format: "int32" },
  "Edm.Decimal": { type: "number" },
  "Edm.Date": { type: "string", format: "date" },
  "Edm.DateTimeOffset": { type: "string", format: "date-time" },
};

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

/** Nomes em português de cada entity set: menu lateral (many) e títulos das operações. */
const NAMES: Record<string, { menu: string; one: string; many: string; de: string; ao: string }> = {
  Clients: { menu: "Clientes", one: "cliente", many: "clientes", de: "do cliente", ao: "ao cliente" },
  Contacts: { menu: "Contatos", one: "contato", many: "contatos", de: "do contato", ao: "ao contato" },
  ClientGroups: { menu: "Grupos de clientes", one: "grupo de clientes", many: "grupos de clientes", de: "do grupo de clientes", ao: "ao grupo de clientes" },
  DocumentationItems: { menu: "Documentação", one: "item de documentação", many: "itens de documentação", de: "do item de documentação", ao: "ao item de documentação" },
  CsAssignments: { menu: "Histórico de CS", one: "atribuição de CS", many: "atribuições de CS", de: "da atribuição de CS", ao: "à atribuição de CS" },
  Projects: { menu: "Projetos", one: "projeto", many: "projetos", de: "do projeto", ao: "ao projeto" },
  Phases: { menu: "Fases", one: "fase", many: "fases", de: "da fase", ao: "à fase" },
  Tasks: { menu: "Tarefas", one: "tarefa", many: "tarefas", de: "da tarefa", ao: "à tarefa" },
  Comments: { menu: "Comentários", one: "comentário", many: "comentários", de: "do comentário", ao: "ao comentário" },
  Risks: { menu: "Riscos", one: "risco", many: "riscos", de: "do risco", ao: "ao risco" },
  DelayLogs: { menu: "Atrasos", one: "registro de atraso", many: "registros de atraso", de: "do registro de atraso", ao: "ao registro de atraso" },
  OpenPoints: { menu: "Pontos em aberto", one: "ponto em aberto", many: "pontos em aberto", de: "do ponto em aberto", ao: "ao ponto em aberto" },
  Meetings: { menu: "Atas de reunião", one: "ata de reunião", many: "atas de reunião", de: "da ata de reunião", ao: "à ata de reunião" },
  History: { menu: "Histórico", one: "registro do histórico", many: "registros do histórico", de: "do registro do histórico", ao: "ao registro do histórico" },
  Incidents: { menu: "Incidentes", one: "incidente", many: "incidentes", de: "do incidente", ao: "ao incidente" },
  IncidentStakeholders: { menu: "Stakeholders", one: "stakeholder", many: "stakeholders", de: "do stakeholder", ao: "ao stakeholder" },
  Users: { menu: "Pessoas", one: "pessoa", many: "pessoas", de: "da pessoa", ao: "à pessoa" },
  Notifications: { menu: "Notificações", one: "notificação", many: "notificações", de: "da notificação", ao: "à notificação" },
};
const nm = (set: string) => NAMES[set] ?? { menu: set, one: set, many: set, de: `de ${set}`, ao: `a ${set}` };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Navegações cujo nome diz mais que o tipo de destino. */
const NAV_LABEL: Record<string, string> = {
  PmUser: "Líder",
  DevLeadUser: "Dev lead",
  Dependencies: "Predecessoras",
  Replies: "Respostas",
  CsHistory: "Histórico de CS",
  Groups: "Grupos",
  Documentation: "Documentação",
};

/** Títulos curtos das actions/functions (o texto longo vai na descrição). */
function actionTitle(a: ActionDef): string {
  if (!a.boundTo) {
    return ({ Intake: "Cadastrar demandas em lote (Intake)", Search: "Busca global", ResolveCode: "Resolver código curto", MarkNotificationsRead: "Marcar notificações como lidas" } as Record<string, string>)[a.name] ??
      a.name;
  }
  const n = nm(a.boundTo);
  const titles: Record<string, string> = {
    SetStatus: a.boundTo === "Tasks" ? "Mudar a etapa da tarefa" : `Mudar o status ${n.de}`,
    ChangeDates: "Mudar as datas da tarefa (com cascata)",
    AddComment: "Comentar na tarefa",
    Archive: `Arquivar ${n.one}`,
    Unarchive: `Desarquivar ${n.one}`,
    LinkClient: `Vincular cliente ${n.ao}`,
    UnlinkClient: `Desvincular cliente ${n.de}`,
    LinkProject: `Vincular projeto ${n.ao}`,
    UnlinkProject: `Desvincular projeto ${n.de}`,
    SetBaseline: "Definir a baseline do projeto",
    ClearBaseline: "Remover a baseline do projeto",
    AssignCs: "Trocar o CS do cliente",
    AddStakeholder: "Adicionar stakeholder ao incidente",
    RemoveStakeholder: "Remover stakeholder do incidente",
    Resolve: "Resolver ponto em aberto",
    Reopen: "Reabrir ponto em aberto",
    OpenTasks: `Listar tarefas abertas ${n.de}`,
    CompleteOpenTasks: `Concluir tarefas abertas ${n.de}`,
  };
  return titles[a.name] ?? a.name;
}

function enumSchema(en: EnumType): Json {
  return { type: "string", enum: Object.keys(en.members) };
}
function complexSchema(ct: ComplexType): Json {
  return {
    type: "object",
    properties: Object.fromEntries(ct.props.map((cp) => [cp.name, cp.enum ? ref(cp.enum.name) : { ...PRIM[cp.type] }])),
  };
}
function propSchema(pr: Prop): Json {
  const base = pr.complex ? ref(pr.complex.name) : pr.enum ? ref(pr.enum.name) : { ...PRIM[pr.type] };
  const s: Json = pr.collection ? { type: "array", items: base } : base;
  const notes = [pr.description, pr.computed ? "Somente leitura (calculada)." : "", pr.post ? "Não filtrável/ordenável." : "", pr.heavy ? "Fora do retorno padrão de listas: peça via $select." : ""]
    .filter(Boolean).join(" ");
  if (notes) return pr.collection || pr.complex || pr.enum ? { allOf: [s], description: notes } : { ...s, description: notes };
  return s;
}

// ── exemplos de resposta (valores plausíveis, gerados a partir do modelo) ─────────────────────────────────────

const SAMPLE_ID: Record<string, string> = {
  Project: "00000000-0000-4000-8000-0000000b0001",
  Client: "00000000-0000-4000-8000-0000000c0001",
  Phase: "00000000-0000-4000-8000-0000000d0001",
  Task: "00000000-0000-4000-8000-0000000e0002",
  Incident: "00000000-0000-4000-8000-0000000f0001",
  User: "00000000-0000-4000-8000-00000000a002",
};
const SAMPLE_NAME: Record<string, string> = {
  Owner: "Ana Teste",
  TeamMember: "Ana Teste",
  Task: "Configurar funis de venda",
  Project: "Implantação ACME",
  Phase: "Configuração",
  Client: "ACME Ltda",
  Contact: "Maria Souza",
  User: "Ana Teste",
  Incident: "Integração com o ERP parou de sincronizar",
  Meeting: "Reunião de kickoff",
};
const SAMPLE_TEXT: Record<string, string> = {
  Comment: "Acessos recebidos, começando amanhã.",
  Risk: "Atraso na liberação de acessos",
  DelayLog: "Cliente atrasou o envio dos acessos",
  OpenPoint: "Definir campos obrigatórios do funil",
  History: "Cliente aprovou o escopo",
  Notification: "Você foi marcado como executor de uma tarefa.",
};

function sampleId(propName: string, owner: string): string {
  if (propName === "Id") return SAMPLE_ID[owner] ?? "00000000-0000-4000-8000-000000000001";
  const t = propName.replace(/Ids?$/, "").replace(/(Member|Author|Pm|DevLead|Owner|Parent)$/, "");
  if (/User|Member|Author|Owner|Pm|DevLead|By$/.test(propName)) return SAMPLE_ID.User;
  return SAMPLE_ID[t] ?? (propName.startsWith("ParentTask") ? SAMPLE_ID.Task : "00000000-0000-4000-8000-000000000001");
}

function sampleEnum(en: EnumType): string {
  const keys = Object.keys(en.members);
  return keys.find((k) => k === "InProgress") ?? keys[0];
}

function samplePrim(type: EdmPrim, name: string, owner: string): unknown {
  switch (type) {
    case "Edm.Guid":
      return sampleId(name, owner);
    case "Edm.Boolean":
      return /^(IsCritical|Active)$/.test(name);
    case "Edm.Int32":
      return /Progress/.test(name) ? 60 : /Day/.test(name) ? 5 : /Order/.test(name) ? 1 : 0;
    case "Edm.Decimal":
      return 8.5;
    case "Edm.Date":
      return /Start/.test(name) ? "2026-10-27" : "2026-11-05";
    case "Edm.DateTimeOffset":
      return "2026-10-21T14:30:00-03:00";
    default:
      if (/Email/.test(name)) return "ana.teste@ploomes.com";
      if (/Url$|Link$/.test(name)) return "https://openploo.vercel.app/projects/00000000-0000-4000-8000-0000000b0001";
      if (/^(Responsible|Pm|DevLead|AuthorName|OwnerName|Cs|CsName)$/.test(name)) return "Ana Teste";
      if (name === "Country") return "BR";
      if (name === "Id") return "00000000-0000-4000-8000-000000000001";
      if (name === "Name" || name === "Title") return SAMPLE_NAME[owner] ?? SAMPLE_TEXT[owner] ?? `${owner} de exemplo`;
      if (name === "Label") return "Proposta comercial";
      if (/Description|Text|Note|Detail|Message|Body/.test(name)) return SAMPLE_TEXT[owner] ?? "Texto de exemplo.";
      return "exemplo";
  }
}

function sampleComplex(ct: ComplexType): Json {
  const out: Json = Object.fromEntries(ct.props.map((cp) => [cp.name, cp.enum ? sampleEnum(cp.enum) : samplePrim(cp.type, cp.name, ct.name)]));
  return { ...out, ...SAMPLE_OVERRIDE[ct.name] };
}

/** Ajustes para o exemplo ser coerente (ex.: tarefa de projeto não tem incidente). */
const SAMPLE_OVERRIDE: Record<string, Json> = {
  Task: { IncidentId: null, ParentTaskId: null, ActualEnd: null, BaselineDate: null, PlannedDate: null, DaysOverdue: 0, DependsOn: ["00000000-0000-4000-8000-0000000e0001"] },
  Project: { DevType: "integration", DevIntegration: "ERP via n8n", ProposalLink: "https://app10.ploomes.com/deal/123456", DealLink: "https://app10.ploomes.com/deal/123456" },
  TeamMember: { Role: "Consultora de implantação" },
};

function sampleEntity(set: EntitySet): Json {
  const out: Json = { "@odata.etag": 'W/"1234"' };
  for (const pr of set.props) {
    if (pr.heavy) continue;
    const one = pr.complex ? sampleComplex(pr.complex) : pr.enum ? sampleEnum(pr.enum) : samplePrim(pr.type, pr.name.replace(/s$/, ""), set.type);
    out[pr.name] = pr.collection ? [one] : one;
  }
  for (const [k, v] of Object.entries(SAMPLE_OVERRIDE[set.type] ?? {})) if (k in out) out[k] = v;
  return out;
}

const setByType = (type: string) => Object.values(SETS).find((s) => s.type === type);

// ── respostas de erro: um exemplo real por código ──────────────────────────────────────────────────────────────

const err = (code: string, message: string, target?: string): Json => ({
  error: { code, message, ...(target ? { target } : {}), innererror: { requestId: "4f1c2a9e-7b3d-4e8a-9c61-2d5f0b8a7e13" } },
});
const errorResponse = (description: string, example: Json, headers?: Json): Json => ({
  description,
  ...(headers ? { headers } : {}),
  content: { "application/json": { schema: ref("ODataError"), example } },
});
const E = {
  read400: errorResponse("Requisição inválida — ex.: erro de sintaxe no $filter ou campo inexistente no $select", err("BadRequest", "$select: 'Nome' não existe em Tasks.")),
  write400: errorResponse("Dados inválidos — campo obrigatório ausente ou valor fora do permitido", err("Validation", "Informe ao menos o executor em Owners.", "Owners")),
  "401": errorResponse("User-Key ausente, inválida ou já trocada", err("Unauthorized", "User-Key inválida ou trocada. Pegue a atual em /api/minha-chave."), {
    "WWW-Authenticate": { schema: { type: "string" }, example: 'User-Key realm="Open API"' },
  }),
  "403": errorResponse("Sem permissão — usuário desativado no Open ou operação só para administradores", err("Forbidden", "Usuário desativado no Open.")),
  "404": errorResponse("Não encontrado — o Id não existe ou você não tem acesso a ele", err("NotFound", "Recurso não encontrado.")),
  "409": errorResponse("Conflito com o estado atual — ex.: dependência circular ou registro duplicado", err("Conflict", "Dependência circular: Kickoff → Configurar funis → Kickoff.")),
  "412": errorResponse("O registro mudou desde a sua leitura (If-Match com ETag antigo). Releia e tente de novo", err("PreconditionFailed", "O registro foi alterado por outra pessoa (ETag diferente). Releia e tente de novo.")),
  "422": errorResponse("Idempotency-Key repetida com outro corpo ou rota", err("IdempotencyKeyReused", "Esta Idempotency-Key já foi usada com outro corpo/rota.")),
  "429": errorResponse("Limite de requisições por minuto atingido. Aguarde os segundos de Retry-After", err("TooManyRequests", "Limite de 120 requisições/minuto atingido."), {
    "Retry-After": { schema: { type: "integer" }, example: 42 },
  }),
};
const readErrors: Json = { "400": E.read400, "401": E["401"], "403": E["403"], "404": E["404"], "429": E["429"] };
const createErrors: Json = { "400": E.write400, "401": E["401"], "403": E["403"], "409": E["409"], "422": E["422"], "429": E["429"] };
const writeErrors: Json = { ...createErrors, "404": E["404"], "412": E["412"] };

// ── parâmetros ────────────────────────────────────────────────────────────────────────────────────────────────

const Q = {
  filter: { name: "$filter", in: "query", schema: { type: "string" }, description: "Expressão OData. Ex.: `Status eq 'InProgress' and IsOverdue`." },
  select: { name: "$select", in: "query", schema: { type: "string" }, description: "Campos separados por vírgula." },
  expand: { name: "$expand", in: "query", schema: { type: "string" }, description: "Navegações (até 2 níveis), com opções: `Phases($orderby=Order;$expand=Tasks)`." },
  orderby: { name: "$orderby", in: "query", schema: { type: "string" }, description: "Ex.: `DueDate asc, Name desc`." },
  top: { name: "$top", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
  skip: { name: "$skip", in: "query", schema: { type: "integer", default: 0 } },
  count: { name: "$count", in: "query", schema: { type: "boolean" }, description: "Inclui `@odata.count`." },
  search: { name: "$search", in: "query", schema: { type: "string" }, description: "Busca textual (todas as palavras, sem diferenciar maiúsculas)." },
};
const H = {
  prefer: { name: "Prefer", in: "header", schema: { type: "string" }, description: "`dry-run` simula sem gravar; `return=minimal` responde 204." },
  idem: { name: "Idempotency-Key", in: "header", schema: { type: "string" }, description: "Repetir com a mesma chave devolve a resposta original (não duplica)." },
  ifMatch: { name: "If-Match", in: "header", schema: { type: "string" }, description: "ETag recebido no GET. Se o registro mudou: 412." },
};
const idParam = { name: "Id", in: "path", required: true, schema: { type: "string", format: "uuid" } };

function collectionResponse(root: string, set: EntitySet, description: string): Json {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            "@odata.context": { type: "string" },
            "@odata.count": { type: "integer" },
            "@odata.nextLink": { type: "string" },
            value: { type: "array", items: ref(set.type) },
          },
        },
        example: { "@odata.context": `${root}/odata/v1/$metadata#${set.name}`, value: [sampleEntity(set)] },
      },
    },
  };
}
const entityResponse = (set: EntitySet, description: string): Json => ({
  description,
  headers: { ETag: { schema: { type: "string" }, example: 'W/"1234"' } },
  content: { "application/json": { schema: ref(set.type), example: sampleEntity(set) } },
});
const jsonResponse = (description: string, example: unknown): Json => ({ description, content: { "application/json": { example } } });

const EXAMPLE_QUERIES: Record<string, string[]> = {
  Tasks: [
    "$filter=IsOverdue and Owners/any(o: o/UserId eq 00000000-0000-4000-8000-00000000a002)&$orderby=DueDate&$select=Id,Name,Status,DueDate&$expand=Project($select=Name)",
    "$filter=Scope eq 'Standalone' and Status in ('Todo','InProgress')",
  ],
  Projects: ["$filter=Status eq 'InProgress' and not Archived&$select=Id,Name,Progress,OverdueCount,IsDelayed&$count=true"],
  Incidents: ["$filter=Status in ('Open','InProgress') and Priority eq 'High'&$expand=Clients($select=Name)"],
  Clients: ["$filter=Status eq 'Implantacao' and not Archived&$expand=Projects($select=Name,Status)"],
};

const QUERY_EXAMPLE = { filter: "Status ne 'Done'", select: "Id,Name,Status", orderby: "Name", top: 20, count: true };

export function buildOpenApi(root: string): Json {
  const paths: Json = {};
  const schemas: Json = {};
  for (const en of Object.values(Enums)) schemas[en.name] = enumSchema(en);
  for (const ct of Object.values(Complex)) schemas[ct.name] = complexSchema(ct);

  for (const s of Object.values(SETS)) {
    const n = nm(s.name);
    schemas[s.type] = {
      type: "object",
      description: s.description,
      properties: {
        "@odata.etag": { type: "string", readOnly: true },
        ...Object.fromEntries(s.props.map((pr) => [pr.name, propSchema(pr)])),
        ...Object.fromEntries(s.navs.map((nv) => [nv.name, nv.many ? { type: "array", items: ref(SETS[nv.target].type), description: "Via $expand." } : { allOf: [ref(SETS[nv.target].type)], description: "Via $expand." }])),
      },
    };
    const w = WRITES[s.name];
    const tag = s.name;
    const exQueries = EXAMPLE_QUERIES[s.name];
    const list = collectionResponse(root, s, `Lista de ${n.many} (até $top por página; a próxima vem em @odata.nextLink)`);
    const queryBody = {
      required: true,
      content: { "application/json": { schema: ref("QueryBody"), example: QUERY_EXAMPLE } },
    };
    paths[`/odata/v1/${s.name}`] = {
      get: {
        tags: [tag],
        summary: `Listar ${n.many}`,
        description: `${s.description}${exQueries ? `\n\n**Exemplos:**\n${exQueries.map((q) => `- \`GET /odata/v1/${s.name}?${q}\``).join("\n")}` : ""}`,
        operationId: `list${s.name}`,
        parameters: [Q.filter, Q.select, Q.expand, Q.orderby, Q.top, Q.skip, Q.count, Q.search],
        responses: { "200": list, ...readErrors },
      },
      query: {
        tags: [tag],
        summary: `Consultar ${n.many} (QUERY)`,
        description: `Igual ao **Listar ${n.many}**, mas com as opções no corpo — útil quando o \`$filter\` é grande demais para a URL. ` +
          `Método HTTP **QUERY** (seguro e idempotente, como o GET). Se algum proxy ou ferramenta não aceitar QUERY, use o **POST /odata/v1/${s.name}/$query**.`,
        operationId: `query${s.name}`,
        requestBody: queryBody,
        responses: { "200": list, ...readErrors },
      },
      ...(w?.create
        ? {
          post: {
            tags: [tag],
            summary: `Criar ${n.one}`,
            operationId: `create${s.type}`,
            parameters: [H.prefer, H.idem],
            requestBody: { required: true, content: { "application/json": { schema: { type: "object" }, ...(w.example ? { example: w.example } : {}) } } },
            responses: {
              "201": entityResponse(s, `Criado — devolve os dados ${n.de} gravados`),
              "200": entityResponse(s, "Simulação (Prefer: dry-run) — mostra o resultado, mas nada foi gravado"),
              ...createErrors,
            },
          },
        }
        : {}),
    };
    paths[`/odata/v1/${s.name}/$query`] = {
      post: {
        tags: [tag],
        summary: `Consultar ${n.many} (POST $query)`,
        description: `Alternativa ao método QUERY para clientes que só enviam GET/POST (padrão OData 4.01). Mesmo corpo e mesma resposta.`,
        operationId: `queryPost${s.name}`,
        requestBody: queryBody,
        responses: { "200": list, ...readErrors },
      },
    };
    paths[`/odata/v1/${s.name}/$count`] = {
      get: {
        tags: [tag],
        summary: `Contar ${n.many}`,
        operationId: `count${s.name}`,
        parameters: [Q.filter, Q.search],
        responses: { "200": { description: `Quantidade de ${n.many} (texto puro)`, content: { "text/plain": { schema: { type: "integer" }, example: 42 } } }, ...readErrors },
      },
    };
    paths[`/odata/v1/${s.name}({Id})`] = {
      get: {
        tags: [tag],
        summary: `Obter ${n.one} pelo Id`,
        operationId: `get${s.type}`,
        parameters: [idParam, Q.select, Q.expand],
        responses: { "200": entityResponse(s, `Dados ${n.de}`), ...readErrors },
      },
      ...(w?.update
        ? {
          patch: {
            tags: [tag],
            summary: `Atualizar ${n.one}`,
            description: "Envie só os campos que mudam.",
            operationId: `update${s.type}`,
            parameters: [idParam, H.ifMatch, H.prefer, H.idem],
            requestBody: { required: true, content: { "application/json": { schema: { type: "object" }, ...(w.patchExample ? { example: w.patchExample } : {}) } } },
            responses: {
              "200": entityResponse(s, `Atualizado — devolve os dados ${n.de}`),
              "204": { description: "Atualizado, sem corpo (Prefer: return=minimal)" },
              ...writeErrors,
            },
          },
        }
        : {}),
      ...(s.name === "Comments"
        ? { delete: { tags: [tag], summary: "Apagar comentário (autor ou admin)", operationId: "deleteComment", parameters: [idParam], responses: { "204": { description: "Comentário apagado" }, ...readErrors } } }
        : w?.delete
        ? {
          delete: {
            tags: [tag],
            summary: s.name === "ClientGroups" ? "Desfazer o grupo (clientes e contatos continuam existindo)" : `Apagar ${n.one}`,
            description: s.name === "DocumentationItems"
              ? "Só itens diretos (Source=Direct); o arquivo sai do Storage. Itens de tarefas (Source=Task) se removem na tarefa. Com `Prefer: dry-run` só valida."
              : "Com `Prefer: dry-run` só valida (nada é apagado).",
            operationId: `delete${s.type}`,
            parameters: [idParam, H.prefer],
            responses: { "204": { description: "Apagado" }, "200": { description: "Simulação (Prefer: dry-run) — nada foi apagado" }, ...writeErrors },
          },
        }
        : {}),
    };
    for (const nv of s.navs) {
      const t = SETS[nv.target];
      const tn = nm(nv.target);
      const label = `${NAV_LABEL[nv.name] ?? cap(nv.many ? tn.many : tn.one)} ${n.de}`;
      paths[`/odata/v1/${s.name}({Id})/${nv.name}`] = {
        get: {
          tags: [tag],
          summary: label,
          operationId: `get${s.type}${nv.name}`,
          parameters: nv.many ? [idParam, Q.filter, Q.select, Q.expand, Q.orderby, Q.top, Q.skip, Q.count] : [idParam, Q.select],
          responses: { "200": nv.many ? collectionResponse(root, t, label) : entityResponse(t, label), ...readErrors },
        },
      };
    }
  }

  for (const a of ACTIONS) {
    const body = {
      type: "object",
      properties: Object.fromEntries(a.params.map((pa) => [pa.name, { description: `${pa.type}${pa.description ? ` — ${pa.description}` : ""}` }])),
      required: a.params.filter((pa) => pa.required).map((pa) => pa.name),
    };
    const tag = a.boundTo ?? "Operações";
    const target = a.returns?.startsWith("Open.") ? setByType(a.returns.slice(5)) : undefined;
    const ok200 = target ? entityResponse(target, `Feito — devolve os dados ${nm(target.name).de} atualizados`) : { description: "Resultado da operação" };
    const prefix = a.boundTo ? `/odata/v1/${a.boundTo}({Id})` : "/odata/v1";
    if (a.kind === "function") {
      const args = a.params.map((pa) => `${pa.name}={${pa.name}}`).join(",");
      paths[`${prefix}/Open.${a.name}(${args})`] = {
        get: {
          tags: [tag],
          summary: actionTitle(a),
          description: a.description,
          operationId: `${a.boundTo ? a.boundTo.replace(/s$/, "") : "fn"}${a.name}`,
          parameters: [
            ...(a.boundTo ? [idParam] : []),
            ...a.params.map((pa) => ({ name: pa.name, in: "path", required: true, schema: { type: pa.type === "Edm.Int32" ? "integer" : "string" }, description: pa.type === "Edm.String" ? "Texto entre aspas simples: q='acme'" : undefined })),
          ],
          responses: { "200": ok200, ...readErrors },
        },
      };
      continue;
    }
    paths[`${prefix}/Open.${a.name}`] = {
      post: {
        tags: [tag],
        summary: actionTitle(a),
        description: a.description,
        operationId: `${a.boundTo ? a.boundTo.replace(/s$/, "") : "op"}${a.name}`,
        parameters: [...(a.boundTo ? [idParam] : []), H.prefer, H.idem],
        requestBody: a.params.length ? { content: { "application/json": { schema: body, ...(a.example ? { example: a.example } : {}) } } } : undefined,
        responses: { "200": ok200, ...writeErrors },
      },
    };
  }

  // conjuntos especiais
  paths["/odata/v1/Me"] = {
    get: {
      tags: ["Autenticação"],
      summary: "Quem sou eu",
      description: "Pessoa dona da User-Key usada e as permissões dela. Bom para testar a chave.",
      operationId: "me",
      responses: {
        "200": jsonResponse("Pessoa autenticada", {
          "@odata.context": `${root}/odata/v1/$metadata#Me`,
          Id: SAMPLE_ID.User,
          Name: "Ana Teste",
          Email: "ana.teste@ploomes.com",
          Role: "Member",
          AvatarUrl: null,
          Permissions: ["read", "write"],
        }),
        "401": E["401"],
        "403": E["403"],
        "429": E["429"],
      },
    },
  };
  const keyExample = { UserKey: "ouk_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCD", Prefix: "ouk_AbCd", CreatedAt: "2026-10-21T18:00:00Z", RotatedAt: "2026-10-21T18:00:00Z", LastUsedAt: null, Email: "ana.teste@ploomes.com" };
  const sessionErrors = { "401": errorResponse("Sessão de login ausente ou expirada", err("Unauthorized", "Sessão expirada. Entre de novo.")), "403": E["403"], "429": E["429"] };
  paths["/user-key"] = {
    get: {
      tags: ["Autenticação"],
      summary: "Ver a minha User-Key",
      description: "Cria a chave na primeira vez. Usado pela página **/api/minha-chave**. Autentica com a sessão do login Google do Open (`Authorization: Bearer <token de sessão>`), não com a User-Key.",
      operationId: "getMyUserKey",
      security: [{ session: [] }],
      responses: { "200": jsonResponse("A sua chave", keyExample), ...sessionErrors },
    },
  };
  paths["/user-key/rotate"] = {
    post: {
      tags: ["Autenticação"],
      summary: "Gerar uma nova User-Key",
      description: "A chave anterior para de funcionar na hora: atualize Claude, n8n e scripts.",
      operationId: "rotateMyUserKey",
      security: [{ session: [] }],
      responses: { "200": jsonResponse("Nova chave", keyExample), ...sessionErrors },
    },
  };
  paths["/admin/user-keys"] = {
    get: {
      tags: ["Autenticação"],
      summary: "Listar as chaves de todos (admin)",
      description: "Mostra quem tem chave, prefixo e último uso — nunca o segredo.",
      operationId: "listUserKeys",
      responses: {
        "200": jsonResponse("Chaves (sem o segredo)", { value: [{ Email: "ana.teste@ploomes.com", Prefix: "ouk_AbCd", CreatedAt: "2026-10-21T18:00:00Z", RotatedAt: "2026-10-21T18:00:00Z", LastUsedAt: "2026-10-21T19:12:00Z" }] }),
        "401": E["401"],
        "403": errorResponse("Somente administradores do Open", err("Forbidden", "Somente administradores do Open.")),
        "429": E["429"],
      },
    },
  };
  paths["/admin/user-keys/rotate"] = {
    post: {
      tags: ["Autenticação"],
      summary: "Gerar chave para outra pessoa (admin)",
      description: "Ex.: usuário-robô de automação. Se a pessoa já tinha chave, a anterior para de funcionar.",
      operationId: "adminRotateUserKey",
      requestBody: { content: { "application/json": { example: { Email: "open-bot@ploomes.com" } } } },
      responses: {
        "200": jsonResponse("Nova chave da pessoa", { ...keyExample, Email: "open-bot@ploomes.com" }),
        "400": errorResponse("E-mail ausente, ou a pessoa não existe ou está inativa no Open", err("Validation", "Usuário não encontrado ou inativo no Open.", "Email")),
        "401": E["401"],
        "403": errorResponse("Somente administradores do Open", err("Forbidden", "Somente administradores do Open.")),
        "429": E["429"],
      },
    },
  };
  // OAuth 2.1 do conector do Claude (usado pelos apps do Claude, não por integrações comuns)
  const oauthErr = (description: string, error: string, msg: string) =>
    jsonResponse(description, { error, error_description: msg });
  paths["/.well-known/oauth-authorization-server"] = {
    get: {
      tags: ["Autenticação"],
      summary: "Login do conector: metadados do servidor OAuth",
      description: "Descoberta automática usada pelos apps do Claude (RFC 8414). Também em `/.well-known/openid-configuration`.",
      operationId: "oauthMetadata",
      security: [],
      responses: {
        "200": jsonResponse("Endereços e capacidades do servidor de login", {
          issuer: root,
          authorization_endpoint: `${root}/oauth/authorize`,
          token_endpoint: `${root}/oauth/token`,
          registration_endpoint: `${root}/oauth/register`,
          code_challenge_methods_supported: ["S256"],
        }),
      },
    },
  };
  paths["/oauth/register"] = {
    post: {
      tags: ["Autenticação"],
      summary: "Login do conector: registrar o app (RFC 7591)",
      description: "O Claude se registra sozinho ao clicar em Vincular. Só clientes públicos com PKCE; redirect https (ou http em localhost).",
      operationId: "oauthRegister",
      security: [],
      requestBody: { content: { "application/json": { example: { client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] } } } },
      responses: {
        "201": jsonResponse("App registrado", { client_id: "ocl_AbCd…", client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], token_endpoint_auth_method: "none" }),
        "400": oauthErr("Metadados inválidos", "invalid_redirect_uri", "redirect_uri precisa ser https (ou http em localhost)."),
        "429": E["429"],
      },
    },
  };
  paths["/oauth/token"] = {
    post: {
      tags: ["Autenticação"],
      summary: "Login do conector: trocar código ou renovar acesso",
      description: "`grant_type=authorization_code` (com `code_verifier` do PKCE) ou `refresh_token` (rotativo: cada renovação devolve um novo). Acesso dura 1 hora; renovação, 30 dias.",
      operationId: "oauthToken",
      security: [],
      requestBody: {
        content: {
          "application/x-www-form-urlencoded": {
            example: { grant_type: "authorization_code", code: "oac_…", code_verifier: "…", redirect_uri: "https://claude.ai/api/mcp/auth_callback", client_id: "ocl_…" },
          },
        },
      },
      responses: {
        "200": jsonResponse("Acesso concedido", { access_token: "oat_…", token_type: "Bearer", expires_in: 3600, refresh_token: "ort_…", scope: "open" }),
        "400": oauthErr("Código ou renovação inválidos, expirados ou já usados", "invalid_grant", "Código inválido, expirado ou já usado."),
        "429": E["429"],
      },
    },
  };
  const templateExample = {
    Name: "Implantação padrão",
    Type: "NovaConta",
    Phases: [
      { Name: "Kickoff", Tasks: [{ Ref: "k", Name: "Kickoff", Type: "Meeting" }] },
      { Name: "Configuração", Tasks: [{ Ref: "c", Name: "Configurar funis", DurationDays: 5, DependsOn: ["k"] }] },
      { Name: "Go-live", Tasks: [{ Ref: "g", Name: "Go live", Type: "Milestone", DependsOn: ["c"] }] },
    ],
  };
  const templateOut = { Id: "00000000-0000-4000-8000-000000007001", ...templateExample, CreatedAt: "2026-10-21T18:00:00Z" };
  const adminOnly = errorResponse("Somente administradores do Open", err("Forbidden", "Somente administradores do Open."));
  paths["/odata/v1/Templates"] = {
    get: {
      tags: ["Templates"],
      summary: "Listar templates de projeto",
      operationId: "listTemplates",
      responses: { "200": jsonResponse("Templates cadastrados", { value: [templateOut] }), ...readErrors },
    },
    post: {
      tags: ["Templates"],
      summary: "Criar template (admin)",
      operationId: "createTemplate",
      requestBody: { content: { "application/json": { example: templateExample } } },
      responses: { "201": jsonResponse("Template criado", templateOut), ...createErrors, "403": adminOnly },
    },
  };
  paths["/odata/v1/Templates({Id})"] = {
    get: { tags: ["Templates"], summary: "Obter template pelo Id", operationId: "getTemplate", parameters: [idParam], responses: { "200": jsonResponse("Dados do template", templateOut), ...readErrors } },
    patch: {
      tags: ["Templates"],
      summary: "Substituir template (admin)",
      operationId: "updateTemplate",
      parameters: [idParam],
      requestBody: { content: { "application/json": { example: templateExample } } },
      responses: { "200": jsonResponse("Template atualizado", templateOut), ...writeErrors, "403": adminOnly },
    },
    delete: { tags: ["Templates"], summary: "Apagar template (admin)", operationId: "deleteTemplate", parameters: [idParam], responses: { "204": { description: "Template apagado" }, ...readErrors, "403": adminOnly } },
  };
  paths["/odata/v1/$metadata"] = {
    get: {
      tags: ["Autenticação"],
      summary: "Modelo de dados OData (CSDL)",
      description: "XML com todas as entidades, campos, enums e operações. Ferramentas OData (Power BI, Excel, n8n) leem daqui.",
      operationId: "metadata",
      security: [],
      responses: {
        "200": {
          description: "Modelo em XML (CSDL)",
          content: { "application/xml": { example: '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">…</edmx:Edmx>' } },
        },
      },
    },
  };

  schemas.QueryBody = {
    type: "object",
    description: "Mesmas opções da query string, sem o `$`. Também aceita texto: `$filter=...&$top=10`.",
    properties: {
      filter: { type: "string", description: "Igual ao $filter. Ex.: `Status ne 'Done' and IsOverdue`." },
      select: { type: "string", description: "Igual ao $select. Ex.: `Id,Name,Status`." },
      expand: { type: "string", description: "Igual ao $expand. Ex.: `Project($select=Name)`." },
      orderby: { type: "string", description: "Igual ao $orderby. Ex.: `DueDate asc`." },
      top: { type: "integer", description: "Máximo por página (padrão 50, até 200)." },
      skip: { type: "integer", description: "Quantos pular (paginação)." },
      count: { type: "boolean", description: "true inclui @odata.count." },
      search: { type: "string", description: "Busca textual." },
    },
  };
  schemas.ODataError = {
    type: "object",
    properties: {
      error: {
        type: "object",
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          target: { type: "string" },
          details: { type: "array", items: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, target: { type: "string" } } } },
          innererror: { type: "object", properties: { requestId: { type: "string" } } },
        },
      },
    },
  };

  const setTags = Object.values(SETS).map((s) => ({
    name: s.name,
    "x-displayName": nm(s.name).menu,
    description: `**Entity set:** \`${s.name}\`\n\n${s.description}${TAG_DOCS[s.name] ? `\n\n${TAG_DOCS[s.name]}` : ""}`,
  }));
  return {
    openapi: "3.2.0",
    info: { title: "Open API (OData v4)", version: config.version, description: GUIDE.replaceAll("{{ROOT}}", root) },
    servers: [{ url: root, description: "Esta instância" }],
    security: [{ userKey: [] }],
    tags: [
      { name: "Autenticação", "x-displayName": "Autenticação (User-Key)", description: TAG_DOCS["Autenticação"] },
      { name: "Operações", "x-displayName": "Intake e operações", description: "Ações sem vínculo: Intake (cadastro em lote), busca global e notificações." },
      ...setTags,
      { name: "Templates", "x-displayName": "Templates de projeto", description: "Templates de projeto (fases e tarefas com durações e dependências) usados por POST /Projects e pelo Intake." },
    ],
    // Menu lateral agrupado pelos módulos do app
    "x-tagGroups": [
      { name: "Começando", tags: ["Autenticação"] },
      { name: "Carteira", tags: ["Clients", "ClientGroups", "Contacts", "CsAssignments"] },
      { name: "Documentação", tags: ["DocumentationItems"] },
      { name: "Portfólio", tags: ["Projects", "Phases", "Tasks", "Comments", "Risks", "DelayLogs", "Templates"] },
      { name: "Diário", tags: ["OpenPoints", "Meetings", "History"] },
      { name: "Sustentação", tags: ["Incidents", "IncidentStakeholders"] },
      { name: "Pessoas e avisos", tags: ["Users", "Notifications"] },
      { name: "Lote e busca", tags: ["Operações"] },
    ],
    paths,
    components: {
      securitySchemes: {
        userKey: { type: "apiKey", in: "header", name: "User-Key", description: "Sua chave `ouk_...` — pegue em /api/minha-chave." },
        session: { type: "http", scheme: "bearer", description: "Sessão do login Google do Open (só para /user-key)." },
      },
      schemas,
    },
  };
}
