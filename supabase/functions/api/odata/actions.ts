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

// deno-lint-ignore no-explicit-any
type Body = any;

export interface WriteDef {
  create?: (ctx: Ctx, body: Body) => Promise<string>;
  update?: (ctx: Ctx, id: string, body: Body, ifMatch?: string | null) => Promise<void>;
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
