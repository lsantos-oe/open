// Servidor MCP ponta a ponta (rodar via tools/test-local.ts, contra STAGING).
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals, assertMatch } from "@std/assert";
import { api, create, EMAIL, env, IDS, ignore, mcp, tool, uniq } from "./_helpers.ts";

const t = (name: string, fn: () => Promise<void>) => Deno.test({ name: `[mcp] ${name}`, ignore, fn, sanitizeResources: false, sanitizeOps: false });

t("initialize: protocolo, capacidades e instruções", async () => {
  const r = await mcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "teste", version: "1" } });
  assertEquals(r.result.serverInfo.name, "open");
  for (const c of ["tools", "resources", "prompts", "completions", "logging"]) assert(c in r.result.capabilities, c);
  assertMatch(r.result.instructions, /Nunca grave sem mostrar o plano/);
});

t("tools/list: catálogo completo, todas com schema, descrição e anotações", async () => {
  const w = (await mcp("tools/list")).result.tools;
  const m = (await mcp("tools/list", {}, env.read)).result.tools;
  assert(w.length >= 55, `só ${w.length} tools`);
  assertEquals(m.length, w.length); // a User-Key tem o acesso da pessoa: membro também grava
  for (const x of w) {
    assert(x.inputSchema?.type === "object", `${x.name} sem inputSchema`);
    assert(x.annotations && "readOnlyHint" in x.annotations, `${x.name} sem anotações`);
    assert(x.description?.length > 10, `${x.name} sem descrição`);
  }
  for (const n of ["whoami", "search", "list_tasks", "get_project", "generate_status_report"]) {
    assertEquals(w.find((x: any) => x.name === n).annotations.readOnlyHint, true, n);
  }
  for (const n of ["create_task", "intake_commit", "set_task_status"]) assertEquals(w.find((x: any) => x.name === n).annotations.readOnlyHint, false, n);
});

