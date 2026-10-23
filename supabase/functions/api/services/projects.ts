// Projetos e fases. Criação "profunda" (projeto + fases + tarefas + clientes) numa transação só.
import { z } from "zod";
import { parseISO } from "date-fns";
import type { Ctx } from "../lib/context.ts";
import { badRequest, notFound, validation } from "../lib/errors.ts";
import { Enums } from "../odata/edm.ts";
import { completeOpenTasks } from "./closeout.ts";
import { addWorkdays, parseHolidays, toISODate } from "../domain/businessDays.ts";
import type { EntryOwner } from "../domain/types.ts";
import {
  addHistory,
  assertNoCycle,
  checkEtag,
  collabReset,
  findPerson,
  Guid,
  lockScope,
  IsoDate,
  notify,
  OwnerInput,
  parseBody,
  refreshCritical,
  resolveOwners,
  Text,
  zEnum,
} from "./shared.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const PersonRef = z.object({ UserId: Guid.optional(), Email: z.string().email().optional() }).strict()
  .refine((x) => x.UserId || x.Email, "Informe UserId ou Email.");

export const PlanTaskInput = z.object({
  Ref: z.string().max(60).optional(),
  Name: Text(300),
  Type: zEnum(Enums.TaskType).optional(),
  Description: z.string().max(50_000).optional(),
  Owners: z.array(OwnerInput).max(10).optional(),
  DurationDays: z.number().int().min(1).max(3650).optional(),
  DurationHours: z.number().positive().max(1000).optional(),
  PlannedStart: IsoDate.optional(),
  PlannedEnd: IsoDate.optional(),
  PlannedDate: IsoDate.optional(),
  DependsOn: z.array(z.string().max(60)).max(50).optional(),
  RiskFlag: zEnum(Enums.RiskFlag).optional(),
}).strict();

export const PlanPhaseInput = z.object({
  Ref: z.string().max(60).optional(),
  Name: Text(200),
  Tasks: z.array(PlanTaskInput).max(300).optional(),
}).strict();

export const ProjectCreate = z.object({
  Name: Text(300),
  Type: zEnum(Enums.ProjectType).optional(),
  Status: zEnum(Enums.ProjectStatus).optional(),
  Language: zEnum(Enums.Language).optional(),
  Pm: PersonRef,
  DevLead: PersonRef.optional(),
  DevType: z.enum(["integration", "application"]).optional(),
  DevIntegration: z.string().max(300).optional(),
  ClientIds: z.array(Guid).max(20).optional(),
  Overview: z.string().max(100_000).optional(),
  ProposalLink: z.string().url().max(2000).optional(),
  DealLink: z.string().url().max(2000).optional(),
  StartDate: IsoDate.optional(),
  TemplateId: Guid.optional(),
  Phases: z.array(PlanPhaseInput).max(50).optional(),
}).strict();

export const ProjectPatch = z.object({
  Name: Text(300).optional(),
  Type: zEnum(Enums.ProjectType).optional(),
  Status: zEnum(Enums.ProjectStatus).optional(),
  Language: zEnum(Enums.Language).optional(),
  Pm: PersonRef.optional(),
  DevLead: PersonRef.nullable().optional(),
  DevType: z.enum(["integration", "application"]).nullable().optional(),
  DevIntegration: z.string().max(300).nullable().optional(),
  Overview: z.string().max(100_000).nullable().optional(),
  CharterDoc: z.string().max(200_000).nullable().optional(),
  ProposalLink: z.string().url().max(2000).nullable().optional(),
  DealLink: z.string().url().max(2000).nullable().optional(),
  Hidden: z.boolean().optional(),
  CompleteOpenTasks: z.boolean().optional(),
  Team: z.array(z.object({ Name: Text(200), Role: z.string().max(200).optional(), Email: z.string().email().optional(), UserId: Guid.optional() }).strict()).max(100).optional(),
  Links: z.array(z.object({ Label: Text(200), Url: z.string().url().max(2000) }).strict()).max(50).optional(),
}).strict();

