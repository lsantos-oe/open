// Autenticação e autorização.
//
// API OData e MCP: header `User-Key: ouk_...` (como na API do Ploomes). A chave age como a pessoa, com o mesmo
// acesso dela no Open (admin só se ela for admin no app). A cada request: chave existente, dono com
// profiles.active = true (usuário desligado perde acesso na hora, mesmo que o RLS do app não cheque isso),
// rate limit e auditoria.
//
// MCP: também aceita `Authorization: Bearer oat_...`, o token OAuth emitido quando a pessoa clica em "Vincular"
// no conector do Claude (lib/oauth.ts). Mesmas regras: age como a pessoa, active checado, rate limit.
//
// Página /api/minha-chave: sessão do Supabase (login Google) só para a pessoa ver/trocar a própria chave.
import { admin } from "./db.ts";
import { config } from "./config.ts";
import { ApiError, forbidden, unauthorized } from "./errors.ts";
import { hashUserKey, USER_KEY_RE } from "./userkeys.ts";
import { ACCESS_TOKEN_RE } from "./oauth.ts";

export type Scope = "read" | "write" | "admin";

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  role: "admin" | "member";
  scopes: Set<Scope>;
  kind: "user-key" | "session" | "oauth";
}

interface ProfileRow {
  id: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  role: "admin" | "member";
  active: boolean;
}

function toUser(p: ProfileRow, kind: AuthUser["kind"]): AuthUser {
  if (!p.active) throw forbidden("Usuário desativado no Open.");
  const scopes: Scope[] = ["read", "write"];
  if (p.role === "admin") scopes.push("admin");
  return { id: p.id, email: p.email, name: p.name, avatarUrl: p.avatar_url, role: p.role, scopes: new Set(scopes), kind };
}

const lastTouch = new Map<string, number>();

/** Autentica pelo header User-Key (API OData e MCP) e conta no rate limit — numa única ida ao banco. */
export async function authenticate(headers: Headers, cost = 1, limit = config.rateLimitPerMinute): Promise<AuthUser> {
  const key = headers.get("user-key")?.trim();
  if (!key) {
    if (/^Bearer\s/i.test(headers.get("authorization") ?? "")) {
      throw unauthorized("Esta API usa o header User-Key (não Bearer). Pegue a sua em /api/minha-chave.");
    }
    throw unauthorized("Envie o header User-Key com a sua chave (pegue em /api/minha-chave).");
  }
  if (!USER_KEY_RE.test(key)) throw unauthorized("User-Key inválida.");
  const [row] = await admin()<(ProfileRow & { rl_count: number })[]>`
    with u as (
      select p.id, p.email, p.name, p.avatar_url, p.role, p.active
      from open_api.user_keys k join public.profiles p on p.id = k.user_id
      where k.key_hash = ${await hashUserKey(key)}
    ), rl as (
      insert into open_api.rate_limits (bucket, window_start, count)
      select 'u:' || u.id, date_trunc('minute', now()), ${cost} from u
      on conflict (bucket, window_start) do update set count = open_api.rate_limits.count + excluded.count
      returning count
    )
    select u.*, (select count from rl) as rl_count from u`;
  if (!row) throw unauthorized("User-Key inválida ou trocada. Pegue a atual em /api/minha-chave.");
  const user = toUser(row, "user-key");
  if (row.rl_count > limit) throw tooMany(limit);
  const now = Date.now();
  if ((lastTouch.get(row.id) ?? 0) < now - 60_000) {
    lastTouch.set(row.id, now);
    admin()`update open_api.user_keys set last_used_at = now() where user_id = ${row.id}`.catch(() => {});
  }
  return user;
}

/**
 * MCP: User-Key (Claude Code, scripts) ou token OAuth (conector do Claude). Sem credencial → 401 com o desafio
 * Bearer que leva o Claude a abrir o login (o handler de erro monta o WWW-Authenticate).
 */
