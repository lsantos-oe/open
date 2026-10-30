// Roteamento OData v4: interpreta o resource path e despacha leitura/escrita.
//
//   GET    /odata/v1/                         service document
//   GET    /odata/v1/$metadata                CSDL
//   GET    /odata/v1/Me                       usuário autenticado
//   GET    /odata/v1/{Set}                    coleção (+ $filter $select $expand $orderby $top $skip $count $search)
//   QUERY  /odata/v1/{Set}                    idem, opções no corpo (método HTTP QUERY)
//   POST   /odata/v1/{Set}/$query             idem (padrão OData 4.01 — use se o QUERY for bloqueado)
//   GET    /odata/v1/{Set}/$count             contagem
//   POST   /odata/v1/{Set}                    cria
//   GET    /odata/v1/{Set}({id})              entidade
//   PATCH  /odata/v1/{Set}({id})              atualiza (If-Match opcional)
//   GET    /odata/v1/{Set}({id})/{Nav}        navegação
//   POST   /odata/v1/{Set}({id})/Open.{Action}
//   POST   /odata/v1/Open.{Action}            ação sem vínculo (Intake, MarkNotificationsRead)
//   GET    /odata/v1/Open.Search(q='...')     função sem vínculo
import type { AuthUser } from "../lib/auth.ts";
import { requireScope } from "../lib/auth.ts";
import { makeCtx } from "../lib/context.ts";
import { withUser } from "../lib/db.ts";
import { ApiError, badRequest, notFound } from "../lib/errors.ts";
import { buildCsdl } from "./csdl.ts";
import { ACTIONS, findAction, WRITES } from "./actions.ts";
import { parseOptions, type QueryOptions } from "./filter.ts";
import { SETS } from "./entities.ts";
import { readCollection, readNavigation, readOne, resolveSet } from "./read.ts";
import { abortIdempotent, beginIdempotent, finishIdempotent } from "../lib/idempotency.ts";
import * as templates from "../services/templates.ts";

export interface ODataResult {
  status: number;
  body?: unknown;
  headers?: Record<string, string | undefined>;
  text?: string;
  contentType?: string;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Seg {
  name: string;
  key?: string;
  args?: Record<string, string>;
}

function parseSeg(raw: string): Seg {
  const s = decodeURIComponent(raw);
  const m = /^([\w.$]+)(?:\((.*)\))?$/s.exec(s);
  if (!m) throw badRequest(`Segmento inválido: '${s}'.`);
  const name = m[1];
  const inside = m[2];
  if (inside === undefined) return { name };
  if (inside === "") return { name, args: {} };
  const keyM = /^(?:Id=)?'?([0-9a-fA-F-]{36})'?$/.exec(inside);
  if (keyM) return { name, key: keyM[1].toLowerCase() };
  // argumentos de função: q='texto',top=5
  const args: Record<string, string> = {};
  for (const part of inside.match(/(\w+)\s*=\s*('(?:[^']|'')*'|[^,]+)/g) ?? []) {
    const eq = part.indexOf("=");
    const k = part.slice(0, eq).trim();
    let v = part.slice(eq + 1).trim();
    if (v.startsWith("'")) v = v.slice(1, -1).replace(/''/g, "'");
    args[k] = v;
  }
  return { name, args };
}

/** Opções vindas do corpo (QUERY / $query): JSON {filter, select, ...} ou texto "$filter=...&$top=5". */
function optionsFromBody(body: string): (k: string) => string | undefined {
  const t = body.trim();
  if (!t) return () => undefined;
  if (t.startsWith("{")) {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(t);
    } catch {
      throw badRequest("Corpo da consulta não é JSON válido.");
    }
    const norm: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      const key = k.startsWith("$") ? k : `$${k}`;
      norm[key.toLowerCase()] = Array.isArray(v) ? v.join(",") : String(v);
    }
    return (k) => norm[k.toLowerCase()];
  }
  const sp = new URLSearchParams(t);
  return (k) => sp.get(k) ?? undefined;
}

function contextUrl(base: string, frag: string) {
  return `${base}/$metadata#${frag}`;
}

function nextLink(url: URL, top: number, skip: number) {
  const u = new URL(url);
  u.searchParams.set("$skip", String(skip + top));
  u.searchParams.set("$top", String(top));
  return u.toString();
}

