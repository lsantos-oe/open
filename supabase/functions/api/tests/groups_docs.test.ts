// Grupos de clientes, documentação e códigos curtos — SQL real num Postgres em memória (PGlite), sem staging.
//   deno test -A tests/groups_docs.test.ts
// Aplica as migrations de grupos e de códigos sobre um schema mínimo e roda as leituras OData/serviços de verdade.
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals, assertMatch, assertRejects } from "@std/assert";
import { PGlite } from "npm:@electric-sql/pglite@0.5.13";
import type { Ctx } from "../lib/context.ts";
import { getSet } from "../odata/entities.ts";
import { parseOptions } from "../odata/filter.ts";
import { readCollection, readOne } from "../odata/read.ts";
import { getClientGroup, listClientGroups, listDocumentation, resolveCode } from "../services/groups.ts";

const MIG = new URL("../../../migrations/", import.meta.url);
const read = (f: string) => Deno.readTextFile(new URL(f, MIG));
const CODE = /^[A-Z][0-9]{8}$/;

const A = "00000000-0000-4000-8000-00000000a001";
const id = (p: string, n: number) => `${p}0000000-0000-4000-8000-00000000000${n}`;
const C = [1, 2, 3].map((n) => id("c", n)); // clientes
const P = [1, 2].map((n) => id("b", n)); // projetos
const K = [1, 2, 3].map((n) => id("d", n)); // contatos
const E = [1, 2, 3].map((n) => id("e", n)); // tarefas
const I1 = id("f", 1);

const db = new PGlite();
const ctx: Ctx = {
  user: { id: A } as any,
  tx: { unsafe: async (sql: string, params: unknown[] = []) => (await db.query(sql, params as any[])).rows } as any,
  today: "2026-10-30",
  settings: { holidays: [], workdays: "mon-fri", defaultLanguage: "pt" },
  dryRun: false,
};

