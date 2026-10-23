// Aplicação HTTP (Hono). Rotas sob /api (nome da Edge Function no Supabase):
//   /api                 índice
//   /api/health          saúde (sem auth)
//   /api/docs            documentação interativa (Scalar, sem auth para ler)
//   /api/openapi.json    contrato OpenAPI 3.2 (gerado do modelo)
//   /api/minha-chave     página para ver/copiar/trocar a própria User-Key (login Google)
//   /api/auth/google     inicia o login Google (página da chave e "Vincular" do conector)
//   /api/user-key        GET/POST rotate — usados pela página (sessão do login)
//   /api/odata/v1/...    API OData v4 (header User-Key)
//   /api/mcp             MCP Streamable HTTP (header User-Key ou token OAuth do conector do Claude)
//   /api/oauth/*         servidor OAuth 2.1 do conector (register, authorize, token, revoke) + .well-known
import { Hono } from "hono";
import type { Context } from "hono";
import { authenticate, authenticateMcp, type AuthUser, authenticateSession, rateLimit, rateLimitBucket, requireScope } from "./lib/auth.ts";
import {
  authServerMetadata,
  issueCode,
  OAuthError,
  parseAuthorize,
  protectedResourceMetadata,
  redirectWith,
  registerClient,
  revoke,
  revokeAllForUser,
  token,
} from "./lib/oauth.ts";
import { oauthAuthorizeHtml, oauthCallbackHtml, oauthErrorHtml } from "./oauthpage.ts";
import { getOrCreateUserKey, listUserKeys, rotateUserKey } from "./lib/userkeys.ts";
import { keyPageHtml } from "./keypage.ts";
import { config } from "./lib/config.ts";
import { admin } from "./lib/db.ts";
import { ApiError, errorBody } from "./lib/errors.ts";
import { handleOData } from "./odata/router.ts";
import { buildOpenApi } from "./odata/openapi.ts";
import { docsHtml } from "./docs.ts";
import { handleMcp } from "./mcp/server.ts";

type Env = { Variables: { requestId: string; user?: AuthUser; channel: "odata" | "mcp" | "other" } };

export const app = new Hono<Env>().basePath("/api");

/** URL pública da raiz da função (…/functions/v1/api no Supabase, …/api local). */
export function publicRoot(c: Context): string {
  const env = Deno.env.get("API_PUBLIC_URL");
  if (env) return env.replace(/\/$/, "");
  const url = new URL(c.req.url);
  const proto = c.req.header("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? url.host;
  const prefix = host.endsWith(".supabase.co") ? "/functions/v1" : "";
  return `${proto}://${host}${prefix}/api`;
}

function waitUntil(p: Promise<unknown>) {
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
  else p.catch(() => {});
}

// ── request id, CORS, log
app.use("*", async (c, next) => {
  const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
  c.set("requestId", requestId);
  c.set("channel", "other");
  const origin = c.req.header("origin");
  const allowed = origin && config.allowedOrigins.includes(origin);
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: allowed
        ? {
          "Access-Control-Allow-Origin": origin!,
          "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, QUERY, OPTIONS",
          "Access-Control-Allow-Headers": "User-Key, Authorization, Content-Type, If-Match, Prefer, Idempotency-Key, Mcp-Session-Id, Mcp-Protocol-Version",
          "Access-Control-Max-Age": "600",
        }
        : {},
    });
  }
  const started = performance.now();
  await next();
  c.header("X-Request-Id", requestId);
  c.header("OData-Version", "4.0");
  c.header("X-Content-Type-Options", "nosniff");
  if (allowed) {
    c.header("Access-Control-Allow-Origin", origin!);
    c.header("Access-Control-Expose-Headers", "ETag, Location, OData-Version, X-Request-Id, Preference-Applied, Retry-After");
  }
  const user = c.get("user");
  if (user) {
    const path = new URL(c.req.url).pathname.replace(/^.*?\/api/, "");
    waitUntil(admin()`
      insert into open_api.request_log (user_id, channel, method, path, status, duration_ms)
      values (${user.id}, ${c.get("channel")}, ${c.req.method}, ${path.slice(0, 500)}, ${c.res.status},
              ${Math.round(performance.now() - started)})`);
    if (Math.random() < 0.01) waitUntil(admin()`select open_api.cleanup()`);
  }
});

app.onError((err, c) => {
  if (err instanceof OAuthError) {
    c.header("Cache-Control", "no-store");
    return c.json({ error: err.error, error_description: err.description }, err.status as 400);
  }
  const e = err instanceof ApiError
    ? err
    : err instanceof SyntaxError
    ? new ApiError(400, "BadRequest", "JSON inválido no corpo da requisição.")
    : new ApiError(500, "InternalError", "Erro interno. Use o requestId para rastrear.");
  if (!(err instanceof ApiError) && !(err instanceof SyntaxError)) console.error(c.get("requestId"), err);
  // deno-lint-ignore no-explicit-any
  const retry = (err as any)?.retryAfter;
  if (retry) c.header("Retry-After", String(retry));
  // deno-lint-ignore no-explicit-any
  const bearer: string | undefined = (err as any)?.bearer;
  if (e.status === 401 && bearer !== undefined) {
    // MCP sem credencial: o desafio Bearer com resource_metadata leva o Claude ao login (OAuth)
    const meta = `${publicRoot(c)}/.well-known/oauth-protected-resource/mcp`;
    c.header("WWW-Authenticate", `Bearer resource_metadata="${meta}"${bearer ? `, error="${bearer}"` : ""}`);
  } else if (e.status === 401) c.header("WWW-Authenticate", `User-Key realm="open-api"`);
  return c.json(errorBody(e, c.get("requestId")), e.status as 400);
});

