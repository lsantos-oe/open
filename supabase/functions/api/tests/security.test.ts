// Segurança: header User-Key, chave trocada/inexistente, usuário inativo, Bearer recusado, admin, página da chave.
import { assert, assertEquals, assertMatch } from "@std/assert";
import { api, EMAIL, env, ignore, uniq } from "./_helpers.ts";

const t = (name: string, fn: () => Promise<void>) => Deno.test({ name: `[segurança] ${name}`, ignore, fn, sanitizeResources: false, sanitizeOps: false });

t("sem User-Key → 401 explicando o header", async () => {
  const r = await api("/Tasks", { token: "" });
  assertEquals(r.status, 401);
  assertMatch(r.body.error.message, /User-Key/);
  assertMatch(r.headers.get("www-authenticate") ?? "", /User-Key/);
  assert(r.body.error.innererror.requestId);
});

t("Authorization: Bearer é recusado com orientação", async () => {
  const r = await api("/Me", { token: "", headers: { Authorization: `Bearer ${env.write}` } });
  assertEquals(r.status, 401);
  assertMatch(r.body.error.message, /não Bearer/);
});

t("chave com formato errado, inexistente ou já trocada → 401", async () => {
  assertEquals((await api("/Me", { token: "abc" })).status, 401);
  if (env.fake) assertEquals((await api("/Me", { token: env.fake })).status, 401);
  if (env.old) {
    const r = await api("/Me", { token: env.old });
    assertEquals(r.status, 401);
    assertMatch(r.body.error.message, /trocada/);
  }
});

t("usuário desativado no Open → 403 mesmo com chave válida", async () => {
  if (!env.inactive) return;
  const r = await api("/Me", { token: env.inactive });
  assertEquals(r.status, 403);
  assertMatch(r.body.error.message, /desativado/);
});

t("a chave age como a pessoa: Me e autoria", async () => {
  const ana = await api("/Me");
  assertEquals(ana.body.Email, EMAIL.ana);
  assert(ana.body.Permissions.includes("admin"));
  const bruno = await api("/Me", { token: env.read });
  assertEquals(bruno.body.Email, EMAIL.bruno);
  assertEquals(bruno.body.Permissions, ["read", "write"]);
  const c = await api("/Clients", { token: env.read, body: { Name: uniq("Cliente do Bruno") } });
  assertEquals(c.status, 201);
  assertEquals(c.body.CreatedBy, "00000000-0000-4000-8000-00000000a002");
});

t("funções de admin: templates e chaves de terceiros só para admin", async () => {
  assertEquals((await api("/Templates", { token: env.read, body: { Name: "x", Phases: [] } })).status, 403);
  const res = await fetch(`${env.url}/admin/user-keys`, { headers: { "User-Key": env.read } });
  await res.body?.cancel();
  assertEquals(res.status, 403);
  const ok = await fetch(`${env.url}/admin/user-keys`, { headers: { "User-Key": env.write } });
  const list = await ok.json();
  assertEquals(ok.status, 200);
  assert(list.value.length >= 2);
  assert(!/ouk_[A-Za-z0-9]{40}/.test(JSON.stringify(list)), "listagem não pode trazer a chave inteira");
});

t("admin gera chave de usuário-robô; a nova funciona e a antiga não", async () => {
  const oldKey = env.read;
  const r1 = await fetch(`${env.url}/admin/user-keys/rotate`, {
    method: "POST",
    headers: { "User-Key": env.write, "Content-Type": "application/json" },
    body: JSON.stringify({ Email: EMAIL.bruno }),
  });
  const k1 = await r1.json();
  assertEquals(r1.status, 200);
  assertMatch(k1.UserKey, /^ouk_[A-Za-z0-9]{40}$/);
  assertEquals(r1.headers.get("cache-control"), "no-store");
  assertEquals((await api("/Me", { token: k1.UserKey })).body.Email, EMAIL.bruno);
  env.read = k1.UserKey; // os próximos testes usam a chave nova do Bruno
  assertEquals((await api("/Me", { token: oldKey })).status, 401); // a chave anterior caiu na hora
});

