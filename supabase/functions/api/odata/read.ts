// Execução de leituras OData: coleção, entidade por chave, navegação, $count e $expand (até 2 níveis).
import type { Ctx } from "../lib/context.ts";
import { badRequest, notFound } from "../lib/errors.ts";
import { complexOut, type EntitySet, enumToMember, type Prop } from "./edm.ts";
import type { ExpandItem, QueryOptions } from "./filter.ts";
import { findSet, getSet, keyProp } from "./entities.ts";
import { findProp, Params, translateFilter, translateOrderBy, translateSearch } from "./sql.ts";

export const DEFAULT_TOP = 50;
export const MAX_TOP = 200;
const EXPAND_DEFAULT_TOP = 100;

export interface Page {
  rows: Record<string, unknown>[];
  count?: number;
  hasMore: boolean;
  top: number;
  skip: number;
}

/** Propriedades que entram no SELECT: $select, ou todas menos as "pesadas" (texto longo) em coleções. */
function selectedProps(set: EntitySet, select: string[] | undefined, single: boolean): Prop[] {
  if (select?.length) {
    const props: Prop[] = [];
    for (const name of select) {
      const pr = findProp(set, name);
      if (!pr) {
        if (set.navs.some((n) => n.name.toLowerCase() === name.toLowerCase())) continue; // nav em $select é ignorada (use $expand)
        throw badRequest(`$select: '${name}' não existe em ${set.name}.`);
      }
      props.push(pr);
    }
    const key = keyProp(set);
    if (!props.includes(key)) props.unshift(key);
    return props;
  }
  return set.props.filter((pr) => single || !pr.heavy);
}

function projection(set: EntitySet, props: Prop[], alias: string): string {
  const cols: string[] = [];
  for (const pr of props) {
    cols.push(`${pr.sql(alias)} as "${pr.name}"`);
    if (pr.post) for (const [k, f] of Object.entries(pr.post.deps)) cols.push(`${f(alias)} as "${k}"`);
  }
  if (set.etag) cols.push(`${set.etag(alias)} as "__etag"`);
  return [...new Set(cols)].join(", ");
}

function whereClause(set: EntitySet, opts: QueryOptions, alias: string, params: Params, extra?: string): string {
  const parts: string[] = [];
  if (set.base) parts.push(set.base(alias));
  if (extra) parts.push(extra);
  if (opts.filter) parts.push(translateFilter(opts.filter, { set, alias, params }));
  if (opts.search) parts.push(translateSearch(opts.search, { set, alias, params }));
  return parts.length ? parts.join(" and ") : "true";
}

function orderClause(set: EntitySet, opts: QueryOptions, alias: string, params: Params): string {
  if (!opts.orderby?.length) return set.defaultOrder(alias);
  return `${translateOrderBy(opts.orderby, { set, alias, params })}, ${alias}.id`;
}

/** Serializa uma linha do banco no formato OData (enums como membro, JSON → tipos complexos, ETag). */
function serialize(
  _set: EntitySet,
  props: Prop[],
  row: Record<string, unknown>,
  ctx: Ctx,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (row.__etag) out["@odata.etag"] = `W/"${row.__etag}"`;
  for (const pr of props) {
    let v = row[pr.name];
    if (pr.post) {
      v = pr.post.fn(row, { today: ctx.today, holidays: ctx.settings.holidays, workdays: ctx.settings.workdays });
    } else if (pr.complex && pr.collection) {
      v = Array.isArray(v) ? v.map((x) => complexOut(pr.complex!, x)).filter(Boolean) : [];
    } else if (pr.complex) {
      v = complexOut(pr.complex, v);
    } else if (pr.collection) {
      v = Array.isArray(v) ? v : [];
    } else if (pr.enum) {
      v = enumToMember(pr.enum, v);
    } else if (v instanceof Date) {
      v = v.toISOString();
    } else if (pr.type === "Edm.Int32" && typeof v === "string") {
      v = Number(v);
    }
    out[pr.name] = v ?? null;
  }
  return out;
}

