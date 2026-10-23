// API OData ponta a ponta, módulo a módulo (rodar via tools/test-local.ts, contra STAGING).
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals, assertExists, assertMatch, assertNotEquals } from "@std/assert";
import { api, create, EMAIL, env, IDS, ignore, uniq } from "./_helpers.ts";

const t = (name: string, fn: () => Promise<void>) => Deno.test({ name: `[api] ${name}`, ignore, fn, sanitizeResources: false, sanitizeOps: false });

// ───────────────────────── Leitura OData ─────────────────────────

t("service document lista todos os entity sets", async () => {
  const r = await api("/");
  assertEquals(r.status, 200);
  const names = r.body.value.map((v: any) => v.name);
  for (const s of ["Clients", "Contacts", "Projects", "Phases", "Tasks", "Comments", "Incidents", "Risks", "DelayLogs", "OpenPoints", "Meetings", "History", "Users", "Notifications", "Templates", "Me"]) {
    assert(names.includes(s), `faltou ${s}`);
  }
});

t("$metadata é CSDL XML válido", async () => {
  const r = await api("/$metadata");
  assertEquals(r.status, 200);
  assertMatch(r.body, /^<\?xml/);
  assertMatch(r.body, /<EntityType Name="Task">/);
});

t("todo entity set responde GET com @odata.context e value", async () => {
  const doc = await api("/");
  for (const s of doc.body.value.filter((v: any) => v.kind === "EntitySet" && v.name !== "Templates")) {
    const r = await api(`/${s.name}?$top=2`);
    assertEquals(r.status, 200, `${s.name}: ${JSON.stringify(r.body).slice(0, 200)}`);
    assert(Array.isArray(r.body.value), s.name);
    assertMatch(r.body["@odata.context"], new RegExp(`#${s.name}$`));
  }
});

t("todas as navegações de Projects, Clients e Incidents respondem", async () => {
  for (const [set, id, navs] of [
    ["Projects", IDS.project, ["Clients", "Phases", "Tasks", "Risks", "DelayLogs", "OpenPoints", "Meetings", "History", "Incidents", "PmUser"]],
    ["Clients", IDS.client, ["Contacts", "Projects", "Incidents", "Tasks", "CsHistory"]],
    ["Incidents", IDS.incident, ["Clients", "Projects", "Stakeholders", "Tasks", "OpenPoints", "History"]],
  ] as const) {
    for (const nav of navs) {
      const r = await api(`/${set}(${id})/${nav}`);
      assertEquals(r.status, 200, `${set}/${nav}: ${JSON.stringify(r.body).slice(0, 200)}`);
    }
  }
});

t("$select, $expand aninhado, $orderby, $count e ETag", async () => {
  const r = await api(
    `/Projects(${IDS.project})?$select=Id,Name,Progress&$expand=${encodeURIComponent("Phases($orderby=Order;$select=Name,Order;$expand=Tasks($select=Name,Status;$orderby=Name))")}`,
  );
  assertEquals(r.status, 200);
  assertEquals(Object.keys(r.body).filter((k) => !k.startsWith("@")).sort(), ["Id", "Name", "Phases", "Progress"].sort());
  const orders = r.body.Phases.map((p: any) => p.Order);
  assertEquals(orders, [...orders].sort((a: number, b: number) => a - b));
  assertExists(r.headers.get("etag"));
  const c = await api(`/Tasks?$count=true&$top=1&$filter=${encodeURIComponent(`ProjectId eq ${IDS.project}`)}`);
  assert(c.body["@odata.count"] >= 2);
});

t("paginação: @odata.nextLink leva à próxima página sem repetir", async () => {
  const p1 = await api(`/Tasks?$top=1&$orderby=Name&$select=Id&$filter=${encodeURIComponent(`ProjectId eq ${IDS.project}`)}`);
  assertExists(p1.body["@odata.nextLink"]);
  const next = new URL(p1.body["@odata.nextLink"]);
  const p2 = await api(`/Tasks${next.search}`);
  const ids1 = p1.body.value.map((x: any) => x.Id);
  assert(!p2.body.value.some((x: any) => ids1.includes(x.Id)));
});

