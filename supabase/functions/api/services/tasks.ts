// Tarefas (entries): criar, atualizar, mudar etapa, mudar datas (cascata), comentar.
// Replica as regras do store do front (useAppStore): datas de transição de status, caminho crítico,
// cascata em dias úteis, auto-status, notificações, histórico e atividade — numa transação só.
import { z } from "zod";
import { parseISO } from "date-fns";
import type { Ctx } from "../lib/context.ts";
import { badRequest, notFound, validation } from "../lib/errors.ts";
import { Enums } from "../odata/edm.ts";
import { addWorkdays, parseHolidays, toISODate, workdaysBetween } from "../domain/businessDays.ts";
import { applyDateChange } from "../domain/dateEngine.ts";
import { applyIsCritical } from "../domain/criticalPath.ts";
import { applyAutoStatus } from "../domain/statusCalc.ts";
import type { EntryOwner } from "../domain/types.ts";
import {
  addHistory,
  assertNoCycle,
  checkEtag,
  flatEntries,
  Guid,
  IsoDate,
  linkFor,
  loadScope,
  lockScope,
  notify,
  OwnerInput,
  parseBody,
  persistScheduleDiff,
  refreshCritical,
  resolveOwners,
  scopeOf,
  Text,
  zEnum,
} from "./shared.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const LinkInput = z.object({ Label: Text(200), Url: z.string().url().max(2000) }).strict();
const DelayInput = z.object({
  Description: Text(2000),
  Responsibility: zEnum(Enums.DelayResponsibility),
  Type: zEnum(Enums.DelayType),
}).strict();

export const TaskCreate = z.object({
  Name: Text(300),
  Type: zEnum(Enums.TaskType).optional(),
  Description: z.string().max(50_000).optional(),
  ProjectId: Guid.optional(),
  PhaseId: Guid.optional(),
  IncidentId: Guid.optional(),
  ClientId: Guid.optional(),
  ClientIds: z.array(Guid).max(20).optional(),
  Owners: z.array(OwnerInput).min(1, "Informe ao menos o executor em Owners.").max(10),
  PlannedStart: IsoDate.optional(),
  PlannedEnd: IsoDate.optional(),
  PlannedDate: IsoDate.optional(),
  DurationDays: z.number().int().min(1).max(3650).optional(),
  DurationHours: z.number().positive().max(1000).optional(),
  DependsOn: z.array(Guid).max(50).optional(),
  RiskFlag: zEnum(Enums.RiskFlag).optional(),
  Status: zEnum(Enums.TaskStatus).optional(),
  HiddenFromPlan: z.boolean().optional(),
  Links: z.array(LinkInput).max(20).optional(),
}).strict();

export const TaskPatch = z.object({
  Name: Text(300).optional(),
  ClientIds: z.array(Guid).max(20).optional(),
  Description: z.string().max(50_000).nullable().optional(),
  Owners: z.array(OwnerInput).min(1).max(10).optional(),
  RiskFlag: zEnum(Enums.RiskFlag).optional(),
  HiddenFromPlan: z.boolean().optional(),
  /** Marca/desmarca a tarefa de projeto como "de documentação": seus links e anexos aparecem na aba Documentação. */
  IsDocumentation: z.boolean().optional(),
  Links: z.array(LinkInput).max(20).optional(),
  PhaseId: Guid.optional(),
  Status: zEnum(Enums.TaskStatus).optional(),
  PlannedStart: IsoDate.optional(),
  PlannedEnd: IsoDate.optional(),
  PlannedDate: IsoDate.optional(),
  ActualStart: IsoDate.nullable().optional(),
  ActualEnd: IsoDate.nullable().optional(),
  DurationDays: z.number().int().min(1).max(3650).optional(),
  DurationHours: z.number().positive().max(1000).nullable().optional(),
  DependsOn: z.array(Guid).max(50).optional(),
  Delay: DelayInput.optional(),
}).strict();

export const SetStatusInput = z.object({ Status: zEnum(Enums.TaskStatus), Note: z.string().trim().max(5000).optional() }).strict();
export const ChangeDatesInput = z.object({
  PlannedStart: IsoDate.optional(),
  PlannedEnd: IsoDate.optional(),
  PlannedDate: IsoDate.optional(),
  ActualStart: IsoDate.nullable().optional(),
  ActualEnd: IsoDate.nullable().optional(),
  DurationDays: z.number().int().min(1).max(3650).optional(),
  Delay: DelayInput.optional(),
}).strict();
export const CommentInput = z.object({ Text: Text(10_000), ParentId: Guid.optional() }).strict();

