// Roda a bateria completa (unitários + API + segurança + MCP + fidelidade) contra um banco de STAGING.
//
//   deno run -A --env-file=<caminho>/api.env tools/test-local.ts            # tudo
//   deno run -A --env-file=<caminho>/api.env tools/test-local.ts mcp        # só arquivos que contêm "mcp"
//   ... tools/test-local.ts --keep-data                                     # não apaga o que os testes criaram
//
// O que faz: recusa a URL de produção → aplica o seed de teste → gera User-Keys para os usuários de teste → sobe a
// API numa porta livre → roda `deno test` → troca as chaves de teste e derruba a API.
import postgres from "postgres";
import { generateUserKey, hashUserKey, rotateUserKey } from "../lib/userkeys.ts";
import { cleanupTestData } from "../tests/fixtures/cleanup.ts";

const PROD_REF = "fgzxmcvvahoasisgoqjr";
const ROOT = new URL("../", import.meta.url);
const dbUrl = Deno.env.get("API_DB_URL") ?? "";
const filter = Deno.args.find((a) => !a.startsWith("--"));
const keepData = Deno.args.includes("--keep-data");
const startedAt = new Date();

if (!dbUrl) fail("Defina API_DB_URL (use --env-file com o arquivo do STAGING).");
if (dbUrl.includes(PROD_REF)) fail("BLOQUEADO: a URL é de PRODUÇÃO. Os testes gravam dados — use o staging.");
const host = new URL(dbUrl.replace(/^postgres(ql)?:/, "http:")).hostname;
console.log(`\n▶ Banco de teste: ${host} (${new URL(dbUrl.replace(/^postgres(ql)?:/, "http:")).username})`);

const sql = postgres(dbUrl, { prepare: false, max: 1, onnotice: () => {} });
const rotated: string[] = [];

/** Garante uma User-Key nova para o usuário de teste (a de antes deixa de valer). */
async function keyFor(email: string): Promise<string> {
  const [p] = await sql<{ id: string }[]>`select id from public.profiles where lower(email) = lower(${email})`;
  if (!p) fail(`Usuário de teste ${email} não existe (seed não aplicado?).`);
  rotated.push(p.id);
  return (await rotateUserKey(p.id)).UserKey;
}

function fail(msg: string): never {
  console.error(`✖ ${msg}`);
  Deno.exit(2);
}

let server: Deno.ChildProcess | undefined;
let code = 1;
try {
  // 1. seed (idempotente)
  const seed = await Deno.readTextFile(new URL("tests/fixtures/seed.sql", ROOT));
  await sql.unsafe(seed);
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from information_schema.tables where table_schema = 'open_api'`;
  if (!n) fail("Schema open_api não existe neste banco — aplique supabase/migrations/*_open_api_schema.sql.");
  console.log("✔ seed aplicado");

  // 2. User-Keys dos usuários de teste (Carla é ativada só para gerar a chave e desativada de novo)
  await sql`update public.profiles set active = true where email = 'carla.inativa@ploomes.com'`;
  const keys: Record<string, string> = {
    API_TEST_KEY_ANA: await keyFor("ana.teste@ploomes.com"), // admin
    API_TEST_KEY_BRUNO: await keyFor("bruno.teste@ploomes.com"), // membro
    API_TEST_KEY_INACTIVE: await keyFor("carla.inativa@ploomes.com"),
    API_TEST_KEY_LIMIT: await keyFor("dani.limite@ploomes.com"), // só para o teste de rate limit
    API_TEST_KEY_EXTERNAL: await keyFor("eva.externa@example.com"), // conta externa ativa: deve ser recusada
    API_TEST_KEY_OLD: await keyFor("ana.teste@ploomes.com"), // será trocada: vira chave antiga
    API_TEST_KEY_FAKE: generateUserKey(), // formato válido, nunca cadastrada
  };
  keys.API_TEST_KEY_ANA = (await rotateUserKey(rotated[0])).UserKey; // a anterior (OLD) deixa de valer
  await sql`update public.profiles set active = false where email = 'carla.inativa@ploomes.com'`;
  void hashUserKey;
  console.log("✔ User-Keys de teste geradas");

  // Sessões (login do Supabase) para testar a página /minha-chave sem depender do Google: senha aleatória,
  // temporária, só nos usuários fictícios de teste; removida ao final.
  const sessions: Record<string, string> = {};
  const supaUrl = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (supaUrl && anon) {
    const pass = `T!${crypto.randomUUID()}`;
    for (const [envName, email] of [["API_TEST_SESSION_ANA", "ana.teste@ploomes.com"], ["API_TEST_SESSION_BRUNO", "bruno.teste@ploomes.com"]]) {
      await sql`update auth.users set encrypted_password = extensions.crypt(${pass}, extensions.gen_salt('bf')),
                  email_confirmed_at = coalesce(email_confirmed_at, now()) where email = ${email}`;
      const r = await fetch(`${supaUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: anon, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pass }),
      });
      const j = await r.json();
      if (!r.ok) fail(`Login de teste falhou para ${email}: ${JSON.stringify(j)}`);
      sessions[envName] = j.access_token;
    }
    await sql`update auth.users set encrypted_password = null where email in ('ana.teste@ploomes.com', 'bruno.teste@ploomes.com')`;
    Object.assign(keys, sessions);
    console.log("✔ sessões de teste (login por senha temporária) geradas");
  } else {
    console.log("· SUPABASE_URL/SUPABASE_ANON_KEY ausentes: testes de sessão serão ignorados");
  }

  // 3. sobe a API
  const port = String(8790 + Math.floor(Math.random() * 100));
  const url = `http://localhost:${port}/api`;
  server = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "index.ts"],
    cwd: ROOT,
    env: { ...Deno.env.toObject(), PORT: port, API_PUBLIC_URL: url },
    stdout: "null",
    stderr: "inherit",
  }).spawn();
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try {
      const r = await fetch(`${url}/health`);
      await r.body?.cancel();
      up = r.ok;
    } catch { /* subindo */ }
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) fail("A API não subiu em 30s.");
  console.log(`✔ API no ar em ${url}\n`);

  // 4. testes
  const files = [...Deno.readDirSync(new URL("tests/", ROOT))]
    .filter((f) => f.isFile && f.name.endsWith(".test.ts") && (!filter || f.name.includes(filter)))
    .map((f) => `tests/${f.name}`)
    .sort();
  const run = await new Deno.Command(Deno.execPath(), {
    args: ["test", "-A", "--no-check", ...files],
    cwd: ROOT,
    env: { ...Deno.env.toObject(), ...keys, API_TEST_URL: url },
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  code = run.code;
} finally {
  if (!keepData) {
    const removed = await cleanupTestData(sql, startedAt).catch((e) => ({ erro: String(e) }));
    console.log(`✔ limpeza do staging: ${JSON.stringify(removed)}`);
  }
  // troca as chaves de teste no fim: as que ficaram no ambiente do teste deixam de valer
  for (const id of [...new Set(rotated)]) await rotateUserKey(id).catch(() => {});
  await sql.end();
  try {
    server?.kill("SIGTERM");
    await server?.status;
  } catch { /* já encerrado */ }
  console.log(code === 0 ? "\n✔ Tudo passou." : "\n✖ Há falhas (veja acima).");
}
Deno.exit(code);