t("$filter com lambda, navegação, funções e calculados", async () => {
  const f = encodeURIComponent(`Owners/any(o: o/UserId eq ${IDS.bruno}) and Project/Status eq 'InProgress' and year(DueDate) ge 2026`);
  const r = await api(`/Tasks?$filter=${f}&$select=Name,IsOverdue,DaysOverdue,Scope`);
  assertEquals(r.status, 200);
  assert(r.body.value.length >= 1);
  for (const x of r.body.value) assertEquals(x.Scope, "Project");
  const s = await api(`/Clients?$search=acme`);
  assert(s.body.value.some((c: any) => c.Id === IDS.client));
});

t("erros de consulta: enum inválido, campo inexistente, set inexistente", async () => {
  assertEquals((await api(`/Tasks?$filter=${encodeURIComponent("Status eq 'Feito'")}`)).status, 400);
  assertEquals((await api(`/Tasks?$filter=${encodeURIComponent("Nada eq 1")}`)).status, 400);
  assertEquals((await api(`/Projects?$filter=IsDelayed`)).status, 400); // calculado fora do banco
  assertEquals((await api(`/Coisas`)).status, 404);
  assertEquals((await api(`/Tasks(00000000-0000-4000-8000-00000000ffff)`)).status, 404);
});

t("QUERY e POST /$query (JSON e texto) equivalem ao GET", async () => {
  const filter = `ProjectId eq ${IDS.project}`;
  const g = await api(`/Tasks?$filter=${encodeURIComponent(filter)}&$select=Id&$orderby=Name&$top=5`);
  const q1 = await api("/Tasks/$query", { body: { filter, select: "Id", orderby: "Name", top: 5 } });
  const q2 = await api("/Tasks", { method: "QUERY", body: `$filter=${filter}&$select=Id&$orderby=Name&$top=5` });
  assertEquals(q1.body.value, g.body.value);
  assertEquals(q2.body.value, g.body.value);
});

t("função Open.Search", async () => {
  const r = await api(`/Open.Search(q='acme',top=5)`);
  assertEquals(r.status, 200);
  assert(r.body.value.Clients.length >= 1);
});

// ───────────────────────── Carteira ─────────────────────────

t("clientes: criar, duplicado, atualizar, CS, arquivar", async () => {
  const name = uniq("Cliente Teste");
  const c = await create("Clients", { Name: name, Country: "br", Status: "PreVenda", Owners: [{ Email: EMAIL.ana }] });
  assertEquals(c.Country, "BR");
  assertEquals(c.Status, "PreVenda");
  assertEquals(c.Owners[0].UserId, IDS.ana);
  assertEquals((await api("/Clients", { body: { Name: name } })).status, 400); // duplicado
  const p = await api(`/Clients(${c.Id})`, { method: "PATCH", body: { Status: "Implantacao", Notes: "## Notas\nCliente estratégico." } });
  assertEquals(p.body.Status, "Implantacao");
  const cs = await api(`/Clients(${c.Id})/Open.AssignCs`, { body: { Email: EMAIL.bruno, Note: "Assumiu" } });
  assertEquals(cs.status, 200);
  assertEquals(cs.body.CurrentCs.UserId, IDS.bruno);
  const a = await api(`/Clients(${c.Id})/Open.Archive`, { body: {} });
  assertEquals(a.body.Archived, true);
});

t("contatos: criar com vínculo, e-mail duplicado, vincular/desvincular", async () => {
  const email = `contato.${crypto.randomUUID().slice(0, 6)}@exemplo.com`;
  const c = await create("Contacts", { Name: "Maria Teste", Role: "Gerente", Email: email, ClientIds: [IDS.client] });
  const links = await api(`/Contacts(${c.Id})/Clients`);
  assertEquals(links.body.value[0].Id, IDS.client);
  assertEquals((await api("/Contacts", { body: { Name: "Outra", Email: email } })).status, 400);
  await api(`/Contacts(${c.Id})/Open.UnlinkClient`, { body: { ClientId: IDS.client } });
  assertEquals((await api(`/Contacts(${c.Id})/Clients`)).body.value.length, 0);
});

// ───────────────────────── Portfólio ─────────────────────────