export const PhaseCreate = z.object({ ProjectId: Guid, Name: Text(200), Order: z.number().int().min(0).optional() }).strict();
export const PhasePatch = z.object({ Name: Text(200).optional(), Order: z.number().int().min(0).optional() }).strict();
export const ClientRef = z.object({ ClientId: Guid }).strict();

async function loadProject(ctx: Ctx, id: string): Promise<Row> {
  const [r] = await ctx.tx<Row[]>`select * from projects where id = ${id} for update`;
  if (!r) throw notFound(`Projects(${id}) não encontrado.`);
  return r;
}

// ─── agenda de um plano (template ou fases enviadas) ───────────────────────

export interface PlannedTask {
  id: string;
  ref?: string;
  phaseIndex: number;
  name: string;
  type: string;
  description?: string;
  owners: EntryOwner[];
  dependsOn: string[]; // ids
  plannedStart?: string;
  plannedEnd?: string;
  plannedDate?: string;
  durationDays?: number;
  durationHours?: number;
  riskFlag: string;
  order: number;
}

/**
 * Converte o plano em tarefas com datas: com StartDate, cada tarefa começa no próximo dia útil após o fim
 * das suas dependências (ou no StartDate) e dura DurationDays dias úteis — o mesmo cálculo da cascata do app.
 */
export async function schedulePlan(
  ctx: Ctx,
  phases: z.infer<typeof PlanPhaseInput>[],
  startDate: string | undefined,
): Promise<PlannedTask[]> {
  const h = parseHolidays(ctx.settings.holidays);
  const refToId = new Map<string, string>();
  const tasks: PlannedTask[] = [];
  for (const [pi, ph] of phases.entries()) {
    for (const [ti, t] of (ph.Tasks ?? []).entries()) {
      const id = crypto.randomUUID();
      if (t.Ref) {
        if (refToId.has(t.Ref)) throw validation(`Ref duplicado no plano: '${t.Ref}'.`);
        refToId.set(t.Ref, id);
      }
      const type = t.Type ?? "task";
      tasks.push({
        id,
        ref: t.Ref,
        phaseIndex: pi,
        name: t.Name,
        type,
        description: t.Description,
        owners: t.Owners ? await resolveOwners(ctx, t.Owners) : [],
        dependsOn: [],
        plannedStart: t.PlannedStart,
        plannedEnd: t.PlannedEnd,
        plannedDate: t.PlannedDate,
        durationDays: type === "task" ? t.DurationDays ?? 1 : undefined,
        durationHours: t.DurationHours,
        riskFlag: t.RiskFlag ?? "none",
        order: ti,
      });
    }
  }
  // dependências por Ref
  let k = 0;
  for (const ph of phases) {
    for (const t of ph.Tasks ?? []) {
      const deps = (t.DependsOn ?? []).map((r) => {
        const id = refToId.get(r);
        if (!id) throw validation(`DependsOn referencia Ref inexistente: '${r}' (tarefa '${t.Name}').`);
        return id;
      });
      tasks[k++].dependsOn = deps;
    }
  }
  assertNoCycle(tasks);
  if (!startDate) return tasks;

  // ordem topológica + datas
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const done = new Set<string>();
  const ends = new Map<string, string>();
  const visit = (t: PlannedTask) => {
    if (done.has(t.id)) return;
    for (const d of t.dependsOn) visit(byId.get(d)!);
    let start = startDate;
    for (const d of t.dependsOn) {
      const next = toISODate(addWorkdays(parseISO(ends.get(d)!), 1, h));
      if (next > start) start = next;
    }
    if (t.type === "task") {
      t.plannedStart ??= start;
      t.plannedEnd ??= toISODate(addWorkdays(parseISO(t.plannedStart), (t.durationDays ?? 1) - 1, h));
      ends.set(t.id, t.plannedEnd);
    } else {
      t.plannedDate ??= start;
      ends.set(t.id, t.plannedDate);
    }
    done.add(t.id);
  };
  tasks.forEach(visit);
  return tasks;
}

