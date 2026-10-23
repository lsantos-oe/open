// Busca global (função OData Open.Search e tool MCP `search`).
import type { Ctx } from "../lib/context.ts";
import { badRequest } from "../lib/errors.ts";
import { getSet } from "../odata/entities.ts";
import { readCollection } from "../odata/read.ts";

const TARGETS: [string, string[]][] = [
  ["Projects", ["Id", "Name", "Status", "Pm"]],
  ["Tasks", ["Id", "Name", "Status", "Scope", "ProjectId", "IncidentId", "DueDate", "Responsible"]],
  ["Incidents", ["Id", "Title", "Status", "Priority"]],
  ["Clients", ["Id", "Name", "Status", "Country"]],
  ["Contacts", ["Id", "Name", "Email", "Role"]],
  ["OpenPoints", ["Id", "Title", "Status", "ProjectId", "IncidentId"]],
];

export async function searchAll(ctx: Ctx, q: string, top = 10) {
  const query = q.trim();
  if (query.length < 2) throw badRequest("Informe ao menos 2 caracteres em q.");
  const out: Record<string, unknown[]> = {};
  for (const [name, select] of TARGETS) {
    const page = await readCollection(ctx, getSet(name), { search: query, select, top: Math.min(Math.max(top, 1), 25) });
    out[name] = page.rows;
  }
  return out;
}