async function loadTask(ctx: Ctx, id: string, lock = false): Promise<Row> {
  const [row] = await ctx.tx<Row[]>`select * from entries where id = ${id}`;
  if (!row) throw notFound(`Tasks(${id}) não encontrada.`);
  if (!lock) return row;
  // ordem fixa de travas: escopo (projeto/incidente/avulsas) → linha. Evita deadlock entre escritas concorrentes.
  await lockScope(ctx, scopeOf(row));
  const [locked] = await ctx.tx<Row[]>`select * from entries where id = ${id} for update`;
  if (!locked) throw notFound(`Tasks(${id}) não encontrada.`);
  return locked;
}

function validateOwners(owners: EntryOwner[], scopeKind: string) {
  const exec = owners.filter((o) => (o.kind ?? "executor") === "executor");
  const val = owners.filter((o) => o.kind === "validator");
  if (!exec.length) throw validation("Toda tarefa precisa de um executor (Owners com Kind=Executor).", "Owners");
  if (val.length > 1) throw validation("Só um validador por tarefa.", "Owners");
  // Mesma regra da tela: incidente e tarefa avulsa têm um executor só.
  if (scopeKind !== "project" && exec.length > 1) throw validation("Tarefas de incidente/avulsas têm um executor só.", "Owners");
}

function primaryOwnerColumns(owners: EntryOwner[]) {
  const primary = owners.find((o) => o.kind === "executor") ?? owners[0];
  return {
    responsible: primary?.name ?? null,
    responsible_member_id: primary?.type === "member" ? primary.memberId ?? null : null,
  };
}

/** Mesma regra de applyStatusTransitionDates do front. */
function transitionDates(prev: Row, status: string, today: string, explicit: { start?: unknown; end?: unknown }) {
  const out: Row = {};
  if (status === prev.status) return out;
  if (status === "in_progress" && !prev.actual_start && explicit.start === undefined) out.actual_start = today;
  if (status === "done" && !prev.actual_end && explicit.end === undefined) out.actual_end = today;
  if (prev.status === "done" && status !== "done" && explicit.start === undefined && explicit.end === undefined) {
    out.actual_start = null;
    out.actual_end = null;
  }
  return out;
}

async function ensureClients(ctx: Ctx, ids: string[]) {
  if (!ids.length) return;
  const found = await ctx.tx`select id from clients where id = any(${ids}::uuid[])`;
  if (found.length !== ids.length) throw validation("Algum cliente não existe.", "ClientIds");
}

async function nextOrder(ctx: Ctx, where: { phaseId?: string; incidentId?: string; standalone?: boolean }) {
  const [r] = where.phaseId
    ? await ctx.tx<{ n: number }[]>`select coalesce(max("order") + 1, 0)::int as n from entries where phase_id = ${where.phaseId}`
    : where.incidentId
    ? await ctx.tx<{ n: number }[]>`select coalesce(max("order") + 1, 0)::int as n from entries where incident_id = ${where.incidentId}`
    : await ctx.tx<{ n: number }[]>`select coalesce(max("order") + 1, 0)::int as n from entries where project_id is null and incident_id is null`;
  return r.n;
}

async function unassignedPhase(ctx: Ctx, projectId: string): Promise<string> {
  const [ph] = await ctx.tx<{ id: string }[]>`select id from phases where project_id = ${projectId} and is_unassigned limit 1`;
  if (ph) return ph.id;
  const [n] = await ctx.tx<{ id: string }[]>`
    insert into phases (project_id, name, "order", is_unassigned)
    values (${projectId}, 'Sem fase', (select coalesce(max("order") + 1, 0) from phases where project_id = ${projectId}), true)
    returning id`;
  return n.id;
}

