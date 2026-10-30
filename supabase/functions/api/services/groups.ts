// Grupos de clientes, documentação e códigos curtos: leituras compiladas (usadas pelo MCP e pela função OData Open.ResolveCode).
// Tudo passa pelo modelo OData (mesmas regras de acesso); nada aqui grava.
import type { Ctx } from "../lib/context.ts";
import { config } from "../lib/config.ts";
import { badRequest, notFound } from "../lib/errors.ts";
import { Enums } from "../odata/edm.ts";
import { getSet } from "../odata/entities.ts";
import { parseOptions } from "../odata/filter.ts";
import { readCollection, readOne } from "../odata/read.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const q = (s: string) => `'${s.replaceAll("'", "''")}'`;
const orOf = (field: string, ids: string[]) => ids.length ? `(${ids.map((i) => `${field} eq ${i}`).join(" or ")})` : "false";

const opts = (o: { filter?: string; select?: string; expand?: string; top?: number; search?: string; orderby?: string }) =>
  parseOptions((k) =>
    k === "$filter" ? o.filter : k === "$select" ? o.select : k === "$expand" ? o.expand : k === "$top" ? (o.top ? String(o.top) : undefined) : k === "$search"
      ? o.search
      : k === "$orderby" ? o.orderby : undefined
  );

// ─── códigos curtos ─────────────────────────────────────────────────────────

export const CODE_RE = /^[A-Z][0-9]{8}$/;
/** Letra do código → entity set. */
export const CODE_SETS: Record<string, { set: string; select: string }> = {
  C: { set: "Clients", select: "Id,Code,Name,Status,Country,Archived" },
  P: { set: "Projects", select: "Id,Code,Name,Status,Pm,Progress,OverdueCount,Archived" },
  I: { set: "Incidents", select: "Id,Code,Title,Status,Priority,Impact" },
  T: { set: "Tasks", select: "Id,Code,Name,Type,Status,Scope,ProjectId,IncidentId,ClientIds,DueDate,IsOverdue,Responsible" },
  K: { set: "Contacts", select: "Id,Code,Name,Role,Email" },
  G: { set: "ClientGroups", select: "Id,Code,Name,ClientIds,ContactIds,ClientCount,BelowMinimum" },
  R: { set: "Risks", select: "Id,Code,ProjectId,Description,Probability,Impact,Score,Status" },
  D: { set: "DocumentationItems", select: "Id,Code,Source,Kind,Title,Url,FileName,Audience,Tags,ProjectId,ClientId,TaskId" },
};

/** Onde abrir cada coisa no app. Documentação e demais usam o link curto /r/<código> (o app resolve). */
export const codeLink = (code: string) => `${config.appUrl}/r/${code}`;

/** Resolve um código curto (C26000123) para o registro e o link do app. */
export async function resolveCode(ctx: Ctx, raw: string) {
  const code = String(raw ?? "").trim().toUpperCase();
  if (!CODE_RE.test(code)) throw badRequest("Código inválido. O formato é uma letra, o ano (2 dígitos) e 6 dígitos de sequência, sem hífen, como C26000123 (C cliente, P projeto, I incidente, T tarefa, K contato, G grupo, R risco, D documentação).");
  const target = CODE_SETS[code[0]];
  if (!target) throw badRequest(`Letra '${code[0]}' não é de nenhuma entidade (use C, P, I, T, K, G, R ou D).`);
  const page = await readCollection(ctx, getSet(target.set), opts({ filter: `Code eq ${q(code)}`, select: target.select, top: 1 }));
  const row = page.rows[0];
  if (!row) throw notFound(`Nenhum registro com o código ${code} (ou sem permissão para vê-lo).`);
  return { Code: code, EntitySet: target.set, Id: row.Id, Link: codeLink(code), Entity: row };
}

// ─── grupos ─────────────────────────────────────────────────────────────────

export async function listClientGroups(ctx: Ctx, a: { text?: string; clientId?: string; top?: number }) {
  const f: string[] = [];
  if (a.clientId) f.push(`Clients/any(c: c/Id eq ${a.clientId})`);
  const page = await readCollection(
    ctx,
    getSet("ClientGroups"),
    opts({ filter: f.join(" and ") || undefined, search: a.text, top: a.top ?? 100, expand: "Clients($select=Id,Code,Name)", select: "Id,Code,Name,ClientIds,ContactIds,ClientCount,BelowMinimum" }),
  );
  return page.rows.map((r) => ({ ...r, Link: r.Code ? codeLink(String(r.Code)) : undefined }));
}

/** Visão compilada do grupo: membros, contatos (diretos + dos clientes), projetos, incidentes e resumo da documentação. */
export async function getClientGroup(ctx: Ctx, id: string) {
  if (!GUID.test(id)) throw badRequest("Id do grupo precisa ser um Guid.");
  const group = await readOne(
    ctx,
    getSet("ClientGroups"),
    id,
    opts({
      expand:
        "Clients($select=Id,Code,Name,Status,Country,Archived),Contacts($select=Id,Code,Name,Role,Email,Phone),Projects($select=Id,Code,Name,Status,Pm,Progress,OverdueCount;$top=200),Incidents($select=Id,Code,Title,Status,Priority,IsOverdue;$top=200)",
    }),
  );
  const clientIds = (group.ClientIds as string[]) ?? [];
  const directIds = new Set((group.ContactIds as string[]) ?? []);
  // contatos ligados aos clientes membros (inclui os do grupo, já materializados) — sem repetir
  let memberContacts: Row[] = [];
  if (clientIds.length) {
    const clientsOr = clientIds.map((c) => `c/Id eq ${c}`).join(" or ");
    memberContacts = (await readCollection(
      ctx,
      getSet("Contacts"),
      opts({ filter: `Clients/any(c: ${clientsOr})`, select: "Id,Code,Name,Role,Email,Phone", expand: "Clients($select=Id,Name)", top: 200 }),
    )).rows;
  }
  const contacts = memberContacts.map((c): Row => ({
    ...c,
    DirectInGroup: directIds.has(String(c.Id)),
    Clients: ((c.Clients as Row[]) ?? []).filter((x) => clientIds.includes(String(x.Id))),
  })).sort((x, y) => Number(y.DirectInGroup) - Number(x.DirectInGroup) || String(x.Name).localeCompare(String(y.Name), "pt-BR"));
  const docs = await listDocumentation(ctx, { groupId: id, top: 200, includeBody: false });
  const documentation = {
    Total: docs.count,
    ByAudience: {
      Technical: docs.items.filter((d) => d.Audience === "Technical").length,
      Executive: docs.items.filter((d) => d.Audience === "Executive").length,
      Both: docs.items.filter((d) => d.Audience === "Both").length,
    },
    Items: docs.items,
    Hint: "Para filtrar por público ou etiqueta use list_documentation com groupId.",
  };
  return {
    Id: group.Id,
    Code: group.Code,
    Name: group.Name,
    Link: group.Code ? codeLink(String(group.Code)) : `${config.appUrl}/wallet/groups/${group.Id}`,
    BelowMinimum: group.BelowMinimum,
    Clients: group.Clients,
    Contacts: contacts,
    Projects: group.Projects,
    Incidents: group.Incidents,
    Documentation: documentation,
    Notes: "Contacts: DirectInGroup=true são contatos do grupo (ligados a todos os clientes); os demais são contatos dos clientes membros. Somente leitura nesta versão da API.",
  };
}

// ─── documentação ───────────────────────────────────────────────────────────

export interface DocQuery {
  projectId?: string;
  clientId?: string;
  groupId?: string;
  audience?: "Technical" | "Executive" | "Both";
  tag?: string;
  kind?: "Link" | "File" | "Text";
  source?: "Direct" | "Task";
  text?: string;
  includeBody?: boolean;
  top?: number;
}

const DOC_SELECT = ["Id", "Code", "Source", "Kind", "Title", "Url", "FileName", "FileSize", "HasFile", "Audience", "Tags", "ProjectId", "ClientId", "TaskId", "CreatedAt"];

/** Projetos ativos ligados a estes clientes. */
async function projectIdsOf(ctx: Ctx, clientIds: string[]): Promise<string[]> {
  if (!clientIds.length) return [];
  const clientsOr = clientIds.map((c) => `c/Id eq ${c}`).join(" or ");
  const page = await readCollection(ctx, getSet("Projects"), opts({ filter: `not Archived and Clients/any(c: ${clientsOr})`, select: "Id", top: 200 }));
  return page.rows.map((r) => String(r.Id));
}

/** Documentação de um projeto, de um cliente (itens do cliente + dos projetos dele) ou de um grupo (soma dos clientes membros). */
export async function listDocumentation(ctx: Ctx, a: DocQuery) {
  const scopes = [a.projectId, a.clientId, a.groupId].filter(Boolean);
  if (scopes.length !== 1) throw badRequest("Informe exatamente um entre projectId, clientId e groupId.");
  for (const id of scopes) if (!GUID.test(String(id))) throw badRequest("Ids precisam ser Guid.");
  const f: string[] = [];
  let clientIds: string[] = [];
  if (a.projectId) {
    f.push(`ProjectId eq ${a.projectId}`);
  } else {
    if (a.clientId) clientIds = [a.clientId];
    else clientIds = ((await readOne(ctx, getSet("ClientGroups"), a.groupId!, opts({ select: "Id,ClientIds" }))).ClientIds as string[]) ?? [];
    const projectIds = await projectIdsOf(ctx, clientIds);
    const parts = [orOf("ClientId", clientIds), ...(projectIds.length ? [orOf("ProjectId", projectIds)] : [])];
    f.push(`(${parts.join(" or ")})`);
  }
  // Como no app: "técnico" mostra técnico e ambos; "executivo" mostra executivo e ambos.
  if (a.audience === "Technical") f.push("(Audience eq 'Technical' or Audience eq 'Both')");
  else if (a.audience === "Executive") f.push("(Audience eq 'Executive' or Audience eq 'Both')");
  else if (a.audience === "Both") f.push("Audience eq 'Both'");
  if (a.tag?.trim()) f.push(`Tags/any(t: tolower(t) eq ${q(a.tag.trim().toLowerCase())})`);
  if (a.kind) f.push(`Kind eq '${a.kind}'`);
  if (a.source) f.push(`Source eq '${a.source}'`);
  const page = await readCollection(
    ctx,
    getSet("DocumentationItems"),
    opts({
      filter: f.join(" and "),
      select: [...DOC_SELECT, ...(a.includeBody ? ["Body"] : [])].join(","),
      expand: "Project($select=Id,Code,Name),Client($select=Id,Code,Name),Task($select=Id,Code,Name)",
      search: a.text,
      top: Math.min(a.top ?? 100, 200),
    }),
  );
  const items: Row[] = page.rows.map((r) => ({ ...r, Link: r.Code ? codeLink(String(r.Code)) : undefined }));
  const tagCount = new Map<string, number>();
  for (const it of items) for (const t of (it.Tags as string[]) ?? []) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  return {
    count: items.length,
    hasMore: page.hasMore,
    tags: [...tagCount.entries()].sort((x, y) => y[1] - x[1]).map(([Tag, Count]) => ({ Tag, Count })),
    items,
  };
}

void Enums;
