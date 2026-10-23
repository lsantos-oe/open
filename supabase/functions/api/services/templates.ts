// /odata/v1/Templates — templates de projeto usados por POST /Projects e pelo Intake (TemplateId).
// Leitura: qualquer token 'read'. Escrita: só admin.
import { z } from "zod";
import type { ODataRequest, ODataResult } from "../odata/router.ts";
import { requireScope } from "../lib/auth.ts";
import { admin } from "../lib/db.ts";
import { ApiError, notFound } from "../lib/errors.ts";
import { PlanPhaseInput } from "./projects.ts";
import { parseBody } from "./shared.ts";

const Body = z.object({
  Name: z.string().trim().min(1).max(120),
  Description: z.string().max(2000).nullable().optional(),
  Type: z.enum(["NovaConta", "NovoProjeto"]).optional(),
  Language: z.enum(["Pt", "En", "Es", "pt", "en", "es"]).optional(),
  Phases: z.array(PlanPhaseInput).max(50),
}).strict();

interface Row {
  id: string;
  name: string;
  description: string | null;
  type: string;
  language: string;
  structure: { phases?: unknown[] };
  updated_at: Date;
}

const out = (r: Row) => ({
  Id: r.id,
  Name: r.name,
  Description: r.description,
  Type: r.type === "nova_conta" ? "NovaConta" : "NovoProjeto",
  Language: r.language,
  Phases: r.structure?.phases ?? [],
  UpdatedAt: r.updated_at.toISOString(),
});

export async function route(req: ODataRequest, key: string | undefined, rest: string[]): Promise<ODataResult> {
  const { user, method, base } = req;
  if (rest.length) throw notFound();
  if (method === "GET") {
    requireScope(user, "read");
    if (key) {
      const [r] = await admin()<Row[]>`select * from open_api.project_templates where id = ${key}`;
      if (!r) throw notFound("Template não encontrado.");
      return { status: 200, body: { "@odata.context": `${base}/$metadata#Templates/$entity`, ...out(r) } };
    }
    const rows = await admin()<Row[]>`select * from open_api.project_templates order by name`;
    return { status: 200, body: { "@odata.context": `${base}/$metadata#Templates`, value: rows.map(out) } };
  }
  requireScope(user, "admin");
  const raw = await req.bodyText();
  if (method === "POST" && !key) {
    const d = parseBody(Body, raw ? JSON.parse(raw) : {});
    const [r] = await admin()<Row[]>`
      insert into open_api.project_templates (name, description, type, language, structure, created_by)
      values (${d.Name}, ${d.Description ?? null}, ${d.Type === "NovaConta" ? "nova_conta" : "novo_projeto"},
              ${(d.Language ?? "pt").toLowerCase()}, ${admin().json({ phases: d.Phases } as never)}, ${user.id})
      returning *`;
    return { status: 201, body: { "@odata.context": `${base}/$metadata#Templates/$entity`, ...out(r) } };
  }
  if ((method === "PATCH" || method === "PUT") && key) {
    const d = parseBody(Body, raw ? JSON.parse(raw) : {});
    const [r] = await admin()<Row[]>`
      update open_api.project_templates set name = ${d.Name}, description = ${d.Description ?? null},
        type = ${d.Type === "NovaConta" ? "nova_conta" : "novo_projeto"}, language = ${(d.Language ?? "pt").toLowerCase()},
        structure = ${admin().json({ phases: d.Phases } as never)}, updated_at = now()
      where id = ${key} returning *`;
    if (!r) throw notFound("Template não encontrado.");
    return { status: 200, body: { "@odata.context": `${base}/$metadata#Templates/$entity`, ...out(r) } };
  }
  if (method === "DELETE" && key) {
    const r = await admin()`delete from open_api.project_templates where id = ${key} returning id`;
    if (!r.length) throw notFound("Template não encontrado.");
    return { status: 204 };
  }
  throw new ApiError(405, "MethodNotAllowed", `Método ${method} não suportado em Templates.`);
}