t("projeto profundo: fases + tarefas + dependências com datas em dias úteis", async () => {
  const p = await create("Projects", {
    Name: uniq("Projeto Teste"),
    Type: "NovaConta",
    Pm: { Email: EMAIL.ana },
    DevLead: { Email: EMAIL.bruno },
    ClientIds: [IDS.client],
    StartDate: "2026-12-04", // sexta
    Phases: [
      { Name: "Kickoff", Tasks: [{ Ref: "k", Name: "Kickoff", Type: "Meeting" }] },
      { Name: "Execução", Tasks: [{ Ref: "a", Name: "Configurar", DurationDays: 3, DependsOn: ["k"], Owners: [{ Email: EMAIL.bruno }] }, { Ref: "g", Name: "Go live", Type: "Milestone", DependsOn: ["a"] }] },
    ],
  });
  assertEquals(p.Status, "Planning");
  assertEquals(p.Pm, "Ana Teste");
  assertEquals(p.DevLeadUserId, IDS.bruno);
  const full = await api(`/Projects(${p.Id})?$expand=${encodeURIComponent("Phases($orderby=Order;$expand=Tasks($select=Name,PlannedStart,PlannedEnd,PlannedDate,DependsOn,IsCritical))")}`);
  const tasks = full.body.Phases.flatMap((ph: any) => ph.Tasks);
  const by = Object.fromEntries(tasks.map((x: any) => [x.Name, x]));
  assertEquals(by["Kickoff"].PlannedDate, "2026-12-04");
  assertEquals(by["Configurar"].PlannedStart, "2026-12-07"); // segunda (pula o fim de semana)
  assertEquals(by["Configurar"].PlannedEnd, "2026-12-09");
  assertEquals(by["Go live"].PlannedDate, "2026-12-10");
  assertEquals(full.body.GoLiveDate, "2026-12-10");
  assert(tasks.every((x: any) => x.IsCritical));
  const hist = await api(`/Projects(${p.Id})/History`);
  assert(hist.body.value.some((h: any) => h.Event === "project_created"));
});

t("projeto: PATCH (status, líder, overview, nome→histórico), vínculo, baseline, arquivar", async () => {
  const p = await create("Projects", { Name: uniq("Projeto Patch"), Pm: { Email: EMAIL.ana } });
  const r = await api(`/Projects(${p.Id})`, { method: "PATCH", body: { Status: "InProgress", Pm: { Email: EMAIL.bruno }, Overview: "Objetivo", Name: `${p.Name} v2` } });
  assertEquals(r.status, 200);
  assertEquals(r.body.Status, "InProgress");
  assertEquals(r.body.PmUserId, IDS.bruno);
  assert((await api(`/Projects(${p.Id})/History`)).body.value.some((h: any) => h.Event === "name_changed"));
  const l = await api(`/Projects(${p.Id})/Open.LinkClient`, { body: { ClientId: IDS.client } });
  assertEquals(l.status, 200);
  assertEquals((await api(`/Projects(${p.Id})/Clients`)).body.value.length, 1);
  const b = await api(`/Projects(${p.Id})/Open.SetBaseline`, { body: {} });
  assertExists(b.body.BaselineSetAt);
  const cl = await api(`/Projects(${p.Id})/Open.ClearBaseline`, { body: {} });
  assertEquals(cl.body.BaselineSetAt, null);
  const ar = await api(`/Projects(${p.Id})/Open.Archive`, { body: {} });
  assertEquals(ar.body.Archived, true);
});

t("fases: criar, renomear, ordem", async () => {
  const ph = await create("Phases", { ProjectId: IDS.project, Name: uniq("Fase") });
  const r = await api(`/Phases(${ph.Id})`, { method: "PATCH", body: { Name: `${ph.Name} renomeada`, Order: 99 } });
  assertEquals(r.body.Order, 99);
});

// ───────────────────────── Tarefas ─────────────────────────

const taskBase = { ProjectId: IDS.project, PhaseId: IDS.phaseConfig, Owners: [{ Email: EMAIL.bruno }] };

t("tarefas: regras de validação da tela", async () => {
  const bad = async (body: unknown) => (await api("/Tasks", { body })).status;
  assertEquals(await bad({ ...taskBase, Owners: [] }), 400); // sem executor
  assertEquals(await bad({ Name: "x", ProjectId: IDS.project, Owners: [{ Email: EMAIL.bruno }] }), 400); // sem fase
  assertEquals(await bad({ ...taskBase, Name: "x", PlannedDate: "2026-11-01" }), 400); // PlannedDate em tarefa
  assertEquals(await bad({ ...taskBase, Name: "x", PlannedStart: "2026-11-10", PlannedEnd: "2026-11-01" }), 400); // fim < início
  assertEquals(await bad({ Name: "x", IncidentId: IDS.incident, Owners: [{ Email: EMAIL.ana }, { Email: EMAIL.bruno }] }), 400); // 2 executores em incidente
  assertEquals(await bad({ ...taskBase, Name: "x", Campo: 1 }), 400); // campo desconhecido
  assertEquals(await bad({ ...taskBase, Name: "x", Owners: [{ Email: "ninguem@ploomes.com" }] }), 400);
});

