// Intake: cadastro em lote de demandas para agentes de IA.
//
// Recebe uma lista heterogênea (Client | Project | Incident | Task) com referências cruzadas por Ref.
// Clientes/projetos com o mesmo nome são REAPROVEITADOS; nomes parecidos viram "Ambiguous" (com candidatos)
// e bloqueiam o commit até o agente decidir (Id explícito ou ForceCreate=true).
// O dry-run executa tudo de verdade dentro da transação e desfaz no fim — o preview é fiel ao commit.
import { z } from "zod";
import type { Ctx } from "../lib/context.ts";
import { uiLink } from "../lib/context.ts";
import { conflict, validation } from "../lib/errors.ts";
import { Guid, IsoDate, lockName, OwnerInput, parseBody, Text } from "./shared.ts";
import { createClient } from "./clients.ts";
import { createProject, PlanPhaseInput } from "./projects.ts";
import { createIncident } from "./incidents.ts";
import { createTask } from "./tasks.ts";

const Ref = z.string().trim().min(1).max(60);
const PersonRef = z.object({ UserId: Guid.optional(), Email: z.string().email().optional() }).strict();

const ClientItem = z.object({
  Kind: z.literal("Client"),
  Ref: Ref.optional(),
  Id: Guid.optional(),
  ForceCreate: z.boolean().optional(),
  Name: Text(300),
  Country: z.string().optional(),
  Status: z.string().optional(),
  PloomesLink: z.string().optional(),
  Notes: z.string().optional(),
  Owners: z.array(OwnerInput).optional(),
}).strict();

const ProjectItem = z.object({
  Kind: z.literal("Project"),
  Ref: Ref.optional(),
  Id: Guid.optional(),
  ForceCreate: z.boolean().optional(),
  Name: Text(300),
  Type: z.string().optional(),
  Status: z.string().optional(),
  Language: z.string().optional(),
  Pm: PersonRef,
  DevLead: PersonRef.optional(),
  ClientRefs: z.array(Ref).optional(),
  ClientIds: z.array(Guid).optional(),
  Overview: z.string().optional(),
  ProposalLink: z.string().optional(),
  DealLink: z.string().optional(),
  StartDate: IsoDate.optional(),
  TemplateId: Guid.optional(),
  Phases: z.array(PlanPhaseInput).optional(),
}).strict();

const IncidentItem = z.object({
  Kind: z.literal("Incident"),
  Ref: Ref.optional(),
  Title: Text(300),
  Priority: z.string(),
  Impact: z.string(),
  Owner: OwnerInput,
  Description: z.string().optional(),
  Deadline: IsoDate.optional(),
  ClientRefs: z.array(Ref).optional(),
  ClientIds: z.array(Guid).optional(),
  ProjectRefs: z.array(Ref).optional(),
  ProjectIds: z.array(Guid).optional(),
}).strict();

const TaskItem = z.object({
  Kind: z.literal("Task"),
  Ref: Ref.optional(),
  Name: Text(300),
  Type: z.string().optional(),
  Description: z.string().optional(),
  ProjectRef: Ref.optional(),
  ProjectId: Guid.optional(),
  PhaseName: z.string().optional(),
  PhaseId: Guid.optional(),
  IncidentRef: Ref.optional(),
  IncidentId: Guid.optional(),
  ClientRef: Ref.optional(),
  ClientId: Guid.optional(),
  ClientRefs: z.array(Ref).optional(),
  ClientIds: z.array(Guid).optional(),
  Owners: z.array(OwnerInput).min(1),
  PlannedStart: IsoDate.optional(),
  PlannedEnd: IsoDate.optional(),
  PlannedDate: IsoDate.optional(),
  DurationDays: z.number().int().optional(),
  RiskFlag: z.string().optional(),
  Status: z.string().optional(),
  HiddenFromPlan: z.boolean().optional(),
}).strict();

const IntakeInput = z.object({
  DryRun: z.boolean().optional(),
  Items: z.array(z.discriminatedUnion("Kind", [ClientItem, ProjectItem, IncidentItem, TaskItem])).min(1).max(100),
}).strict();

