// Catálogo de escritas OData: POST/PATCH por entity set + actions/functions (operações de negócio).
// Uma única fonte alimenta o roteador, o $metadata, o OpenAPI e as tools do MCP.
import type { Ctx } from "../lib/context.ts";
import * as tasks from "../services/tasks.ts";
import * as projects from "../services/projects.ts";
import * as clients from "../services/clients.ts";
import * as incidents from "../services/incidents.ts";
import * as diary from "../services/diary.ts";
import * as intake from "../services/intake.ts";
import { searchAll } from "../services/search.ts";
import { resolveCode } from "../services/groups.ts";
import * as closeout from "../services/closeout.ts";
import * as docs from "../services/docs.ts";
import * as groupsWrite from "../services/groups_write.ts";

// deno-lint-ignore no-explicit-any
type Body = any;

export interface WriteDef {
  create?: (ctx: Ctx, body: Body) => Promise<string>;
  update?: (ctx: Ctx, id: string, body: Body, ifMatch?: string | null) => Promise<void>;
  /** DELETE /Set(id). Sem isso a exclusão não é permitida pela API. */
  delete?: (ctx: Ctx, id: string) => Promise<void>;
  /** Exemplo de payload para a documentação. */
  example?: Record<string, unknown>;
  patchExample?: Record<string, unknown>;
}

export const WRITES: Record<string, WriteDef> = {
  Tasks: {
    create: tasks.createTask,
    update: tasks.updateTask,
    example: {
      Name: "Levantamento de requisitos",
      ProjectId: "00000000-0000-4000-8000-0000000b0001",
      PhaseId: "00000000-0000-4000-8000-0000000f0002",
      Owners: [{ Email: "bruno.teste@ploomes.com", Kind: "Executor" }, { Email: "ana.teste@ploomes.com", Kind: "Validator" }],
      PlannedStart: "2026-11-03",
      DurationDays: 5,
      DependsOn: ["00000000-0000-4000-8000-0000000e0001"],
    },
    patchExample: { PlannedEnd: "2026-11-12", Delay: { Description: "Cliente atrasou o envio dos acessos", Responsibility: "ClientIt", Type: "Execution" } },
  },
  Projects: {
    create: async (ctx, b) => (await projects.createProject(ctx, b)).id,
    update: projects.updateProject,
    example: {
      Name: "Implantação ACME",
      Type: "NovaConta",
      Pm: { Email: "ana.teste@ploomes.com" },
      ClientIds: ["00000000-0000-4000-8000-0000000c0001"],
      StartDate: "2026-11-03",
      Phases: [
        { Name: "Kickoff", Tasks: [{ Ref: "k1", Name: "Reunião de kickoff", Type: "Meeting" }] },
        { Name: "Configuração", Tasks: [{ Ref: "c1", Name: "Configurar funis", DurationDays: 5, DependsOn: ["k1"], Owners: [{ Email: "bruno.teste@ploomes.com" }] }] },
      ],
    },
    patchExample: { Status: "InProgress", Overview: "## Objetivo\nImplantar o CRM no time comercial." },
  },
  Phases: { create: projects.createPhase, update: projects.updatePhase, example: { ProjectId: "00000000-0000-4000-8000-0000000b0001", Name: "Go-live" } },
  Clients: {
    create: clients.createClient,
    update: clients.updateClient,
    example: { Name: "ACME Ltda", Country: "BR", Status: "Implantacao", Owners: [{ Email: "ana.teste@ploomes.com" }] },
  },
  Contacts: {
    create: clients.createContact,
    update: clients.updateContact,
    example: { Name: "Maria Souza", Role: "Gerente Comercial", Email: "maria@acme.com", ClientIds: ["00000000-0000-4000-8000-0000000c0001"] },
  },
  Incidents: {
    create: incidents.createIncident,
    update: incidents.updateIncident,
    example: {
      Title: "Integração com ERP parada",
      Priority: "High",
      Impact: "High",
      Owner: { Email: "bruno.teste@ploomes.com" },
      ClientIds: ["00000000-0000-4000-8000-0000000c0001"],
      Deadline: "2026-10-30",
    },
  },
  OpenPoints: {
    create: diary.createOpenPoint,
    update: diary.updateOpenPoint,
    example: { ProjectId: "00000000-0000-4000-8000-0000000b0001", Title: "Definir campos obrigatórios do funil", Owner: { Email: "ana.teste@ploomes.com" }, DueDate: "2026-11-05" },
  },
  Meetings: {
    create: diary.createMeeting,
    example: {
      ProjectId: "00000000-0000-4000-8000-0000000b0001",
      Title: "Status semanal",
      Date: "2026-10-21",
      Participants: [{ Email: "ana.teste@ploomes.com" }],
      Items: [{ Text: "Cliente vai enviar a planilha de produtos", Type: "Action", Responsible: "Maria" }],
    },
  },
  History: { create: diary.addNote, example: { ProjectId: "00000000-0000-4000-8000-0000000b0001", Title: "Cliente aprovou o escopo", Detail: "Aprovado por e-mail." } },
  Risks: {
    create: diary.createRisk,
    update: diary.updateRisk,
    example: { ProjectId: "00000000-0000-4000-8000-0000000b0001", Description: "Atraso na liberação de acessos", Probability: "Medium", Impact: "High" },
  },
  ClientGroups: {
    create: groupsWrite.createClientGroup,
    update: groupsWrite.updateClientGroup,
    delete: groupsWrite.deleteClientGroup,
    example: {
      Name: "Grupo Lockton",
      ClientIds: ["00000000-0000-4000-8000-0000000c0001", "00000000-0000-4000-8000-0000000c0002"],
      ContactIds: ["00000000-0000-4000-8000-0000000a0001"],
    },
    patchExample: { Name: "Grupo Lockton Américas" },
  },
  DocumentationItems: {
    create: docs.createDocumentationItem,
    update: docs.updateDocumentationItem,
    delete: docs.deleteDocumentationItem,
    example: {
      Kind: "Link",
      ProjectId: "00000000-0000-4000-8000-0000000b0001",
      Title: "Coleção Postman da integração",
      Url: "https://exemplo.com/postman",
      Audience: "Technical",
      Tags: ["API", "Integração"],
    },
    patchExample: { Audience: "Both", Tags: ["API"] },
  },
  Comments: {
    create: async (ctx, b) => {
      const { TaskId, ...rest } = b ?? {};
      return await tasks.addComment(ctx, TaskId, rest);
    },
    example: { TaskId: "00000000-0000-4000-8000-0000000e0002", Text: "Acessos recebidos, começando amanhã." },
  },
};

