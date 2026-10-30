// Grupos de clientes: escrita (criar, renomear, desfazer, clientes e contatos diretos).
//
// As regras de integridade moram no banco (migration 20261030): um cliente só em um grupo (a menos que
// settings.config.allowMultipleClientGroups), contato direto do grupo vira vínculo com TODOS os clientes membros
// (contact_clients, por trigger), desfazer o grupo solta o que ele criou. Aqui só validamos o que dá para explicar
// melhor que o erro do banco e deixamos as mensagens do banco (pt-BR) chegarem como 409.
import { z } from "zod";
import type { Ctx } from "../lib/context.ts";
import { conflict, notFound, validation } from "../lib/errors.ts";
import { Guid, parseBody, Text } from "./shared.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export const GroupCreate = z.object({
  Name: Text(120),
  ClientIds: z.array(Guid).min(2, "Um grupo começa com pelo menos 2 clientes.").max(100),
  ContactIds: z.array(Guid).max(100).optional(),
}).strict();
export const GroupPatch = z.object({ Name: Text(120).optional() }).strict();
export const GroupClientInput = z.object({ ClientId: Guid }).strict();
export const GroupContactInput = z.object({ ContactId: Guid }).strict();

async function loadGroup(ctx: Ctx, id: string): Promise<Row> {
  const [g] = await ctx.tx<Row[]>`select * from client_groups where id = ${id} for update`;
  if (!g) throw notFound(`ClientGroups(${id}) não encontrado (ou sem permissão para vê-lo).`);
  return g;
}

async function assertNameFree(ctx: Ctx, name: string, exceptId?: string) {
  const [dup] = await ctx.tx<Row[]>`
    select id from client_groups where lower(btrim(name)) = lower(btrim(${name})) and (${exceptId ?? null}::uuid is null or id <> ${exceptId ?? null}::uuid)`;
  if (dup) throw conflict(`Já existe um grupo chamado "${name}" (Id ${dup.id}). Os nomes de grupo são únicos.`);
}

async function assertClients(ctx: Ctx, ids: string[]) {
  const found = await ctx.tx<Row[]>`select id from clients where id = any(${ids}::uuid[])`;
  const have = new Set(found.map((r) => String(r.id)));
  const missing = ids.filter((i) => !have.has(i));
  if (missing.length) throw validation(`Cliente(s) não encontrado(s): ${missing.join(", ")}.`, "ClientIds");
}

export async function createClientGroup(ctx: Ctx, body: unknown): Promise<string> {
  const d = parseBody(GroupCreate, body);
  const clientIds = [...new Set(d.ClientIds)];
  if (clientIds.length < 2) throw validation("Um grupo começa com pelo menos 2 clientes diferentes.", "ClientIds");
  const contactIds = [...new Set(d.ContactIds ?? [])];
  await assertNameFree(ctx, d.Name);
  await assertClients(ctx, clientIds);
  if (contactIds.length) {
    const found = await ctx.tx<Row[]>`select id from contacts where id = any(${contactIds}::uuid[])`;
    if (found.length !== contactIds.length) throw validation("Algum ContactId não existe.", "ContactIds");
  }
  const [g] = await ctx.tx<{ id: string }[]>`insert into client_groups (name, created_by) values (${d.Name}, ${ctx.user.id}) returning id`;
  // um a um: se um cliente já está em outro grupo, o banco explica qual (409) e tudo é desfeito
  for (const c of clientIds) await ctx.tx`insert into client_group_members (group_id, client_id, added_by) values (${g.id}, ${c}, ${ctx.user.id})`;
  for (const k of contactIds) await ctx.tx`insert into client_group_contacts (group_id, contact_id, added_by) values (${g.id}, ${k}, ${ctx.user.id})`;
  return g.id;
}

export async function updateClientGroup(ctx: Ctx, id: string, body: unknown, _ifMatch?: string | null) {
  const d = parseBody(GroupPatch, body);
  const g = await loadGroup(ctx, id);
  if (d.Name === undefined || d.Name === g.name) return;
  await assertNameFree(ctx, d.Name, id);
  await ctx.tx`update client_groups set name = ${d.Name} where id = ${id}`;
}

/** Desfaz o grupo: clientes e contatos continuam existindo; os vínculos de contato que o grupo criou são soltos. */
export async function deleteClientGroup(ctx: Ctx, id: string) {
  await loadGroup(ctx, id);
  await ctx.tx`delete from client_groups where id = ${id}`;
}

export async function groupClient(ctx: Ctx, id: string, body: unknown, add: boolean) {
  const { ClientId } = parseBody(GroupClientInput, body);
  await loadGroup(ctx, id);
  if (add) {
    await assertClients(ctx, [ClientId]).catch(() => {
      throw validation(`Cliente não encontrado: ${ClientId}.`, "ClientId");
    });
    // erro do banco (cliente já em outro grupo) sobe como 409 com o nome do grupo
    await ctx.tx`insert into client_group_members (group_id, client_id, added_by) values (${id}, ${ClientId}, ${ctx.user.id}) on conflict do nothing`;
  } else {
    await ctx.tx`delete from client_group_members where group_id = ${id} and client_id = ${ClientId}`;
  }
}

export async function groupContact(ctx: Ctx, id: string, body: unknown, add: boolean) {
  const { ContactId } = parseBody(GroupContactInput, body);
  await loadGroup(ctx, id);
  if (add) {
    const [k] = await ctx.tx<Row[]>`select id from contacts where id = ${ContactId}`;
    if (!k) throw validation(`Contato não encontrado: ${ContactId}.`, "ContactId");
    await ctx.tx`insert into client_group_contacts (group_id, contact_id, added_by) values (${id}, ${ContactId}, ${ctx.user.id}) on conflict do nothing`;
  } else {
    await ctx.tx`delete from client_group_contacts where group_id = ${id} and contact_id = ${ContactId}`;
  }
}
