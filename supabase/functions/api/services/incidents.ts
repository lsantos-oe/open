// Incidentes (Sustentação): criar, atualizar, mudar status, vínculos e stakeholders.
import { z } from "zod";
import type { Ctx } from "../lib/context.ts";
import { notFound, validation } from "../lib/errors.ts";
import { Enums } from "../odata/edm.ts";
import { completeOpenTasks } from "./closeout.ts";
import type { EntryOwner } from "../domain/types.ts";
import {
  addHistory,
  checkEtag,
  collabReset,
  Guid,
  IsoDate,
  notify,
  OwnerInput,
  parseBody,
  resolveOwner,
  Text,
  zEnum,
} from "./shared.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export const IncidentCreate = z.object({
  Title: Text(300),
  Priority: zEnum(Enums.Level),
  Impact: zEnum(Enums.Level),
  Owner: OwnerInput,
  Description: z.string().max(100_000).optional(),
  Deadline: IsoDate.optional(),
  ClientIds: z.array(Guid).max(20).optional(),
  ProjectIds: z.array(Guid).max(20).optional(),
}).strict();

export const IncidentPatch = z.object({
  Title: Text(300).optional(),
  Priority: zEnum(Enums.Level).optional(),
  Impact: zEnum(Enums.Level).optional(),
  Owner: OwnerInput.optional(),
  Description: z.string().max(100_000).nullable().optional(),
  Deadline: IsoDate.nullable().optional(),
  Status: zEnum(Enums.IncidentStatus).optional(),
  CompleteOpenTasks: z.boolean().optional(),
}).strict();

export const IncidentStatusInput = z.object({
  Status: zEnum(Enums.IncidentStatus),
  Note: z.string().max(5000).optional(),
  CompleteOpenTasks: z.boolean().optional().describe("Ao resolver/fechar: conclui também as tarefas abertas (como o modal do app)."),
}).strict();

const STATUS_LABEL: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em andamento",
  waiting_on_client: "Aguardando cliente",
  resolved: "Resolvido",
  closed: "Fechado",
};

async function loadIncident(ctx: Ctx, id: string): Promise<Row> {
  const [r] = await ctx.tx<Row[]>`select * from incidents where id = ${id} for update`;
  if (!r) throw notFound(`Incidents(${id}) não encontrado.`);
  return r;
}

async function ensureIds(ctx: Ctx, table: "clients" | "projects", ids: string[], target: string) {
  if (!ids.length) return;
  const found = await ctx.tx.unsafe(`select id from public.${table} where id = any($1::uuid[])`, [ids]);
  if (found.length !== ids.length) throw validation(`Algum Id em ${target} não existe.`, target);
}

export async function createIncident(ctx: Ctx, body: unknown): Promise<string> {
  const d = parseBody(IncidentCreate, body);
  const owner = await resolveOwner(ctx, d.Owner);
  delete owner.kind;
  const clientIds = [...new Set(d.ClientIds ?? [])], projectIds = [...new Set(d.ProjectIds ?? [])];
  await ensureIds(ctx, "clients", clientIds, "ClientIds");
  await ensureIds(ctx, "projects", projectIds, "ProjectIds");
  const [r] = await ctx.tx<{ id: string }[]>`insert into incidents ${
    ctx.tx({
      title: d.Title,
      description: d.Description ?? null,
      owner: ctx.tx.json(owner as never),
      status: "open",
      priority: d.Priority,
      impact: d.Impact,
      deadline: d.Deadline ?? null,
      created_by: ctx.user.id,
      updated_by: ctx.user.id,
    })
  } returning id`;
  for (const c of clientIds) await ctx.tx`insert into incident_clients (incident_id, client_id) values (${r.id}, ${c})`;
  for (const p of projectIds) await ctx.tx`insert into incident_projects (incident_id, project_id) values (${r.id}, ${p})`;
  return r.id;
}

async function setStatusInternal(ctx: Ctx, row: Row, status: string) {
  if (row.status === status) return;
  const entering = (status === "resolved" || status === "closed") && !row.resolved_at;
  await ctx.tx`update incidents set status = ${status}, status_changed_at = now(),
                 resolved_at = case when ${entering} then now() else resolved_at end,
                 updated_at = now(), updated_by = ${ctx.user.id}
               where id = ${row.id}`;
  await addHistory(ctx, { incidentId: row.id }, { event: "status_changed", title: row.title, detail: status });
  const recipients = new Set<string>();
  const owner = row.owner as EntryOwner | null;
  if (owner?.type === "member" && owner.memberId) recipients.add(owner.memberId);
  const stakeholders = await ctx.tx<{ owner: EntryOwner }[]>`select owner from incident_stakeholders where incident_id = ${row.id}`;
  for (const s of stakeholders) if (s.owner?.type === "member" && s.owner.memberId) recipients.add(s.owner.memberId);
  for (const uid of recipients) {
    await notify(ctx, uid, `Incidente "${row.title}" mudou para ${STATUS_LABEL[status] ?? status}`, `/support/${row.id}`);
  }
}