export async function authenticateMcp(headers: Headers, resource: string, cost = 1, limit = config.rateLimitPerMinute): Promise<AuthUser> {
  if (headers.get("user-key")) return await authenticate(headers, cost, limit);
  const m = /^Bearer\s+(\S+)$/i.exec(headers.get("authorization") ?? "");
  if (!m) throw Object.assign(unauthorized("Conecte-se: vincule o conector do Open no Claude ou envie o header User-Key."), { bearer: "" });
  if (!ACCESS_TOKEN_RE.test(m[1])) throw Object.assign(unauthorized("Token inválido."), { bearer: "invalid_token" });
  const [row] = await admin()<(ProfileRow & { rl_count: number })[]>`
    with u as (
      select p.id, p.email, p.name, p.avatar_url, p.role, p.active
      from open_api.oauth_tokens t join public.profiles p on p.id = t.user_id
      where t.token_hash = ${await hashUserKey(m[1])} and t.kind = 'access' and t.revoked_at is null
        and t.expires_at > now() and t.resource = ${resource}
    ), rl as (
      insert into open_api.rate_limits (bucket, window_start, count)
      select 'u:' || u.id, date_trunc('minute', now()), ${cost} from u
      on conflict (bucket, window_start) do update set count = open_api.rate_limits.count + excluded.count
      returning count
    )
    select u.*, (select count from rl) as rl_count from u`;
  if (!row) throw Object.assign(unauthorized("Token expirado ou revogado. Vincule o conector de novo."), { bearer: "invalid_token" });
  const user = toUser(row, "oauth");
  if (row.rl_count > limit) throw tooMany(limit);
  return user;
}

/** Limite por chave arbitrária (ex.: IP nas rotas públicas do OAuth). */
export async function rateLimitBucket(bucket: string, limit: number) {
  const [row] = await admin()<{ count: number }[]>`
    insert into open_api.rate_limits (bucket, window_start, count)
    values (${bucket}, date_trunc('minute', now()), 1)
    on conflict (bucket, window_start) do update set count = open_api.rate_limits.count + 1
    returning count`;
  if (row.count > limit) throw tooMany(limit);
}

function tooMany(limit: number) {
  return Object.assign(new ApiError(429, "TooManyRequests", `Limite de ${limit} requisições/minuto atingido.`), {
    retryAfter: 60 - new Date().getUTCSeconds(),
  });
}

/** Autentica pela sessão do Supabase (Authorization: Bearer <JWT do login Google>). Só para /api/user-key. */
export async function authenticateSession(headers: Headers): Promise<AuthUser> {
  const m = /^Bearer\s+(.+)$/i.exec(headers.get("authorization") ?? "");
  if (!m) throw unauthorized("Faça login para ver a sua chave.");
  if (!config.supabaseUrl || !config.anonKey) throw unauthorized("Login por sessão não configurado nesta instância.");
  const res = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: config.anonKey, Authorization: `Bearer ${m[1]}` },
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw unauthorized("Sessão expirada. Entre de novo.");
  }
  const { id } = await res.json() as { id: string };
  const [p] = await admin()<ProfileRow[]>`select id, email, name, avatar_url, role, active from public.profiles where id = ${id}`;
  if (!p) throw unauthorized("Perfil não encontrado no Open.");
  return toUser(p, "session");
}

export function requireScope(user: AuthUser, scope: Scope) {
  if (!user.scopes.has(scope)) {
    throw forbidden(scope === "admin" ? "Somente administradores do Open." : `Sem permissão de '${scope}'.`);
  }
  if (scope === "write" && !config.writeEnabled) {
    throw new ApiError(503, "WriteDisabled", "Escrita temporariamente desabilitada nesta instância da API.");
  }
}

/** Janela fixa de 1 minuto por pessoa. */
export async function rateLimit(user: AuthUser, cost = 1, limit = config.rateLimitPerMinute) {
  const [row] = await admin()<{ count: number }[]>`
    insert into open_api.rate_limits (bucket, window_start, count)
    values (${`u:${user.id}`}, date_trunc('minute', now()), ${cost})
    on conflict (bucket, window_start) do update set count = open_api.rate_limits.count + ${cost}
    returning count`;
  if (row.count > limit) throw tooMany(limit);
}