async function templatePhases(_ctx: Ctx, templateId: string): Promise<z.infer<typeof PlanPhaseInput>[]> {
  // templates vivem em open_api (fora do RLS do app): leitura feita pelo dono do schema
  const { admin } = await import("../lib/db.ts");
  const [t] = await admin()<{ structure: { phases?: unknown[] } }[]>`select structure from open_api.project_templates where id = ${templateId}`;
  if (!t) throw validation("Template não encontrado.", "TemplateId");
  return z.array(PlanPhaseInput).parse(t.structure?.phases ?? []);
}

export async function insertPlan(ctx: Ctx, projectId: string, phases: z.infer<typeof PlanPhaseInput>[], tasks: PlannedTask[]) {
  const phaseIds: string[] = [];
  const [{ n: base }] = await ctx.tx<{ n: number }[]>`select coalesce(max("order") + 1, 0)::int as n from phases where project_id = ${projectId}`;
  for (const [i, ph] of phases.entries()) {
    const [r] = await ctx.tx<{ id: string }[]>`
      insert into phases (project_id, name, "order", is_unassigned) values (${projectId}, ${ph.Name}, ${base + i}, false) returning id`;
    phaseIds.push(r.id);
  }
  const now = new Date().toISOString();
  for (const t of tasks) {
    const primary = t.owners.find((o) => (o.kind ?? "executor") === "executor") ?? t.owners[0];
    await ctx.tx`insert into entries ${
      ctx.tx({
        id: t.id,
        project_id: projectId,
        phase_id: phaseIds[t.phaseIndex],
        type: t.type,
        name: t.name,
        description: t.description ?? null,
        owners: ctx.tx.json(t.owners as never),
        responsible: primary?.name ?? null,
        responsible_member_id: primary?.type === "member" ? primary.memberId ?? null : null,
        depends_on: ctx.tx.json(t.dependsOn as never),
        planned_start: t.plannedStart ?? null,
        planned_end: t.plannedEnd ?? null,
        planned_date: t.plannedDate ?? null,
        duration_days: t.durationDays ?? null,
        duration_hours: t.durationHours ?? null,
        risk_flag: t.riskFlag,
        status: "pending",
        order: t.order,
        created_by: ctx.user.id,
        updated_by: ctx.user.id,
        last_activity_at: now,
      })
    }`;
  }
  return phaseIds;
}

// ─── projetos ───────────────────────────────────────────────────────────────

export async function createProject(ctx: Ctx, body: unknown): Promise<{ id: string; refs: Record<string, string> }> {
  const d = parseBody(ProjectCreate, body);
  if (d.TemplateId && d.Phases?.length) throw validation("Use TemplateId OU Phases, não os dois.");
  const pm = await findPerson(ctx, d.Pm, "Pm");
  const dev = d.DevLead ? await findPerson(ctx, d.DevLead, "DevLead") : null;
  const clientIds = [...new Set(d.ClientIds ?? [])];
  if (clientIds.length) {
    const found = await ctx.tx<{ id: string }[]>`select id from clients where id = any(${clientIds}::uuid[])`;
    if (found.length !== clientIds.length) throw validation("Algum ClientId não existe.", "ClientIds");
  }
  const phases = d.TemplateId ? await templatePhases(ctx, d.TemplateId) : d.Phases ?? [];
  const tasks = await schedulePlan(ctx, phases, d.StartDate);

  const id = crypto.randomUUID();
  await ctx.tx`insert into projects ${
    ctx.tx({
      id,
      name: d.Name,
      type: d.Type ?? "novo_projeto",
      status: d.Status ?? "planning",
      language: d.Language ?? ctx.settings.defaultLanguage,
      pm: pm.name,
      pm_member_id: pm.id,
      dev_lead: dev?.name ?? null,
      dev_lead_member_id: dev?.id ?? null,
      dev_type: d.DevType ?? null,
      dev_integration: d.DevIntegration ?? null,
      overview: d.Overview ?? null,
      proposal_link: d.ProposalLink ?? null,
      deal_link: d.DealLink ?? null,
      client_id: clientIds[0] ?? null,
      created_by: ctx.user.id,
      updated_by: ctx.user.id,
    })
  }`;
  for (const c of clientIds) await ctx.tx`insert into project_clients (project_id, client_id) values (${id}, ${c})`;
  await insertPlan(ctx, id, phases, tasks);
  await refreshCritical(ctx, "project", id);
  await addHistory(ctx, { projectId: id }, { event: "project_created", title: d.Name });
  const refs: Record<string, string> = {};
  for (const t of tasks) if (t.ref) refs[t.ref] = t.id;
  return { id, refs };
}