t("tarefas: criar em projeto, incidente e avulsa (escopos)", async () => {
  const a = await create("Tasks", { ...taskBase, Name: uniq("T projeto"), PlannedStart: "2026-12-01", DurationDays: 2 });
  assertEquals(a.Scope, "Project");
  assertEquals(a.PlannedEnd, "2026-12-02");
  assertEquals(a.Responsible, "Bruno Teste");
  assertEquals(a.ResponsibleUserId, IDS.bruno);
  const b = await create("Tasks", { Name: uniq("T incidente"), IncidentId: IDS.incident, Owners: [{ Email: EMAIL.bruno }] });
  assertEquals(b.Scope, "Incident");
  const c = await create("Tasks", { Name: uniq("T avulsa"), ClientId: IDS.client, Owners: [{ Email: EMAIL.ana }], Type: "Milestone", PlannedDate: "2026-12-05" });
  assertEquals(c.Scope, "Standalone");
  assertEquals(c.DueDate, "2026-12-05");
  const h = await create("Tasks", { ProjectId: IDS.project, Name: uniq("T oculta"), HiddenFromPlan: true, Owners: [{ Email: EMAIL.ana }] });
  assertNotEquals(h.PhaseId, null); // vai para o balde "Sem fase"
});

t("dependência circular → 409", async () => {
  const a = await create("Tasks", { ...taskBase, Name: uniq("Ciclo A") });
  const b = await create("Tasks", { ...taskBase, Name: uniq("Ciclo B"), DependsOn: [a.Id] });
  const r = await api(`/Tasks(${a.Id})`, { method: "PATCH", body: { DependsOn: [b.Id] } });
  assertEquals(r.status, 409);
});

t("ChangeDates: cascata, duração, caminho crítico e registro de atraso", async () => {
  const a = await create("Tasks", { ...taskBase, Name: uniq("Casc A"), PlannedStart: "2026-12-14", DurationDays: 2 });
  const b = await create("Tasks", { ...taskBase, Name: uniq("Casc B"), PlannedStart: "2026-12-16", DurationDays: 2, DependsOn: [a.Id] });
  const r = await api(`/Tasks(${a.Id})/Open.ChangeDates`, {
    body: { PlannedEnd: "2026-12-18", Delay: { Description: "Teste de atraso", Responsibility: "Internal", Type: "Planning" } },
  });
  assertEquals(r.status, 200);
  assertEquals(r.body.value.DelayDays, 3);
  assert(r.body.value.AffectedTaskIds.includes(b.Id));
  const b2 = await api(`/Tasks(${b.Id})?$select=PlannedStart,PlannedEnd,DurationDays`);
  assertEquals(b2.body.PlannedStart, "2026-12-21");
  assertEquals(b2.body.PlannedEnd, "2026-12-22");
  const a2 = await api(`/Tasks(${a.Id})?$select=DurationDays`);
  assertEquals(a2.body.DurationDays, 5);
  const delays = await api(`/Tasks(${a.Id})/DelayLogs`);
  assertEquals(delays.body.value[0].Days, 3);
  assertEquals(delays.body.value[0].Responsibility, "Internal");
});

t("SetStatus: datas reais, histórico e aviso ao validador", async () => {
  const name = uniq("Validar");
  const x = await create("Tasks", { ...taskBase, Name: name, Owners: [{ Email: EMAIL.ana }, { Email: EMAIL.bruno, Kind: "Validator" }] });
  const s1 = await api(`/Tasks(${x.Id})/Open.SetStatus`, { body: { Status: "InProgress" } });
  assertEquals(s1.body.Status, "InProgress");
  assertEquals(s1.body.StatusOverride, true);
  assertExists(s1.body.ActualStart);
  await api(`/Tasks(${x.Id})/Open.SetStatus`, { body: { Status: "Validation", Note: "pronto" } });
  const notes = await api(`/Notifications?$filter=${encodeURIComponent(`contains(Message, '${name}')`)}`, { token: env.read });
  assert(notes.body.value.some((n: any) => /pronta para validação/.test(n.Message)), "Bruno deveria ser avisado");
  const comments = await api(`/Tasks(${x.Id})/Comments`);
  assertEquals(comments.body.value[0].Text, "pronto");
  const done = await api(`/Tasks(${x.Id})/Open.SetStatus`, { body: { Status: "Done" } });
  assertExists(done.body.ActualEnd);
  const reopen = await api(`/Tasks(${x.Id})/Open.SetStatus`, { body: { Status: "Todo" } });
  assertEquals(reopen.body.ActualEnd, null);
});

