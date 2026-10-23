// OAuth 2.1 para o MCP — é o que os apps do Claude usam no botão "Vincular" do conector (claude.ai, Desktop e
// também o Claude Code). Servidor de autorização mínimo, dentro da própria API:
//   - registro dinâmico de cliente (RFC 7591) ou client_id como URL de metadados (CIMD); só clientes públicos;
//   - authorization code + PKCE S256 obrigatório, código de uso único (5 min);
//   - access token opaco de 1 h + refresh token rotativo de 30 dias; reuso de refresh já trocado revoga a família;
//   - tokens presos ao recurso (RFC 8707: …/api/mcp) e guardados só como hash.
// O login da pessoa é o mesmo do Open (Google) — ou a própria User-Key —, e o token age como ela: mesmas
// permissões, profiles.active checado a cada requisição.
import { admin } from "./db.ts";
import { config } from "./config.ts";
import { generateUserKey, hashUserKey } from "./userkeys.ts";

export const ACCESS_TTL_S = 3600;
export const REFRESH_TTL_S = 30 * 24 * 3600;
const CODE_TTL_S = 300;
export const ACCESS_TOKEN_RE = /^oat_[A-Za-z0-9]{40}$/;

/** Erro no formato do OAuth ({error, error_description}), não no formato OData. */
export class OAuthError extends Error {
  constructor(public error: string, public description: string, public status = 400) {
    super(description);
  }
}

const secret = (prefix: string) => prefix + generateUserKey().slice(4);

export function authServerMetadata(root: string) {
  return {
    issuer: root,
    authorization_endpoint: `${root}/oauth/authorize`,
    token_endpoint: `${root}/oauth/token`,
    registration_endpoint: `${root}/oauth/register`,
    revocation_endpoint: `${root}/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["open"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${root}/docs`,
  };
}

export function protectedResourceMetadata(root: string) {
  return {
    resource: `${root}/mcp`,
    authorization_servers: [root],
    bearer_methods_supported: ["header"],
    scopes_supported: ["open"],
    resource_name: "Open",
    resource_documentation: `${root}/docs`,
  };
}

/** Recurso canônico do token; aceita variações com/sem barra e a raiz da API. */
function normalizeResource(root: string, resource: string | undefined): string {
  const canonical = `${root}/mcp`;
  if (!resource) return canonical;
  const r = resource.replace(/\/+$/, "");
  if (r === canonical || r === root) return canonical;
  throw new OAuthError("invalid_target", "O recurso pedido não é este servidor MCP.");
}

// ── clientes ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface OAuthClient {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
}

const isLoopback = (u: URL) => u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";

function checkRedirectUri(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 2000) throw new OAuthError("invalid_redirect_uri", "redirect_uri inválido.");
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new OAuthError("invalid_redirect_uri", `redirect_uri inválido: ${raw}`);
  }
  if (u.hash) throw new OAuthError("invalid_redirect_uri", "redirect_uri não pode ter fragmento (#).");
  if (u.protocol !== "https:" && !(u.protocol === "http:" && isLoopback(u))) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uri precisa ser https (ou http em localhost).");
  }
  return raw;
}

/** Registro dinâmico (RFC 7591). */
export async function registerClient(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 10) {
    throw new OAuthError("invalid_redirect_uri", "Informe de 1 a 10 redirect_uris.");
  }
  const redirectUris = uris.map(checkRedirectUri);
  const grants = (body.grant_types as string[] | undefined) ?? ["authorization_code", "refresh_token"];
  if (!Array.isArray(grants) || grants.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
    throw new OAuthError("invalid_client_metadata", "grant_types suportados: authorization_code, refresh_token.");
  }
  const name = String(body.client_name ?? "").slice(0, 100);
  const clientId = secret("ocl_");
  const [row] = await admin()<{ created_at: Date }[]>`
    insert into open_api.oauth_clients (client_id, client_name, redirect_uris)
    values (${clientId}, ${name}, ${admin().array(redirectUris)}) returning created_at`;
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(row.created_at.getTime() / 1000),
    client_name: name,
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}

const cimdCache = new Map<string, { at: number; client: OAuthClient }>();

