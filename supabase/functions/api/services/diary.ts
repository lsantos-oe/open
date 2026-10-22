// Diário (pontos em aberto, atas, notas), riscos e notificações.
import { z } from "zod";
import type { Ctx } from "../lib/context.ts";
import { notFound, validation } from "../lib/errors.ts";
import { Enums } from "../odata/edm.ts";
import {
  addHistory,
  checkEtag,
  collabReset,
  findPerson,
  Guid,
  IsoDate,
  OwnerInput,
  parseBody,
  resolveOwners,
  Text,
  zEnum,
} from "./shared.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const ScopeRef = { ProjectId: Guid.optional(), IncidentId: Guid.optional() };
const PersonRef = z.object({ UserId: Guid.optional(), Email: z.string().email().optional(), Name: z.string().max(200).optional() })
  .strict().refine((x) => x.UserId || x.Email || x.Name, "Informe UserId, Email ou Name.");

async function checkScope(ctx: Ctx, d: { ProjectId?: string; IncidentId?: string }, allowIncident = true) {
  if (!!d.ProjectId === !!d.IncidentId) {
    throw validation(allowIncident ? "Informe ProjectId OU IncidentId." : "Informe ProjectId.");
  }
  if (d.IncidentId && !allowIncident) throw validation("Disponível apenas para projetos.", "IncidentId");
  const [r] = d.ProjectId
    ? await ctx.tx`select id from projects where id = ${d.ProjectId}`
    : await ctx.tx`select id from incidents where id = ${d.IncidentId!}`;
  if (!r) throw validation("Projeto/incidente não encontrado.");
}

async function owner(ctx: Ctx, ref?: z.infer<typeof PersonRef> | null) {
  if (!ref) return { owner: null, owner_user_id: null };
  if (ref.UserId || ref.Email) {
    const p = await findPerson(ctx, ref, "Owner");
    return { owner: p.name, owner_user_id: p.id };
  }
  return { owner: ref.Name!, owner_user_id: null };
}

// ─── pontos em aberto ───────────────────────────────────────────────────────

export const OpenPointCreate = z.object({
  ...ScopeRef,
  Title: Text(300),
  Description: z.string().max(50_000).optional(),
  Priority: zEnum(Enums.Level).optional(),
  Owner: PersonRef.optional(),
  DueDate: IsoDate.optional(),
  LinkedTaskId: Guid.optional(),
}).strict();

export const OpenPointPatch = z.object({
  Title: Text(300).optional(),
  Description: z.string().max(50_000).optional(),
  Priority: zEnum(Enums.Level).optional(),
  Owner: PersonRef.nullable().optional(),
  DueDate: IsoDate.nullable().optional(),
  LinkedTaskId: Guid.nullable().optional(),
}).strict();

export async function createOpenPoint(ctx: Ctx, body: unknown): Promise<string> {
  const d = parseBody(OpenPointCreate, body);
  await checkScope(ctx, d);
  const [r] = await ctx.tx<{ id: string }[]>`insert into open_points ${
    ctx.tx({
      project_id: d.ProjectId ?? null,
      incident_id: d.IncidentId ?? null,
      title: d.Title,
      description: d.Description || d.Title, // como o front: sem descrição, repete o título
      status: "open",
      priority: d.Priority ?? "medium",
      ...(await owner(ctx, d.Owner)),
      due_date: d.DueDate ?? null,
      linked_entry_id: d.LinkedTaskId ?? null,
      created_by: ctx.user.id,
      created_by_name: ctx.user.name ?? ctx.user.email,
      created_by_avatar: ctx.user.avatarUrl,
    })
  } returning id`;
  return r.id;
}

export async function updateOpenPoint(ctx: Ctx, id: string, body: unknown, ifMatch?: string | null) {
  const d = parseBody(OpenPointPatch, body);
  await checkEtag(ctx, "open_points", id, ifMatch);
  const [row] = await ctx.tx<Row[]>`select * from open_points where id = ${id}`;
  if (!row) throw notFound();
  const set: Row = {};
  if (d.Title !== undefined) set.title = d.Title;
  if (d.Priority !== undefined) set.priority = d.Priority;
  if (d.DueDate !== undefined) set.due_date = d.DueDate;
  if (d.LinkedTaskId !== undefined) set.linked_entry_id = d.LinkedTaskId;
  if (d.Owner !== undefined) Object.assign(set, await owner(ctx, d.Owner));
  if (d.Description !== undefined && d.Description !== row.description) {
    await collabReset(ctx, `diary_${id}_op_description`);
    set.description = d.Description;
  }
  if (Object.keys(set).length) await ctx.tx`update open_points set ${ctx.tx(set)} where id = ${id}`;
}