t("PATCH de responsáveis avisa quem entrou", async () => {
  const name = uniq("Responsavel");
  const x = await create("Tasks", { ...taskBase, Name: name, Owners: [{ Email: EMAIL.ana }] });
  await api(`/Tasks(${x.Id})`, { method: "PATCH", body: { Owners: [{ Email: EMAIL.bruno }] } });
  const notes = await api(`/Notifications?$filter=${encodeURIComponent(`contains(Message, '${name}')`)}`, { token: env.read });
  assert(notes.body.value.some((n: any) => /adicionado como responsável/.test(n.Message)));
});

t("comentários: criar (autor forçado), responder, apagar", async () => {
  const x = await create("Tasks", { ...taskBase, Name: uniq("Coment") });
  const c = await api(`/Tasks(${x.Id})/Open.AddComment`, { body: { Text: "Primeiro" } });
  assertEquals(c.body.AuthorId, IDS.ana);
  assertEquals(c.body.AuthorName, "Ana Teste");
  const reply = await create("Comments", { TaskId: x.Id, Text: "Resposta", ParentId: c.body.Id });
  assertEquals(reply.ParentId, c.body.Id);
  assertEquals((await api(`/Comments(${reply.Id})`, { method: "DELETE" })).status, 204);
});

t("ETag: If-Match certo grava; antigo → 412", async () => {
  const x = await create("Tasks", { ...taskBase, Name: uniq("Etag") });
  const etag = x["@odata.etag"];
  const ok = await api(`/Tasks(${x.Id})`, { method: "PATCH", headers: { "If-Match": etag }, body: { RiskFlag: "Warning" } });
  assertEquals(ok.status, 200);
  const stale = await api(`/Tasks(${x.Id})`, { method: "PATCH", headers: { "If-Match": etag }, body: { RiskFlag: "Critical" } });
  assertEquals(stale.status, 412);
});

// ───────────────────────── Sustentação ─────────────────────────

t("incidentes: criar, status (resolvido + aviso + histórico), stakeholder, vínculos", async () => {
  const title = uniq("Incidente");
  const i = await create("Incidents", { Title: title, Priority: "High", Impact: "Low", Owner: { Email: EMAIL.bruno }, ClientIds: [IDS.client] });
  assertEquals(i.Status, "Open");
  assertEquals(i.Owner.UserId, IDS.bruno);
  assertEquals((await api("/Incidents", { body: { Title: "x", Priority: "High", Impact: "High" } })).status, 400); // sem owner
  const st = await api(`/Incidents(${i.Id})/Open.AddStakeholder`, { body: { Email: EMAIL.ana } });
  assertEquals(st.status, 200);
  const r = await api(`/Incidents(${i.Id})/Open.SetStatus`, { body: { Status: "Resolved" } });
  assertEquals(r.body.Status, "Resolved");
  assertExists(r.body.ResolvedAt);
  const notes = await api(`/Notifications?$filter=${encodeURIComponent(`contains(Message, '${title}')`)}`, { token: env.read });
  assert(notes.body.value.some((n: any) => /mudou para Resolvido/.test(n.Message)));
  assert((await api(`/Incidents(${i.Id})/History`)).body.value.some((h: any) => h.Event === "status_changed"));
  await api(`/Incidents(${i.Id})/Open.LinkProject`, { body: { ProjectId: IDS.project } });
  assertEquals((await api(`/Incidents(${i.Id})/Projects`)).body.value.length, 1);
  const p = await api(`/Incidents(${i.Id})`, { method: "PATCH", body: { Status: "InProgress", Deadline: "2026-12-31" } });
  assertEquals(p.body.Status, "InProgress");
  assertExists(p.body.ResolvedAt); // nunca é apagado ao reabrir (regra do app)
});