export async function updateProject(ctx: Ctx, id: string, body: unknown, ifMatch?: string | null) {
  const d = parseBody(ProjectPatch, body);
  await checkEtag(ctx, "projects", id, ifMatch);
  const row = await loadProject(ctx, id);
  const set: Row = {};
  if (d.Name !== undefined && d.Name !== row.name) set.name = d.Name;
  if (d.Type !== undefined) set.type = d.Type;
  if (d.Status !== undefined) set.status = d.Status;
  if (d.Language !== undefined) set.language = d.Language;
  if (d.Pm) {
    const pm = await findPerson(ctx, d.Pm, "Pm");
    Object.assign(set, { pm: pm.name, pm_member_id: pm.id });
  }
  if (d.DevLead !== undefined) {
    const dev = d.DevLead ? await findPerson(ctx, d.DevLead, "DevLead") : null;
    Object.assign(set, { dev_lead: dev?.name ?? null, dev_lead_member_id: dev?.id ?? null });
  }
  for (const [k, c] of [["DevType", "dev_type"], ["DevIntegration", "dev_integration"], ["ProposalLink", "proposal_link"], ["DealLink", "deal_link"], ["Hidden", "hidden"]] as const) {
    if (d[k] !== undefined) set[c] = d[k];
  }
  if (d.Team) set.team = ctx.tx.json(d.Team.map((m) => ({ id: crypto.randomUUID(), name: m.Name, role: m.Role ?? "", email: m.Email, user_id: m.UserId })) as never);
  if (d.Links) set.links = ctx.tx.json(d.Links.map((l) => ({ id: crypto.randomUUID(), label: l.Label, url: l.Url })) as never);
  if (d.Overview !== undefined && d.Overview !== row.overview) {
    await collabReset(ctx, `project_${id}_overview`); // como o front: zera o documento colaborativo antes
    set.overview = d.Overview;
  }
  if (Object.keys(set).length) {
    set.updated_by = ctx.user.id;
    await ctx.tx`update projects set ${ctx.tx(set)} where id = ${id}`;
  }
  if (d.CharterDoc !== undefined && d.CharterDoc !== row.charter_doc) {
    await ctx.tx`update projects set charter_doc = ${d.CharterDoc} where id = ${id}`;
    await collabReset(ctx, `project_${id}_charter`);
  }
  if (set.name) await addHistory(ctx, { projectId: id }, { event: "name_changed", title: set.name, detail: row.name });
  if (d.CompleteOpenTasks && d.Status === "done") await completeOpenTasks(ctx, "project", id, {});
}

export async function setProjectArchived(ctx: Ctx, id: string, archived: boolean) {
  await loadProject(ctx, id);
  await ctx.tx`update projects set archived = ${archived}, updated_by = ${ctx.user.id} where id = ${id}`;
}

export async function linkProjectClient(ctx: Ctx, id: string, body: unknown, link: boolean) {
  const { ClientId } = parseBody(ClientRef, body);
  const row = await loadProject(ctx, id);
  if (link) {
    const [c] = await ctx.tx`select id from clients where id = ${ClientId}`;
    if (!c) throw validation("Cliente não encontrado.", "ClientId");
    await ctx.tx`insert into project_clients (project_id, client_id) values (${id}, ${ClientId}) on conflict do nothing`;
    if (!row.client_id) await ctx.tx`update projects set client_id = ${ClientId} where id = ${id}`;
  } else {
    await ctx.tx`delete from project_clients where project_id = ${id} and client_id = ${ClientId}`;
    if (row.client_id === ClientId) {
      await ctx.tx`update projects set client_id = (select client_id from project_clients where project_id = ${id} limit 1) where id = ${id}`;
    }
  }
}

