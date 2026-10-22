// Utilitários compartilhados pelos serviços de escrita.
import { z } from "zod";
import type { Ctx } from "../lib/context.ts";
import { conflict, notFound, preconditionFailed, validation } from "../lib/errors.ts";
import type { Entry, EntryOwner, Phase } from "../domain/types.ts";
import { applyIsCritical } from "../domain/criticalPath.ts";

// ─── validação de payload ───────────────────────────────────────────────────

export const Guid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Guid inválido");
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato YYYY-MM-DD").refine(
  (s) => !Number.isNaN(Date.parse(s)),
  "Data inválida",
);
export const Text = (max = 500) => z.string().trim().min(1, "Não pode ficar vazio").max(max);

/** Lê o corpo com zod e devolve erros no formato OData (details por campo). */
export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body ?? {});
  if (r.success) return r.data;
  const details = r.error.issues.map((i) => ({
    code: "Validation",
    message: i.message,
    target: i.path.join("/") || undefined,
  }));
  throw validation(details[0]?.message ?? "Payload inválido.", details[0]?.target, details);
}

/** Enum por membro OData (InProgress) ou valor do banco (in_progress). */
export function zEnum(en: { members: Record<string, string> }) {
  const members = en.members;
  return z.string().transform((s, ctx): string => {
    if (s in members) return members[s];
    const low = s.toLowerCase();
    for (const [m, v] of Object.entries(members)) if (m.toLowerCase() === low || v === s) return v;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Use um de: ${Object.keys(members).join(", ")}` });
    return z.NEVER;
  });
}

// ─── pessoas ────────────────────────────────────────────────────────────────

export interface Person {
  id: string;
  name: string;
  email: string | null;
}

/** Pessoa por UserId ou e-mail (nunca por nome — evita ambiguidade). Só usuários ativos. */
export async function findPerson(ctx: Ctx, ref: { UserId?: string; Email?: string }, target = "UserId"): Promise<Person> {
  const rows = ref.UserId
    ? await ctx.tx<Person[]>`select id, coalesce(name, email) as name, email from profiles where id = ${ref.UserId} and active`
    : await ctx.tx<Person[]>`select id, coalesce(name, email) as name, email from profiles where lower(email) = lower(${ref.Email!}) and active`;
  if (!rows[0]) throw validation(`Usuário não encontrado ou inativo: ${ref.UserId ?? ref.Email}.`, target);
  return rows[0];
}

export const OwnerInput = z.object({
  UserId: Guid.optional(),
  Email: z.string().email().optional(),
  ContactId: Guid.optional(),
  Name: z.string().trim().min(1).max(200).optional(),
  Kind: z.enum(["Executor", "Validator", "executor", "validator"]).optional(),
}).refine((o) => o.UserId || o.Email || o.ContactId || o.Name, "Informe UserId, Email, ContactId ou Name.");
export type OwnerInputT = z.infer<typeof OwnerInput>;

/** Converte o owner da API no JSON que o app grava ({id,type,memberId,contactId,name,kind}). */
export async function resolveOwner(ctx: Ctx, o: OwnerInputT, defaultKind?: "executor" | "validator"): Promise<EntryOwner> {
  const kind = (o.Kind?.toLowerCase() as "executor" | "validator" | undefined) ?? defaultKind;
  if (o.UserId || o.Email) {
    const p = await findPerson(ctx, o);
    return { id: crypto.randomUUID(), type: "member", memberId: p.id, name: p.name, ...(kind ? { kind } : {}) };
  }
  if (o.ContactId) {
    const [c] = await ctx.tx<{ name: string }[]>`select name from contacts where id = ${o.ContactId}`;
    if (!c) throw validation(`Contato não encontrado: ${o.ContactId}.`, "ContactId");
    return { id: crypto.randomUUID(), type: "contact", contactId: o.ContactId, name: c.name, ...(kind ? { kind } : {}) };
  }
  return { id: crypto.randomUUID(), type: "text", name: o.Name!, ...(kind ? { kind } : {}) };
}

export async function resolveOwners(ctx: Ctx, list: OwnerInputT[]): Promise<EntryOwner[]> {
  const out: EntryOwner[] = [];
  for (const o of list) out.push(await resolveOwner(ctx, o, "executor"));
  return out;
}

export function myName(ctx: Ctx): string {
  return ctx.user.name ?? ctx.user.email ?? "API";
}

// ─── efeitos colaterais (mesmos do front) ───────────────────────────────────

/** Notificação para outra pessoa (nunca para si mesmo), como notifyUser() do front. */
export async function notify(ctx: Ctx, userId: string | undefined | null, message: string, link: string) {
  if (!userId || userId === ctx.user.id) return;
  await ctx.tx`insert into notifications (user_id, message, link) values (${userId}, ${message}, ${link})`;
}

export async function addHistory(
  ctx: Ctx,
  scope: { projectId?: string | null; incidentId?: string | null },
  h: { event: string; title: string; detail?: string | null; linkedId?: string | null; linkedType?: string | null; manual?: boolean },
) {
  await ctx.tx`insert into history (project_id, incident_id, type, event, title, detail, linked_id, linked_type,
                                   author_id, author_name, author_avatar, date)
               values (${scope.projectId ?? null}, ${scope.incidentId ?? null}, ${h.manual ? "manual" : "auto"}, ${h.event},
                       ${h.title}, ${h.detail ?? null}, ${h.linkedId ?? null}, ${h.linkedType ?? null},
                       ${ctx.user.id}, ${ctx.user.name ?? ctx.user.email}, ${ctx.user.avatarUrl}, now())`;
}

/** Antes de sobrescrever um texto colaborativo (overview, notes, description...), como o front faz. */
export async function collabReset(ctx: Ctx, docId: string) {
  await ctx.tx`select collab_reset(${docId})`;
}

// ─── concorrência (ETag = xmin) ─────────────────────────────────────────────

export async function checkEtag(ctx: Ctx, table: string, id: string, ifMatch: string | null | undefined) {
  if (!ifMatch || ifMatch === "*") return;
  const want = ifMatch.replace(/^W\//, "").replace(/"/g, "");
  const rows = await ctx.tx.unsafe(`select xmin::text as v from public.${table} where id = $1 for update`, [id]);
  if (!rows[0]) throw notFound();
  if ((rows[0] as unknown as { v: string }).v !== want) throw preconditionFailed();
}

// ─── escopo de tarefas para o motor de datas/caminho crítico do app ────────

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export function rowToEntry(r: Row): Entry {
  const owners = Array.isArray(r.owners) && r.owners.length
    ? r.owners
    : r.responsible
    ? [{ id: r.responsible_member_id ?? r.responsible, type: r.responsible_member_id ? "member" : "text", memberId: r.responsible_member_id ?? undefined, name: r.responsible }]
    : [];
  const u = (v: unknown) => (v == null ? undefined : v);
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    description: u(r.description) as string | undefined,
    clientId: u(r.client_id) as string | undefined,
    clientIds: Array.isArray(r.client_ids) ? r.client_ids : r.client_id ? [r.client_id] : [],
    responsible: r.responsible ?? "",
    dependsOn: Array.isArray(r.depends_on) ? r.depends_on : [],
    isCritical: !!r.is_critical,
    plannedStart: u(r.planned_start) as string | undefined,
    plannedEnd: u(r.planned_end) as string | undefined,
    baselineStart: u(r.baseline_start) as string | undefined,
    baselineEnd: u(r.baseline_end) as string | undefined,
    plannedDate: u(r.planned_date) as string | undefined,
    baselineDate: u(r.baseline_date) as string | undefined,
    actualStart: u(r.actual_start) as string | undefined,
    actualEnd: u(r.actual_end) as string | undefined,
    durationDays: u(r.duration_days) as number | undefined,
    durationHours: r.duration_hours == null ? undefined : Number(r.duration_hours),
    riskFlag: r.risk_flag ?? "none",
    status: r.status ?? "pending",
    statusOverride: r.status_override ?? undefined,
    responsibleMemberId: u(r.responsible_member_id) as string | undefined,
    owners,
    hiddenFromPlan: r.hidden_from_plan ?? undefined,
    // subtarefas ficam como estão no JSON (a API não as edita nesta versão)
    subtasks: (Array.isArray(r.subtasks) ? r.subtasks : []).map((s: Row) => ({
      id: s.id,
      type: s.type,
      name: s.name,
      responsible: s.responsible ?? "",
      dependsOn: s.depends_on ?? [],
      isCritical: !!s.is_critical,
      plannedStart: s.planned_start,
      plannedEnd: s.planned_end,
      plannedDate: s.planned_date,
      actualStart: s.actual_start,
      actualEnd: s.actual_end,
      durationDays: s.duration_days,
      riskFlag: s.risk_flag ?? "none",
      status: s.status ?? "pending",
      statusOverride: s.status_override,
      order: s.order ?? 0,
      subtasks: [],
      comments: [],
      links: [],
      __raw: s,
    } as unknown as Entry)),
    comments: [],
    links: [],
    order: r.order ?? 0,
    parentEntryId: u(r.parent_entry_id) as string | undefined,
    lastActivityAt: r.last_activity_at ? new Date(r.last_activity_at).toISOString() : undefined,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
  };
}

/** Campos de agenda que o motor do app pode alterar (e que a API grava de volta). */
const SCHEDULE_FIELDS: [keyof Entry, string][] = [
  ["plannedStart", "planned_start"],
  ["plannedEnd", "planned_end"],
  ["plannedDate", "planned_date"],
  ["actualStart", "actual_start"],
  ["actualEnd", "actual_end"],
  ["durationDays", "duration_days"],
  ["isCritical", "is_critical"],
  ["status", "status"],
  ["statusOverride", "status_override"],
  ["lastActivityAt", "last_activity_at"],
];

function subtaskJson(e: Entry) {
  // deno-lint-ignore no-explicit-any
  const raw = (e as any).__raw ?? {};
  return {
    ...raw,
    planned_start: e.plannedStart,
    planned_end: e.plannedEnd,
    planned_date: e.plannedDate,
    actual_start: e.actualStart,
    actual_end: e.actualEnd,
    duration_days: e.durationDays,
    is_critical: e.isCritical,
    status: e.status,
    status_override: e.statusOverride,
  };
}

export interface Scope {
  kind: "project" | "incident" | "standalone";
  id: string | null;
  phases: Phase[];
}

/**
 * Serializa escritas que recalculam a agenda de um mesmo escopo (cascata, caminho crítico, ordem): duas mudanças
 * simultâneas no mesmo projeto rodam uma depois da outra, sem uma sobrescrever a outra. Trava de transação
 * (liberada no commit/rollback) e reentrante. Sempre adquirir ANTES de travar linhas (evita deadlock).
 */
export async function lockScope(ctx: Ctx, s: { kind: Scope["kind"]; id: string | null }) {
  await ctx.tx`select pg_advisory_xact_lock(hashtext(${`open_api:scope:${s.kind}:${s.id ?? "standalone"}`}))`;
}

/** Serializa criações pelo mesmo nome/e-mail (o banco do app não tem unique): evita duplicar sob concorrência. */
export async function lockName(ctx: Ctx, kind: "client" | "project" | "contact", value: string) {
  const norm = value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  await ctx.tx`select pg_advisory_xact_lock(hashtext(${`open_api:${kind}:${norm}`}))`;
}

export async function loadScope(ctx: Ctx, kind: Scope["kind"], id: string | null): Promise<Scope> {
  await lockScope(ctx, { kind, id });
  if (kind === "project") {
    const phases = await ctx.tx<Row[]>`select id, name, "order", is_unassigned from phases where project_id = ${id} order by "order", id`;
    const rows = await ctx.tx<Row[]>`select * from entries where project_id = ${id} order by "order", id`;
    const byPhase = new Map<string, Entry[]>();
    for (const r of rows) {
      const list = byPhase.get(r.phase_id ?? "") ?? [];
      list.push(rowToEntry(r));
      byPhase.set(r.phase_id ?? "", list);
    }
    const out: Phase[] = phases.map((ph) => ({
      id: ph.id,
      name: ph.name,
      order: ph.order ?? 0,
      isUnassigned: ph.is_unassigned,
      entries: byPhase.get(ph.id) ?? [],
    }));
    const orphan = byPhase.get("");
    if (orphan?.length) out.push({ id: "_orphan", name: "", order: 9999, entries: orphan });
    return { kind, id, phases: out };
  }
  const rows = kind === "incident"
    ? await ctx.tx<Row[]>`select * from entries where incident_id = ${id} order by "order", id`
    : await ctx.tx<Row[]>`select * from entries where project_id is null and incident_id is null order by "order", id`;
  return { kind, id, phases: [{ id: `_${kind}`, name: "", order: 0, entries: rows.map(rowToEntry) }] };
}

export function flatEntries(phases: Phase[]): Entry[] {
  return phases.flatMap((ph) => ph.entries);
}

/** Grava só o que mudou entre `before` e `after` (nunca regrava a linha inteira nem o created_at). */
export async function persistScheduleDiff(ctx: Ctx, before: Phase[], after: Phase[]): Promise<string[]> {
  const old = new Map(flatEntries(before).map((e) => [e.id, e]));
  const changed: string[] = [];
  const writes: Promise<unknown>[] = [];
  for (const e of flatEntries(after)) {
    const prev = old.get(e.id);
    if (!prev) continue;
    const set: Record<string, unknown> = {};
    for (const [k, c] of SCHEDULE_FIELDS) {
      const a = prev[k] ?? null, b = e[k] ?? null;
      if (a !== b) set[c] = b;
    }
    const subsBefore = JSON.stringify(prev.subtasks.map(subtaskJson));
    const subsAfter = JSON.stringify(e.subtasks.map(subtaskJson));
    // deno-lint-ignore no-explicit-any
    if (subsBefore !== subsAfter) set.subtasks = ctx.tx.json(e.subtasks.map(subtaskJson) as any);
    if (!Object.keys(set).length) continue;
    set.updated_by = ctx.user.id;
    changed.push(e.id);
    // disparadas juntas: o driver envia em pipeline na mesma conexão (uma ida ao banco para N linhas)
    writes.push(ctx.tx`update entries set ${ctx.tx(set)} where id = ${e.id}`);
  }
  await Promise.all(writes);
  return changed;
}

/** Recalcula o caminho crítico do escopo (mesma função do front) e grava as diferenças. */
export async function refreshCritical(ctx: Ctx, kind: Scope["kind"], id: string | null) {
  const scope = await loadScope(ctx, kind, id);
  await persistScheduleDiff(ctx, scope.phases, applyIsCritical(scope.phases));
}

/** Dependências: existem no mesmo escopo e não formam ciclo. */
export function assertNoCycle(entries: { id: string; dependsOn: string[] }[]) {
  const map = new Map(entries.map((e) => [e.id, e.dependsOn]));
  const state = new Map<string, 1 | 2>();
  const visit = (id: string, path: string[]) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) throw conflict(`Dependência circular: ${[...path, id].join(" → ")}.`);
    state.set(id, 1);
    for (const d of map.get(id) ?? []) if (map.has(d)) visit(d, [...path, id]);
    state.set(id, 2);
  };
  for (const id of map.keys()) visit(id, []);
}

export function scopeOf(row: { project_id?: string | null; incident_id?: string | null }): {
  kind: Scope["kind"];
  id: string | null;
} {
  if (row.project_id) return { kind: "project", id: row.project_id };
  if (row.incident_id) return { kind: "incident", id: row.incident_id };
  return { kind: "standalone", id: null };
}

export function linkFor(row: { project_id?: string | null; incident_id?: string | null }): string {
  if (row.project_id) return `/projects/${row.project_id}`;
  if (row.incident_id) return `/support/${row.incident_id}`;
  return "/tasks";
}