// ───────────────────────── Diário, riscos, notificações ─────────────────────────

t("pontos em aberto: descrição padrão = título, resolver (histórico), reabrir", async () => {
  const o = await create("OpenPoints", { ProjectId: IDS.project, Title: uniq("Ponto"), Owner: { Email: EMAIL.bruno }, DueDate: "2026-01-10" });
  assertEquals(o.Description, o.Title);
  assertEquals(o.OwnerUserId, IDS.bruno);
  assertEquals(o.IsOverdue, true);
  const r = await api(`/OpenPoints(${o.Id})/Open.Resolve`, { body: { ResolutionNote: "ok" } });
  assertEquals(r.body.Status, "Resolved");
  const re = await api(`/OpenPoints(${o.Id})/Open.Reopen`, { body: {} });
  assertEquals(re.body.Status, "Open");
});

t("riscos (score), atas, notas do histórico", async () => {
  const r = await create("Risks", { ProjectId: IDS.project, Description: uniq("Risco"), Probability: "Medium", Impact: "High" });
  assertEquals(r.Score, 6);
  const u = await api(`/Risks(${r.Id})`, { method: "PATCH", body: { Probability: "Low" } });
  assertEquals(u.body.Score, 3);
  const m = await create("Meetings", { ProjectId: IDS.project, Title: uniq("Ata"), Date: "2026-10-21", Participants: [{ Email: EMAIL.ana }], Items: [{ Text: "Enviar planilha", Type: "Action" }] });
  assertEquals(m.Items[0].Type, "Action");
  const n = await create("History", { ProjectId: IDS.project, Title: uniq("Nota") });
  assertEquals(n.Type, "manual");
});

t("notificações: marcar como lidas", async () => {
  const r = await api("/Open.MarkNotificationsRead", { token: env.read, body: {} });
  assertEquals(r.status, 200);
  const unread = await api("/Notifications/$count?$filter=not Read", { token: env.read });
  assertEquals(unread.body, 0);
});

// ───────────────────────── Templates e Intake ─────────────────────────

t("template: criar (admin) e criar projeto a partir dele", async () => {
  const tpl = await api("/Templates", {
    body: {
      Name: uniq("Template"),
      Type: "NovaConta",
      Phases: [{ Name: "Fase 1", Tasks: [{ Ref: "a", Name: "Passo A", DurationDays: 2 }, { Ref: "b", Name: "Passo B", DurationDays: 1, DependsOn: ["a"] }] }],
    },
  });
  assertEquals(tpl.status, 201);
  const p = await create("Projects", { Name: uniq("Projeto de template"), Pm: { Email: EMAIL.ana }, TemplateId: tpl.body.Id, StartDate: "2026-12-07" });
  const tasks = (await api(`/Projects(${p.Id})/Tasks?$select=Name,PlannedStart,PlannedEnd&$orderby=PlannedStart`)).body.value;
  assertEquals(tasks.map((x: any) => [x.Name, x.PlannedStart, x.PlannedEnd]), [["Passo A", "2026-12-07", "2026-12-08"], ["Passo B", "2026-12-09", "2026-12-09"]]);
  assertEquals((await api(`/Templates(${tpl.body.Id})`, { method: "DELETE" })).status, 204);
});