function taskDates(type: string, d: { PlannedStart?: string; PlannedEnd?: string; PlannedDate?: string; DurationDays?: number }, holidays: string[]) {
  if (type !== "task") {
    if (d.PlannedStart || d.PlannedEnd) throw validation("Marcos e reuniões usam PlannedDate (não PlannedStart/PlannedEnd).");
    return { planned_date: d.PlannedDate ?? null, duration_days: null as number | null, planned_start: null, planned_end: null };
  }
  if (d.PlannedDate) throw validation("Tarefas usam PlannedStart/PlannedEnd (PlannedDate é para marcos e reuniões).");
  const h = parseHolidays(holidays);
  const start = d.PlannedStart ?? null;
  let end = d.PlannedEnd ?? null, dur = d.DurationDays ?? null;
  if (start && !end && dur) end = toISODate(addWorkdays(parseISO(start), dur - 1, h));
  if (start && end) {
    if (end < start) throw validation("PlannedEnd não pode ser anterior a PlannedStart.", "PlannedEnd");
    dur = workdaysBetween(parseISO(start), parseISO(end), h) + 1;
  }
  return { planned_start: start, planned_end: end, duration_days: dur ?? (start && end ? 1 : dur), planned_date: null };
}

// ─── criar ──────────────────────────────────────────────────────────────────

export async function createTask(ctx: Ctx, body: unknown): Promise<string> {
  const d = parseBody(TaskCreate, body);
  const type = d.Type ?? "task";
  if (d.ProjectId && d.IncidentId) throw validation("Informe ProjectId OU IncidentId (ou nenhum, para tarefa avulsa).");
  // Vários clientes (tarefa avulsa): ClientIds é a lista; ClientId (legado) vira lista de um — igual ao app.
  const clientIds = [...new Set(d.ClientIds?.length ? d.ClientIds : d.ClientId ? [d.ClientId] : [])];
  if (clientIds.length && (d.ProjectId || d.IncidentId)) throw validation("Clientes só valem para tarefa avulsa.", "ClientIds");
  const scopeKind = d.ProjectId ? "project" : d.IncidentId ? "incident" : "standalone";
  await lockScope(ctx, { kind: scopeKind, id: d.ProjectId ?? d.IncidentId ?? null });

  let phaseId: string | null = null;
  if (d.ProjectId) {
    const [pr] = await ctx.tx`select id from projects where id = ${d.ProjectId}`;
    if (!pr) throw validation("Projeto não encontrado.", "ProjectId");
    if (d.PhaseId) {
      const [ph] = await ctx.tx`select id from phases where id = ${d.PhaseId} and project_id = ${d.ProjectId}`;
      if (!ph) throw validation("A fase não pertence a esse projeto.", "PhaseId");
      phaseId = d.PhaseId;
    } else if (d.HiddenFromPlan) {
      phaseId = await unassignedPhase(ctx, d.ProjectId);
    } else {
      throw validation("Tarefa de projeto precisa de PhaseId (ou HiddenFromPlan=true).", "PhaseId");
    }
  } else if (d.PhaseId) {
    throw validation("PhaseId só vale junto com ProjectId.", "PhaseId");
  }
  if (d.IncidentId) {
    const [inc] = await ctx.tx`select id from incidents where id = ${d.IncidentId}`;
    if (!inc) throw validation("Incidente não encontrado.", "IncidentId");
  }
  await ensureClients(ctx, clientIds);

  const owners = await resolveOwners(ctx, d.Owners);
  validateOwners(owners, scopeKind);
  const dates = taskDates(type, d, ctx.settings.holidays);

  const scopeId = d.ProjectId ?? d.IncidentId ?? null;
  if (d.DependsOn?.length) {
    const scope = await loadScope(ctx, scopeKind, scopeId);
    const ids = new Set(flatEntries(scope.phases).map((e) => e.id));
    const bad = d.DependsOn.filter((x) => !ids.has(x));
    if (bad.length) throw validation(`Dependências fora do escopo da tarefa: ${bad.join(", ")}.`, "DependsOn");
  }

  const status = d.Status ?? "pending";
  const today = ctx.today;
  const id = crypto.randomUUID();
  const row: Row = {
    id,
    project_id: d.ProjectId ?? null,
    phase_id: phaseId,
    incident_id: d.IncidentId ?? null,
    client_id: clientIds[0] ?? null,
    client_ids: ctx.tx.array(clientIds, 2950), // uuid[]
    type,
    name: d.Name,
    description: d.Description ?? null,
    ...primaryOwnerColumns(owners),
    owners: ctx.tx.json(owners as never),
    depends_on: ctx.tx.json((d.DependsOn ?? []) as never),
    ...dates,
    duration_hours: d.DurationHours ?? null,
    risk_flag: d.RiskFlag ?? "none",
    status,
    status_override: d.Status ? true : null,
    actual_start: status === "in_progress" || status === "done" ? today : null,
    actual_end: status === "done" ? today : null,
    hidden_from_plan: d.HiddenFromPlan ?? null,
    links: ctx.tx.json((d.Links ?? []).map((l) => ({ id: crypto.randomUUID(), label: l.Label, url: l.Url })) as never),
    order: await nextOrder(ctx, { phaseId: phaseId ?? undefined, incidentId: d.IncidentId, standalone: scopeKind === "standalone" }),
    created_by: ctx.user.id,
    updated_by: ctx.user.id,
    last_activity_at: new Date().toISOString(),
  };
  await ctx.tx`insert into entries ${ctx.tx(row)}`;
  await refreshCritical(ctx, scopeKind, scopeId);
  return id;
}