/** Client ID Metadata Document: o client_id é uma URL https que devolve os metadados do cliente. */
async function fetchClientMetadata(clientId: string): Promise<OAuthClient> {
  const hit = cimdCache.get(clientId);
  if (hit && hit.at > Date.now() - 5 * 60_000) return hit.client;
  const u = new URL(clientId);
  // só https público: nada de porta, loopback, IP literal ou nome interno (evita a API buscar endereços da rede interna)
  const ipLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname) || u.hostname.startsWith("[");
  if (u.protocol !== "https:" || isLoopback(u) || u.port || ipLiteral || !u.hostname.includes(".") || /\.(local|internal)$/.test(u.hostname)) {
    throw new OAuthError("invalid_client", "client_id inválido.");
  }
  const res = await fetch(clientId, { headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(5000) })
    .catch(() => null);
  if (!res?.ok) {
    await res?.body?.cancel();
    throw new OAuthError("invalid_client", "Não foi possível ler os metadados do cliente.");
  }
  const text = await res.text();
  if (text.length > 20_000) throw new OAuthError("invalid_client", "Metadados do cliente grandes demais.");
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new OAuthError("invalid_client", "Metadados do cliente inválidos.");
  }
  if (doc.client_id !== clientId || !Array.isArray(doc.redirect_uris)) {
    throw new OAuthError("invalid_client", "Metadados do cliente não conferem com o client_id.");
  }
  const client = { client_id: clientId, client_name: String(doc.client_name ?? u.host).slice(0, 100), redirect_uris: doc.redirect_uris.map(checkRedirectUri) };
  cimdCache.set(clientId, { at: Date.now(), client });
  return client;
}

export async function getClient(clientId: string | undefined): Promise<OAuthClient> {
  if (!clientId) throw new OAuthError("invalid_request", "client_id ausente.");
  if (clientId.startsWith("https://")) return await fetchClientMetadata(clientId);
  const [c] = await admin()<OAuthClient[]>`
    select client_id, client_name, redirect_uris from open_api.oauth_clients where client_id = ${clientId}`;
  if (!c) throw new OAuthError("invalid_client", "Cliente não registrado. Remova e adicione o conector de novo.");
  return c;
}

/** Igualdade exata; em loopback a porta pode variar (RFC 8252 §7.3). */
function redirectAllowed(client: OAuthClient, uri: string): boolean {
  if (client.redirect_uris.includes(uri)) return true;
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (!isLoopback(u)) return false;
  return client.redirect_uris.some((r) => {
    try {
      const x = new URL(r);
      return isLoopback(x) && x.protocol === u.protocol && x.hostname === u.hostname && x.pathname === u.pathname;
    } catch {
      return false;
    }
  });
}

// ── autorização ──────────────────────────────────────────────────────────────────────────────────────────────

export interface AuthorizeRequest {
  client: OAuthClient;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  resource: string;
}

/**
 * Valida os parâmetros do /authorize. Erros de cliente/redirect_uri não podem voltar ao redirect_uri (pode ser de
 * um atacante): saem com `redirectable=false`, e a página mostra o erro.
 */
export async function parseAuthorize(root: string, p: Record<string, string | undefined>): Promise<AuthorizeRequest> {
  const client = await getClient(p.client_id);
  if (!p.redirect_uri || !redirectAllowed(client, p.redirect_uri)) {
    throw new OAuthError("invalid_request", "redirect_uri não registrado para este cliente.");
  }
  const fail = (error: string, description: string) =>
    Object.assign(new OAuthError(error, description), { redirectUri: p.redirect_uri, state: p.state });
  if (p.response_type !== "code") throw fail("unsupported_response_type", "Use response_type=code.");
  if (!p.code_challenge || p.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(p.code_challenge)) {
    throw fail("invalid_request", "PKCE obrigatório: code_challenge com code_challenge_method=S256.");
  }
  let resource: string;
  try {
    resource = normalizeResource(root, p.resource);
  } catch (e) {
    throw fail("invalid_target", (e as Error).message);
  }
  return { client, redirectUri: p.redirect_uri, state: p.state, codeChallenge: p.code_challenge, resource };
}

export function redirectWith(uri: string, params: Record<string, string | undefined>): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
  return u.toString();
}

/** A pessoa aprovou: emite o código e devolve a URL de volta ao cliente. */
export async function issueCode(root: string, req: AuthorizeRequest, userId: string): Promise<string> {
  const code = secret("oac_");
  await admin()`
    insert into open_api.oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, resource, expires_at)
    values (${await hashUserKey(code)}, ${req.client.client_id}, ${userId}, ${req.redirectUri}, ${req.codeChallenge},
            ${req.resource}, now() + make_interval(secs => ${CODE_TTL_S}))`;
  await admin()`update open_api.oauth_clients set last_used_at = now() where client_id = ${req.client.client_id}`;
  return redirectWith(req.redirectUri, { code, state: req.state, iss: root });
}

// ── tokens ───────────────────────────────────────────────────────────────────────────────────────────────────

async function s256(verifier: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...d)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function issueTokens(familyId: string, clientId: string, userId: string, resource: string) {
  const access = secret("oat_");
  const refresh = secret("ort_");
  await admin()`
    insert into open_api.oauth_tokens (token_hash, kind, family_id, client_id, user_id, resource, expires_at) values
      (${await hashUserKey(access)}, 'access', ${familyId}, ${clientId}, ${userId}, ${resource}, now() + make_interval(secs => ${ACCESS_TTL_S})),
      (${await hashUserKey(refresh)}, 'refresh', ${familyId}, ${clientId}, ${userId}, ${resource}, now() + make_interval(secs => ${REFRESH_TTL_S}))`;
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: "open" };
}