t("intake: dry-run (padrão) não grava; commit grava tudo; idempotência", async () => {
  const cname = uniq("Cliente Intake");
  const items = [
    { Kind: "Client", Ref: "c", Name: cname, Country: "BR" },
    { Kind: "Project", Ref: "p", Name: uniq("Projeto Intake"), Pm: { Email: EMAIL.ana }, ClientRefs: ["c"], StartDate: "2026-12-07", Phases: [{ Name: "F", Tasks: [{ Ref: "t", Name: "Tarefa do plano", DurationDays: 1 }] }] },
    { Kind: "Incident", Ref: "i", Title: uniq("Inc Intake"), Priority: "Low", Impact: "Low", Owner: { Email: EMAIL.bruno }, ClientRefs: ["c"] },
    { Kind: "Task", Name: "Tarefa do incidente", IncidentRef: "i", Owners: [{ Email: EMAIL.bruno }] },
    { Kind: "Task", Name: "Tarefa do projeto", ProjectRef: "p", PhaseName: "F", Owners: [{ Email: EMAIL.bruno }] },
    { Kind: "Task", Name: "Tarefa avulsa", ClientRef: "c", Owners: [{ Email: EMAIL.ana }] },
  ];
  const dry = await api("/Open.Intake", { body: { Items: items } });
  assertEquals(dry.status, 200);
  assertEquals(dry.body.value.DryRun, true);
  assertMatch(dry.body.value.Summary, /Estou prestes a criar/);
  assertEquals(dry.body.value.Plan.filter((p: any) => p.Action === "Create").length, 6);
  assertEquals((await api(`/Clients/$count?$filter=${encodeURIComponent(`Name eq '${cname}'`)}`)).body, 0);
  const key = `intake-${crypto.randomUUID()}`;
  const c1 = await api("/Open.Intake", { headers: { "Idempotency-Key": key }, body: { DryRun: false, Items: items } });
  assertEquals(c1.status, 200);
  assertEquals(c1.body.value.Committed, true);
  const c2 = await api("/Open.Intake", { headers: { "Idempotency-Key": key }, body: { DryRun: false, Items: items } });
  assertEquals(c2.headers.get("idempotent-replayed"), "true");
  assertEquals((await api(`/Clients/$count?$filter=${encodeURIComponent(`Name eq '${cname}'`)}`)).body, 1);
  const reused = await api("/Open.Intake", { body: { Items: [{ Kind: "Client", Ref: "c", Name: cname }] } });
  assertEquals(reused.body.value.Plan[0].Action, "Reuse");
});

t("intake: ambíguo bloqueia commit (409) e marca dependentes", async () => {
  const r = await api("/Open.Intake", { body: { DryRun: false, Items: [{ Kind: "Client", Ref: "c", Name: "ACME" }, { Kind: "Task", Name: "x", ClientRef: "c", Owners: [{ Email: EMAIL.ana }] }] } });
  assertEquals(r.status, 409);
  const d = await api("/Open.Intake", { body: { Items: [{ Kind: "Client", Ref: "c", Name: "ACME" }, { Kind: "Task", Name: "x", ClientRef: "c", Owners: [{ Email: EMAIL.ana }] }] } });
  assertEquals(d.body.value.Plan.map((p: any) => p.Action), ["Ambiguous", "Ambiguous"]);
});

// ───────────────────────── Cabeçalhos de escrita ─────────────────────────

t("Prefer: dry-run em PATCH não grava", async () => {
  const x = await create("Tasks", { ...taskBase, Name: uniq("DryPatch") });
  const r = await api(`/Tasks(${x.Id})`, { method: "PATCH", headers: { Prefer: "dry-run" }, body: { Name: "mudou?" } });
  assertEquals(r.body.Name, "mudou?");
  assertEquals(r.body["@open.dryRun"], true);
  assertEquals((await api(`/Tasks(${x.Id})?$select=Name`)).body.Name, x.Name);
});

t("Idempotency-Key reutilizada com outro corpo → 422", async () => {
  const key = `k-${crypto.randomUUID()}`;
  await api("/Tasks", { headers: { "Idempotency-Key": key }, body: { ...taskBase, Name: uniq("Idem") } });
  const r = await api("/Tasks", { headers: { "Idempotency-Key": key }, body: { ...taskBase, Name: uniq("Idem outro") } });
  assertEquals(r.status, 422);
});

t("Prefer: return=minimal em PATCH → 204", async () => {
  const x = await create("Tasks", { ...taskBase, Name: uniq("Minimal") });
  assertEquals((await api(`/Tasks(${x.Id})`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: { RiskFlag: "None" } })).status, 204);
});

t("métodos não permitidos: PUT e DELETE de entidade de negócio", async () => {
  assertEquals((await api(`/Projects(${IDS.project})`, { method: "PUT", body: {} })).status, 405);
  assertEquals((await api(`/Projects(${IDS.project})`, { method: "DELETE" })).status, 405);
});

// ───────────────────────── Novidades do app (main 14d50f3) ─────────────────────────

