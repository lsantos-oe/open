// Tradução da AST de $filter/$orderby para SQL parametrizado, usando só colunas declaradas no EDM
// (whitelist): nenhum identificador vindo do cliente entra cru no SQL.
import { badRequest } from "../lib/errors.ts";
import { type ComplexType, type EdmPrim, type EntitySet, type EnumType, memberToDb, type Prop } from "./edm.ts";
import type { Lit, Node, OrderItem } from "./filter.ts";
import { getSet } from "./entities.ts";

export class Params {
  values: unknown[] = [];
  add(v: unknown): string {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

const CAST: Record<EdmPrim, string> = {
  "Edm.Guid": "::uuid",
  "Edm.String": "::text",
  "Edm.Boolean": "::boolean",
  "Edm.Int32": "::int",
  "Edm.Decimal": "::numeric",
  "Edm.Date": "::date",
  "Edm.DateTimeOffset": "::timestamptz",
};

interface Typed {
  sql: string;
  type: EdmPrim;
  enum?: EnumType;
}

type Expr = Typed | { lit: Lit };

type Var =
  | { kind: "complex"; alias: string; complex: ComplexType }
  | { kind: "prim"; alias: string; type: EdmPrim }
  | { kind: "entity"; alias: string; set: EntitySet };

let aliasSeq = 0;
const nextAlias = (base: string) => `${base}${++aliasSeq}`;

export interface FilterScope {
  set: EntitySet;
  alias: string;
  params: Params;
  vars?: Map<string, Var>;
}

export function findProp(set: EntitySet, name: string): Prop | undefined {
  return set.props.find((p) => p.name === name) ?? set.props.find((p) => p.name.toLowerCase() === name.toLowerCase());
}

function litType(l: Lit): EdmPrim | null {
  switch (l.kind) {
    case "string":
    case "enum":
      return "Edm.String";
    case "number":
      return Number.isInteger(l.v) ? "Edm.Int32" : "Edm.Decimal";
    case "bool":
      return "Edm.Boolean";
    case "guid":
      return "Edm.Guid";
    case "date":
      return "Edm.Date";
    case "datetime":
      return "Edm.DateTimeOffset";
    default:
      return null;
  }
}

/** Emite um literal com o tipo do outro operando (cast + tradução de enum). */
function emitLit(l: Lit, other: Typed | null, params: Params): Typed {
  if (other?.enum && (l.kind === "string" || l.kind === "enum")) {
    const db = memberToDb(other.enum, String(l.v));
    if (db === undefined) {
      throw badRequest(
        `Valor '${l.v}' inválido para ${other.enum.name}. Use um de: ${Object.keys(other.enum.members).join(", ")}.`,
      );
    }
    return { sql: params.add(db), type: "Edm.String", enum: other.enum };
  }
  const type = other?.type ?? litType(l) ?? "Edm.String";
  if (l.kind === "null") return { sql: "null", type };
  let v: unknown = l.v;
  if (type === "Edm.Guid" && typeof v === "string" && !/^[0-9a-f-]{36}$/i.test(v)) {
    throw badRequest(`'${v}' não é um Guid válido.`);
  }
  if (type === "Edm.Date" && typeof v === "string") v = v.slice(0, 10);
  if (type === "Edm.Boolean" && typeof v !== "boolean") throw badRequest(`Esperava true/false, recebeu '${v}'.`);
  return { sql: `${params.add(v)}${CAST[type]}`, type };
}

function asTyped(e: Expr, other: Expr | null, params: Params): Typed {
  if ("lit" in e) return emitLit(e.lit, other && !("lit" in other) ? other : null, params);
  return e;
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

export function translateFilter(node: Node, scope: FilterScope): string {
  const t = toExpr(node, scope);
  if ("lit" in t) {
    if (t.lit.kind === "bool") return t.lit.v ? "true" : "false";
    throw badRequest("$filter precisa ser uma expressão booleana.");
  }
  if (t.type !== "Edm.Boolean") throw badRequest("$filter precisa ser uma expressão booleana.");
  return t.sql;
}

function bool(sql: string): Typed {
  return { sql, type: "Edm.Boolean" };
}

function toBoolSql(e: Expr, scope: FilterScope): string {
  if ("lit" in e) {
    if (e.lit.kind === "bool") return e.lit.v ? "true" : "false";
    throw badRequest("Operando de and/or/not precisa ser booleano.");
  }
  if (e.type !== "Edm.Boolean") throw badRequest("Operando de and/or/not precisa ser booleano.");
  void scope;
  return `(${e.sql}) is true`;
}

function toExpr(node: Node, scope: FilterScope): Expr {
  switch (node.t) {
    case "lit":
      return { lit: node };
    case "not":
      return bool(`not (${toBoolSql(toExpr(node.e, scope), scope)})`);
    case "bin": {
      if (node.op === "and" || node.op === "or") {
        const l = toBoolSql(toExpr(node.l, scope), scope);
        const r = toBoolSql(toExpr(node.r, scope), scope);
        return bool(`(${l} ${node.op} ${r})`);
      }
      return compare(node.op, toExpr(node.l, scope), toExpr(node.r, scope), scope.params);
    }
    case "in": {
      const l = toExpr(node.l, scope);
      if ("lit" in l) throw badRequest("O lado esquerdo de 'in' precisa ser uma propriedade.");
      const items = node.list.map((n) => asTyped(toExpr(n, scope), l, scope.params).sql);
      return bool(`${l.sql} in (${items.join(", ")})`);
    }
    case "call":
      return call(node.fn, node.args.map((a) => toExpr(a, scope)), scope);
    case "path":
      return path(node, scope);
  }
}

function compare(op: string, le: Expr, re: Expr, params: Params): Typed {
  const lNull = "lit" in le && le.lit.kind === "null";
  const rNull = "lit" in re && re.lit.kind === "null";
  if (lNull || rNull) {
    const side = lNull ? re : le;
    if ("lit" in side) throw badRequest("Comparação entre dois literais não é suportada.");
    if (op === "eq") return bool(`${side.sql} is null`);
    if (op === "ne") return bool(`${side.sql} is not null`);
    throw badRequest("null só pode ser comparado com eq/ne.");
  }
  if ("lit" in le && "lit" in re) throw badRequest("Comparação entre dois literais não é suportada.");
  const l = asTyped(le, re, params);
  const r = asTyped(re, le, params);
  const sqlOp = { eq: "=", ne: "is distinct from", gt: ">", ge: ">=", lt: "<", le: "<=", has: "=" }[op]!;
  if ((l.enum || r.enum) && !["eq", "ne", "has"].includes(op)) {
    throw badRequest("Enums só aceitam eq, ne, has e in.");
  }
  return bool(`${l.sql} ${sqlOp} ${r.sql}`);
}

function call(fn: string, args: Expr[], scope: FilterScope): Typed {
  const need = (n: number) => {
    if (args.length !== n) throw badRequest(`${fn}() espera ${n} argumento(s).`);
  };
  const str = (e: Expr) => asTyped(e, { sql: "", type: "Edm.String" }, scope.params).sql;
  switch (fn) {
    case "contains":
    case "startswith":
    case "endswith": {
      need(2);
      const target = str(args[0]);
      const pat = args[1];
      if ("lit" in pat && pat.lit.kind === "string") {
        const s = escapeLike(pat.lit.v);
        const v = fn === "contains" ? `%${s}%` : fn === "startswith" ? `${s}%` : `%${s}`;
        return bool(`${target} ilike ${scope.params.add(v)}`);
      }
      const p = str(pat);
      const expr = fn === "contains"
        ? `position(lower(${p}) in lower(${target})) > 0`
        : fn === "startswith"
        ? `lower(${target}) like lower(${p}) || '%'`
        : `lower(${target}) like '%' || lower(${p})`;
      return bool(expr);
    }
    case "tolower":
      need(1);
      return { sql: `lower(${str(args[0])})`, type: "Edm.String" };
    case "toupper":
      need(1);
      return { sql: `upper(${str(args[0])})`, type: "Edm.String" };
    case "trim":
      need(1);
      return { sql: `btrim(${str(args[0])})`, type: "Edm.String" };
    case "length":
      need(1);
      return { sql: `char_length(${str(args[0])})`, type: "Edm.Int32" };
    case "year":
    case "month":
    case "day": {
      need(1);
      const a = args[0];
      if ("lit" in a) throw badRequest(`${fn}() espera uma propriedade de data.`);
      return { sql: `extract(${fn} from ${a.sql})::int`, type: "Edm.Int32" };
    }
    case "now":
      need(0);
      return { sql: "now()", type: "Edm.DateTimeOffset" };
    case "date": {
      need(1);
      const a = args[0];
      if ("lit" in a) throw badRequest("date() espera uma propriedade ou now().");
      return {
        sql: a.type === "Edm.Date" ? a.sql : `(${a.sql} at time zone 'America/Sao_Paulo')::date`,
        type: "Edm.Date",
      };
    }
  }
  throw badRequest(`Função não suportada: ${fn}().`);
}

/** Resolve caminhos: Prop, Nav/Prop, Complex/Prop, var/Prop, Collection/any(...). */
function path(node: Extract<Node, { t: "path" }>, scope: FilterScope): Typed {
  const segs = [...node.segs];
  let set: EntitySet | null = scope.set;
  let alias = scope.alias;
  let complex: { ct: ComplexType; sql: string } | null = null;
  let current: Typed | null = null;
  let primCollection: { sql: string; type: EdmPrim; pg?: boolean } | null = null;
  let complexCollection: { sql: string; ct: ComplexType } | null = null;
  let navCollection: { set: EntitySet; from: string; where: string; alias: string } | null = null;

  // variável de lambda no início do caminho
  const v = scope.vars?.get(segs[0]);
  if (v) {
    segs.shift();
    if (v.kind === "prim") {
      if (segs.length) throw badRequest("Variável de coleção primitiva não tem propriedades.");
      return { sql: `${v.alias}.val`, type: v.type };
    }
    if (v.kind === "complex") {
      set = null;
      complex = { ct: v.complex, sql: `${v.alias}.val` };
    } else {
      set = v.set;
      alias = v.alias;
    }
    if (!segs.length) throw badRequest("Use variavel/Propriedade dentro da lambda.");
  }

  while (segs.length) {
    const name = segs.shift()!;
    if (complex) {
      const cp = complex.ct.props.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (!cp) throw badRequest(`Propriedade '${name}' não existe em ${complex.ct.name}.`);
      const raw = `(${complex.sql}->>'${cp.json}')`;
      current = {
        sql: cp.type === "Edm.String" ? raw : `${raw}${CAST[cp.type]}`,
        type: cp.type,
        enum: cp.enum,
      };
      complex = null;
      continue;
    }
    if (!set) throw badRequest(`Caminho inválido em '${node.segs.join("/")}'.`);
    const prop = findProp(set, name);
    if (prop) {
      if (prop.post) throw badRequest(`'${prop.name}' é calculada fora do banco e não pode ser usada em $filter/$orderby.`);
      const sql = prop.sql(alias);
      if (prop.collection && prop.complex) complexCollection = { sql, ct: prop.complex };
      else if (prop.collection) primCollection = { sql, type: prop.type, pg: prop.pgArray };
      else if (prop.complex) complex = { ct: prop.complex, sql };
      else current = { sql, type: prop.type, enum: prop.enum };
      set = null;
      continue;
    }
    const nav = set.navs.find((n) => n.name.toLowerCase() === name.toLowerCase());
    if (!nav) throw badRequest(`Propriedade '${name}' não existe em ${set.name}.`);
    const target = getSet(nav.target);
    const na = nextAlias("n");
    const base = target.base ? ` and ${target.base(na)}` : "";
    if (nav.many) {
      navCollection = { set: target, from: nav.from(na), where: nav.where(alias, na) + base, alias: na };
      set = null;
      continue;
    }
    // navegação de valor único: o resto do caminho vira subconsulta escalar
    const rest: Node = { t: "path", segs: segs.splice(0) };
    const inner = path(rest as Extract<Node, { t: "path" }>, { ...scope, set: target, alias: na });
    return {
      sql: `(select ${inner.sql} from ${nav.from(na)} where ${nav.where(alias, na)}${base} limit 1)`,
      type: inner.type,
      enum: inner.enum,
    };
  }

  const lam = node.lambda;
  if (lam) {
    const vars = new Map(scope.vars ?? []);
    let source: string, where = "true";
    const la = nextAlias("l");
    if (primCollection) {
      source = primCollection.pg
        ? `unnest(${primCollection.sql}) as ${la}(val)`
        : `jsonb_array_elements_text(coalesce(${primCollection.sql}, '[]'::jsonb)) as ${la}(val)`;
      if (lam.v) vars.set(lam.v, { kind: "prim", alias: la, type: primCollection.type });
    } else if (complexCollection) {
      source = `jsonb_array_elements(case when jsonb_typeof(${complexCollection.sql}) = 'array' then ${complexCollection.sql} else '[]'::jsonb end) as ${la}(val)`;
      if (lam.v) vars.set(lam.v, { kind: "complex", alias: la, complex: complexCollection.ct });
    } else if (navCollection) {
      source = navCollection.from;
      where = navCollection.where;
      if (lam.v) vars.set(lam.v, { kind: "entity", alias: navCollection.alias, set: navCollection.set });
    } else {
      throw badRequest("any()/all() só se aplica a coleções.");
    }
    if (!lam.body) return bool(`exists (select 1 from ${source} where ${where})`);
    const body = toBoolSql(toExpr(lam.body, { ...scope, vars }), scope);
    return lam.op === "any"
      ? bool(`exists (select 1 from ${source} where ${where} and ${body})`)
      : bool(`not exists (select 1 from ${source} where ${where} and not (${body}))`);
  }

  if (current) return current;
  if (primCollection || complexCollection || navCollection || complex) {
    throw badRequest(`'${node.segs.join("/")}' é coleção/objeto: use any()/all() ou uma propriedade dele.`);
  }
  throw badRequest(`Caminho inválido: '${node.segs.join("/")}'.`);
}

/** $orderby → "expr asc|desc nulls last" (só propriedades escalares, inclusive via navegação única). */
export function translateOrderBy(items: OrderItem[], scope: FilterScope): string {
  return items.map((it) => {
    const e = path({ t: "path", segs: it.path }, scope);
    return `${e.sql} ${it.desc ? "desc" : "asc"} nulls last`;
  }).join(", ");
}

/** $search: todas as palavras precisam aparecer em algum dos campos de busca (sem diferenciar maiúsculas). */
export function translateSearch(q: string, scope: FilterScope): string {
  const words = q.split(/\s+/).map((w) => w.trim()).filter(Boolean).slice(0, 8);
  if (!words.length || !scope.set.search.length) return "true";
  return words.map((w) => {
    const pv = scope.params.add(`%${escapeLike(w)}%`);
    return "(" + scope.set.search.map((f) => `${f(scope.alias)} ilike ${pv}`).join(" or ") + ")";
  }).join(" and ");
}