t("conta de fora do domínio da empresa é recusada mesmo ativa no app (API, MCP e Vincular)", async () => {
  if (!env.external) return;
  const r = await api("/Me", { token: env.external });
  assertEquals(r.status, 403);
  assertMatch(r.body.error.message, /@ploomes\.com/);
  const m = await fetch(`${env.url}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "User-Key": env.external }, body: "{}" });
  assertEquals(m.status, 403);
  await m.body?.cancel();
  const ap = await fetch(`${env.url}/oauth/approve`, { method: "POST", headers: { "Content-Type": "application/json", "User-Key": env.external }, body: "{}" });
  assertEquals(ap.status, 403);
  await ap.body?.cancel();
});

t("página /minha-chave e endpoints de sessão", async () => {
  const page = await fetch(`${env.url}/minha-chave`);
  const html = await page.text();
  assertEquals(page.status, 200);
  assertMatch(html, /Minha chave da Open API/);
  assertEquals(page.headers.get("cache-control"), "no-store");
  const noSession = await fetch(`${env.url}/user-key`);
  await noSession.body?.cancel();
  assertEquals(noSession.status, 401);
  const withKey = await fetch(`${env.url}/user-key`, { headers: { "User-Key": env.write } }); // a página exige sessão, não chave
  await withKey.body?.cancel();
  assertEquals(withKey.status, 401);
});

t("cabeçalhos de segurança e OData-Version", async () => {
  const r = await api("/Me");
  assertEquals(r.headers.get("odata-version"), "4.0");
  assertEquals(r.headers.get("x-content-type-options"), "nosniff");
  assert(r.headers.get("x-request-id"));
});

t("CORS: origem não autorizada não recebe Allow-Origin", async () => {
  const res = await fetch(`${env.url}/odata/v1/Me`, { headers: { Origin: "https://evil.example", "User-Key": env.write } });
  await res.body?.cancel();
  assertEquals(res.headers.get("access-control-allow-origin"), null);
});

t("SQL injection via $filter não executa nada", async () => {
  const r = await api(`/Tasks?$filter=${encodeURIComponent("Name eq 'x'' or 1=1; drop table entries; --'")}`);
  assertEquals(r.status, 200);
  assertEquals(r.body.value.length, 0);
  assertEquals((await api(`/Tasks?$filter=${encodeURIComponent("Name eq 'x' ; drop table entries")}`)).status, 400);
  assertEquals((await api("/Tasks/$count")).status, 200);
});

t("notificações: cada um só vê as suas (RLS do app)", async () => {
  const ana = await api("/Notifications?$top=200");
  const bruno = await api("/Notifications?$top=200", { token: env.read });
  const aIds = new Set(ana.body.value.map((n: { Id: string }) => n.Id));
  assert(!bruno.body.value.some((n: { Id: string }) => aIds.has(n.Id)));
});

t("sessão (login da página): ver a própria chave e gerar nova", async () => {
  if (!env.sessionAna || !env.sessionBruno) return;
  const get = async (jwt: string) => {
    const r = await fetch(`${env.url}/user-key`, { headers: { Authorization: `Bearer ${jwt}` } });
    return { status: r.status, cache: r.headers.get("cache-control"), body: await r.json() };
  };
  const ana = await get(env.sessionAna);
  assertEquals(ana.status, 200);
  assertEquals(ana.cache, "no-store");
  assertEquals(ana.body.UserKey, env.write); // a mesma chave que a API aceita (decifrada do Vault)
  const before = env.read;
  const rot = await fetch(`${env.url}/user-key/rotate`, { method: "POST", headers: { Authorization: `Bearer ${env.sessionBruno}` } });
  const nk = await rot.json();
  assertEquals(rot.status, 200);
  assertMatch(nk.UserKey, /^ouk_[A-Za-z0-9]{40}$/);
  assert(nk.UserKey !== before);
  assertEquals((await api("/Me", { token: before })).status, 401);
  assertEquals((await api("/Me", { token: nk.UserKey })).body.Email, EMAIL.bruno);
  env.read = nk.UserKey;
  assertEquals((await get(env.sessionBruno)).body.UserKey, nk.UserKey); // ver de novo devolve a nova
  const bad = await fetch(`${env.url}/user-key`, { headers: { Authorization: "Bearer eyJ.invalido.x" } });
  await bad.body?.cancel();
  assertEquals(bad.status, 401);
});

t("rate limit: estoura 120/min → 429 com Retry-After (sem afetar outras pessoas)", async () => {
  if (!env.limit) return;
  // manda em lotes até receber 429 (a janela é de 1 minuto; se virar o minuto no meio, continua até estourar)
  let got429: Response | null = null;
  let sent = 0;
  while (!got429 && sent < 400) {
    const rs = await Promise.all(Array.from({ length: 20 }, () => fetch(`${env.url}/odata/v1/Me`, { headers: { "User-Key": env.limit } })));
    sent += rs.length;
    for (const r of rs) {
      if (r.status === 429 && !got429) got429 = r;
      else await r.body?.cancel();
    }
  }
  assert(got429, `nenhum 429 em ${sent} requisições`);
  const body = await got429!.json();
  assertEquals(body.error.code, "TooManyRequests");
  assert(Number(got429!.headers.get("retry-after")) > 0);
  assertEquals((await api("/Me")).status, 200); // a Ana continua normal
});

t("endereço do Open: página, docs e OpenAPI sem nenhum traço do provedor (supabase)", async () => {
  for (const path of ["/minha-chave", "/docs", "/openapi.json", ""]) {
    const res = await fetch(`${env.url}${path}`);
    const body = await res.text();
    assertEquals(res.status, 200, path);
    assert(!/supabase/i.test(body), `${path} menciona supabase`);
  }
  const login = await fetch(`${env.url}/auth/google`, { redirect: "manual" });
  await login.body?.cancel();
  assertEquals(login.status, 302);
  const loc = new URL(login.headers.get("location")!);
  assertEquals(loc.pathname, "/auth/v1/authorize");
  assertEquals(loc.searchParams.get("redirect_to"), `${env.url}/minha-chave`); // volta sempre para a página da API
  assertEquals(loc.searchParams.get("provider"), "google");
  // login do "Vincular" (conector do Claude) volta para o callback do OAuth — nunca para um endereço externo
  const oauth = await fetch(`${env.url}/auth/google?to=oauth`, { redirect: "manual" });
  await oauth.body?.cancel();
  assertEquals(new URL(oauth.headers.get("location")!).searchParams.get("redirect_to"), `${env.url}/oauth/callback`);
  const other = await fetch(`${env.url}/auth/google?to=https://evil.example`, { redirect: "manual" });
  await other.body?.cancel();
  assertEquals(new URL(other.headers.get("location")!).searchParams.get("redirect_to"), `${env.url}/minha-chave`);
  const cb = await fetch(`${env.url}/oauth/callback`);
  assert(!/supabase/i.test(await cb.text()), "callback menciona supabase");
});
