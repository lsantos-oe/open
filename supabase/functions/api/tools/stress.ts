// deno-lint-ignore-file no-explicit-any
// Teste de carga/estresse da API e do MCP contra um banco de STAGING.
//
//   deno run -A --env-file=<staging>.env tools/stress.ts [--duration 30] [--concurrency 10] [--report caminho.md]
//
// Sobe a API (rate limit desligado para medir capacidade), roda cenários com N "usuários virtuais" em paralelo por D
// segundos cada (leitura OData, escrita OData, MCP, misto), mede vazão e latência (p50/p95/p99), conta erros e, no
// fim, confere a consistência dos dados gravados (datas da cascata, nenhuma tarefa órfã, nenhum 5xx).
import { parseArgs } from "@std/cli/parse-args";
import postgres from "postgres";
import { rotateUserKey } from "../lib/userkeys.ts";
import { cleanupTestData } from "../tests/fixtures/cleanup.ts";
const startedAt = new Date();

const args = parseArgs(Deno.args, { string: ["duration", "concurrency", "report"] });
const DURATION = Number(args.duration ?? 30) * 1000;
const CONC = Number(args.concurrency ?? 10);
const dbUrl = Deno.env.get("API_DB_URL") ?? "";
if (!dbUrl || dbUrl.includes("fgzxmcvvahoasisgoqjr")) {
  console.error("✖ Use o banco de STAGING (API_DB_URL). Produção é bloqueada.");
  Deno.exit(2);
}
const ROOT = new URL("../", import.meta.url);
const sql = postgres(dbUrl, { prepare: false, max: 1, onnotice: () => {} });

// ── preparação
await sql.unsafe(await Deno.readTextFile(new URL("tests/fixtures/seed.sql", ROOT)));
const [ana] = await sql<{ id: string }[]>`select id from profiles where email = 'ana.teste@ploomes.com'`;
const KEY = (await rotateUserKey(ana.id)).UserKey;
const port = String(8700 + Math.floor(Math.random() * 80));
const BASE = `http://localhost:${port}/api`;
const server = new Deno.Command(Deno.execPath(), {
  args: ["run", "-A", "index.ts"],
  cwd: ROOT,
  env: { ...Deno.env.toObject(), PORT: port, API_PUBLIC_URL: BASE, API_RATE_LIMIT: "1000000" },
  stdout: "null",
  stderr: "piped",
}).spawn();
const stderrChunks: string[] = [];
(async () => {
  for await (const c of server.stderr.pipeThrough(new TextDecoderStream())) stderrChunks.push(c);
})();
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`${BASE}/health`);
    await r.body?.cancel();
    if (r.ok) break;
  } catch { /* subindo */ }
  await new Promise((r) => setTimeout(r, 500));
}

const H = { "User-Key": KEY, "Content-Type": "application/json" };
const PROJECT = "00000000-0000-4000-8000-0000000b0001";
// projeto exclusivo do estresse (para as escritas não bagunçarem o seed)
const sp = await (await fetch(`${BASE}/odata/v1/Projects`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ Name: `Estresse ${new Date().toISOString()}`, Pm: { Email: "ana.teste@ploomes.com" }, StartDate: "2027-03-01", Phases: [{ Name: "Carga", Tasks: [{ Ref: "root", Name: "Raiz", DurationDays: 1 }] }] }),
})).json();
const STRESS_PROJECT: string = sp.Id;
const PHASE: string = (await (await fetch(`${BASE}/odata/v1/Projects(${STRESS_PROJECT})/Phases`, { headers: H })).json()).value[0].Id;
const ROOT_TASK: string = (await (await fetch(`${BASE}/odata/v1/Projects(${STRESS_PROJECT})/Tasks?$select=Id`, { headers: H })).json()).value[0].Id;

// ── medição
interface Sample { op: string; ms: number; status: number }
const samples: Sample[] = [];
async function hit(op: string, path: string, init: RequestInit = {}) {
  const t0 = performance.now();
  let status = 0;
  let body: any = null;
  try {
    const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
    status = r.status;
    const txt = await r.text();
    try {
      body = JSON.parse(txt);
    } catch { body = txt; }
  } catch {
    status = -1; // erro de rede
  }
  samples.push({ op, ms: performance.now() - t0, status });
  return body;
}
const mcp = (op: string, name: string, a: unknown) =>
  hit(`mcp:${op}`, "/mcp", {
    method: "POST",
    headers: { Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: a } }),
  });

const rand = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const day = () => `2027-0${3 + Math.floor(Math.random() * 3)}-${String(10 + Math.floor(Math.random() * 18)).padStart(2, "0")}`;