async function setup() {
  await db.exec(`
    create role authenticated; create role anon; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select '${A}'::uuid $$;
    create table profiles (id uuid primary key);
    insert into profiles values ('${A}');
    create table settings (key text primary key, value jsonb);
    create table clients (id uuid primary key default gen_random_uuid(), name text, country text, status text default 'implantacao', archived boolean default false, created_at timestamptz default now());
    create table contacts (id uuid primary key default gen_random_uuid(), name text, role text, email text, phone text, created_at timestamptz default now());
    create table contact_clients (contact_id uuid not null references contacts(id) on delete cascade, client_id uuid not null references clients(id) on delete cascade, primary key (contact_id, client_id));
    create table projects (id uuid primary key default gen_random_uuid(), name text, status text default 'in_progress', pm text, archived boolean default false, created_at timestamptz default now());
    create table project_clients (project_id uuid references projects(id) on delete cascade, client_id uuid references clients(id) on delete cascade);
    create table incidents (id uuid primary key default gen_random_uuid(), title text, status text default 'open', priority text default 'medium', impact text default 'medium', deadline date, created_at timestamptz default now(), status_changed_at timestamptz default now());
    create table incident_clients (incident_id uuid references incidents(id) on delete cascade, client_id uuid references clients(id) on delete cascade);
    create table entries (id uuid primary key default gen_random_uuid(), type text default 'task', name text, project_id uuid, phase_id uuid, incident_id uuid, status text default 'pending',
      planned_start date, planned_end date, planned_date date, actual_end date, hidden_from_plan boolean, "order" int default 0, subtasks jsonb default '[]', links jsonb default '[]',
      is_documentation boolean not null default false, created_at timestamptz default now(), updated_at timestamptz default now());
    create table risks (id uuid primary key default gen_random_uuid(), project_id uuid, description text, created_at timestamptz default now());
    create table attachments (id uuid primary key default gen_random_uuid(), entity_type text, entity_id uuid, storage_path text, name text, size bigint, uploaded_by uuid, created_at timestamptz default now());
    create table documentation_items (id uuid primary key default gen_random_uuid(), project_id uuid references projects(id) on delete cascade, client_id uuid references clients(id) on delete cascade,
      kind text not null, title text not null, url text, storage_path text, file_name text, file_size bigint, body text, audience text not null default 'both', tags text[] not null default '{}',
      created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    create table documentation_meta (source_key text primary key, audience text not null default 'both', tags text[] not null default '{}', updated_by uuid, updated_at timestamptz not null default now());
  `);
  await db.exec(await read("20261030_client_groups.sql"));
  await db.exec(await read("20261031_display_codes.sql"));
  await db.exec(`
    insert into clients (id, name, country) values ('${C[0]}', 'Lockton Brasil', 'BR'), ('${C[1]}', 'Lockton México', 'MX'), ('${C[2]}', 'Acme', 'BR');
    insert into contacts (id, name, role, email) values ('${K[0]}', 'Marina Alves', 'Diretora', 'm@x.com'), ('${K[1]}', 'Pedro Lima', null, null), ('${K[2]}', 'Contato do grupo', 'Sponsor', null);
    insert into contact_clients values ('${K[0]}', '${C[0]}'), ('${K[1]}', '${C[1]}');
    insert into projects (id, name) values ('${P[0]}', 'Implantação Lockton'), ('${P[1]}', 'Projeto da Acme');
    insert into project_clients values ('${P[0]}', '${C[0]}'), ('${P[1]}', '${C[2]}');
    insert into incidents (id, title) values ('${I1}', 'Integração parada');
    insert into incident_clients values ('${I1}', '${C[1]}');
    insert into entries (id, name, project_id, is_documentation, links) values
      ('${E[0]}', 'Documentação', '${P[0]}', true, '[{"id":"l1","label":"Manual do administrador","url":"https://wiki/manual"},{"id":"l2","label":"","url":"https://wiki/semrotulo"}]'),
      ('${E[1]}', 'Treinamento', '${P[0]}', false, '[{"id":"l9","label":"Fora","url":"https://nao.deve/aparecer"}]'),
      ('${E[2]}', 'Documentação', '${P[1]}', true, '[]');
    insert into attachments (id, entity_type, entity_id, storage_path, name, size) values
      ('${id("a", 1)}', 'entry', '${E[0]}', 'entry/e1/arq.pdf', 'arquitetura.pdf', 2048),
      ('${id("a", 2)}', 'entry', '${E[1]}', 'entry/e2/x.pdf', 'fora.pdf', 10);
    insert into documentation_meta (source_key, audience, tags) values ('entry-link:${E[0]}:l1', 'executive', '{Manual}');
    insert into documentation_items (project_id, client_id, kind, title, url, body, audience, tags) values
      ('${P[0]}', null, 'link', 'Postman da integração', 'https://postman/col', null, 'technical', '{API,Integração}'),
      (null, '${C[1]}', 'text', 'Visão geral da operação', null, '## Resumo\\nO cliente usa três funis.', 'executive', '{Operação}'),
      ('${P[1]}', null, 'file', 'Mapa de campos', null, null, 'both', '{Integração}');
    update documentation_items set storage_path = 'documentation/project/x/mapa.xlsx', file_name = 'mapa.xlsx', file_size = 15000 where kind = 'file';
  `);
  // grupo: Lockton Brasil + México, com um contato direto
  await db.exec(`
    insert into client_groups (id, name) values ('${id("9", 1)}', 'Grupo Lockton');
    insert into client_group_members (group_id, client_id) values ('${id("9", 1)}', '${C[0]}'), ('${id("9", 1)}', '${C[1]}');
    insert into client_group_contacts (group_id, contact_id) values ('${id("9", 1)}', '${K[2]}');
  `);
}

const o = (f: Record<string, string | undefined>) => parseOptions((k) => f[k]);
const G = id("9", 1);
const codeOf = async (set: string, rid: string) => String((await readOne(ctx, getSet(set), rid, o({ $select: "Id,Code" }))).Code);