export async function resolveOpenPoint(ctx: Ctx, id: string, body: unknown) {
  const d = parseBody(z.object({ ResolutionNote: z.string().max(5000).optional() }).strict(), body);
  const [row] = await ctx.tx<Row[]>`
    update open_points set status = 'resolved', resolved_at = now(), resolved_by = ${ctx.user.id},
           resolution_note = ${d.ResolutionNote ?? null}
    where id = ${id} returning *`;
  if (!row) throw notFound();
  await addHistory(ctx, { projectId: row.project_id, incidentId: row.incident_id }, {
    event: "open_point_resolved",
    title: row.title ?? row.description,
    detail: d.ResolutionNote ?? null,
    linkedId: id,
    linkedType: "open_point",
  });
}

export async function reopenOpenPoint(ctx: Ctx, id: string) {
  const r = await ctx.tx`update open_points set status = 'open', resolved_at = null, resolved_by = null where id = ${id} returning id`;
  if (!r.length) throw notFound();
}

// ─── atas de reunião ────────────────────────────────────────────────────────

const MeetingItemInput = z.object({
  Text: Text(2000),
  Type: zEnum(Enums.MeetingItemType).optional(),
  Done: z.boolean().optional(),
  Responsible: z.string().max(200).optional(),
  DueDate: IsoDate.optional(),
}).strict();

export const MeetingCreate = z.object({
  ProjectId: Guid,
  Title: Text(300),
  Date: IsoDate,
  Participants: z.array(OwnerInput).max(50).optional(),
  Notes: z.string().max(100_000).optional(),
  Items: z.array(MeetingItemInput).max(200).optional(),
}).strict();

export async function createMeeting(ctx: Ctx, body: unknown): Promise<string> {
  const d = parseBody(MeetingCreate, body);
  await checkScope(ctx, { ProjectId: d.ProjectId }, false);
  const participants = d.Participants ? await resolveOwners(ctx, d.Participants) : [];
  for (const p of participants) delete p.kind;
  const items = (d.Items ?? []).map((i) => ({
    id: crypto.randomUUID(),
    text: i.Text,
    type: i.Type ?? "info",
    done: i.Done ?? false,
    responsible: i.Responsible,
    dueDate: i.DueDate,
  }));
  const [r] = await ctx.tx<{ id: string }[]>`insert into meeting_logs ${
    ctx.tx({
      project_id: d.ProjectId,
      title: d.Title,
      date: d.Date,
      participants: ctx.tx.json(participants as never),
      notes: d.Notes ?? null,
      items: ctx.tx.json(items as never),
      attachments: ctx.tx.json([] as never),
      created_by: ctx.user.id,
      created_by_name: ctx.user.name ?? ctx.user.email,
      created_by_avatar: ctx.user.avatarUrl,
    })
  } returning id`;
  return r.id;
}

// ─── notas do histórico ─────────────────────────────────────────────────────

export const NoteCreate = z.object({ ...ScopeRef, Title: Text(300), Detail: z.string().max(50_000).optional() }).strict();

export async function addNote(ctx: Ctx, body: unknown): Promise<string> {
  const d = parseBody(NoteCreate, body);
  await checkScope(ctx, d);
  const [r] = await ctx.tx<{ id: string }[]>`
    insert into history (project_id, incident_id, type, event, title, detail, author_id, author_name, author_avatar, date)
    values (${d.ProjectId ?? null}, ${d.IncidentId ?? null}, 'manual', 'note', ${d.Title}, ${d.Detail ?? null},
            ${ctx.user.id}, ${ctx.user.name ?? ctx.user.email}, ${ctx.user.avatarUrl}, now())
    returning id`;
  return r.id;
}