// ─── etapa (status) ─────────────────────────────────────────────────────────

async function setStatusInternal(ctx: Ctx, row: Row, status: string, note?: string) {
  if (row.status === status && row.status_override) return;
  const patch: Row = {
    status,
    status_override: true,
    last_activity_at: new Date().toISOString(),
    updated_by: ctx.user.id,
    ...transitionDates(row, status, ctx.today, {}),
  };
  await ctx.tx`update entries set ${ctx.tx(patch)} where id = ${row.id}`;
  const scope = scopeOf(row);
  if (scope.kind !== "standalone") {
    await addHistory(ctx, { projectId: row.project_id, incidentId: row.incident_id }, {
      event: "status_changed",
      title: row.name,
      detail: status,
      linkedId: row.id,
      linkedType: "entry",
    });
  }
  if (status === "validation" && row.status !== "validation") {
    const validator = (row.owners as EntryOwner[] | null)?.find((o) => o.kind === "validator" && o.memberId);
    await notify(ctx, validator?.memberId, `Tarefa "${row.name}" está pronta para validação`, linkFor(row));
  }
  if (note) await addComment(ctx, row.id, { Text: note });
}

export async function setTaskStatus(ctx: Ctx, id: string, body: unknown) {
  const d = parseBody(SetStatusInput, body);
  const row = await loadTask(ctx, id, true);
  await setStatusInternal(ctx, row, d.Status, d.Note);
}

// ─── datas (cascata) ────────────────────────────────────────────────────────

type DateField = "plannedStart" | "plannedEnd" | "plannedDate" | "actualStart" | "actualEnd";