Deno.test({ name: "[grupos/docs] schema + migrations", sanitizeResources: false, sanitizeOps: false, fn: async (t) => {
  await setup();

  await t.step("códigos: formato letra + ano(2) + 6 dígitos em tudo que tem Code", async () => {
    for (const [set, ids] of [["Clients", C], ["Projects", P], ["Contacts", K], ["Tasks", E], ["Incidents", [I1]], ["ClientGroups", [G]]] as const) {
      const rows = (await readCollection(ctx, getSet(set), o({ $select: "Id,Code", $top: "50" }))).rows;
      for (const x of ids) assertMatch(String(rows.find((r) => r.Id === x)?.Code), CODE, `${set} sem código`);
    }
  });

  await t.step("ClientGroups: membros, contatos diretos, contagem e aviso de menos de 2", async () => {
    const g = await readOne(ctx, getSet("ClientGroups"), G, {});
    assertEquals(g.Name, "Grupo Lockton");
    assertEquals(g.ClientIds, [C[0], C[1]]);
    assertEquals(g.ContactIds, [K[2]]);
    assertEquals([g.ClientCount, g.BelowMinimum], [2, false]);
    await db.exec(`insert into client_groups (id, name) values ('${id("9", 2)}', 'Sozinho'); insert into client_group_members values ('${id("9", 2)}', '${C[2]}');`);
    assertEquals((await readOne(ctx, getSet("ClientGroups"), id("9", 2), {})).BelowMinimum, true);
    await db.exec(`delete from client_groups where id = '${id("9", 2)}'`);
  });

  await t.step("filtros: grupos de um cliente, clientes de um grupo (Groups/Clients)", async () => {
    const g = await listClientGroups(ctx, { clientId: C[1] });
    assertEquals(g.map((x: any) => x.Name), ["Grupo Lockton"]);
    assertEquals((await listClientGroups(ctx, { clientId: C[2] })).length, 0);
    const byMember = await readCollection(ctx, getSet("ClientGroups"), o({ $filter: `ClientIds/any(c: c eq ${C[0]})`, $select: "Id" }));
    assertEquals(byMember.rows.length, 1);
    const cg = await readCollection(ctx, getSet("Clients"), o({ $filter: "Groups/any(g: g/Name eq 'Grupo Lockton')", $select: "Name" }));
    assertEquals(cg.rows.map((r) => r.Name).sort(), ["Lockton Brasil", "Lockton México"]);
  });

  await t.step("contato direto no grupo vira vínculo com TODOS os clientes (materializado) e aparece na visão compilada", async () => {
    const view: any = await getClientGroup(ctx, G);
    assertEquals(view.Clients.map((c: any) => c.Name).sort(), ["Lockton Brasil", "Lockton México"]);
    assertEquals(view.Projects.map((p: any) => p.Name), ["Implantação Lockton"]);
    assertEquals(view.Incidents.map((i: any) => i.Title), ["Integração parada"]);
    const byName = Object.fromEntries(view.Contacts.map((c: any) => [c.Name, c]));
    assertEquals(Object.keys(byName).sort(), ["Contato do grupo", "Marina Alves", "Pedro Lima"]);
    assertEquals(byName["Contato do grupo"].DirectInGroup, true);
    assertEquals(byName["Contato do grupo"].Clients.length, 2); // ligado aos dois clientes
    assertEquals(byName["Marina Alves"].DirectInGroup, false);
    assertEquals(view.Contacts[0].Name, "Contato do grupo"); // diretos primeiro
    assertMatch(view.Code, CODE);
    assert(view.Link.endsWith(`/r/${view.Code}`));
  });

  await t.step("DocumentationItems: diretos + links e anexos das tarefas de documentação (espelhados)", async () => {
    const all = (await readCollection(ctx, getSet("DocumentationItems"), o({ $top: "100", $select: "Id,Source,Kind,Title,Audience,Tags,ProjectId,ClientId,TaskId,HasFile" }))).rows;
    assertEquals(all.length, 3 + 3); // 3 diretos + 2 links + 1 anexo (nada das tarefas que não são de documentação)
    const titles = all.map((r) => r.Title).sort();
    assertEquals(titles, ["Manual do administrador", "Mapa de campos", "Postman da integração", "Visão geral da operação", "arquitetura.pdf", "https://wiki/semrotulo"].sort());
    const manual = all.find((r) => r.Title === "Manual do administrador")!;
    assertEquals([manual.Source, manual.Kind, manual.Audience, manual.Tags, manual.TaskId, manual.ProjectId], ["Task", "Link", "Executive", ["Manual"], E[0], P[0]]);
    const semMeta = all.find((r) => r.Title === "https://wiki/semrotulo")!;
    assertEquals([semMeta.Audience, semMeta.Tags], ["Both", []]); // sem classificação: ambos, sem etiquetas
    const arq = all.find((r) => r.Title === "arquitetura.pdf")!;
    assertEquals([arq.Kind, arq.HasFile, arq.Source], ["File", true, "Task"]);
    assertEquals(all.find((r) => r.Title === "Visão geral da operação")!.ClientId, C[1]);
  });

  await t.step("Id dos espelhados é estável e funciona na leitura por chave", async () => {
    const one = (await readCollection(ctx, getSet("DocumentationItems"), o({ $filter: "Title eq 'Manual do administrador'", $select: "Id" }))).rows[0];
    const again = (await readCollection(ctx, getSet("DocumentationItems"), o({ $filter: "Title eq 'Manual do administrador'", $select: "Id" }))).rows[0];
    assertEquals(one.Id, again.Id);
    assertEquals((await readOne(ctx, getSet("DocumentationItems"), String(one.Id), {})).Title, "Manual do administrador");
  });

  await t.step("list_documentation por projeto: filtro de público (técnico traz técnico + ambos) e etiqueta", async () => {
    const proj = await listDocumentation(ctx, { projectId: P[0] });
    assertEquals(proj.count, 4); // Postman + 2 links + anexo
    const tech = await listDocumentation(ctx, { projectId: P[0], audience: "Technical" });
    assertEquals(tech.items.map((i: any) => i.Title).sort(), ["Postman da integração", "arquitetura.pdf", "https://wiki/semrotulo"].sort()); // sem o executivo
    const exec = await listDocumentation(ctx, { projectId: P[0], audience: "Executive" });
    assertEquals(exec.items.map((i: any) => i.Title).sort(), ["Manual do administrador", "arquitetura.pdf", "https://wiki/semrotulo"].sort());
    const tag = await listDocumentation(ctx, { projectId: P[0], tag: "API" });
    assertEquals(tag.items.map((i: any) => i.Title), ["Postman da integração"]);
    assertEquals((await listDocumentation(ctx, { projectId: P[0], tag: "api" })).count, 1); // sem diferenciar caixa
    assertEquals((await listDocumentation(ctx, { projectId: P[0], source: "Task", kind: "Link" })).count, 2);
    assertEquals((await listDocumentation(ctx, { projectId: P[0], text: "postman" })).count, 1);
    assertEquals(proj.tags.map((t: any) => t.Tag).sort(), ["API", "Integração", "Manual"]);
  });

  await t.step("list_documentation por cliente (itens do cliente + dos projetos dele) e por grupo (soma dos membros)", async () => {
    const brasil = await listDocumentation(ctx, { clientId: C[0] });
    assertEquals(brasil.count, 4); // só os do projeto da Lockton Brasil
    const mexico = await listDocumentation(ctx, { clientId: C[1] });
    assertEquals(mexico.items.map((i: any) => i.Title), ["Visão geral da operação"]); // item direto do cliente
    const grupo = await listDocumentation(ctx, { groupId: G });
    assertEquals(grupo.count, 5); // 4 do projeto + 1 do cliente México; nada da Acme
    assert(!grupo.items.some((i: any) => i.Title === "Mapa de campos"));
    assert(grupo.items.every((i: any) => !("Body" in i)), "texto não vem por padrão");
    const comTexto = await listDocumentation(ctx, { groupId: G, includeBody: true, kind: "Text" });
    assertMatch(String(comTexto.items[0].Body), /três funis/);
  });

  await t.step("list_documentation exige exatamente um escopo", async () => {
    await assertRejects(() => listDocumentation(ctx, {}), Error, "exatamente um");
    await assertRejects(() => listDocumentation(ctx, { projectId: P[0], clientId: C[0] }), Error, "exatamente um");
  });

  await t.step("get_client_group traz a documentação resumida por público", async () => {
    const view: any = await getClientGroup(ctx, G);
    assertEquals(view.Documentation.Total, 5);
    assertEquals(view.Documentation.ByAudience, { Technical: 1, Executive: 2, Both: 2 });
  });

  await t.step("resolve_code: acha o registro pelo código em qualquer entidade, com o link do app", async () => {
    const cli = await codeOf("Clients", C[0]);
    const r = await resolveCode(ctx, cli.toLowerCase()); // ignora caixa
    assertEquals([r.EntitySet, r.Id], ["Clients", C[0]]);
    assert(r.Link.endsWith(`/r/${cli}`));
    const t1 = await codeOf("Tasks", E[0]);
    assertEquals((await resolveCode(ctx, ` ${t1} `)).EntitySet, "Tasks");
    const grp = await codeOf("ClientGroups", G);
    assertEquals((await resolveCode(ctx, grp)).EntitySet, "ClientGroups");
    const direct = (await readCollection(ctx, getSet("DocumentationItems"), o({ $filter: "Source eq 'Direct' and Kind eq 'Link'", $select: "Id,Code" }))).rows[0];
    assertEquals((await resolveCode(ctx, String(direct.Code))).EntitySet, "DocumentationItems");
  });

  await t.step("resolve_code: formato inválido e código inexistente", async () => {
    await assertRejects(() => resolveCode(ctx, "C-2026-000123"), Error, "formato");
    await assertRejects(() => resolveCode(ctx, "abc"), Error, "formato");
    await assertRejects(() => resolveCode(ctx, "X26000001"), Error, "Letra");
    await assertRejects(() => resolveCode(ctx, "C99999999"), Error, "Nenhum registro");
  });

  await t.step("Projects/Clients navegam para Documentation e Groups ($expand)", async () => {
    const p = await readOne(ctx, getSet("Projects"), P[0], o({ $select: "Id,Code", $expand: "Documentation($select=Title)" }));
    assertEquals((p.Documentation as any[]).length, 4);
    const c = await readOne(ctx, getSet("Clients"), C[1], o({ $select: "Id", $expand: "Groups($select=Name),Documentation($select=Title)" }));
    assertEquals((c.Groups as any[]).map((x) => x.Name), ["Grupo Lockton"]);
    assertEquals((c.Documentation as any[]).map((x) => x.Title), ["Visão geral da operação"]);
    const gx = await readOne(ctx, getSet("ClientGroups"), G, o({ $expand: "Documentation($select=Title)" }));
    assertEquals((gx.Documentation as any[]).length, 5);
  });
}});