export interface ParamDef {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
}

export interface ActionDef {
  name: string;
  kind: "action" | "function";
  boundTo?: string;
  params: ParamDef[];
  returns?: string;
  description: string;
  scope: "read" | "write";
  /** Entity set devolvido (lido de novo após a operação). */
  returnsEntity?: "self" | string;
  example?: Record<string, unknown>;
  run: (ctx: Ctx, id: string | undefined, body: Body) => Promise<unknown>;
}

const T = (t: string) => `Open.${t}`;
const p = (name: string, type: string, required = false, description?: string): ParamDef => ({ name, type, required, description });
const ok = { Ok: true };

export const ACTIONS: ActionDef[] = [
  // ── Tasks
  {
    name: "SetStatus",
    kind: "action",
    boundTo: "Tasks",
    scope: "write",
    returnsEntity: "self",
    returns: T("Task"),
    description: "Muda a etapa (marca StatusOverride). Preenche ActualStart/ActualEnd na transição, registra histórico e avisa o validador ao entrar em Validation.",
    params: [p("Status", T("TaskStatus"), true), p("Note", "Edm.String", false, "Vira um comentário na tarefa.")],
    example: { Status: "Validation", Note: "Pronto para validar." },
    run: (ctx, id, b) => tasks.setTaskStatus(ctx, id!, b),
  },
  {
    name: "ChangeDates",
    kind: "action",
    boundTo: "Tasks",
    scope: "write",
    returns: "Edm.Untyped",
    description:
      "Muda datas com a mesma engine do app: recalcula duração, empurra os dependentes (dias úteis + feriados), caminho crítico e etapa automática. Com Delay, registra o atraso.",
    params: [
      p("PlannedStart", "Edm.Date"),
      p("PlannedEnd", "Edm.Date"),
      p("PlannedDate", "Edm.Date"),
      p("ActualStart", "Edm.Date"),
      p("ActualEnd", "Edm.Date"),
      p("DurationDays", "Edm.Int32"),
      p("Delay", "Edm.Untyped", false, "{ Description, Responsibility, Type }"),
    ],
    example: { PlannedEnd: "2026-11-14", Delay: { Description: "Aguardando acessos do cliente", Responsibility: "ClientIt", Type: "Execution" } },
    run: async (ctx, id, b) => {
      const r = await tasks.changeTaskDates(ctx, id!, b);
      return { AffectedTaskIds: r.affected, DelayDays: r.delayDays };
    },
  },
  {
    name: "AddComment",
    kind: "action",
    boundTo: "Tasks",
    scope: "write",
    returnsEntity: "Comments",
    returns: T("Comment"),
    description: "Comenta na tarefa (menções: [@Nome](open:user/<id>) notificam a pessoa).",
    params: [p("Text", "Edm.String", true), p("ParentId", "Edm.Guid", false, "Responder a um comentário.")],
    example: { Text: "Bloqueado aguardando o cliente." },
    run: (ctx, id, b) => tasks.addComment(ctx, id!, b),
  },
  // ── Projects
  ...(["Archive", "Unarchive"] as const).map((n): ActionDef => ({
    name: n,
    kind: "action",
    boundTo: "Projects",
    scope: "write",
    returnsEntity: "self",
    returns: T("Project"),
    description: n === "Archive" ? "Arquiva o projeto." : "Desarquiva o projeto.",
    params: [],
    run: (ctx, id) => projects.setProjectArchived(ctx, id!, n === "Archive"),
  })),
  ...(["LinkClient", "UnlinkClient"] as const).map((n): ActionDef => ({
    name: n,
    kind: "action",
    boundTo: "Projects",
    scope: "write",
    returnsEntity: "self",
    returns: T("Project"),
    description: n === "LinkClient" ? "Vincula um cliente ao projeto." : "Remove o vínculo com um cliente.",
    params: [p("ClientId", "Edm.Guid", true)],
    run: (ctx, id, b) => projects.linkProjectClient(ctx, id!, b, n === "LinkClient"),
  })),
  {
    name: "SetBaseline",
    kind: "action",
    boundTo: "Projects",
    scope: "write",
    returnsEntity: "self",
    returns: T("Project"),
    description: "Define/refaz a baseline (tarefas concluídas que já têm baseline ficam congeladas).",
    params: [],
    run: (ctx, id) => projects.setBaseline(ctx, id!),
  },
  {
    name: "ClearBaseline",
    kind: "action",
    boundTo: "Projects",
    scope: "write",
    returnsEntity: "self",
    returns: T("Project"),
    description: "Remove a baseline do projeto.",
    params: [],
    run: (ctx, id) => projects.setBaseline(ctx, id!, true),
  },
  // ── Clients
  ...(["Archive", "Unarchive"] as const).map((n): ActionDef => ({
    name: n,
    kind: "action",
    boundTo: "Clients",
    scope: "write",
    returnsEntity: "self",
    returns: T("Client"),
    description: n === "Archive" ? "Arquiva o cliente." : "Desarquiva o cliente.",
    params: [],
    run: (ctx, id) => clients.setClientArchived(ctx, id!, n === "Archive"),
  })),
  {
    name: "AssignCs",
    kind: "action",
    boundTo: "Clients",
    scope: "write",
    returnsEntity: "self",
    returns: T("Client"),
    description: "Registra um novo CS para o cliente (histórico de CS).",
    params: [p("UserId", "Edm.Guid"), p("Email", "Edm.String"), p("Name", "Edm.String"), p("AssignedAt", "Edm.Date"), p("Note", "Edm.String")],
    example: { Email: "ana.teste@ploomes.com", Note: "Assumiu a conta após o go-live." },
    run: (ctx, id, b) => clients.assignCs(ctx, id!, b),
  },
  // ── Contacts
  ...(["LinkClient", "UnlinkClient"] as const).map((n): ActionDef => ({
    name: n,
    kind: "action",
    boundTo: "Contacts",
    scope: "write",
    returnsEntity: "self",
    returns: T("Contact"),
    description: n === "LinkClient" ? "Liga o contato a mais um cliente." : "Desliga o contato de um cliente.",
    params: [p("ClientId", "Edm.Guid", true)],
    run: (ctx, id, b) => clients.linkContactClient(ctx, id!, b, n === "LinkClient"),
  })),
  // ── Incidents
  {
    name: "SetStatus",
    kind: "action",
    boundTo: "Incidents",
    scope: "write",
    returnsEntity: "self",
    returns: T("Incident"),
    description: "Muda o status do incidente (StatusChangedAt, ResolvedAt na 1ª resolução, histórico e aviso ao owner e stakeholders).",
    params: [p("Status", T("IncidentStatus"), true), p("Note", "Edm.String")],
    example: { Status: "WaitingOnClient", Note: "Aguardando log do cliente." },
    run: (ctx, id, b) => incidents.setIncidentStatus(ctx, id!, b),
  },
  ...([["LinkClient", "client", true], ["UnlinkClient", "client", false], ["LinkProject", "project", true], ["UnlinkProject", "project", false]] as const)
    .map(([n, kind, link]): ActionDef => ({
      name: n,
      kind: "action",
      boundTo: "Incidents",
      scope: "write",
      returnsEntity: "self",
      returns: T("Incident"),
      description: `${link ? "Vincula" : "Desvincula"} ${kind === "client" ? "um cliente" : "um projeto"}.`,
      params: [p(kind === "client" ? "ClientId" : "ProjectId", "Edm.Guid", true)],
      run: (ctx, id, b) => incidents.linkIncident(ctx, id!, kind, b, link),
    })),
  {
    name: "AddStakeholder",
    kind: "action",
    boundTo: "Incidents",
    scope: "write",
    returnsEntity: "self",
    returns: T("Incident"),
    description: "Adiciona um stakeholder (membro, contato ou nome livre) e avisa o membro.",
    params: [p("UserId", "Edm.Guid"), p("Email", "Edm.String"), p("ContactId", "Edm.Guid"), p("Name", "Edm.String")],
    example: { Email: "ana.teste@ploomes.com" },
    run: (ctx, id, b) => incidents.addStakeholder(ctx, id!, b),
  },
  {
    name: "RemoveStakeholder",
    kind: "action",
    boundTo: "Incidents",
    scope: "write",
    returnsEntity: "self",
    returns: T("Incident"),
    description: "Remove um stakeholder.",
    params: [p("StakeholderId", "Edm.Guid", true)],
    run: (ctx, id, b) => incidents.removeStakeholder(ctx, id!, b),
  },
  // ── OpenPoints
  {
    name: "Resolve",
    kind: "action",
    boundTo: "OpenPoints",
    scope: "write",
    returnsEntity: "self",
    returns: T("OpenPoint"),
    description: "Resolve o ponto em aberto (registra no histórico).",
    params: [p("ResolutionNote", "Edm.String")],
    example: { ResolutionNote: "Cliente confirmou por e-mail." },
    run: (ctx, id, b) => diary.resolveOpenPoint(ctx, id!, b),
  },
  {
    name: "Reopen",
    kind: "action",
    boundTo: "OpenPoints",
    scope: "write",
    returnsEntity: "self",
    returns: T("OpenPoint"),
    description: "Reabre um ponto resolvido.",
    params: [],
    run: (ctx, id) => diary.reopenOpenPoint(ctx, id!),
  },
  // ── Encerramento (concluir tarefas abertas ao concluir projeto / resolver incidente)
  ...(["Projects", "Incidents"] as const).flatMap((set): ActionDef[] => [
    {
      name: "OpenTasks",
      kind: "function",
      boundTo: set,
      scope: "read",
      returns: "Edm.Untyped",
      description: `Tarefas ainda abertas ${set === "Projects" ? "do projeto" : "do incidente"} (o que o app pergunta se deve concluir ao encerrar).`,
      params: [],
      run: (ctx, id) => closeout.openTasks(ctx, set === "Projects" ? "project" : "incident", id!),
    },
    {
      name: "CompleteOpenTasks",
      kind: "action",
      boundTo: set,
      scope: "write",
      returns: "Edm.Untyped",
      description: "Conclui as tarefas abertas (todas ou as informadas): Concluído, etapa manual e Fim real = hoje. Mesmo efeito do modal de encerramento do app.",
      params: [{ name: "TaskIds", type: "Collection(Edm.Guid)", description: "Vazio = todas as abertas." }],
      example: {},
      run: (ctx, id, b) => closeout.completeOpenTasks(ctx, set === "Projects" ? "project" : "incident", id!, b),
    },
  ]),
  // ── Grupos de clientes
  ...(["AddClient", "RemoveClient"] as const).map((n): ActionDef => ({
    name: n,
    kind: "action",
    boundTo: "ClientGroups",
    scope: "write",
    returnsEntity: "self",
    returns: T("ClientGroup"),
    description: n === "AddClient"
      ? "Coloca um cliente no grupo (um cliente só pode estar em um grupo, salvo se a configuração permitir mais; os contatos do grupo passam a valer para ele)."
      : "Tira o cliente do grupo (os vínculos de contato que o grupo havia criado para ele são soltos).",
    params: [p("ClientId", "Edm.Guid", true)],
    run: (ctx, id, b) => groupsWrite.groupClient(ctx, id!, b, n === "AddClient"),
  })),
  ...(["AddContact", "RemoveContact"] as const).map((n): ActionDef => ({
    name: n,
    kind: "action",
    boundTo: "ClientGroups",
    scope: "write",
    returnsEntity: "self",
    returns: T("ClientGroup"),
    description: n === "AddContact"
      ? "Coloca um contato direto no grupo: ele passa a estar ligado a TODOS os clientes membros (inclusive os que entrarem depois)."
      : "Tira o contato do grupo (os vínculos que o grupo criou são soltos; vínculos feitos à mão continuam).",
    params: [p("ContactId", "Edm.Guid", true)],
    run: (ctx, id, b) => groupsWrite.groupContact(ctx, id!, b, n === "AddContact"),
  })),
  // ── Documentação
  {
    name: "DownloadLink",
    kind: "function",
    boundTo: "DocumentationItems",
    scope: "read",
    returns: "Edm.Untyped",
    description: "Link assinado e temporário (padrão 10 min, máx. 1 h) para baixar um item do tipo arquivo. Parâmetro opcional: ExpiresInSeconds.",
    params: [p("ExpiresInSeconds", "Edm.Int32")],
    run: (ctx, id, b) => docs.documentationFileLink(ctx, id!, { ExpiresInSeconds: b?.ExpiresInSeconds === undefined ? undefined : Number(b.ExpiresInSeconds) }),
  },
  {
    name: "RequestDocumentationUpload",
    kind: "action",
    scope: "write",
    returns: "Edm.Untyped",
    description:
      "Upload direto de arquivo local, sem base64 e sem URL pública: devolve `UploadUrl` (URL assinada do Storage, só permite criar o caminho `StoragePath`, sem sobrescrever) e o `Curl` pronto. Depois do PUT do arquivo nessa URL, finalize com `POST /DocumentationItems` `{Kind:'File', ProjectId|ClientId, StoragePath, FileName, Title, Audience, Tags}`. Não grava item nenhum. Limite de 25 MB.",
    params: [p("ProjectId", "Edm.Guid"), p("ClientId", "Edm.Guid"), p("FileName", "Edm.String", true), p("Size", "Edm.Int64", false, "Bytes (opcional): recusa já aqui se passar de 25 MB."), p("ContentType", "Edm.String")],
    example: { ProjectId: "00000000-0000-4000-8000-0000000b0001", FileName: "arquitetura.pdf", Size: 1572864, ContentType: "application/pdf" },
    run: (ctx, _id, b) => docs.requestDocumentationUpload(ctx, b),
  },
  // ── unbound
  {
    name: "MarkNotificationsRead",
    kind: "action",
    scope: "write",
    returns: "Edm.Untyped",
    description: "Marca notificações do usuário como lidas (todas, ou só os Ids informados).",
    params: [p("Ids", "Collection(Edm.Guid)")],
    run: async (ctx, _id, b) => ({ Updated: await diary.markNotificationsRead(ctx, b) }),
  },
  {
    name: "Intake",
    kind: "action",
    scope: "write",
    returns: "Edm.Untyped",
    description:
      "Cadastro em lote de demandas (clientes, projetos com fases/tarefas, incidentes, tarefas avulsas) com referências cruzadas. DryRun=true (padrão) só simula e devolve o plano.",
    params: [p("DryRun", "Edm.Boolean"), p("Items", "Collection(Edm.Untyped)", true)],
    example: intake.EXAMPLE,
    run: (ctx, _id, b) => intake.runIntake(ctx, b),
  },
  {
    name: "Search",
    kind: "function",
    scope: "read",
    returns: "Edm.Untyped",
    description: "Busca textual em projetos, tarefas, incidentes, clientes, contatos e pontos em aberto.",
    params: [p("q", "Edm.String", true), p("top", "Edm.Int32")],
    run: (ctx, _id, b) => searchAll(ctx, String(b?.q ?? ""), Number(b?.top ?? 10)),
  },
  {
    name: "ResolveCode",
    kind: "function",
    scope: "read",
    returns: "Edm.Untyped",
    description:
      "Resolve um código curto (ex.: C26000123 — C cliente, P projeto, I incidente, T tarefa, K contato, G grupo, R risco, D documentação) no registro e no link do app (/r/<código>).",
    params: [p("code", "Edm.String", true)],
    run: (ctx, _id, b) => resolveCode(ctx, String(b?.code ?? "")),
  },
];

export function findAction(name: string, boundTo?: string): ActionDef | undefined {
  const clean = name.replace(/^Open\./, "").replace(/\(.*\)$/, "");
  return ACTIONS.find((a) => a.name.toLowerCase() === clean.toLowerCase() && (a.boundTo ?? null) === (boundTo ?? null));
}

export { ok };