const readOps: (() => Promise<unknown>)[] = [
  () => hit("GET Projects+expand", `/odata/v1/Projects?$select=Id,Name,Progress,OverdueCount,IsDelayed&$expand=Clients($select=Name)&$top=20`),
  () => hit("GET Projects(id) profundo", `/odata/v1/Projects(${PROJECT})?$expand=${encodeURIComponent("Phases($expand=Tasks($select=Name,Status,DueDate))")}`),
  () => hit("GET Tasks lambda", `/odata/v1/Tasks?$filter=${encodeURIComponent("Owners/any(o: o/UserId eq 00000000-0000-4000-8000-00000000a002) and Status ne 'Done'")}&$select=Id,Name,IsOverdue&$top=50`),
  () => hit("GET Tasks $count", `/odata/v1/Tasks/$count?$filter=IsOverdue`),
  () => hit("GET Clients $search", `/odata/v1/Clients?$search=acme&$expand=Projects($select=Name)`),
  () => hit("GET Incidents", `/odata/v1/Incidents?$filter=${encodeURIComponent("Status in ('Open','InProgress')")}&$expand=Clients($select=Name)`),
  () => hit("POST $query", `/odata/v1/Tasks/$query`, { method: "POST", body: JSON.stringify({ filter: "Scope eq 'Project'", select: "Id,Name", top: 50 }) }),
  () => hit("GET Open.Search", `/odata/v1/Open.Search(q='teste',top=5)`),
  () => hit("GET $metadata", `/odata/v1/$metadata`),
];

const writeOps: (() => Promise<unknown>)[] = [
  async () => {
    const t = await hit("POST Tasks", `/odata/v1/Tasks`, { method: "POST", body: JSON.stringify({ ProjectId: STRESS_PROJECT, PhaseId: PHASE, Name: `C ${crypto.randomUUID().slice(0, 6)}`, Owners: [{ Email: "bruno.teste@ploomes.com" }], PlannedStart: "2027-03-02", DurationDays: 2, DependsOn: [ROOT_TASK] }) });
    if (t?.Id) {
      await hit("PATCH Tasks", `/odata/v1/Tasks(${t.Id})`, { method: "PATCH", body: JSON.stringify({ RiskFlag: rand(["None", "Warning", "Critical"]) }) });
      await hit("SetStatus", `/odata/v1/Tasks(${t.Id})/Open.SetStatus`, { method: "POST", body: JSON.stringify({ Status: rand(["Todo", "InProgress", "Validation"]) }) });
      await hit("AddComment", `/odata/v1/Tasks(${t.Id})/Open.AddComment`, { method: "POST", body: JSON.stringify({ Text: "carga" }) });
    }
  },
  () => hit("ChangeDates (cascata)", `/odata/v1/Tasks(${ROOT_TASK})/Open.ChangeDates`, { method: "POST", body: JSON.stringify({ PlannedEnd: day() }) }),
  () => hit("Intake dry-run", `/odata/v1/Open.Intake`, { method: "POST", body: JSON.stringify({ Items: [{ Kind: "Client", Ref: "c", Name: `Carga ${crypto.randomUUID().slice(0, 6)}` }, { Kind: "Task", Name: "x", ClientRef: "c", Owners: [{ Email: "ana.teste@ploomes.com" }] }] }) }),
];

const mcpOps: (() => Promise<unknown>)[] = [
  () => mcp("list_tasks", "list_tasks", { mine: true }),
  () => mcp("search", "search", { q: "teste" }),
  () => mcp("get_project", "get_project", { id: PROJECT }),
  () => mcp("generate_status_report", "generate_status_report", { projectId: PROJECT }),
  () => mcp("create_task (prévia)", "create_task", { ProjectId: STRESS_PROJECT, PhaseId: PHASE, Name: "prévia", Owners: [{ Email: "bruno.teste@ploomes.com" }] }),
];

async function scenario(name: string, ops: (() => Promise<unknown>)[]) {
  const start = samples.length;
  const t0 = performance.now();
  const end = t0 + DURATION;
  console.log(`▶ ${name}: ${CONC} usuários virtuais por ${DURATION / 1000}s`);
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (performance.now() < end) await rand(ops)();
  }));
  return { name, samples: samples.slice(start), seconds: (performance.now() - t0) / 1000 };
}

function pct(xs: number[], p: number) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

const results = [];
results.push(await scenario("Leitura OData", readOps));
results.push(await scenario("Escrita OData", writeOps));
results.push(await scenario("MCP", mcpOps));
results.push(await scenario("Misto (leitura + escrita + MCP)", [...readOps, ...readOps, ...writeOps, ...mcpOps]));