// ─── riscos ─────────────────────────────────────────────────────────────────

const LEVEL = { low: 1, medium: 2, high: 3 } as Record<string, number>;
const ActionTaskInput = z.object({
  Description: Text(1000),
  Responsible: z.string().max(200).optional(),
  DueDate: IsoDate.optional(),
  Done: z.boolean().optional(),
}).strict();

export const RiskCreate = z.object({
  ProjectId: Guid,
  Description: Text(2000),
  Probability: zEnum(Enums.Level),
  Impact: zEnum(Enums.Level),
  Status: z.string().max(50).optional(),
  Owner: z.string().max(200).optional(),
  DueDate: IsoDate.optional(),
  LinkedTaskIds: z.array(Guid).max(50).optional(),
  ActionTasks: z.array(ActionTaskInput).max(50).optional(),
}).strict();

export const RiskPatch = RiskCreate.omit({ ProjectId: true }).partial().strict();

function actionTasks(list: z.infer<typeof ActionTaskInput>[]) {
  return list.map((a) => ({ id: crypto.randomUUID(), description: a.Description, responsible: a.Responsible, due_date: a.DueDate, done: a.Done ?? false }));
}

export async function createRisk(ctx: Ctx, body: unknown): Promise<string> {
  const d = parseBody(RiskCreate, body);
  await checkScope(ctx, { ProjectId: d.ProjectId }, false);
  const [r] = await ctx.tx<{ id: string }[]>`insert into risks ${
    ctx.tx({
      project_id: d.ProjectId,
      description: d.Description,
      probability: d.Probability,
      impact: d.Impact,
      score: LEVEL[d.Probability] * LEVEL[d.Impact],
      status: d.Status ?? "open",
      owner: d.Owner ?? null,
      due_date: d.DueDate ?? null,
      linked_entry_ids: ctx.tx.json((d.LinkedTaskIds ?? []) as never),
      action_tasks: ctx.tx.json(actionTasks(d.ActionTasks ?? []) as never),
      created_by: ctx.user.id,
    })
  } returning id`;
  await addHistory(ctx, { projectId: d.ProjectId }, { event: "risk_added", title: d.Description, linkedId: r.id, linkedType: "risk" });
  return r.id;
}

export async function updateRisk(ctx: Ctx, id: string, body: unknown, ifMatch?: string | null) {
  const d = parseBody(RiskPatch, body);
  await checkEtag(ctx, "risks", id, ifMatch);
  const [row] = await ctx.tx<Row[]>`select * from risks where id = ${id}`;
  if (!row) throw notFound();
  const set: Row = {};
  if (d.Description !== undefined) set.description = d.Description;
  if (d.Probability !== undefined) set.probability = d.Probability;
  if (d.Impact !== undefined) set.impact = d.Impact;
  if (d.Probability !== undefined || d.Impact !== undefined) {
    set.score = (LEVEL[d.Probability ?? row.probability] ?? 0) * (LEVEL[d.Impact ?? row.impact] ?? 0);
  }
  if (d.Status !== undefined) set.status = d.Status;
  if (d.Owner !== undefined) set.owner = d.Owner;
  if (d.DueDate !== undefined) set.due_date = d.DueDate;
  if (d.LinkedTaskIds !== undefined) set.linked_entry_ids = ctx.tx.json(d.LinkedTaskIds as never);
  if (d.ActionTasks !== undefined) set.action_tasks = ctx.tx.json(actionTasks(d.ActionTasks) as never);
  if (Object.keys(set).length) await ctx.tx`update risks set ${ctx.tx(set)} where id = ${id}`;
}

// ─── notificações ───────────────────────────────────────────────────────────

export async function markNotificationsRead(ctx: Ctx, body: unknown): Promise<number> {
  const d = parseBody(z.object({ Ids: z.array(Guid).max(500).optional() }).strict(), body);
  const r = d.Ids?.length
    ? await ctx.tx`update notifications set read = true where user_id = ${ctx.user.id} and id = any(${d.Ids}::uuid[]) and not read returning id`
    : await ctx.tx`update notifications set read = true where user_id = ${ctx.user.id} and not read returning id`;
  return r.length;
}