export async function setIncidentStatus(ctx: Ctx, id: string, body: unknown) {
  const d = parseBody(IncidentStatusInput, body);
  const row = await loadIncident(ctx, id);
  await setStatusInternal(ctx, row, d.Status);
  if (d.CompleteOpenTasks && (d.Status === "resolved" || d.Status === "closed")) await completeOpenTasks(ctx, "incident", id, {});
  if (d.Note) await addHistory(ctx, { incidentId: id }, { event: "note", title: "Nota", detail: d.Note, manual: true });
}

export async function updateIncident(ctx: Ctx, id: string, body: unknown, ifMatch?: string | null) {
  const d = parseBody(IncidentPatch, body);
  await checkEtag(ctx, "incidents", id, ifMatch);
  const row = await loadIncident(ctx, id);
  const set: Row = {};
  if (d.Title !== undefined && d.Title !== row.title) set.title = d.Title;
  if (d.Priority !== undefined) set.priority = d.Priority;
  if (d.Impact !== undefined) set.impact = d.Impact;
  if (d.Deadline !== undefined) set.deadline = d.Deadline;
  if (d.Owner) {
    const o = await resolveOwner(ctx, d.Owner);
    delete o.kind;
    set.owner = ctx.tx.json(o as never);
  }
  if (d.Description !== undefined && d.Description !== row.description) {
    await collabReset(ctx, `incident_${id}_description`);
    set.description = d.Description;
  }
  if (Object.keys(set).length) {
    set.updated_at = new Date().toISOString();
    set.updated_by = ctx.user.id;
    await ctx.tx`update incidents set ${ctx.tx(set)} where id = ${id}`;
  }
  if (set.title) await addHistory(ctx, { incidentId: id }, { event: "name_changed", title: set.title, detail: row.title });
  if (d.Status) await setStatusInternal(ctx, { ...row, ...set }, d.Status);
  if (d.CompleteOpenTasks && (d.Status === "resolved" || d.Status === "closed")) await completeOpenTasks(ctx, "incident", id, {});
}

export async function linkIncident(ctx: Ctx, id: string, kind: "client" | "project", body: unknown, link: boolean) {
  const key = kind === "client" ? "ClientId" : "ProjectId";
  const parsed = parseBody(z.object({ [key]: Guid }).strict(), body) as Record<string, string>;
  const other = parsed[key];
  await loadIncident(ctx, id);
  const table = kind === "client" ? "incident_clients" : "incident_projects";
  const colName = kind === "client" ? "client_id" : "project_id";
  if (link) {
    await ensureIds(ctx, kind === "client" ? "clients" : "projects", [other], key);
    await ctx.tx.unsafe(`insert into public.${table} (incident_id, ${colName}) values ($1, $2) on conflict do nothing`, [id, other]);
  } else {
    await ctx.tx.unsafe(`delete from public.${table} where incident_id = $1 and ${colName} = $2`, [id, other]);
  }
}

export async function addStakeholder(ctx: Ctx, id: string, body: unknown): Promise<string> {
  const d = parseBody(OwnerInput, body);
  const row = await loadIncident(ctx, id);
  const owner = await resolveOwner(ctx, d);
  delete owner.kind;
  await ctx.tx`insert into incident_stakeholders (id, incident_id, owner) values (${owner.id}, ${id}, ${ctx.tx.json(owner as never)})`;
  if (owner.type === "member") {
    await notify(ctx, owner.memberId, `Você foi adicionado como stakeholder em "${row.title}"`, `/support/${id}`);
  }
  return owner.id;
}

export async function removeStakeholder(ctx: Ctx, id: string, body: unknown) {
  const { StakeholderId } = parseBody(z.object({ StakeholderId: Guid }).strict(), body);
  const r = await ctx.tx`delete from incident_stakeholders where id = ${StakeholderId} and incident_id = ${id} returning id`;
  if (!r.length) throw notFound("Stakeholder não encontrado neste incidente.");
}