export interface ODataRequest {
  method: string;
  url: URL;
  /** URL pública da raiz OData (…/odata/v1). */
  base: string;
  path: string; // depois de /odata/v1
  headers: Headers;
  bodyText: () => Promise<string>;
  user: AuthUser;
}

export async function handleOData(req: ODataRequest): Promise<ODataResult> {
  const { method, url, base, user } = req;
  const segs = req.path.split("/").filter(Boolean);
  const prefer = req.headers.get("prefer") ?? "";
  const dryRun = /\bdry-run\b/i.test(prefer);
  const returnMinimal = /return=minimal/i.test(prefer);

  // ── documentos de serviço
  if (!segs.length) {
    requireScope(user, "read");
    return {
      status: 200,
      body: {
        "@odata.context": contextUrl(base, ""),
        value: [
          ...Object.values(SETS).map((s) => ({ name: s.name, kind: "EntitySet", url: s.name })),
          { name: "Templates", kind: "EntitySet", url: "Templates" },
          { name: "Me", kind: "Singleton", url: "Me" },
          ...ACTIONS.filter((a) => !a.boundTo && a.kind === "function").map((a) => ({ name: a.name, kind: "FunctionImport", url: `Open.${a.name}` })),
        ],
      },
    };
  }
  if (segs[0] === "$metadata") {
    return { status: 200, text: buildCsdl(), contentType: "application/xml" };
  }
  if (segs[0] === "$batch") throw new ApiError(501, "NotImplemented", "$batch ainda não é suportado.");

  const first = parseSeg(segs[0]);

  // ── conjuntos especiais (fora do RLS do app; sempre do próprio usuário)
  if (first.name === "Templates") return await templates.route(req, first.key, segs.slice(1));
  if (first.name === "Me") {
    requireScope(user, "read");
    return {
      status: 200,
      body: {
        "@odata.context": contextUrl(base, "Me"),
        Id: user.id,
        Name: user.name,
        Email: user.email,
        Role: user.role === "admin" ? "Admin" : "Member",
        AvatarUrl: user.avatarUrl,
        Permissions: [...user.scopes],
      },
    };
  }

  // ── ações/funções sem vínculo: /Open.X
  if (first.name.startsWith("Open.")) {
    const action = findAction(first.name);
    if (!action) throw notFound(`Operação '${first.name}' não existe.`);
    return await runOperation(req, action, undefined, first.args ?? Object.fromEntries(url.searchParams), dryRun);
  }

  const set = resolveSet(first.name);

  // ── coleção
  if (!first.key) {
    const sub = segs[1];
    if (sub === "$count" && method === "GET") {
      requireScope(user, "read");
      const opts = parseOptions((k) => url.searchParams.get(k) ?? undefined);
      const page = await withUser(user, async (tx) => readCollection(await makeCtx(user, tx), set, { ...opts, top: 0, count: true }), {
        readOnly: true,
      });
      return { status: 200, text: String(page.count ?? 0), contentType: "text/plain" };
    }
    const isQuery = method === "QUERY" || (method === "POST" && sub === "$query");
    if (method === "GET" || isQuery) {
      if (sub && sub !== "$query") throw notFound();
      requireScope(user, "read");
      const get = isQuery ? optionsFromBody(await req.bodyText()) : (k: string) => url.searchParams.get(k) ?? undefined;
      const opts = parseOptions(get);
      const page = await withUser(user, async (tx) => readCollection(await makeCtx(user, tx), set, opts), { readOnly: true });
      const body: Record<string, unknown> = { "@odata.context": contextUrl(base, set.name) };
      if (page.count !== undefined) body["@odata.count"] = page.count;
      body.value = page.rows;
      if (page.hasMore) {
        if (isQuery) {
          // próxima página como GET equivalente (carrega as mesmas opções da consulta)
          const sp = new URLSearchParams();
          for (const k of ["$filter", "$select", "$expand", "$orderby", "$search", "$count"]) {
            const v = get(k);
            if (v) sp.set(k, v);
          }
          sp.set("$skip", String(page.skip + page.top));
          sp.set("$top", String(page.top));
          body["@odata.nextLink"] = `${base}/${set.name}?${sp.toString()}`;
        } else {
          body["@odata.nextLink"] = nextLink(url, page.top, page.skip);
        }
      }
      return { status: 200, body };
    }
    if (method === "POST" && !sub) {
      const w = WRITES[set.name];
      if (!w?.create) throw new ApiError(405, "MethodNotAllowed", `Não é possível criar ${set.name} pela API.`);
      requireScope(user, "write");
      return await idempotentWrite(req, async () => {
        const raw = await req.bodyText();
        const body = raw ? JSON.parse(raw) : {};
        const created = await withUser(user, async (tx) => {
          const ctx = await makeCtx(user, tx, dryRun);
          const id = await w.create!(ctx, body);
          return await readOne(ctx, set, id, { select: undefined, expand: undefined });
        }, { dryRun });
        return {
          status: dryRun ? 200 : 201,
          headers: dryRun ? { "Preference-Applied": "dry-run" } : { Location: `${base}/${set.name}(${created.Id})` },
          body: returnMinimal && !dryRun ? undefined : withContext(created, base, `${set.name}/$entity`, dryRun),
        };
      });
    }
    throw new ApiError(405, "MethodNotAllowed", `Método ${method} não suportado aqui.`);
  }

  // ── entidade por chave
  const id = first.key;
  if (!GUID.test(id)) throw badRequest("Chave precisa ser um Guid.");
  const second = segs[1] ? parseSeg(segs[1]) : undefined;

  if (!second) {
    if (method === "GET") {
      requireScope(user, "read");
      const opts = parseOptions((k) => url.searchParams.get(k) ?? undefined);
      const row = await withUser(user, async (tx) => readOne(await makeCtx(user, tx), set, id, opts), { readOnly: true });
      return { status: 200, body: withContext(row, base, `${set.name}/$entity`), headers: etagHeader(row) };
    }
    if (method === "PATCH" || method === "PUT") {
      if (method === "PUT") throw new ApiError(405, "MethodNotAllowed", "Use PATCH (atualização parcial).");
      const w = WRITES[set.name];
      if (!w?.update) throw new ApiError(405, "MethodNotAllowed", `Não é possível alterar ${set.name} pela API.`);
      requireScope(user, "write");
      return await idempotentWrite(req, async () => {
        const raw = await req.bodyText();
        const body = raw ? JSON.parse(raw) : {};
        const row = await withUser(user, async (tx) => {
          const ctx = await makeCtx(user, tx, dryRun);
          await w.update!(ctx, id, body, req.headers.get("if-match"));
          return await readOne(ctx, set, id, {});
        }, { dryRun });
        if (returnMinimal && !dryRun) return { status: 204 };
        return { status: 200, body: withContext(row, base, `${set.name}/$entity`, dryRun), headers: { ...etagHeader(row), ...(dryRun ? { "Preference-Applied": "dry-run" } : {}) } };
      });
    }
    if (method === "DELETE") {
      const w = WRITES[set.name];
      if (set.name !== "Comments" && !w?.delete) throw new ApiError(405, "MethodNotAllowed", "Exclusão não é permitida pela API nesta versão (use Archive quando existir).");
      requireScope(user, "write");
      await withUser(user, async (tx) => {
        if (w?.delete) return await w.delete(await makeCtx(user, tx, dryRun), id);
        const r = await tx`delete from comments where id = ${id} returning id`;
        if (!r.length) throw notFound("Comentário não encontrado ou sem permissão (só o autor ou admin apagam).");
      }, { dryRun });
      return dryRun ? { status: 200, body: { "@open.dryRun": true, deleted: id }, headers: { "Preference-Applied": "dry-run" } } : { status: 204 };
    }
    throw new ApiError(405, "MethodNotAllowed", `Método ${method} não suportado aqui.`);
  }

  // ── ação/função vinculada: /Set(id)/Open.X
  if (second.name.startsWith("Open.")) {
    const action = findAction(second.name, set.name);
    if (!action) throw notFound(`${set.name} não tem a operação '${second.name}'.`);
    return await runOperation(req, action, id, second.args, dryRun);
  }

  // ── navegação: /Set(id)/Nav
  if (method !== "GET") throw new ApiError(405, "MethodNotAllowed", "Navegação é somente leitura.");
  requireScope(user, "read");
  const opts = parseOptions((k) => url.searchParams.get(k) ?? undefined);
  if (segs[2] === "$count") {
    const r = await withUser(user, async (tx) => readNavigation(await makeCtx(user, tx), set, id, second.name, { ...opts, top: 0, count: true }), {
      readOnly: true,
    });
    return { status: 200, text: String(r.page?.count ?? (r.one ? 1 : 0)), contentType: "text/plain" };
  }
  const r = await withUser(user, async (tx) => readNavigation(await makeCtx(user, tx), set, id, second.name, opts), { readOnly: true });
  if (!r.many) {
    if (!r.one) throw notFound();
    return { status: 200, body: withContext(r.one, base, `${r.target.name}/$entity`) };
  }
  const body: Record<string, unknown> = { "@odata.context": contextUrl(base, `${set.name}(${id})/${second.name}`) };
  if (r.page!.count !== undefined) body["@odata.count"] = r.page!.count;
  body.value = r.page!.rows;
  if (r.page!.hasMore) body["@odata.nextLink"] = nextLink(url, r.page!.top, r.page!.skip);
  return { status: 200, body };
}

