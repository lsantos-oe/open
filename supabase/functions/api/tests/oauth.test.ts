// OAuth 2.1 do conector do Claude: descoberta, registro, PKCE, consentimento, tokens, renovação rotativa,
// revogação e o /mcp aceitando o token como a pessoa.
import { assert, assertEquals, assertMatch, assertNotEquals } from "@std/assert";
import { env, IDS, ignore } from "./_helpers.ts";

const t = (name: string, fn: () => Promise<void>) => Deno.test({ name: `[oauth] ${name}`, ignore, fn, sanitizeResources: false, sanitizeOps: false });

const REDIRECT = "http://127.0.0.1:33418/callback";
const origin = () => new URL(env.url).origin;

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function pkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}

async function register(redirectUris = [REDIRECT]) {
  const r = await fetch(`${env.url}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "Claude (teste)", redirect_uris: redirectUris, token_endpoint_auth_method: "none" }),
  });
  return { status: r.status, body: await r.json() };
}

function authorizeQuery(clientId: string, challenge: string, extra: Record<string, string> = {}) {
  return "?" + new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "st-123",
    resource: `${env.url}/mcp`,
    ...extra,
  }).toString();
}

async function approve(query: string, cred: Record<string, string>, allow = true) {
  const r = await fetch(`${env.url}/oauth/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cred },
    body: JSON.stringify({ query, allow }),
  });
  return { status: r.status, body: await r.json() };
}

