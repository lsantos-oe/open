// Clientes (carteira), contatos e histórico de CS.
import { z } from "zod";
import type { Ctx } from "../lib/context.ts";
import { notFound, validation } from "../lib/errors.ts";
import { Enums } from "../odata/edm.ts";
import {
  checkEtag,
  collabReset,
  Guid,
  IsoDate,
  lockName,
  OwnerInput,
  parseBody,
  resolveOwner,
  resolveOwners,
  Text,
  zEnum,
} from "./shared.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const Country = z.string().trim().regex(/^[A-Za-z]{2}$/, "País em código ISO-2 (ex.: BR)").transform((s) => s.toUpperCase());

export const ClientCreate = z.object({
  Name: Text(300),
  Country: Country.optional(),
  Status: zEnum(Enums.ClientStatus).optional(),
  PloomesLink: z.string().url().max(2000).optional(),
  Notes: z.string().max(100_000).optional(),
  Owners: z.array(OwnerInput).max(10).optional(),
}).strict();

export const ClientPatch = z.object({
  Name: Text(300).optional(),
  Country: Country.nullable().optional(),
  Status: zEnum(Enums.ClientStatus).optional(),
  PloomesLink: z.string().url().max(2000).nullable().optional(),
  Notes: z.string().max(100_000).nullable().optional(),
  Owners: z.array(OwnerInput).max(10).optional(),
}).strict();

export const AssignCsInput = z.object({
  UserId: Guid.optional(),
  Email: z.string().email().optional(),
  Name: z.string().trim().min(1).max(200).optional(),
  AssignedAt: IsoDate.optional(),
  Note: z.string().max(2000).optional(),
}).strict().refine((x) => x.UserId || x.Email || x.Name, "Informe UserId, Email ou Name.");

export const ContactCreate = z.object({
  Name: Text(200),
  Role: z.string().max(200).optional(),
  Email: z.string().email().max(300).optional(),
  Phone: z.string().max(50).optional(),
  ClientIds: z.array(Guid).max(20).optional(),
}).strict();

export const ContactPatch = z.object({
  Name: Text(200).optional(),
  Role: z.string().max(200).nullable().optional(),
  Email: z.string().email().max(300).nullable().optional(),
  Phone: z.string().max(50).nullable().optional(),
}).strict();

async function ensureClient(ctx: Ctx, id: string): Promise<Row> {
  const [c] = await ctx.tx<Row[]>`select * from clients where id = ${id} for update`;
  if (!c) throw notFound(`Clients(${id}) não encontrado.`);
  return c;
}

export async function createClient(ctx: Ctx, body: unknown): Promise<string> {
  const d = parseBody(ClientCreate, body);
  await lockName(ctx, "client", d.Name);
  const [dup] = await ctx.tx`select id from clients where lower(name) = lower(${d.Name}) and not archived`;
  if (dup) throw validation(`Já existe um cliente chamado '${d.Name}' (Id ${dup.id}).`, "Name");
  const owners = d.Owners ? await resolveOwners(ctx, d.Owners) : [];
  const [r] = await ctx.tx<{ id: string }[]>`insert into clients ${
    ctx.tx({
      name: d.Name,
      country: d.Country ?? null,
      // mesmo padrão do app ao criar cliente
      status: d.Status ?? "sustentacao_novos_projetos",
      ploomes_link: d.PloomesLink ?? null,
      notes: d.Notes ?? null,
      owners: ctx.tx.json(owners as never),
      created_by: ctx.user.id,
      archived: false,
    })
  } returning id`;
  return r.id;
}

