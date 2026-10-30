// Testes unitários (sem banco): parser OData, tradução para SQL, opções e documentos gerados.
//   deno test -A tests/odata.test.ts
import { assert, assertEquals, assertMatch, assertThrows } from "@std/assert";
import { parseFilter, parseOptions, splitTop } from "../odata/filter.ts";
import { Params, translateFilter, translateOrderBy } from "../odata/sql.ts";
import { getSet } from "../odata/entities.ts";
import { buildCsdl } from "../odata/csdl.ts";
import { buildOpenApi } from "../odata/openapi.ts";
import { ApiError } from "../lib/errors.ts";

const tasks = getSet("Tasks");
const tr = (f: string, set = tasks) => {
  const params = new Params();
  const sql = translateFilter(parseFilter(f), { set, alias: "t", params });
  return { sql, params: params.values };
};

Deno.test("comparação simples com enum vira valor do banco", () => {
  const r = tr("Status eq 'InProgress'");
  assertEquals(r.params, ["in_progress"]);
  assertMatch(r.sql, /= \$1/);
});

Deno.test("enum aceita nome qualificado e valor do banco", () => {
  assertEquals(tr("Status eq Open.TaskStatus'Done'").params, ["done"]);
  assertEquals(tr("Status eq 'in_progress'").params, ["in_progress"]);
});

Deno.test("enum inválido → 400 com a lista de valores", () => {
  const e = assertThrows(() => tr("Status eq 'Feito'"), ApiError);
  assertMatch(e.message, /Pending, Todo, InProgress/);
});