app.notFound((c) => c.json(errorBody(new ApiError(404, "NotFound", "Rota não encontrada. Veja /api/docs."), c.get("requestId")), 404));

// ── públicos
app.get("/", (c) => {
  const root = publicRoot(c);
  return c.json({
    name: "Open API",
    version: config.version,
    odata: `${root}/odata/v1`,
    metadata: `${root}/odata/v1/$metadata`,
    mcp: `${root}/mcp`,
    docs: `${root}/docs`,
    myKey: `${root}/minha-chave`,
    openapi: `${root}/openapi.json`,
  });
});
app.get("/health", (c) => c.json({ ok: true, version: config.version, writeEnabled: config.writeEnabled }));
app.get("/openapi.json", (c) => c.json(buildOpenApi(publicRoot(c))));
app.get("/docs", (c) => c.html(docsHtml(publicRoot(c))));
app.get("/minha-chave", (c) => {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  return c.html(keyPageHtml({ root: publicRoot(c) }));
});

// ── Login Google (o navegador só fala com a API; o provedor de login fica atrás dela). Volta para a página da
// chave ou, com ?to=oauth, para o callback do "Vincular". As duas URLs precisam estar nas Redirect URLs do Supabase.
const loginBack = (c: Context, to: unknown) => `${publicRoot(c)}/${to === "oauth" ? "oauth/callback" : "minha-chave"}`;

app.get("/auth/google", (c) => {
  if (!config.supabaseUrl) throw new ApiError(503, "LoginUnavailable", "Login não configurado nesta instância.");
  const back = loginBack(c, c.req.query("to"));
  return c.redirect(`${config.supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`, 302);
});

// ── User-Key da própria pessoa (sessão do login Google; usados pela página /minha-chave)
app.get("/user-key", async (c) => {
  const user = await authenticateSession(c.req.raw.headers);
  c.set("user", user);
  c.header("Cache-Control", "no-store");
  return c.json({ ...(await getOrCreateUserKey(user.id)), Email: user.email });
});
app.post("/user-key/rotate", async (c) => {
  const user = await authenticateSession(c.req.raw.headers);
  c.set("user", user);
  await rateLimit(user, 5);
  c.header("Cache-Control", "no-store");
  return c.json({ ...(await rotateUserKey(user.id)), Email: user.email });
});

app.post("/user-key/disconnect-apps", async (c) => {
  const user = await authenticateSession(c.req.raw.headers);
  c.set("user", user);
  return c.json({ Revoked: await revokeAllForUser(user.id) });
});