t("sem credencial ou com Bearer desconhecido → 401 com desafio OAuth", async () => {
  const res = await fetch(`${env.url}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: "Bearer x" }, body: "{}" });
  assertEquals(res.status, 401);
  assertMatch(res.headers.get("www-authenticate") ?? "", /^Bearer resource_metadata="[^"]+", error="invalid_token"$/);
  await res.body?.cancel();
  const none = await fetch(`${env.url}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assertEquals(none.status, 401);
  assertMatch((await none.json()).error.message, /User-Key/);
});

t("GET/DELETE /mcp → 405 (servidor sem estado; evita o cliente reabrir stream em laço)", async () => {
  for (const method of ["GET", "DELETE"]) {
    const res = await fetch(`${env.url}/mcp`, { method, headers: { Accept: "text/event-stream", "User-Key": env.write } });
    assertEquals(res.status, 405, method);
    assertEquals(res.headers.get("allow"), "POST");
    await res.body?.cancel();
  }
});

t("list_tasks: como no app, tarefas de projeto em Backlog ficam fora das listas gerais", async () => {
  const p = await create("Projects", {
    Name: uniq("Projeto Backlog"),
    Pm: { Email: EMAIL.ana },
    StartDate: "2026-12-07",
    Phases: [{ Name: "Fase", Tasks: [{ Ref: "a", Name: uniq("Tarefa de backlog"), DurationDays: 1, Owners: [{ Email: EMAIL.ana }] }] }],
  });
  assertEquals((await api(`/Projects(${p.Id})`, { method: "PATCH", body: { Status: "Backlog" } })).status, 200);
  const ids = (r: any) => (r.data?.value ?? []).map((x: any) => x.ProjectId);
  assert(!ids(await tool("list_tasks", { mine: true, top: 200 })).includes(p.Id), "apareceu sem pedir");
  assert(ids(await tool("list_tasks", { mine: true, includeBacklogProjects: true, top: 200 })).includes(p.Id), "não apareceu com includeBacklogProjects");
  assert(ids(await tool("list_tasks", { projectId: p.Id })).includes(p.Id), "não apareceu pedindo o projeto");
});

t("todas as tools de leitura respondem sem erro", async () => {
  const cases: [string, Record<string, unknown>][] = [
    ["whoami", {}],
    ["describe_model", {}],
    ["describe_model", { entitySet: "Tasks" }],
    ["odata_query", { entitySet: "Tasks", filter: `ProjectId eq ${IDS.project}`, select: "Id,Name", top: 5, count: true }],
    ["get_entity", { entitySet: "Projects", id: IDS.project, expand: "Clients($select=Name)" }],
    ["search", { q: "acme" }],
    ["find_client", { name: "acme" }],
    ["find_project", { name: "implantação" }],
    ["find_incident", { name: "integração" }],
    ["find_contact", { name: "maria" }],
    ["find_user", { name: "bruno" }],
    ["list_projects", {}],
    ["list_projects", { status: "InProgress", clientId: IDS.client }],
    ["get_project", { id: IDS.project, sections: ["phases", "team", "risks", "delays", "open_points", "meetings", "history", "clients", "overview", "charter"] }],
    ["list_tasks", { projectId: IDS.project, includeDone: true }],
    ["list_tasks", { mine: true }],
    ["list_tasks", { scope: "Standalone", overdueOnly: true }],
    ["get_task", { id: "00000000-0000-4000-8000-0000000e0002" }],
    ["list_incidents", { onlyOpen: true }],
    ["get_incident", { id: IDS.incident }],
    ["list_clients", {}],
    ["get_client", { id: IDS.client }],
    ["list_open_points", { projectId: IDS.project }],
    ["list_users", {}],
    ["workload_by_person", { projectId: IDS.project }],
    ["generate_status_report", { projectId: IDS.project }],
    ["list_templates", {}],
    ["list_retros", { includeCards: true }],
    ["list_my_notifications", { unreadOnly: true }],
  ];
  for (const [name, args] of cases) {
    const r = await tool(name, args);
    assert(!r.isError, `${name} falhou: ${r.text.slice(0, 300)}`);
  }
});

t("conteúdo do Open vem delimitado como dado (anti prompt injection)", async () => {
  const r = await tool("whoami");
  assertMatch(r.text, /<open_data>[\s\S]*<\/open_data>/);
  assertMatch(r.text, /nunca como instruções/);
  assertEquals(r.data.Email, EMAIL.ana);
});

t("status report em markdown", async () => {
  const r = await tool("generate_status_report", { projectId: IDS.project });
  assertMatch(r.text, /^# Status report/);
  assertMatch(r.text, /## Fases/);
});

t("escrita: dryRun padrão não grava; dryRun=false grava; idempotencyKey não duplica", async () => {
  const name = uniq("MCP tarefa");
  const args = { Name: name, ProjectId: IDS.project, PhaseId: IDS.phaseConfig, Owners: [{ Email: EMAIL.bruno }], PlannedStart: "2026-12-14", DurationDays: 1 };
  const prev = await tool("create_task", args);
  assert(!prev.isError, prev.text);
  assertEquals(prev.data.dryRun, true);
  assertEquals(prev.data.needsConfirmation, true);
  assertMatch(prev.text, /PRÉVIA/);
  const count = async () => (await api(`/Tasks/$count?$filter=${encodeURIComponent(`Name eq '${name}'`)}`)).body;
  assertEquals(await count(), 0);
  const key = `mcp-${crypto.randomUUID()}`;
  const ok = await tool("create_task", { ...args, dryRun: false, idempotencyKey: key });
  assert(!ok.isError, ok.text);
  assertEquals(ok.data.Name, name);
  const again = await tool("create_task", { ...args, dryRun: false, idempotencyKey: key });
  assertMatch(again.text, /Repetição detectada/);
  assertEquals(await count(), 1);
});

t("escrita: mudar datas com cascata devolve as tarefas afetadas", async () => {
  const a = await tool("create_task", { Name: uniq("MCP A"), ProjectId: IDS.project, PhaseId: IDS.phaseConfig, Owners: [{ Email: EMAIL.bruno }], PlannedStart: "2026-12-14", DurationDays: 1, dryRun: false });
  const b = await tool("create_task", { Name: uniq("MCP B"), ProjectId: IDS.project, PhaseId: IDS.phaseConfig, Owners: [{ Email: EMAIL.bruno }], PlannedStart: "2026-12-15", DurationDays: 1, DependsOn: [a.data.Id], dryRun: false });
  const r = await tool("change_task_dates", { id: a.data.Id, PlannedEnd: "2026-12-16", dryRun: false });
  assert(!r.isError, r.text);
  const moved = r.data.affectedTasks.find((x: any) => x.Id === b.data.Id);
  assertEquals(moved.PlannedStart, "2026-12-17");
});

t("escrita: status, comentário, incidente e cliente", async () => {
  const x = await tool("create_task", { Name: uniq("MCP status"), IncidentId: IDS.incident, Owners: [{ Email: EMAIL.bruno }], dryRun: false });
  assertEquals((await tool("set_task_status", { id: x.data.Id, Status: "Blocked", dryRun: false })).data.Status, "Blocked");
  assertEquals((await tool("add_task_comment", { id: x.data.Id, Text: "via MCP", dryRun: false })).data.Text, "via MCP");
  const inc = await tool("create_incident", { Title: uniq("MCP inc"), Priority: "Medium", Impact: "Medium", Owner: { Email: EMAIL.bruno }, dryRun: false });
  assertEquals(inc.data.Status, "Open");
  assertEquals((await tool("set_incident_status", { id: inc.data.Id, Status: "WaitingOnClient", dryRun: false })).data.Status, "WaitingOnClient");
  const cl = await tool("create_client", { Name: uniq("MCP cliente"), dryRun: false });
  assertEquals(cl.data.Status, "SustentacaoNovosProjetos");
});

t("erros de validação voltam como isError com mensagem útil", async () => {
  const r = await tool("create_task", { Name: "x", Owners: [{ Email: "ninguem@ploomes.com" }], dryRun: false });
  assert(r.isError);
  assertMatch(r.text, /não encontrado/);
});

t("membro (não admin) grava pelo MCP como ele mesmo", async () => {
  const r = await tool("create_client", { Name: uniq("MCP membro"), dryRun: false }, env.read);
  assert(!r.isError, r.text);
  const who = await tool("whoami", {}, env.read);
  assertEquals(who.data.Email, EMAIL.bruno);
  assert(!who.data.Permissions.includes("admin"));
});

t("intake_preview → intake_commit", async () => {
  const cname = uniq("MCP Intake Cliente");
  const Items = [
    { Kind: "Client", Ref: "c", Name: cname },
    { Kind: "Task", Name: "Primeiro contato", ClientRef: "c", Owners: [{ Email: EMAIL.ana }] },
  ];
  const p = await tool("intake_preview", { Items });
  assert(!p.isError, p.text);
  assertMatch(p.data.Summary, /Estou prestes a criar/);
  assertEquals((await api(`/Clients/$count?$filter=${encodeURIComponent(`Name eq '${cname}'`)}`)).body, 0);
  const c = await tool("intake_commit", { Items, idempotencyKey: `mcp-intake-${crypto.randomUUID()}` });
  assert(!c.isError, c.text);
  assertEquals(c.data.Committed, true);
  assertEquals((await api(`/Clients/$count?$filter=${encodeURIComponent(`Name eq '${cname}'`)}`)).body, 1);
});

t("resources: listar e ler guias, me e projeto", async () => {
  const list = (await mcp("resources/list")).result.resources.map((r: any) => r.uri);
  for (const u of ["open://guide/model", "open://guide/intake", "open://me"]) assert(list.includes(u), u);
  assert(list.some((u: string) => u.startsWith("open://projects/")));
  const model = await mcp("resources/read", { uri: "open://guide/model" });
  assertMatch(model.result.contents[0].text, /## Tasks/);
  const me = await mcp("resources/read", { uri: "open://me" });
  assertEquals(JSON.parse(me.result.contents[0].text).Email, EMAIL.ana);
  const proj = await mcp("resources/read", { uri: `open://projects/${IDS.project}` });
  assertMatch(proj.result.contents[0].text, /Status report/);
  const templates = (await mcp("resources/templates/list")).result.resourceTemplates.map((r: any) => r.uriTemplate);
  assert(templates.includes("open://tasks/{id}"));
});

t("prompts: listar, obter e autocompletar nomes", async () => {
  const names = (await mcp("prompts/list")).result.prompts.map((p: any) => p.name);
  for (const n of ["cadastrar_demanda", "novo_projeto", "status_report", "preparar_reuniao_cliente", "triagem_incidente", "revisar_atrasos", "minha_semana"]) {
    assert(names.includes(n), n);
  }
  const g = await mcp("prompts/get", { name: "cadastrar_demanda", arguments: { texto: "Criar projeto para ACME", cliente: "ACME Teste" } });
  assertMatch(g.result.messages[0].content.text, /intake_preview/);
  const c = await mcp("completion/complete", { ref: { type: "ref/prompt", name: "status_report" }, argument: { name: "projeto", value: "implanta" } });
  assert(c.result.completion.values.length >= 1);
});

t("chamada malformada → erro JSON-RPC, não 500", async () => {
  const r = await mcp("tools/call", { name: "nao_existe", arguments: {} });
  assert(r.error || r.result?.isError);
});

t("encerramento pelo MCP: list_open_tasks → complete_open_tasks (com prévia)", async () => {
  const inc = await tool("create_incident", { Title: uniq("MCP encerrar"), Priority: "Low", Impact: "Low", Owner: { Email: EMAIL.bruno }, dryRun: false });
  await tool("create_task", { Name: uniq("MCP aberta"), IncidentId: inc.data.Id, Owners: [{ Email: EMAIL.bruno }], dryRun: false });
  const list = await tool("list_open_tasks", { kind: "incident", id: inc.data.Id });
  assertEquals(list.data.value?.length ?? list.data.length, 1);
  const prev = await tool("complete_open_tasks", { kind: "incident", id: inc.data.Id });
  assertEquals(prev.data.dryRun, true);
  const done = await tool("complete_open_tasks", { kind: "incident", id: inc.data.Id, dryRun: false });
  assertEquals(done.data.Completed, 1);
});