async function changeDatesInternal(
  ctx: Ctx,
  row: Row,
  input: z.infer<typeof ChangeDatesInput>,
): Promise<{ affected: string[]; delayDays: number }> {
  const s = scopeOf(row);
  const scope = await loadScope(ctx, s.kind, s.id);
  const before = structuredClone(scope.phases);
  let phases = scope.phases;
  const h = ctx.settings.holidays;
  const target = flatEntries(phases).find((e) => e.id === row.id)!;
  const prevDue = row.type === "task" ? row.planned_end : row.planned_date;

  if (row.type !== "task" && (input.PlannedStart || input.PlannedEnd || input.DurationDays)) {
    throw validation("Marcos e reuniões usam PlannedDate.");
  }
  if (row.type === "task" && input.PlannedDate) throw validation("Tarefas usam PlannedStart/PlannedEnd.");

  // DurationDays sem PlannedEnd: recalcula o fim a partir do início (como o modal faz).
  let plannedEnd = input.PlannedEnd;
  if (input.DurationDays && !plannedEnd) {
    const start = input.PlannedStart ?? target.plannedStart;
    if (!start) throw validation("Para mudar DurationDays a tarefa precisa de PlannedStart.");
    plannedEnd = toISODate(addWorkdays(parseISO(start), input.DurationDays - 1, parseHolidays(h)));
  }

  const steps: [DateField, string | null | undefined][] = [
    ["plannedStart", input.PlannedStart],
    ["plannedEnd", plannedEnd],
    ["plannedDate", input.PlannedDate],
    ["actualStart", input.ActualStart],
    ["actualEnd", input.ActualEnd],
  ];
  for (const [field, value] of steps) {
    if (value === undefined) continue;
    if (value === null) {
      phases = phases.map((ph) => ({ ...ph, entries: ph.entries.map((e) => (e.id === row.id ? { ...e, [field]: undefined } : e)) }));
      continue;
    }
    phases = applyDateChange({ phases }, row.id, field, value, h);
  }

  const after = flatEntries(phases).find((e) => e.id === row.id)!;
  if (after.plannedStart && after.plannedEnd && after.plannedEnd < after.plannedStart) {
    throw validation("PlannedEnd não pode ser anterior a PlannedStart.", "PlannedEnd");
  }
  if (after.actualStart && after.actualEnd && after.actualEnd < after.actualStart) {
    throw validation("ActualEnd não pode ser anterior a ActualStart.", "ActualEnd");
  }

  const now = new Date().toISOString();
  phases = applyIsCritical(phases).map((ph) => ({
    ...ph,
    entries: ph.entries.map((e) => {
      const withStatus = { ...applyAutoStatus(e, ctx.today), subtasks: e.subtasks.map((sub) => applyAutoStatus(sub, ctx.today)) };
      return withStatus.id === row.id ? { ...withStatus, lastActivityAt: now } : withStatus;
    }),
  }));

  const affected = await persistScheduleDiff(ctx, before, phases);

  const newDue = after.type === "task" ? after.plannedEnd : after.plannedDate;
  let delayDays = 0;
  if (prevDue && newDue && prevDue !== newDue) {
    delayDays = workdaysBetween(parseISO(prevDue), parseISO(newDue), parseHolidays(h), ctx.settings.workdays);
  }
  if (input.Delay && delayDays !== 0 && row.project_id) {
    await ctx.tx`insert into delay_log (project_id, entry_id, entry_name, days, responsibility, type, description, triggered_by, created_by)
                 values (${row.project_id}, ${row.id}, ${row.name}, ${delayDays}, ${input.Delay.Responsibility}, ${input.Delay.Type},
                         ${input.Delay.Description}, 'manual', ${ctx.user.id})`;
    await addHistory(ctx, { projectId: row.project_id }, {
      event: "delay_logged",
      title: row.name,
      detail: `${delayDays > 0 ? "+" : ""}${delayDays}d — ${input.Delay.Description}`,
      linkedType: "entry",
    });
  } else if (input.Delay && !row.project_id) {
    throw badRequest("Registro de atraso (Delay) só existe para tarefas de projeto.");
  }
  return { affected, delayDays };
}

export async function changeTaskDates(ctx: Ctx, id: string, body: unknown) {
  const d = parseBody(ChangeDatesInput, body);
  const row = await loadTask(ctx, id, true);
  return await changeDatesInternal(ctx, row, d);
}

// ─── atualizar (PATCH) ──────────────────────────────────────────────────────