Deno.test("and/or/not e parênteses", () => {
  const r = tr("(Status eq 'Todo' or Status eq 'Blocked') and not IsOverdue");
  assertMatch(r.sql, / or /);
  assertMatch(r.sql, /not \(/);
  assertEquals(r.params, ["todo", "blocked"]);
});

Deno.test("datas, guids e null", () => {
  const r = tr("DueDate lt 2026-11-01 and ProjectId eq 00000000-0000-4000-8000-0000000b0001 and PhaseId ne null");
  assertEquals(r.params, ["2026-11-01", "00000000-0000-4000-8000-0000000b0001"]);
  assertMatch(r.sql, /::date/);
  assertMatch(r.sql, /::uuid/);
  assertMatch(r.sql, /is not null/);
});

Deno.test("in (...)", () => {
  const r = tr("Status in ('Todo','InProgress')");
  assertEquals(r.params, ["todo", "in_progress"]);
});

Deno.test("lambda any em coleção complexa (Owners)", () => {
  const r = tr("Owners/any(o: o/UserId eq 00000000-0000-4000-8000-00000000a002 and o/Kind eq 'Validator')");
  assertMatch(r.sql, /exists \(select 1 from jsonb_array_elements/);
  assertMatch(r.sql, /->>'memberId'/);
  assertEquals(r.params, ["00000000-0000-4000-8000-00000000a002", "validator"]);
});

Deno.test("lambda em coleção primitiva (DependsOn) e all", () => {
  assertMatch(tr("DependsOn/any(d: d eq 00000000-0000-4000-8000-0000000e0001)").sql, /jsonb_array_elements_text/);
  assertMatch(tr("Owners/all(o: o/Type eq 'Member')").sql, /not exists/);
});

Deno.test("navegação única e coleção de navegação", () => {
  assertMatch(tr("Project/Status eq 'InProgress'").sql, /from public\.projects/);
  const r = tr("Clients/any(c: contains(c/Name, 'acme'))", getSet("Projects"));
  assertMatch(r.sql, /project_clients/);
  assertEquals(r.params, ["%acme%"]);
});

Deno.test("funções de texto e data", () => {
  assertMatch(tr("startswith(tolower(Name), 'conf')").sql, /lower\(/);
  assertMatch(tr("year(DueDate) eq 2026").sql, /extract\(year/);
  assertMatch(tr("CreatedAt lt now()").sql, /now\(\)/);
});

Deno.test("contains escapa curingas do LIKE", () => {
  assertEquals(tr("contains(Name, '50%_off')").params, ["%50\\%\\_off%"]);
});

Deno.test("string com aspas escapadas", () => {
  assertEquals(tr("Name eq 'd''Avila'").params, ["d'Avila"]);
});

Deno.test("propriedade inexistente e calculada fora do banco são recusadas", () => {
  assertThrows(() => tr("Inexistente eq 1"), ApiError);
  assertThrows(() => tr("IsDelayed", getSet("Projects")), ApiError, "fora do banco");
});

Deno.test("injeção não passa: identificadores vêm só do modelo, valores sempre parametrizados", () => {
  const r = tr("Name eq 'x''; drop table entries; --'");
  assertEquals(r.params, ["x'; drop table entries; --"]);
  assert(!r.sql.includes("drop"));
  assertThrows(() => tr("Name eq 'a'; drop table x"), ApiError);
});

Deno.test("$orderby", () => {
  const params = new Params();
  const s = translateOrderBy([{ path: ["DueDate"], desc: false }, { path: ["Name"], desc: true }], { set: tasks, alias: "t", params });
  assertMatch(s, /asc nulls last, .* desc nulls last/);
});

Deno.test("parseOptions com $expand aninhado", () => {
  const q = new URLSearchParams({
    "$expand": "Phases($orderby=Order;$expand=Tasks($filter=Status ne 'Done';$select=Name,Status)),Clients($select=Name)",
    "$top": "10",
    "$count": "true",
  });
  const o = parseOptions((k) => q.get(k) ?? undefined);
  assertEquals(o.top, 10);
  assertEquals(o.count, true);
  assertEquals(o.expand?.map((e) => e.nav), ["Phases", "Clients"]);
  assertEquals(o.expand?.[0].expand?.[0].select, ["Name", "Status"]);
  assertThrows(() => parseOptions((k) => (k === "$expand" ? "A($expand=B($expand=C($expand=D)))" : undefined)), ApiError);
});

Deno.test("splitTop respeita parênteses e aspas", () => {
  assertEquals(splitTop("a,b(c,d),'e,f'", ","), ["a", "b(c,d)", "'e,f'"]);
});

Deno.test("$metadata tem todos os entity sets e actions", () => {
  const x = buildCsdl();
  for (const s of ["Tasks", "Projects", "Clients", "Incidents", "OpenPoints"]) assertMatch(x, new RegExp(`EntitySet Name="${s}"`));
  assertMatch(x, /Action Name="ChangeDates" IsBound="true"/);
  assertMatch(x, /ActionImport Name="Intake"/);
  for (const s of ["ClientGroups", "DocumentationItems"]) assertMatch(x, new RegExp(`EntitySet Name="${s}"`));
  assertMatch(x, /FunctionImport Name="ResolveCode"/);
});

Deno.test("grupos e documentação: filtros traduzem (membros, etiquetas, público) e Code existe nas entidades principais", () => {
  const groups = getSet("ClientGroups");
  const g = tr("ClientIds/any(c: c eq 00000000-0000-4000-8000-0000000c0001) and BelowMinimum eq false", groups);
  assertMatch(g.sql, /unnest\(/);
  assertEquals(g.params, ["00000000-0000-4000-8000-0000000c0001", false]);
  assertMatch(g.sql, /< 2/);
  const docs = getSet("DocumentationItems");
  const d = tr("Audience in ('Technical','Both') and Tags/any(t: tolower(t) eq 'api') and Source eq 'Task'", docs);
  assertEquals(d.params, ["technical", "both", "api", "task"]);
  assertMatch(d.sql, /unnest\(/);
  assertMatch(tr("Groups/any(g: g/Name eq 'X')", getSet("Clients")).sql, /client_group_members/);
  assertMatch(tr("Documentation/any(d: d/Kind eq 'Link')", getSet("Projects")).sql, /documentation_items/);
  for (const s of ["Clients", "Projects", "Tasks", "Incidents", "Contacts", "Risks", "ClientGroups", "DocumentationItems"]) {
    assert(getSet(s).props.some((p) => p.name === "Code"), `${s} sem Code`);
  }
  assertThrows(() => tr("Status eq 'Link'", docs), Error); // Status não existe em DocumentationItems
});

Deno.test("OpenAPI 3.2 válido estruturalmente (com operação QUERY e exemplos por status)", () => {
  const o = buildOpenApi("http://x/api");
  assertEquals(o.openapi, "3.2.0");
  assert(o.paths["/odata/v1/Tasks"].post);
  assert(o.paths["/odata/v1/Tasks"].query);
  assert(o.paths["/odata/v1/Projects({Id})/Open.OpenTasks()"].get);
  assert(o.paths["/odata/v1/Incidents({Id})/Open.OpenTasks()"].get);
  for (const op of [o.paths["/odata/v1/Tasks"].get, o.paths["/odata/v1/Tasks({Id})"].patch]) {
    for (const [code, r] of Object.entries(op.responses as Record<string, { content?: Record<string, { example?: unknown }> }>)) {
      if (code !== "204") assert(r.content && Object.values(r.content)[0].example !== undefined, `sem exemplo: ${code}`);
    }
  }
  assert(o.paths["/odata/v1/Tasks({Id})/Open.ChangeDates"].post);
  assert(o.paths["/odata/v1/Open.Intake"].post);
  assert(!JSON.stringify(o).includes("{{ROOT}}"));
});