// ── consistência depois da carga
// Criar uma tarefa com início antes do fim da predecessora é aceito (igual ao app: a cascata só roda quando a
// predecessora muda). Por isso a regra verificada é: depois de mudar a data da raiz, TODAS as dependentes estão no lugar.
await fetch(`${BASE}/odata/v1/Tasks(${ROOT_TASK})/Open.ChangeDates`, { method: "POST", headers: H, body: JSON.stringify({ PlannedEnd: "2027-03-10" }) }).then((r) => r.body?.cancel());
const checks: [string, boolean, string][] = [];
const tasks = await sql<{ id: string; planned_start: string; planned_end: string; depends_on: string[] }[]>`
  select id, planned_start::text, planned_end::text, coalesce(depends_on, '[]'::jsonb) as depends_on from entries where project_id = ${STRESS_PROJECT}`;
const byId = new Map(tasks.map((t) => [t.id, t]));
const broken = tasks.filter((t) => t.depends_on.some((d) => byId.get(d) && t.planned_start && byId.get(d)!.planned_end && t.planned_start <= byId.get(d)!.planned_end));
checks.push(["Cascata (após mudar a raiz): nenhuma tarefa começa antes da predecessora terminar", broken.length === 0, `${tasks.length} tarefas, ${broken.length} violações`]);
const [{ n: orphans }] = await sql<{ n: number }[]>`select count(*)::int as n from entries where project_id = ${STRESS_PROJECT} and phase_id is null`;
checks.push(["Nenhuma tarefa sem fase", orphans === 0, `${orphans}`]);
const all5xx = samples.filter((s) => s.status >= 500 || s.status === -1);
checks.push(["Nenhum erro 5xx/rede", all5xx.length === 0, `${all5xx.length} de ${samples.length}`]);
const [{ n: pending }] = await sql<{ n: number }[]>`select count(*)::int as n from open_api.idempotency where status = 0 and created_at < now() - interval '1 minute'`;
checks.push(["Nenhuma reserva de idempotência presa", pending === 0, `${pending}`]);

// ── relatório
const lines: string[] = [];
lines.push(`# Relatório de carga — Open API`, "");
lines.push(`- Data: ${new Date().toISOString()}`, `- Banco: staging (${new URL(dbUrl.replace(/^postgres(ql)?:/, "http:")).hostname})`);
lines.push(`- ${CONC} usuários virtuais por cenário, ${DURATION / 1000}s cada · API local → banco remoto (a latência de rede entra em cada ida ao banco)`, "");
lines.push("| Cenário | Requisições | Req/s | p50 ms | p95 ms | p99 ms | máx ms | Erros |", "|---|---|---|---|---|---|---|---|");
for (const r of results) {
  const ms = r.samples.map((s) => s.ms);
  const errs = r.samples.filter((s) => s.status >= 400 || s.status < 0);
  const byStatus = Object.entries(errs.reduce((a: Record<string, number>, s) => ((a[s.status] = (a[s.status] ?? 0) + 1), a), {})).map(([k, v]) => `${k}×${v}`).join(" ") || "—";
  lines.push(`| ${r.name} | ${r.samples.length} | ${(r.samples.length / r.seconds).toFixed(1)} | ${pct(ms, 50).toFixed(0)} | ${pct(ms, 95).toFixed(0)} | ${pct(ms, 99).toFixed(0)} | ${Math.max(...ms).toFixed(0)} | ${byStatus} |`);
}
lines.push("", "## Por operação", "", "| Operação | n | p50 ms | p95 ms | Erros |", "|---|---|---|---|---|");
const ops = [...new Set(samples.map((s) => s.op))].sort();
for (const op of ops) {
  const xs = samples.filter((s) => s.op === op);
  const ms = xs.map((s) => s.ms);
  const e = xs.filter((s) => s.status >= 400 || s.status < 0);
  lines.push(`| ${op} | ${xs.length} | ${pct(ms, 50).toFixed(0)} | ${pct(ms, 95).toFixed(0)} | ${e.length ? [...new Set(e.map((x) => x.status))].join(",") + ` (${e.length})` : "—"} |`);
}
lines.push("", "## Consistência após a carga", "");
for (const [n, ok, d] of checks) lines.push(`- ${ok ? "✅" : "❌"} ${n} — ${d}`);
const errLog = stderrChunks.join("").trim();
if (errLog) lines.push("", "## Erros registrados pelo servidor", "", "```", errLog.slice(0, 3000), "```");
const report = lines.join("\n");
console.log("\n" + report);
if (args.report) await Deno.writeTextFile(args.report, report);

server.kill("SIGTERM");
await server.status;
await rotateUserKey(ana.id); // a chave usada no estresse deixa de valer
if (!Deno.args.includes("--keep-data")) console.log(`✔ limpeza: ${JSON.stringify(await cleanupTestData(sql, startedAt))}`);
await sql.end();
Deno.exit(checks.every(([, ok]) => ok) ? 0 : 1);