/** Mesma regra de computeBaselineFields do front: concluídas com baseline ficam congeladas. */
export async function setBaseline(ctx: Ctx, id: string, clear = false) {
  await lockScope(ctx, { kind: "project", id });
  const row = await loadProject(ctx, id);
  if (clear) {
    await ctx.tx`update entries set baseline_start = null, baseline_end = null, baseline_date = null where project_id = ${id}`;
    await ctx.tx`update projects set baseline_set_at = null where id = ${id}`;
    return;
  }
  await ctx.tx`
    update entries set
      baseline_date  = case when type <> 'task' then (case when status = 'done' and baseline_date is not null then baseline_date else planned_date end) else baseline_date end,
      baseline_start = case when type = 'task' then (case when status = 'done' and baseline_end is not null then baseline_start
                                                          when status = 'done' and actual_start is not null then actual_start else planned_start end) else baseline_start end,
      baseline_end   = case when type = 'task' then (case when status = 'done' and baseline_end is not null then baseline_end
                                                          when status = 'done' and actual_end is not null then actual_end else planned_end end) else baseline_end end
    where project_id = ${id}`;
  await ctx.tx`update projects set baseline_set_at = now() where id = ${id}`;
  await addHistory(ctx, { projectId: id }, { event: "baseline_set", title: row.name });
}

// ─── fases ──────────────────────────────────────────────────────────────────

async function notifyClients(ctx: Ctx, projectId: string, message: string) {
  const people = await ctx.tx<{ uid: string }[]>`
    select distinct x.uid from (
      select (o->>'memberId') as uid from project_clients pc join clients c on c.id = pc.client_id
        cross join lateral jsonb_array_elements(case when jsonb_typeof(c.owners) = 'array' then c.owners else '[]'::jsonb end) o
        where pc.project_id = ${projectId}
      union
      select (select h.owner->>'memberId' from client_cs_history h where h.client_id = pc.client_id
              order by h.assigned_at desc limit 1)
        from project_clients pc where pc.project_id = ${projectId}
    ) x where x.uid is not null`;
  for (const p of people) await notify(ctx, p.uid, message, `/projects/${projectId}`);
}

export async function createPhase(ctx: Ctx, body: unknown): Promise<string> {
  const d = parseBody(PhaseCreate, body);
  const project = await loadProject(ctx, d.ProjectId);
  const [r] = await ctx.tx<{ id: string }[]>`
    insert into phases (project_id, name, "order", is_unassigned)
    values (${d.ProjectId}, ${d.Name}, coalesce(${d.Order ?? null}::int, (select coalesce(max("order") + 1, 0) from phases where project_id = ${d.ProjectId})), false)
    returning id`;
  await notifyClients(ctx, d.ProjectId, `Nova fase "${d.Name}" criada em "${project.name}"`);
  return r.id;
}

export async function updatePhase(ctx: Ctx, id: string, body: unknown, ifMatch?: string | null) {
  const d = parseBody(PhasePatch, body);
  await checkEtag(ctx, "phases", id, ifMatch);
  const [ph] = await ctx.tx<Row[]>`select * from phases where id = ${id}`;
  if (!ph) throw notFound();
  if (ph.is_unassigned) throw badRequest("A fase interna 'Sem fase' não pode ser editada.");
  const set: Row = {};
  if (d.Name !== undefined) set.name = d.Name;
  if (d.Order !== undefined) set.order = d.Order;
  if (!Object.keys(set).length) return;
  await ctx.tx`update phases set ${ctx.tx(set)} where id = ${id}`;
  if (d.Name && d.Name !== ph.name) {
    const [p] = await ctx.tx<{ name: string }[]>`select name from projects where id = ${ph.project_id}`;
    await notifyClients(ctx, ph.project_id, `Fase "${ph.name}" renomeada para "${d.Name}" em "${p?.name ?? ""}"`);
  }
}