function withContext(row: Record<string, unknown>, base: string, frag: string, dryRun = false) {
  return { "@odata.context": contextUrl(base, frag), ...(dryRun ? { "@open.dryRun": true } : {}), ...row };
}

function etagHeader(row: Record<string, unknown>): Record<string, string> {
  const e = row["@odata.etag"];
  return typeof e === "string" ? { ETag: e } : {};
}

async function runOperation(
  req: ODataRequest,
  action: (typeof ACTIONS)[number],
  id: string | undefined,
  args: Record<string, string> | undefined,
  preferDryRun: boolean,
): Promise<ODataResult> {
  const { user, method, base } = req;
  if (action.kind === "function") {
    if (method !== "GET") throw new ApiError(405, "MethodNotAllowed", "Funções OData são chamadas com GET.");
    requireScope(user, "read");
    const result = await withUser(user, async (tx) => action.run(await makeCtx(user, tx), id, args ?? {}), { readOnly: true });
    return { status: 200, body: { "@odata.context": contextUrl(base, "Edm.Untyped"), value: result } };
  }
  if (method !== "POST") throw new ApiError(405, "MethodNotAllowed", "Actions OData são chamadas com POST.");
  requireScope(user, "write");
  return await idempotentWrite(req, async () => {
    const raw = await req.bodyText();
    const body = raw ? JSON.parse(raw) : {};
    // Intake simula por padrão (DryRun=true) — só grava com DryRun=false explícito.
    const dryRun = preferDryRun || (action.name === "Intake" && body?.DryRun !== false);
    const result = await withUser(user, async (tx) => {
      const ctx = await makeCtx(user, tx, dryRun);
      const out = await action.run(ctx, id, body);
      if (action.returnsEntity && id) {
        const target = action.returnsEntity === "self" ? resolveSet(action.boundTo!) : resolveSet(action.returnsEntity);
        const key = action.returnsEntity === "self" ? id : String(out);
        return withContext(await readOne(ctx, target, key, {}), base, `${target.name}/$entity`, dryRun);
      }
      return { "@odata.context": contextUrl(base, "Edm.Untyped"), ...(dryRun ? { "@open.dryRun": true } : {}), value: out ?? null };
    }, { dryRun });
    return { status: 200, body: result, headers: dryRun ? { "Preference-Applied": "dry-run" } : {} };
  });
}

async function idempotentWrite(req: ODataRequest, run: () => Promise<ODataResult>): Promise<ODataResult> {
  const key = req.headers.get("idempotency-key");
  if (!key) return await run();
  const raw = await req.bodyText();
  const start = await beginIdempotent(req.user.id, key, `${req.method} ${req.path} ${raw}`);
  if (start.hit) return { status: start.status, body: start.response, headers: { "Idempotent-Replayed": "true" } };
  let res: ODataResult;
  try {
    res = await run();
  } catch (e) {
    await abortIdempotent(req.user.id, key, start.hash);
    throw e;
  }
  const dry = (res.headers ?? {})["Preference-Applied"] === "dry-run";
  if (!dry && res.status < 300) await finishIdempotent(req.user.id, key, start.hash, res.status, res.body ?? null);
  else await abortIdempotent(req.user.id, key, start.hash);
  return res;
}

export type { QueryOptions };