/** Busca filhos de vários pais de uma vez (lateral join por pai, com $filter/$orderby/$top próprios). */
async function expandInto(
  ctx: Ctx,
  parentSet: EntitySet,
  parents: Record<string, unknown>[],
  items: ExpandItem[],
  depth: number,
) {
  if (!parents.length) return;
  const ids = parents.map((r) => r.Id as string);
  for (const item of items) {
    const nav = parentSet.navs.find((n) => n.name.toLowerCase() === item.nav.toLowerCase());
    if (!nav) throw badRequest(`$expand: '${item.nav}' não é navegação de ${parentSet.name}.`);
    const target = getSet(nav.target);
    const params = new Params();
    const idsParam = params.add(ids);
    const props = selectedProps(target, item.select, false);
    const c = `c${depth}`;
    const where = whereClause(target, item, c, params, nav.where("p", c));
    const order = item.orderby?.length
      ? orderClause(target, item, c, params)
      : nav.orderBy?.(c) ?? target.defaultOrder(c);
    const top = Math.min(item.top ?? (nav.many ? EXPAND_DEFAULT_TOP : 1), MAX_TOP);
    const skip = item.skip ?? 0;
    const sql = `select p.id::text as "__pk", x.* from ${parentSet.from("p")}
      cross join lateral (select ${projection(target, props, c)} from ${nav.from(c)} where ${where}
                          order by ${order} limit ${nav.many ? top : 1} offset ${nav.many ? skip : 0}) x
      where p.id = any(${idsParam}::uuid[])`;
    const rows = await ctx.tx.unsafe(sql, params.values as never[]);
    const byParent = new Map<string, Record<string, unknown>[]>();
    for (const r of rows as unknown as Record<string, unknown>[]) {
      const list = byParent.get(r.__pk as string) ?? [];
      list.push(serialize(target, props, r, ctx));
      byParent.set(r.__pk as string, list);
    }
    const children = [...byParent.values()].flat();
    if (item.expand?.length) await expandInto(ctx, target, children, item.expand, depth + 1);
    for (const parent of parents) {
      const list = byParent.get(parent.Id as string) ?? [];
      parent[nav.name] = nav.many ? list : list[0] ?? null;
    }
  }
}

export async function readCollection(
  ctx: Ctx,
  set: EntitySet,
  opts: QueryOptions,
  extra?: { where: (alias: string, params: Params) => string },
): Promise<Page> {
  const params = new Params();
  const a = "t";
  const top = Math.min(opts.top ?? DEFAULT_TOP, MAX_TOP);
  const skip = opts.skip ?? 0;
  const props = selectedProps(set, opts.select, false);
  const extraSql = extra?.where(a, params);
  const where = whereClause(set, opts, a, params, extraSql);
  const order = orderClause(set, opts, a, params);
  const sql = `select ${projection(set, props, a)} from ${set.from(a)} where ${where} order by ${order} limit ${
    top + 1
  } offset ${skip}`;
  const raw = await ctx.tx.unsafe(sql, params.values as never[]) as unknown as Record<string, unknown>[];
  const hasMore = raw.length > top;
  const rows = raw.slice(0, top).map((r) => serialize(set, props, r, ctx));
  let count: number | undefined;
  if (opts.count) {
    const [c] = await ctx.tx.unsafe(`select count(*)::int as n from ${set.from(a)} where ${where}`, params.values as never[]);
    count = (c as unknown as { n: number }).n;
  }
  if (opts.expand?.length) await expandInto(ctx, set, rows, opts.expand, 1);
  return { rows, count, hasMore, top, skip };
}

export async function readOne(
  ctx: Ctx,
  set: EntitySet,
  id: string,
  opts: Pick<QueryOptions, "select" | "expand">,
): Promise<Record<string, unknown>> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw badRequest("Chave precisa ser um Guid.");
  const params = new Params();
  const a = "t";
  const props = selectedProps(set, opts.select, true);
  const idp = params.add(id);
  const base = set.base ? ` and ${set.base(a)}` : "";
  const rows = await ctx.tx.unsafe(
    `select ${projection(set, props, a)} from ${set.from(a)} where ${a}.id = ${idp}::uuid${base}`,
    params.values as never[],
  ) as unknown as Record<string, unknown>[];
  if (!rows[0]) throw notFound(`${set.name}(${id}) não encontrado.`);
  const row = serialize(set, props, rows[0], ctx);
  if (opts.expand?.length) await expandInto(ctx, set, [row], opts.expand, 1);
  return row;
}

/** GET /Set(id)/Nav — coleção ou entidade relacionada. */
export async function readNavigation(
  ctx: Ctx,
  set: EntitySet,
  id: string,
  navName: string,
  opts: QueryOptions,
): Promise<{ target: EntitySet; many: boolean; page?: Page; one?: Record<string, unknown> | null }> {
  const nav = set.navs.find((n) => n.name.toLowerCase() === navName.toLowerCase());
  if (!nav) throw notFound(`${set.name} não tem a navegação '${navName}'.`);
  const target = getSet(nav.target);
  await readOne(ctx, set, id, { select: ["Id"] }); // 404 se o pai não existe/não é visível
  // Reaproveita o modelo: filhos = target onde existe o pai com aquela chave.
  const extra = {
    where: (alias: string, params: Params) => {
      const pid = params.add(id);
      return `exists (select 1 from ${set.from("p")} where p.id = ${pid}::uuid and ${nav.where("p", alias)})`;
    },
  };
  // FROM do alvo via navegação (tabelas de vínculo) quando necessário.
  const navTarget: EntitySet = { ...target, from: nav.from };
  const page = await readCollection(ctx, navTarget, { ...opts, orderby: opts.orderby }, extra);
  if (nav.many) return { target, many: true, page };
  return { target, many: false, one: page.rows[0] ?? null };
}

export function resolveSet(name: string): EntitySet {
  const s = findSet(name);
  if (!s) throw notFound(`Entity set '${name}' não existe. Veja /odata/v1/$metadata.`);
  return s;
}