async function tokenReq(form: Record<string, string>) {
  const r = await fetch(`${env.url}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  return { status: r.status, headers: r.headers, body: await r.json() };
}

/** Fluxo completo até os tokens. */
async function connect(cred: Record<string, string> = { "User-Key": env.write }) {
  const { body: client } = await register();
  const { verifier, challenge } = await pkce();
  const ap = await approve(authorizeQuery(client.client_id, challenge), cred);
  assertEquals(ap.status, 200, JSON.stringify(ap.body));
  const code = new URL(ap.body.redirect).searchParams.get("code")!;
  const tk = await tokenReq({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: REDIRECT, client_id: client.client_id, resource: `${env.url}/mcp` });
  assertEquals(tk.status, 200, JSON.stringify(tk.body));
  return { client, tokens: tk.body, code, verifier };
}

async function mcpWith(accessToken: string, method = "tools/call", params: unknown = { name: "whoami", arguments: {} }) {
  const r = await fetch(`${env.url}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return { status: r.status, headers: r.headers, body: await r.json() };
}

t("descoberta: 401 do /mcp aponta o metadata; metadata na raiz do domínio e sob /api", async () => {
  const r = await fetch(`${env.url}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assertEquals(r.status, 401);
  await r.body?.cancel();
  const www = r.headers.get("www-authenticate") ?? "";
  const meta = /resource_metadata="([^"]+)"/.exec(www)?.[1];
  assert(meta, www);
  const prm = await (await fetch(meta!)).json();
  assertEquals(prm.resource, `${env.url}/mcp`);
  assertEquals(prm.authorization_servers, [env.url]);
  const apiPath = new URL(env.url).pathname; // /api
  for (const u of [`${origin()}/.well-known/oauth-authorization-server${apiPath}`, `${env.url}/.well-known/openid-configuration`, `${origin()}/.well-known/oauth-protected-resource${apiPath}/mcp`]) {
    const res = await fetch(u);
    assertEquals(res.status, 200, u);
    const j = await res.json();
    if (j.issuer) {
      assertEquals(j.issuer, env.url);
      assertEquals(j.code_challenge_methods_supported, ["S256"]);
      assertEquals(j.registration_endpoint, `${env.url}/oauth/register`);
    }
  }
});

t("fluxo completo: registrar → aprovar com a User-Key → token → MCP age como a pessoa", async () => {
  const { tokens } = await connect();
  assertMatch(tokens.access_token, /^oat_/);
  assertMatch(tokens.refresh_token, /^ort_/);
  assertEquals(tokens.token_type, "Bearer");
  const r = await mcpWith(tokens.access_token);
  assertEquals(r.status, 200);
  assertMatch(r.body.result.content[0].text, new RegExp(IDS.ana));
});

t("aprovar com a sessão do login Google (página) também funciona — como a pessoa logada", async () => {
  if (!env.sessionBruno) return;
  const { tokens } = await connect({ Authorization: `Bearer ${env.sessionBruno}` });
  const r = await mcpWith(tokens.access_token);
  assertMatch(r.body.result.content[0].text, new RegExp(IDS.bruno));
});

t("código é de uso único e exige o code_verifier certo (PKCE)", async () => {
  const { body: client } = await register();
  const { verifier, challenge } = await pkce();
  const ap = await approve(authorizeQuery(client.client_id, challenge), { "User-Key": env.write });
  const code = new URL(ap.body.redirect).searchParams.get("code")!;
  const base = { grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: client.client_id };
  const wrong = await tokenReq({ ...base, code_verifier: (await pkce()).verifier });
  assertEquals(wrong.status, 400);
  assertEquals(wrong.body.error, "invalid_grant");
  // a tentativa errada consumiu o código: nem o verificador certo serve mais
  const again = await tokenReq({ ...base, code_verifier: verifier });
  assertEquals(again.body.error, "invalid_grant");
});

t("renovação rotativa; reusar um refresh antigo derruba a família inteira", async () => {
  const { client, tokens } = await connect();
  const r1 = await tokenReq({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: client.client_id });
  assertEquals(r1.status, 200);
  assertNotEquals(r1.body.refresh_token, tokens.refresh_token);
  assertEquals((await mcpWith(r1.body.access_token)).status, 200);
  const reuse = await tokenReq({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: client.client_id });
  assertEquals(reuse.body.error, "invalid_grant");
  const after = await mcpWith(r1.body.access_token);
  assertEquals(after.status, 401);
  assertMatch(after.headers.get("www-authenticate") ?? "", /error="invalid_token"/);
});

t("refresh de outro cliente é recusado", async () => {
  const { tokens } = await connect();
  const { body: other } = await register();
  const r = await tokenReq({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: other.client_id });
  assertEquals(r.body.error, "invalid_grant");
});

t("redirect_uri não registrado → página de erro (nunca redireciona para ele)", async () => {
  const { body: client } = await register();
  const q = authorizeQuery(client.client_id, (await pkce()).challenge, { redirect_uri: "https://atacante.example/cb" });
  const r = await fetch(`${env.url}/oauth/authorize${q}`, { redirect: "manual" });
  assertEquals(r.status, 400);
  assertMatch(await r.text(), /redirect_uri não registrado/);
});

t("sem PKCE → volta ao cliente com erro; cliente inexistente → página de erro", async () => {
  const { body: client } = await register();
  const q = authorizeQuery(client.client_id, "x", { code_challenge_method: "plain" });
  const r = await fetch(`${env.url}/oauth/authorize${q}`, { redirect: "manual" });
  assertEquals(r.status, 302);
  const loc = new URL(r.headers.get("location")!);
  assertEquals(loc.searchParams.get("error"), "invalid_request");
  assertEquals(loc.searchParams.get("state"), "st-123");
  const r2 = await fetch(`${env.url}/oauth/authorize${authorizeQuery("ocl_naoexiste", "x".repeat(43))}`, { redirect: "manual" });
  assertEquals(r2.status, 400);
  await r2.body?.cancel();
});

t("página de autorização: mostra o app e bloqueia iframe", async () => {
  const { body: client } = await register();
  const r = await fetch(`${env.url}/oauth/authorize${authorizeQuery(client.client_id, (await pkce()).challenge)}`);
  assertEquals(r.status, 200);
  assertMatch(await r.text(), /Claude \(teste\)/);
  assertEquals(r.headers.get("x-frame-options"), "DENY");
  assertEquals(r.headers.get("cache-control"), "no-store");
});

t("Cancelar → access_denied; usuário desativado não aprova; sem credencial → 401", async () => {
  const { body: client } = await register();
  const q = authorizeQuery(client.client_id, (await pkce()).challenge);
  const deny = await approve(q, { "User-Key": env.write }, false);
  assertEquals(new URL(deny.body.redirect).searchParams.get("error"), "access_denied");
  if (env.inactive) assertEquals((await approve(q, { "User-Key": env.inactive })).status, 403);
  assertEquals((await approve(q, {})).status, 401);
});

t("registro: só https ou localhost; porta do loopback pode variar", async () => {
  assertEquals((await register(["http://evil.example/cb"])).status, 400);
  assertEquals((await register([])).status, 400);
  const { body: client } = await register(["http://127.0.0.1/callback"]);
  const { challenge } = await pkce();
  const q = authorizeQuery(client.client_id, challenge, { redirect_uri: "http://127.0.0.1:51123/callback" });
  const ap = await approve(q, { "User-Key": env.write });
  assertEquals(ap.status, 200);
  assertMatch(ap.body.redirect, /^http:\/\/127\.0\.0\.1:51123\/callback\?code=oac_/);
});

t("client_id em URL (CIMD) não aceita endereço interno", async () => {
  for (const cid of ["https://127.0.0.1/client.json", "https://10.0.0.5/c.json", "https://intranet/c.json", "http://example.com/c.json"]) {
    const r = await fetch(`${env.url}/oauth/authorize${authorizeQuery(cid, (await pkce()).challenge)}`, { redirect: "manual" });
    assertEquals(r.status, 400, cid);
    await r.body?.cancel();
  }
});

t("recurso diferente → invalid_target", async () => {
  const { body: client } = await register();
  const q = authorizeQuery(client.client_id, (await pkce()).challenge, { resource: "https://outro.example/mcp" });
  const r = await fetch(`${env.url}/oauth/authorize${q}`, { redirect: "manual" });
  assertEquals(new URL(r.headers.get("location")!).searchParams.get("error"), "invalid_target");
});

t("revogar o token (RFC 7009) e 'desconectar apps' na página da chave", async () => {
  const a = await connect();
  const rv = await fetch(`${env.url}/oauth/revoke`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `token=${a.tokens.refresh_token}` });
  assertEquals(rv.status, 200);
  await rv.body?.cancel();
  assertEquals((await mcpWith(a.tokens.access_token)).status, 401);
  if (!env.sessionAna) return;
  const b = await connect();
  const d = await fetch(`${env.url}/user-key/disconnect-apps`, { method: "POST", headers: { Authorization: `Bearer ${env.sessionAna}` } });
  assertEquals(d.status, 200);
  assert((await d.json()).Revoked >= 1);
  assertEquals((await mcpWith(b.tokens.access_token)).status, 401);
});

t("token OAuth não abre a API OData (só o MCP)", async () => {
  const { tokens } = await connect();
  const r = await fetch(`${env.url}/odata/v1/Me`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  assertEquals(r.status, 401);
  await r.body?.cancel();
});