export const EXAMPLE = {
  DryRun: true,
  Items: [
    { Kind: "Client", Ref: "c1", Name: "ACME Ltda", Country: "BR", Status: "Implantacao" },
    {
      Kind: "Project",
      Ref: "p1",
      Name: "Implantação ACME",
      Type: "NovaConta",
      Pm: { Email: "ana.teste@ploomes.com" },
      ClientRefs: ["c1"],
      StartDate: "2026-11-03",
      Phases: [
        { Name: "Kickoff", Tasks: [{ Ref: "t1", Name: "Reunião de kickoff", Type: "Meeting", Owners: [{ Email: "ana.teste@ploomes.com" }] }] },
        { Name: "Configuração", Tasks: [{ Ref: "t2", Name: "Configurar funis", DurationDays: 5, DependsOn: ["t1"], Owners: [{ Email: "bruno.teste@ploomes.com" }] }] },
      ],
    },
    { Kind: "Incident", Ref: "i1", Title: "Integração com ERP parada", Priority: "High", Impact: "High", Owner: { Email: "bruno.teste@ploomes.com" }, ClientRefs: ["c1"] },
    { Kind: "Task", Ref: "s1", Name: "Enviar proposta revisada", ClientRef: "c1", Owners: [{ Email: "ana.teste@ploomes.com" }], PlannedEnd: "2026-11-10", PlannedStart: "2026-11-06" },
  ],
};