export async function updateTask(ctx: Ctx, id: string, body: unknown, ifMatch?: string | null) {
  const d = parseBody(TaskPatch, body);
  const row = await loadTask(ctx, id, true);
  await checkEtag(ctx, "entries", id, ifMatch);
  const s = scopeOf(row);
  const set: Row = {};
  let activity = false;

  if (d.Name !== undefined && d.Name !== row.name) set.name = d.Name;
  if (d.Description !== undefined && d.Description !== row.description) {
    set.description = d.Description;
    activity = true;
  }
  if (d.ClientIds !== undefined) {
    if (s.kind !== "standalone") throw validation("Clientes só valem para tarefa avulsa.", "ClientIds");
    const ids = [...new Set(d.ClientIds)];
    await ensureClients(ctx, ids);
    set.client_ids = ctx.tx.array(ids, 2950); // uuid[]
    set.client_id = ids[0] ?? null;
  }
  if (d.RiskFlag !== undefined) set.risk_flag = d.RiskFlag;
  if (d.HiddenFromPlan !== undefined) set.hidden_from_plan = d.HiddenFromPlan;
  if (d.DurationHours !== undefined) set.duration_hours = d.DurationHours;
  if (d.IsDocumentation !== undefined) {
    if (!row.project_id || row.type !== "task") throw validation("Só tarefas (não marcos/reuniões) de projeto podem ser de documentação.", "IsDocumentation");
    set.is_documentation = d.IsDocumentation;
  }
  if (d.Links !== undefined) {
    // quem já estava na lista (mesma URL) mantém o id: a classificação (público/etiquetas) da documentação é presa a ele
    const keep = new Map<string, string>(((row.links as { id: string; url: string }[] | null) ?? []).map((l) => [l.url, l.id]));
    set.links = ctx.tx.json(d.Links.map((l) => ({ id: keep.get(l.Url) ?? crypto.randomUUID(), label: l.Label, url: l.Url })) as never);
  }

  let newOwners: EntryOwner[] | undefined;
  if (d.Owners) {
    newOwners = await resolveOwners(ctx, d.Owners);
    validateOwners(newOwners, s.kind);
    set.owners = ctx.tx.json(newOwners as never);
    Object.assign(set, primaryOwnerColumns(newOwners));
    activity = true;
  }

  if (d.PhaseId !== undefined && d.PhaseId !== row.phase_id) {
    if (!row.project_id) throw validation("Só tarefas de projeto têm fase.", "PhaseId");
    const [ph] = await ctx.tx`select id from phases where id = ${d.PhaseId} and project_id = ${row.project_id}`;
    if (!ph) throw validation("A fase não pertence ao projeto da tarefa.", "PhaseId");
    set.phase_id = d.PhaseId;
    set.order = await nextOrder(ctx, { phaseId: d.PhaseId });
  }

  let depsChanged = false;
  if (d.DependsOn !== undefined) {
    if (d.DependsOn.includes(id)) throw validation("Uma tarefa não pode depender dela mesma.", "DependsOn");
    const scope = await loadScope(ctx, s.kind, s.id);
    const all = flatEntries(scope.phases);
    const ids = new Set(all.map((e) => e.id));
    const bad = d.DependsOn.filter((x) => !ids.has(x));
    if (bad.length) throw validation(`Dependências fora do escopo da tarefa: ${bad.join(", ")}.`, "DependsOn");
    assertNoCycle(all.map((e) => ({ id: e.id, dependsOn: e.id === id ? d.DependsOn! : e.dependsOn })));
    set.depends_on = ctx.tx.json(d.DependsOn as never);
    depsChanged = true;
  }

  if (activity) set.last_activity_at = new Date().toISOString();
  if (Object.keys(set).length) {
    set.updated_by = ctx.user.id;
    await ctx.tx`update entries set ${ctx.tx(set)} where id = ${id}`;
  }

  if (newOwners) {
    const prevIds = new Set(((row.owners ?? []) as EntryOwner[]).filter((o) => o.type === "member").map((o) => o.memberId));
    for (const o of newOwners) {
      if (o.type === "member" && o.memberId && !prevIds.has(o.memberId)) {
        await notify(ctx, o.memberId, `Você foi adicionado como responsável em "${d.Name ?? row.name}"`, linkFor(row));
      }
    }
  }

  const fresh = await loadTask(ctx, id);
  if (d.Status !== undefined) await setStatusInternal(ctx, fresh, d.Status);

  const dateInput = {
    PlannedStart: d.PlannedStart,
    PlannedEnd: d.PlannedEnd,
    PlannedDate: d.PlannedDate,
    ActualStart: d.ActualStart,
    ActualEnd: d.ActualEnd,
    DurationDays: d.DurationDays,
    Delay: d.Delay,
  };
  const hasDates = Object.entries(dateInput).some(([k, v]) => k !== "Delay" && v !== undefined);
  if (d.Delay && !hasDates) throw validation("Delay só faz sentido junto com uma mudança de data.", "Delay");
  if (hasDates) await changeDatesInternal(ctx, await loadTask(ctx, id), dateInput);
  else if (depsChanged) await refreshCritical(ctx, s.kind, s.id);
}

// ─── comentários ────────────────────────────────────────────────────────────

export async function addComment(ctx: Ctx, taskId: string, body: unknown): Promise<string> {
  const d = parseBody(CommentInput, body);
  const row = await loadTask(ctx, taskId);
  if (d.ParentId) {
    const [parent] = await ctx.tx`select id from comments where id = ${d.ParentId} and entry_id = ${taskId}`;
    if (!parent) throw validation("O comentário respondido não é desta tarefa.", "ParentId");
  }
  const [c] = await ctx.tx<{ id: string }[]>`
    insert into comments (entry_id, project_id, text, author_id, author_name, author_avatar, parent_id)
    values (${taskId}, ${row.project_id}, ${d.Text}, ${ctx.user.id}, ${ctx.user.name ?? ctx.user.email}, ${ctx.user.avatarUrl}, ${
    d.ParentId ?? null
  })
    returning id`;
  await ctx.tx`update entries set last_activity_at = now() where id = ${taskId}`;
  return c.id;
}

export async function ensureTaskVisible(ctx: Ctx, id: string) {
  await loadTask(ctx, id);
}

