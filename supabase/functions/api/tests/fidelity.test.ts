// Fidelidade com o app: confere direto no banco (STAGING) que a API deixa os dados como a tela deixaria —
// autoria nos gatilhos, created_at preservado, nada fora do escopo alterado, auditoria registrada.
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from "@std/assert";
import postgres from "postgres";
import { api, create, EMAIL, IDS, ignore, uniq } from "./_helpers.ts";

const dbUrl = Deno.env.get("API_DB_URL") ?? "";
const skip = ignore || !dbUrl || dbUrl.includes("fgzxmcvvahoasisgoqjr");
const t = (name: string, fn: (sql: postgres.Sql) => Promise<void>) =>
  Deno.test({
    name: `[fidelidade] ${name}`,
    ignore: skip,
    sanitizeResources: false,
    sanitizeOps: false,
    fn: async () => {
      const sql = postgres(dbUrl, { prepare: false, max: 1, onnotice: () => {} });
      try {
        await fn(sql);
      } finally {
        await sql.end();
      }
    },
  });

const base = { ProjectId: IDS.project, PhaseId: IDS.phaseConfig };

t("gatilho do Discord registra o autor da API (não 'Alguém')", async (sql) => {
  const name = uniq("Fid discord");
  await create("Tasks", { ...base, Name: name, Owners: [{ Email: EMAIL.bruno }] });
  const rows = await sql`select actor_name, kind from discord_outbox where task_name = ${name}`;
  assert(rows.length >= 1, "deveria enfileirar aviso de atribuição para o Bruno");
  assertEquals(rows[0].actor_name, "Ana Teste");
  assertEquals(rows[0].kind, "assigned");
});

t("created_at/created_by preservados quando a cascata altera outras tarefas", async (sql) => {
  const a = await create("Tasks", { ...base, Name: uniq("Fid A"), Owners: [{ Email: EMAIL.bruno }], PlannedStart: "2027-01-04", DurationDays: 1 });
  const b = await create("Tasks", { ...base, Name: uniq("Fid B"), Owners: [{ Email: EMAIL.bruno }], PlannedStart: "2027-01-05", DurationDays: 1, DependsOn: [a.Id] });
  const [before] = await sql`select created_at, created_by from entries where id = ${b.Id}`;
  await api(`/Tasks(${a.Id})/Open.ChangeDates`, { body: { PlannedEnd: "2027-01-08" } });
  const [after] = await sql`select created_at, created_by, planned_start from entries where id = ${b.Id}`;
  assertEquals(after.created_at.toISOString(), before.created_at.toISOString());
  assertEquals(after.created_by, before.created_by);
  assertEquals(after.planned_start instanceof Date ? after.planned_start.toISOString().slice(0, 10) : String(after.planned_start).slice(0, 10), "2027-01-11");
});

t("mudança de data só toca linhas do mesmo projeto", async (sql) => {
  const [{ v: before }] = await sql`select max(xmin::text::bigint) as v from entries where project_id is distinct from ${IDS.project}`;
  const a = await create("Tasks", { ...base, Name: uniq("Fid escopo"), Owners: [{ Email: EMAIL.bruno }], PlannedStart: "2027-01-04", DurationDays: 1 });
  await api(`/Tasks(${a.Id})/Open.ChangeDates`, { body: { PlannedEnd: "2027-01-06" } });
  const [{ v: after }] = await sql`select max(xmin::text::bigint) as v from entries where project_id is distinct from ${IDS.project}`;
  assertEquals(String(after), String(before));
});

t("comentário: autor forçado pelo gatilho do app", async (sql) => {
  const x = await create("Tasks", { ...base, Name: uniq("Fid coment"), Owners: [{ Email: EMAIL.bruno }] });
  const c = await api(`/Tasks(${x.Id})/Open.AddComment`, { body: { Text: "teste" } });
  const [row] = await sql`select author_id, author_name from comments where id = ${c.body.Id}`;
  assertEquals(row.author_id, IDS.ana);
  assertEquals(row.author_name, "Ana Teste");
});

t("histórico com autor e auditoria da requisição", async (sql) => {
  const p = await create("Projects", { Name: uniq("Fid projeto"), Pm: { Email: EMAIL.ana } });
  const [h] = await sql`select author_id, author_name, event from history where project_id = ${p.Id}`;
  assertEquals(h.event, "project_created");
  assertEquals(h.author_id, IDS.ana);
  const [log] = await sql`select method, status, channel from open_api.request_log where path like ${"%/Projects%"} and method = 'POST' order by id desc limit 1`;
  assertEquals(log.method, "POST");
  assertEquals(log.channel, "odata");
});

t("dry-run não deixa rastro em nenhuma tabela", async (sql) => {
  const name = uniq("Fid dry");
  await api("/Tasks", { headers: { Prefer: "dry-run" }, body: { ...base, Name: name, Owners: [{ Email: EMAIL.bruno }] } });
  assertEquals((await sql`select count(*)::int as n from entries where name = ${name}`)[0].n, 0);
  assertEquals((await sql`select count(*)::int as n from discord_outbox where task_name = ${name}`)[0].n, 0);
});

t("schema open_api inacessível para os papéis do app", async (sql) => {
  let code = "acessou";
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe("set local role authenticated");
      await tx`select count(*) from open_api.tokens`;
    });
  } catch (e: any) {
    code = e.code;
  }
  assertEquals(code, "42501"); // permission denied for schema open_api
});