interface PlanItem {
  Ref?: string;
  Kind: string;
  Action: "Create" | "Reuse" | "Ambiguous";
  Id?: string;
  Name: string;
  Link?: string;
  Candidates?: { Id: string; Name: string }[];
  Warnings?: string[];
  Detail?: string;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

async function matchByName(ctx: Ctx, table: "clients" | "projects", name: string) {
  const rows = await ctx.tx.unsafe(
    table === "clients"
      ? `select id, name from public.clients where not archived and name ilike $1 order by name limit 6`
      : `select id, name from public.projects where coalesce(archived, false) = false and name ilike $1 order by name limit 6`,
    [`%${name.replace(/[\\%_]/g, (m) => "\\" + m)}%`],
  ) as unknown as { id: string; name: string }[];
  const exact = rows.filter((r) => fold(r.name) === fold(name));
  return { exact, similar: rows.filter((r) => !exact.includes(r)) };
}

export async function runIntake(ctx: Ctx, body: unknown) {
  const d = parseBody(IntakeInput, body);
  const dryRun = d.DryRun !== false;
  const refs = new Map<string, { kind: string; id: string }>();
  const plan: PlanItem[] = [];
  const setRef = (ref: string | undefined, kind: string, id: string) => {
    if (!ref) return;
    if (refs.has(ref)) throw validation(`Ref duplicado: '${ref}'.`);
    refs.set(ref, { kind, id });
  };
  const fromRef = (ref: string, kind: string, field: string) => {
    const r = refs.get(ref);
    if (!r) throw validation(`${field}: Ref '${ref}' não definido nos Items.`, field);
    if (r.kind !== kind) throw validation(`${field}: Ref '${ref}' é um ${r.kind}, esperava ${kind}.`, field);
    if (r.id === PENDING) throw new Pending(ref);
    return r.id;
  };

  // ordem segura: clientes → projetos → incidentes → tarefas
  const order = { Client: 0, Project: 1, Incident: 2, Task: 3 } as const;
  const items = [...d.Items].sort((a, b) => order[a.Kind] - order[b.Kind]);

  for (const it of items) {
    try {
      await handle(it);
    } catch (e) {
      if (!(e instanceof Pending)) throw e;
      const name = "Name" in it ? it.Name : it.Title;
      plan.push({ Ref: it.Ref, Kind: it.Kind, Action: "Ambiguous", Name: name, Detail: `Depende de '${e.ref}', que está ambíguo.` });
      if (it.Ref) refs.set(it.Ref, { kind: it.Kind, id: PENDING });
    }
  }

  // deno-lint-ignore no-explicit-any
  async function handle(it: any) {
    if (it.Kind === "Client") {
      if (it.Id) {
        setRef(it.Ref, "Client", it.Id);
        plan.push({ Ref: it.Ref, Kind: "Client", Action: "Reuse", Id: it.Id, Name: it.Name, Link: uiLink.client(it.Id) });
        return;
      }
      await lockName(ctx, "client", it.Name); // corrida com outro intake/criação do mesmo cliente
      const m = await matchByName(ctx, "clients", it.Name);
      if (m.exact.length && !it.ForceCreate) {
        setRef(it.Ref, "Client", m.exact[0].id);
        plan.push({ Ref: it.Ref, Kind: "Client", Action: "Reuse", Id: m.exact[0].id, Name: m.exact[0].name, Link: uiLink.client(m.exact[0].id) });
        return;
      }
      if (m.similar.length && !it.ForceCreate) {
        plan.push({
          Ref: it.Ref,
          Kind: "Client",
          Action: "Ambiguous",
          Name: it.Name,
          Candidates: m.similar.map((s) => ({ Id: s.id, Name: s.name })),
          Detail: "Informe Id de um candidato ou ForceCreate=true.",
        });
        if (it.Ref) refs.set(it.Ref, { kind: "Client", id: PENDING });
        return;
      }
      const { Kind: _k, Ref: _r, Id: _i, ForceCreate: _f, ...rest } = it;
      const id = await createClient(ctx, rest);
      setRef(it.Ref, "Client", id);
      plan.push({ Ref: it.Ref, Kind: "Client", Action: "Create", Id: id, Name: it.Name, Link: uiLink.client(id) });
    } else if (it.Kind === "Project") {
      if (it.Id) {
        setRef(it.Ref, "Project", it.Id);
        plan.push({ Ref: it.Ref, Kind: "Project", Action: "Reuse", Id: it.Id, Name: it.Name, Link: uiLink.project(it.Id) });
        return;
      }
      await lockName(ctx, "project", it.Name);
      const m = await matchByName(ctx, "projects", it.Name);
      if ((m.exact.length || m.similar.length) && !it.ForceCreate) {
        const exact = m.exact[0];
        if (exact && !it.Phases?.length && !it.TemplateId) {
          setRef(it.Ref, "Project", exact.id);
          plan.push({ Ref: it.Ref, Kind: "Project", Action: "Reuse", Id: exact.id, Name: exact.name, Link: uiLink.project(exact.id) });
          return;
        }
        plan.push({
          Ref: it.Ref,
          Kind: "Project",
          Action: "Ambiguous",
          Name: it.Name,
          Candidates: [...m.exact, ...m.similar].map((s) => ({ Id: s.id, Name: s.name })),
          Detail: "Já existe projeto com nome igual/parecido. Informe Id (reaproveitar) ou ForceCreate=true.",
        });
        if (it.Ref) refs.set(it.Ref, { kind: "Project", id: PENDING });
        return;
      }
      const clientIds = [...(it.ClientIds ?? []), ...(it.ClientRefs ?? []).map((r: string) => fromRef(r, "Client", "ClientRefs"))];
      const { Kind: _k, Ref: _r, Id: _i, ForceCreate: _f, ClientRefs: _c, ...rest } = it;
      const r = await createProject(ctx, { ...rest, ClientIds: clientIds });
      setRef(it.Ref, "Project", r.id);
      for (const [taskRef, taskId] of Object.entries(r.refs)) setRef(taskRef, "Task", taskId);
      const nTasks = (it.Phases ?? []).reduce((s: number, ph: { Tasks?: unknown[] }) => s + (ph.Tasks?.length ?? 0), 0);
      plan.push({
        Ref: it.Ref,
        Kind: "Project",
        Action: "Create",
        Id: r.id,
        Name: it.Name,
        Link: uiLink.project(r.id),
        Detail: it.TemplateId ? "a partir de template" : `${it.Phases?.length ?? 0} fase(s), ${nTasks} tarefa(s)`,
      });
    } else if (it.Kind === "Incident") {
      const clientIds = [...(it.ClientIds ?? []), ...(it.ClientRefs ?? []).map((r: string) => fromRef(r, "Client", "ClientRefs"))];
      const projectIds = [...(it.ProjectIds ?? []), ...(it.ProjectRefs ?? []).map((r: string) => fromRef(r, "Project", "ProjectRefs"))];
      const warnings: string[] = [];
      const [dup] = await ctx.tx`select id from incidents where lower(title) = lower(${it.Title}) and status not in ('resolved','closed') limit 1`;
      if (dup) warnings.push(`Já existe incidente aberto com o mesmo título (${dup.id}).`);
      const { Kind: _k, Ref: _r, ClientRefs: _c, ProjectRefs: _p, ...rest } = it;
      const id = await createIncident(ctx, { ...rest, ClientIds: clientIds, ProjectIds: projectIds });
      setRef(it.Ref, "Incident", id);
      plan.push({ Ref: it.Ref, Kind: "Incident", Action: "Create", Id: id, Name: it.Title, Link: uiLink.incident(id), Warnings: warnings.length ? warnings : undefined });
    } else {
      const projectId = it.ProjectId ?? (it.ProjectRef ? fromRef(it.ProjectRef, "Project", "ProjectRef") : undefined);
      const incidentId = it.IncidentId ?? (it.IncidentRef ? fromRef(it.IncidentRef, "Incident", "IncidentRef") : undefined);
      const clientIds = [...new Set([
        ...(it.ClientIds ?? []),
        ...(it.ClientId ? [it.ClientId] : []),
        ...(it.ClientRef ? [fromRef(it.ClientRef, "Client", "ClientRef")] : []),
        ...(it.ClientRefs ?? []).map((r: string) => fromRef(r, "Client", "ClientRefs")),
      ])];
      let phaseId = it.PhaseId;
      if (projectId && !phaseId && it.PhaseName) {
        const [ph] = await ctx.tx<{ id: string }[]>`select id from phases where project_id = ${projectId} and lower(name) = lower(${it.PhaseName}) limit 1`;
        if (!ph) throw validation(`Fase '${it.PhaseName}' não existe no projeto.`, "PhaseName");
        phaseId = ph.id;
      }
      const { Kind: _k, Ref: _r, ProjectRef: _pr, IncidentRef: _ir, ClientRef: _cr, ClientRefs: _crs, ClientId: _ci, ClientIds: _cis, PhaseName: _pn, ...rest } = it;
      const id = await createTask(ctx, {
        ...rest,
        ...(projectId ? { ProjectId: projectId, PhaseId: phaseId } : {}),
        ...(incidentId ? { IncidentId: incidentId } : {}),
        ...(!projectId && !incidentId && clientIds.length ? { ClientIds: clientIds } : {}),
      });
      setRef(it.Ref, "Task", id);
      plan.push({ Ref: it.Ref, Kind: "Task", Action: "Create", Id: id, Name: it.Name, Link: uiLink.task({ id, project_id: projectId, incident_id: incidentId }) });
    }
  }

  const ambiguous = plan.filter((p) => p.Action === "Ambiguous");
  const summary = buildSummary(plan, dryRun);
  if (!dryRun && ambiguous.length) {
    throw conflict(`Há ${ambiguous.length} item(ns) ambíguo(s); resolva antes de gravar.`, ambiguous.map((a) => ({
      code: "Ambiguous",
      message: `${a.Kind} '${a.Name}': ${a.Candidates?.map((c) => `${c.Name} (${c.Id})`).join("; ")}`,
      target: a.Ref,
    })));
  }
  return { DryRun: dryRun, Committed: !dryRun, Summary: summary, Plan: plan };
}

function buildSummary(plan: PlanItem[], dryRun: boolean): string {
  const label: Record<string, [string, string]> = {
    Client: ["cliente", "clientes"],
    Project: ["projeto", "projetos"],
    Incident: ["incidente", "incidentes"],
    Task: ["tarefa", "tarefas"],
  };
  const part = (action: PlanItem["Action"]) =>
    Object.keys(label).map((k) => {
      const list = plan.filter((p) => p.Kind === k && p.Action === action);
      if (!list.length) return "";
      const [s, pl] = label[k];
      return `${list.length} ${list.length > 1 ? pl : s} (${list.map((p) => p.Name + (p.Detail && action === "Create" ? ` — ${p.Detail}` : "")).join("; ")})`;
    }).filter(Boolean).join(", ");
  const create = part("Create"), reuse = part("Reuse"), amb = part("Ambiguous");
  const lines = [
    dryRun ? `Estou prestes a criar: ${create || "nada"}.` : `Criado: ${create || "nada"}.`,
    reuse ? `${dryRun ? "Vou reaproveitar" : "Reaproveitado"}: ${reuse}.` : "",
    amb ? `Precisa de decisão (nome parecido com registros existentes): ${amb}.` : "",
    dryRun ? "Nada foi gravado ainda. É basicamente isso?" : "",
  ];
  return lines.filter(Boolean).join("\n");
}

const PENDING = "pending";
class Pending extends Error {
  constructor(public ref: string) {
    super(`pending:${ref}`);
  }
}