export async function updateClient(ctx: Ctx, id: string, body: unknown, ifMatch?: string | null) {
  const d = parseBody(ClientPatch, body);
  await checkEtag(ctx, "clients", id, ifMatch);
  const row = await ensureClient(ctx, id);
  const set: Row = {};
  if (d.Name !== undefined) set.name = d.Name;
  if (d.Country !== undefined) set.country = d.Country;
  if (d.Status !== undefined) set.status = d.Status;
  if (d.PloomesLink !== undefined) set.ploomes_link = d.PloomesLink;
  if (d.Owners) set.owners = ctx.tx.json((await resolveOwners(ctx, d.Owners)) as never);
  if (d.Notes !== undefined && d.Notes !== row.notes) {
    await collabReset(ctx, `client_${id}_notes`);
    set.notes = d.Notes;
  }
  if (Object.keys(set).length) await ctx.tx`update clients set ${ctx.tx(set)} where id = ${id}`;
}

export async function setClientArchived(ctx: Ctx, id: string, archived: boolean) {
  await ensureClient(ctx, id);
  await ctx.tx`update clients set archived = ${archived} where id = ${id}`;
}

export async function assignCs(ctx: Ctx, id: string, body: unknown): Promise<string> {
  const d = parseBody(AssignCsInput, body);
  await ensureClient(ctx, id);
  const owner = await resolveOwner(ctx, { UserId: d.UserId, Email: d.Email, Name: d.Name });
  delete owner.kind;
  const [r] = await ctx.tx<{ id: string }[]>`
    insert into client_cs_history (client_id, owner, assigned_at, note, created_by)
    values (${id}, ${ctx.tx.json(owner as never)}, ${d.AssignedAt ?? ctx.today}, ${d.Note ?? null}, ${ctx.user.id})
    returning id`;
  return r.id;
}

// ─── contatos ───────────────────────────────────────────────────────────────

export async function createContact(ctx: Ctx, body: unknown): Promise<string> {
  const d = parseBody(ContactCreate, body);
  const ids = [...new Set(d.ClientIds ?? [])];
  if (ids.length) {
    const found = await ctx.tx`select id from clients where id = any(${ids}::uuid[])`;
    if (found.length !== ids.length) throw validation("Algum ClientId não existe.", "ClientIds");
  }
  if (d.Email) {
    await lockName(ctx, "contact", d.Email);
    const [dup] = await ctx.tx`select id from contacts where lower(email) = lower(${d.Email})`;
    if (dup) throw validation(`Já existe um contato com esse e-mail (Id ${dup.id}). Use Contacts(id)/Open.LinkClient.`, "Email");
  }
  const [r] = await ctx.tx<{ id: string }[]>`
    insert into contacts (name, role, email, phone) values (${d.Name}, ${d.Role ?? null}, ${d.Email ?? null}, ${d.Phone ?? null})
    returning id`;
  for (const c of ids) await ctx.tx`insert into contact_clients (contact_id, client_id) values (${r.id}, ${c})`;
  return r.id;
}

export async function updateContact(ctx: Ctx, id: string, body: unknown, ifMatch?: string | null) {
  const d = parseBody(ContactPatch, body);
  await checkEtag(ctx, "contacts", id, ifMatch);
  const set: Row = {};
  for (const [k, c] of [["Name", "name"], ["Role", "role"], ["Email", "email"], ["Phone", "phone"]] as const) {
    if (d[k] !== undefined) set[c] = d[k];
  }
  if (!Object.keys(set).length) return;
  const r = await ctx.tx`update contacts set ${ctx.tx(set)} where id = ${id} returning id`;
  if (!r.length) throw notFound();
}

export async function linkContactClient(ctx: Ctx, id: string, body: unknown, link: boolean) {
  const { ClientId } = parseBody(z.object({ ClientId: Guid }).strict(), body);
  const [c] = await ctx.tx`select id from contacts where id = ${id}`;
  if (!c) throw notFound();
  if (link) {
    const [cl] = await ctx.tx`select id from clients where id = ${ClientId}`;
    if (!cl) throw validation("Cliente não encontrado.", "ClientId");
    await ctx.tx`insert into contact_clients (contact_id, client_id) values (${id}, ${ClientId}) on conflict do nothing`;
  } else {
    await ctx.tx`delete from contact_clients where contact_id = ${id} and client_id = ${ClientId}`;
  }
}