async function assertActive(userId: string) {
  const [p] = await admin()<{ active: boolean; email: string | null }[]>`select active, email from public.profiles where id = ${userId}`;
  if (!p?.active) throw new OAuthError("invalid_grant", "Usuário desativado no Open.");
  const domain = config.allowedEmailDomain;
  if (domain !== "*" && !(p.email ?? "").toLowerCase().endsWith(`@${domain}`)) {
    throw new OAuthError("invalid_grant", `A API do Open é só para contas @${domain}.`);
  }
}

/** POST /oauth/token (application/x-www-form-urlencoded). */
export async function token(root: string, f: Record<string, string | undefined>) {
  if (f.grant_type === "authorization_code") {
    if (!f.code || !f.code_verifier || !f.redirect_uri || !f.client_id) {
      throw new OAuthError("invalid_request", "Informe code, code_verifier, redirect_uri e client_id.");
    }
    // consome o código de forma atômica: duas trocas simultâneas → só uma vence
    const [c] = await admin()<{ client_id: string; user_id: string; redirect_uri: string; code_challenge: string; resource: string }[]>`
      update open_api.oauth_codes set used_at = now()
      where code_hash = ${await hashUserKey(f.code)} and used_at is null and expires_at > now()
      returning client_id, user_id, redirect_uri, code_challenge, resource`;
    if (!c) throw new OAuthError("invalid_grant", "Código inválido, expirado ou já usado.");
    if (c.client_id !== f.client_id || c.redirect_uri !== f.redirect_uri) {
      throw new OAuthError("invalid_grant", "O código não foi emitido para este cliente/redirect_uri.");
    }
    if ((await s256(f.code_verifier)) !== c.code_challenge) throw new OAuthError("invalid_grant", "code_verifier não confere (PKCE).");
    if (f.resource && normalizeResource(root, f.resource) !== c.resource) throw new OAuthError("invalid_target", "Recurso diferente do autorizado.");
    await assertActive(c.user_id);
    return await issueTokens(crypto.randomUUID(), c.client_id, c.user_id, c.resource);
  }
  if (f.grant_type === "refresh_token") {
    if (!f.refresh_token || !f.client_id) throw new OAuthError("invalid_request", "Informe refresh_token e client_id.");
    const hash = await hashUserKey(f.refresh_token);
    const [t] = await admin()<{ family_id: string; client_id: string; user_id: string; resource: string; ok: boolean }[]>`
      with cur as (
        select token_hash, family_id, client_id, user_id, resource,
               (used_at is null and revoked_at is null and expires_at > now()) as ok
        from open_api.oauth_tokens where token_hash = ${hash} and kind = 'refresh'
      ), mark as (
        update open_api.oauth_tokens t set used_at = now() from cur
        where t.token_hash = cur.token_hash and cur.ok and t.used_at is null
        returning t.token_hash
      )
      select family_id, client_id, user_id, resource, (ok and exists (select 1 from mark)) as ok from cur`;
    if (!t) throw new OAuthError("invalid_grant", "Refresh token inválido.");
    if (!t.ok) {
      // reuso de um refresh já trocado (ou revogado): pode ter vazado → derruba a família toda
      await admin()`update open_api.oauth_tokens set revoked_at = now() where family_id = ${t.family_id} and revoked_at is null`;
      throw new OAuthError("invalid_grant", "Refresh token expirado, revogado ou já usado. Vincule o conector de novo.");
    }
    if (t.client_id !== f.client_id) throw new OAuthError("invalid_grant", "Refresh token de outro cliente.");
    await assertActive(t.user_id);
    return await issueTokens(t.family_id, t.client_id, t.user_id, t.resource);
  }
  throw new OAuthError("unsupported_grant_type", "grant_type suportados: authorization_code, refresh_token.");
}

/** RFC 7009: sempre 200; revogar um token derruba a família (acesso + renovação). */
export async function revoke(tokenValue: string | undefined) {
  if (!tokenValue) return;
  await admin()`
    update open_api.oauth_tokens set revoked_at = now()
    where revoked_at is null and family_id = (select family_id from open_api.oauth_tokens where token_hash = ${await hashUserKey(tokenValue)})`;
}

/** "Desconectar apps": revoga todos os tokens OAuth da pessoa. */
export async function revokeAllForUser(userId: string): Promise<number> {
  const rows = await admin()`
    update open_api.oauth_tokens set revoked_at = now() where user_id = ${userId} and revoked_at is null and expires_at > now()
    returning 1`;
  return rows.length;
}