t("tarefa avulsa com vários clientes: criar, filtrar, navegar e editar", async () => {
  const c2 = await create("Clients", { Name: uniq("Segundo cliente") });
  const x = await create("Tasks", { Name: uniq("Avulsa 2 clientes"), ClientIds: [IDS.client, c2.Id], Owners: [{ Email: EMAIL.ana }] });
  assertEquals(x.ClientIds.sort(), [IDS.client, c2.Id].sort());
  assertEquals(x.ClientId, IDS.client); // legado = primeiro
  const f = await api(`/Tasks?$filter=${encodeURIComponent(`ClientIds/any(c: c eq ${c2.Id})`)}&$select=Id`);
  assert(f.body.value.some((t: any) => t.Id === x.Id));
  const nav = await api(`/Clients(${c2.Id})/Tasks?$select=Id`);
  assert(nav.body.value.some((t: any) => t.Id === x.Id));
  const p = await api(`/Tasks(${x.Id})`, { method: "PATCH", body: { ClientIds: [c2.Id] } });
  assertEquals(p.body.ClientIds, [c2.Id]);
  assertEquals(p.body.ClientId, c2.Id);
  const legacy = await create("Tasks", { Name: uniq("Avulsa legado"), ClientId: IDS.client, Owners: [{ Email: EMAIL.ana }] });
  assertEquals(legacy.ClientIds, [IDS.client]); // ClientId sozinho vira lista de um (igual ao app)
  assertEquals((await api("/Tasks", { body: { ...taskBase, Name: "x", ClientIds: [IDS.client] } })).status, 400); // só avulsa
});

t("encerramento: projeto concluído com CompleteOpenTasks conclui as tarefas abertas", async () => {
  const p = await create("Projects", {
    Name: uniq("Proj encerrar"),
    Pm: { Email: EMAIL.ana },
    Phases: [{ Name: "F", Tasks: [{ Name: "Aberta 1", Owners: [{ Email: EMAIL.bruno }] }, { Name: "Aberta 2" }, { Name: "Marco", Type: "Milestone" }] }],
  });
  const open = await api(`/Projects(${p.Id})/Open.OpenTasks()`);
  assertEquals(open.status, 200);
  assertEquals(open.body.value.length, 2); // marcos não entram
  const r = await api(`/Projects(${p.Id})`, { method: "PATCH", body: { Status: "Done", CompleteOpenTasks: true } });
  assertEquals(r.body.Status, "Done");
  const tasks = (await api(`/Projects(${p.Id})/Tasks?$select=Name,Type,Status,StatusOverride,ActualEnd`)).body.value;
  for (const t of tasks.filter((x: any) => x.Type === "Task")) {
    assertEquals(t.Status, "Done");
    assertEquals(t.StatusOverride, true);
    assertExists(t.ActualEnd);
  }
  assertEquals(tasks.find((x: any) => x.Type === "Milestone").Status, "Pending");
});

t("encerramento: incidente — listar, concluir só as escolhidas, resolver com CompleteOpenTasks", async () => {
  const i = await create("Incidents", { Title: uniq("Inc encerrar"), Priority: "Low", Impact: "Low", Owner: { Email: EMAIL.bruno } });
  const a = await create("Tasks", { Name: uniq("Inc A"), IncidentId: i.Id, Owners: [{ Email: EMAIL.bruno }] });
  const b = await create("Tasks", { Name: uniq("Inc B"), IncidentId: i.Id, Owners: [{ Email: EMAIL.bruno }] });
  const c = await create("Tasks", { Name: uniq("Inc C"), IncidentId: i.Id, Owners: [{ Email: EMAIL.bruno }] });
  const only = await api(`/Incidents(${i.Id})/Open.CompleteOpenTasks`, { body: { TaskIds: [a.Id] } });
  assertEquals(only.body.value.Completed, 1);
  assertEquals((await api(`/Incidents(${i.Id})/Open.OpenTasks()`)).body.value.length, 2);
  await api(`/Incidents(${i.Id})/Open.SetStatus`, { body: { Status: "Resolved", CompleteOpenTasks: true } });
  for (const id of [b.Id, c.Id]) assertEquals((await api(`/Tasks(${id})?$select=Status`)).body.Status, "Done");
});

t("regressão (fix do Leo 3ba763b): alterar a descrição de tarefa com responsável não quebra", async () => {
  const x = await create("Tasks", { ...taskBase, Name: uniq("Desc"), Owners: [{ Email: EMAIL.bruno }] });
  const r = await api(`/Tasks(${x.Id})`, { method: "PATCH", body: { Description: "Nova descrição **markdown**" } });
  assertEquals(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  assertEquals(r.body.Description, "Nova descrição **markdown**");
});