// ── OAuth 2.1 (conector do Claude). Descoberta: o 401 do /mcp aponta para o protected resource metadata, que
// aponta para este servidor de autorização (issuer = raiz da API).
const clientIp = (c: Context) => c.req.header("x-forwarded-for")?.split(",")[0].trim() || c.req.header("cf-connecting-ip") || "local";
const noStore = (c: Context, body: unknown, status = 200) => {
  c.header("Cache-Control", "no-store");
  return c.json(body, status as 200);
};
for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/*"]) {
  app.get(path, (c) => noStore(c, protectedResourceMetadata(publicRoot(c))));
}
for (
  const path of [
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-authorization-server/*",
    "/.well-known/openid-configuration",
    "/.well-known/openid-configuration/*",
  ]
) {
  app.get(path, (c) => noStore(c, authServerMetadata(publicRoot(c))));
}
app.post("/oauth/register", async (c) => {
  await rateLimitBucket(`ip:reg:${clientIp(c)}`, 20);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") throw new OAuthError("invalid_client_metadata", "Corpo JSON inválido.");
  return noStore(c, await registerClient(body as Record<string, unknown>), 201);
});
const pageHeaders = (c: Context) => {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Frame-Options", "DENY");
  c.header("Content-Security-Policy", "frame-ancestors 'none'");
};
app.get("/oauth/authorize", async (c) => {
  pageHeaders(c);
  const root = publicRoot(c);
  try {
    const req = await parseAuthorize(root, c.req.query());
    return c.html(oauthAuthorizeHtml({ root, clientName: req.client.client_name, redirectHost: new URL(req.redirectUri).host }));
  } catch (e) {
    if (!(e instanceof OAuthError)) throw e;
    const { redirectUri, state } = e as OAuthError & { redirectUri?: string; state?: string };
    if (redirectUri) return c.redirect(redirectWith(redirectUri, { error: e.error, error_description: e.description, state, iss: root }), 302);
    return c.html(oauthErrorHtml(e.description, root), 400);
  }
});
app.get("/oauth/callback", (c) => {
  pageHeaders(c);
  return c.html(oauthCallbackHtml(publicRoot(c)));
});
/** Decisão da página de consentimento. Autentica pela sessão do login (Google) ou pela User-Key da pessoa. */
app.post("/oauth/approve", async (c) => {
  const headers = c.req.raw.headers;
  const user = headers.get("user-key") ? await authenticate(headers, 5) : await authenticateSession(headers);
  c.set("user", user);
  if (user.kind === "session") await rateLimit(user, 5);
  const { query, allow } = await c.req.json().catch(() => ({})) as { query?: string; allow?: boolean };
  const root = publicRoot(c);
  const params = Object.fromEntries(new URLSearchParams(String(query ?? "").replace(/^\?/, "")));
  const req = await parseAuthorize(root, params);
  if (allow !== true) return noStore(c, { redirect: redirectWith(req.redirectUri, { error: "access_denied", state: req.state, iss: root }) });
  return noStore(c, { redirect: await issueCode(root, req, user.id) });
});
async function formBody(c: Context): Promise<Record<string, string>> {
  if ((c.req.header("content-type") ?? "").includes("application/json")) return await c.req.json().catch(() => ({}));
  const f = await c.req.parseBody().catch(() => ({}));
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, String(v)]));
}
app.post("/oauth/token", async (c) => {
  await rateLimitBucket(`ip:tok:${clientIp(c)}`, 60);
  c.header("Pragma", "no-cache");
  return noStore(c, await token(publicRoot(c), await formBody(c)));
});
app.post("/oauth/revoke", async (c) => {
  await rateLimitBucket(`ip:rev:${clientIp(c)}`, 60);
  await revoke((await formBody(c)).token);
  return c.body(null, 200);
});

// ── Admin: chaves de outras pessoas (ex.: usuário-robô para automações). Header User-Key de um admin.
app.get("/admin/user-keys", async (c) => {
  const user = await auth(c);
  requireScope(user, "admin");
  const rows = await listUserKeys();
  return c.json({ value: rows.map((r) => ({ UserId: r.user_id, Email: r.email, Name: r.name, Prefix: r.prefix, RotatedAt: r.rotated_at, LastUsedAt: r.last_used_at })) });
});
app.post("/admin/user-keys/rotate", async (c) => {
  const user = await auth(c);
  requireScope(user, "admin");
  const body = await c.req.json().catch(() => ({})) as { Email?: string };
  if (!body.Email) throw new ApiError(400, "Validation", "Informe Email do usuário.", "Email");
  const [p] = await admin()<{ id: string; active: boolean }[]>`select id, active from public.profiles where lower(email) = lower(${body.Email})`;
  if (!p || !p.active) throw new ApiError(400, "Validation", "Usuário não encontrado ou inativo no Open.", "Email");
  c.header("Cache-Control", "no-store");
  return c.json(await rotateUserKey(p.id, user.id));
});

// ── autenticados
async function auth(c: Context<Env>, cost = 1) {
  const user = await authenticate(c.req.raw.headers, cost);
  c.set("user", user);
  return user;
}

app.all("/odata/v1/*", async (c) => {
  c.set("channel", "odata");
  const user = await auth(c);
  const url = new URL(c.req.url);
  const root = publicRoot(c);
  const path = url.pathname.replace(/^.*?\/odata\/v1/, "");
  let cached: string | undefined;
  const res = await handleOData({
    method: c.req.method.toUpperCase(),
    url,
    base: `${root}/odata/v1`,
    path,
    headers: c.req.raw.headers,
    bodyText: async () => (cached ??= await c.req.text()),
    user,
  });
  for (const [k, v] of Object.entries(res.headers ?? {})) if (v !== undefined) c.header(k, v);
  if (res.text !== undefined) {
    return c.body(res.text, res.status as 200, { "Content-Type": `${res.contentType ?? "text/plain"}; charset=utf-8` });
  }
  if (res.body === undefined) return c.body(null, res.status as 204);
  return c.body(JSON.stringify(res.body), res.status as 200, {
    "Content-Type": "application/json; odata.metadata=minimal; charset=utf-8",
  });
});
app.get("/odata/v1", (c) => c.redirect(new URL(c.req.url).pathname + "/", 301));

app.all("/mcp", async (c) => {
  c.set("channel", "mcp");
  const root = publicRoot(c);
  const user = await authenticateMcp(c.req.raw.headers, `${root}/mcp`);
  c.set("user", user);
  // Servidor sem estado: não há stream de eventos (GET) nem sessão para encerrar (DELETE). Responder 405 é o que
  // a especificação manda — senão o cliente reabre o stream vazio em laço.
  if (c.req.method !== "POST") return c.body(null, 405, { Allow: "POST" });
  return await handleMcp(c.req.raw, user, root);
});
