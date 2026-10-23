// Lexer + parser (descida recursiva) do subconjunto suportado de expressões OData v4:
//   eq ne gt ge lt le has in | and or not | ( ) | funções | caminhos com navegação | lambdas any/all
// Produz uma AST; a tradução para SQL fica em sql.ts.
import { badRequest } from "../lib/errors.ts";

export type Lit =
  | { t: "lit"; kind: "string"; v: string }
  | { t: "lit"; kind: "number"; v: number }
  | { t: "lit"; kind: "bool"; v: boolean }
  | { t: "lit"; kind: "null"; v: null }
  | { t: "lit"; kind: "guid" | "date" | "datetime"; v: string }
  | { t: "lit"; kind: "enum"; v: string; enumName: string };

export type Node =
  | Lit
  | { t: "path"; segs: string[]; lambda?: { op: "any" | "all"; v?: string; body?: Node } }
  | { t: "call"; fn: string; args: Node[] }
  | { t: "bin"; op: "and" | "or" | "eq" | "ne" | "gt" | "ge" | "lt" | "le" | "has"; l: Node; r: Node }
  | { t: "not"; e: Node }
  | { t: "in"; l: Node; list: Node[] };

type Tok =
  | { k: "(" | ")" | "," | "/" | ":" }
  | { k: "str"; v: string }
  | { k: "enum"; v: string; name: string }
  | { k: "num"; v: number }
  | { k: "guid" | "date" | "datetime"; v: string }
  | { k: "id"; v: string };

const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})/;
const DATE = /^\d{4}-\d{2}-\d{2}(?![\dT])/;
const NUM = /^-?\d+(\.\d+)?(?![\w-])/;
const IDENT = /^[A-Za-z_$][\w.$]*/;

function readString(src: string, i: number): [string, number] {
  // src[i] === "'"; '' escapa aspas
  let out = "";
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === "'") {
      if (src[j + 1] === "'") {
        out += "'";
        j += 2;
        continue;
      }
      return [out, j + 1];
    }
    out += src[j++];
  }
  throw badRequest("String sem aspas de fechamento no $filter.");
}

export function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if ("(),/:".includes(c)) {
      toks.push({ k: c as "(" });
      i++;
      continue;
    }
    if (c === "'") {
      const [v, j] = readString(src, i);
      toks.push({ k: "str", v });
      i = j;
      continue;
    }
    const rest = src.slice(i);
    let m = GUID.exec(rest);
    if (m) {
      toks.push({ k: "guid", v: m[0].toLowerCase() });
      i += m[0].length;
      continue;
    }
    if ((m = DATETIME.exec(rest))) {
      toks.push({ k: "datetime", v: m[0] });
      i += m[0].length;
      continue;
    }
    if ((m = DATE.exec(rest))) {
      toks.push({ k: "date", v: m[0] });
      i += m[0].length;
      continue;
    }
    if ((m = NUM.exec(rest))) {
      toks.push({ k: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if ((m = IDENT.exec(rest))) {
      const id = m[0];
      i += id.length;
      // enum qualificado: Open.TaskStatus'InProgress'
      if (src[i] === "'" && id.includes(".")) {
        const [v, j] = readString(src, i);
        toks.push({ k: "enum", v, name: id });
        i = j;
        continue;
      }
      toks.push({ k: "id", v: id });
      continue;
    }
    throw badRequest(`Caractere inesperado no $filter na posição ${i}: '${c}'.`);
  }
  return toks;
}

const CMP = new Set(["eq", "ne", "gt", "ge", "lt", "le", "has"]);
export const FUNCTIONS = new Set([
  "contains",
  "startswith",
  "endswith",
  "tolower",
  "toupper",
  "trim",
  "length",
  "year",
  "month",
  "day",
  "now",
  "date",
]);

class Parser {
  i = 0;
  constructor(private toks: Tok[]) {}

  peek(o = 0): Tok | undefined {
    return this.toks[this.i + o];
  }
  isKw(kw: string, o = 0): boolean {
    const t = this.peek(o);
    return t?.k === "id" && t.v.toLowerCase() === kw;
  }
  expect(k: Tok["k"]) {
    const t = this.toks[this.i++];
    if (!t || t.k !== k) throw badRequest(`$filter inválido: esperava '${k}'.`);
    return t;
  }

  parse(): Node {
    const n = this.or();
    if (this.i < this.toks.length) throw badRequest("$filter inválido: sobrou texto após a expressão.");
    return n;
  }
  or(): Node {
    let l = this.and();
    while (this.isKw("or")) {
      this.i++;
      l = { t: "bin", op: "or", l, r: this.and() };
    }
    return l;
  }
  and(): Node {
    let l = this.not();
    while (this.isKw("and")) {
      this.i++;
      l = { t: "bin", op: "and", l, r: this.not() };
    }
    return l;
  }
  not(): Node {
    if (this.isKw("not")) {
      this.i++;
      return { t: "not", e: this.not() };
    }
    return this.cmp();
  }
  cmp(): Node {
    const l = this.primary();
    const t = this.peek();
    if (t?.k === "id" && CMP.has(t.v.toLowerCase())) {
      this.i++;
      return { t: "bin", op: t.v.toLowerCase() as "eq", l, r: this.primary() };
    }
    if (this.isKw("in")) {
      this.i++;
      this.expect("(");
      const list: Node[] = [this.primary()];
      while (this.peek()?.k === ",") {
        this.i++;
        list.push(this.primary());
      }
      this.expect(")");
      return { t: "in", l, list };
    }
    return l;
  }
  primary(): Node {
    const t = this.toks[this.i++];
    if (!t) throw badRequest("$filter inválido: expressão incompleta.");
    switch (t.k) {
      case "(": {
        const n = this.or();
        this.expect(")");
        return n;
      }
      case "str":
        return { t: "lit", kind: "string", v: t.v };
      case "enum":
        return { t: "lit", kind: "enum", v: t.v, enumName: t.name };
      case "num":
        return { t: "lit", kind: "number", v: t.v };
      case "guid":
      case "date":
      case "datetime":
        return { t: "lit", kind: t.k, v: t.v };
      case "id": {
        const low = t.v.toLowerCase();
        if (low === "true" || low === "false") return { t: "lit", kind: "bool", v: low === "true" };
        if (low === "null") return { t: "lit", kind: "null", v: null };
        if (this.peek()?.k === "(" && FUNCTIONS.has(low)) {
          this.i++;
          const args: Node[] = [];
          if (this.peek()?.k !== ")") {
            args.push(this.or());
            while (this.peek()?.k === ",") {
              this.i++;
              args.push(this.or());
            }
          }
          this.expect(")");
          return { t: "call", fn: low, args };
        }
        return this.path(t.v);
      }
      default:
        throw badRequest("$filter inválido.");
    }
  }
  path(first: string): Node {
    const segs = [first];
    while (this.peek()?.k === "/") {
      this.i++;
      const nx = this.expect("id") as { k: "id"; v: string };
      const low = nx.v.toLowerCase();
      if ((low === "any" || low === "all") && this.peek()?.k === "(") {
        this.i++;
        if (this.peek()?.k === ")") {
          this.i++;
          if (low === "all") throw badRequest("all() exige uma expressão lambda.");
          return { t: "path", segs, lambda: { op: "any" } };
        }
        const v = (this.expect("id") as { v: string }).v;
        this.expect(":");
        const body = this.or();
        this.expect(")");
        return { t: "path", segs, lambda: { op: low as "any", v, body } };
      }
      segs.push(nx.v);
    }
    return { t: "path", segs };
  }
}

export function parseFilter(src: string): Node {
  if (src.length > 4000) throw badRequest("$filter grande demais.");
  return new Parser(lex(src)).parse();
}

// ─── demais query options ───────────────────────────────────────────────────

/** Divide por um separador respeitando parênteses e strings. */
export function splitTop(src: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0, inStr = false, cur = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "'") inStr = !inStr;
    if (!inStr) {
      if (c === "(") depth++;
      if (c === ")") depth--;
      if (c === sep && depth === 0) {
        out.push(cur);
        cur = "";
        continue;
      }
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

export interface OrderItem {
  path: string[];
  desc: boolean;
}

export function parseOrderBy(src: string): OrderItem[] {
  return splitTop(src, ",").map((part) => {
    const [path, dir] = part.split(/\s+/);
    if (dir && !/^(asc|desc)$/i.test(dir)) throw badRequest(`$orderby inválido: '${part}'.`);
    return { path: path.split("/"), desc: /^desc$/i.test(dir ?? "") };
  });
}

export interface QueryOptions {
  filter?: Node;
  select?: string[];
  expand?: ExpandItem[];
  orderby?: OrderItem[];
  top?: number;
  skip?: number;
  count?: boolean;
  search?: string;
}

export interface ExpandItem extends QueryOptions {
  nav: string;
}

function int(name: string, v: string): number {
  if (!/^\d+$/.test(v)) throw badRequest(`${name} precisa ser um inteiro não negativo.`);
  return Number(v);
}

export function parseOptions(get: (k: string) => string | undefined, depth = 0): QueryOptions {
  const o: QueryOptions = {};
  const f = get("$filter");
  if (f) o.filter = parseFilter(f);
  const s = get("$select");
  if (s) o.select = splitTop(s, ",").filter((x) => x !== "*");
  const ob = get("$orderby");
  if (ob) o.orderby = parseOrderBy(ob);
  const top = get("$top");
  if (top) o.top = int("$top", top);
  const skip = get("$skip") ?? get("$skiptoken");
  if (skip) o.skip = int("$skip", skip);
  const count = get("$count");
  if (count) o.count = count.toLowerCase() === "true";
  const search = get("$search");
  if (search) o.search = search.replace(/^"|"$/g, "");
  const ex = get("$expand");
  if (ex) {
    if (depth >= 2) throw badRequest("$expand suporta no máximo 2 níveis.");
    o.expand = splitTop(ex, ",").map((item) => {
      const m = /^([A-Za-z]\w*)(?:\((.*)\))?$/s.exec(item);
      if (!m) throw badRequest(`$expand inválido: '${item}'.`);
      const inner: Record<string, string> = {};
      for (const opt of splitTop(m[2] ?? "", ";")) {
        const eq = opt.indexOf("=");
        if (eq < 0) throw badRequest(`Opção de $expand inválida: '${opt}'.`);
        inner[opt.slice(0, eq).trim()] = opt.slice(eq + 1).trim();
      }
      return { nav: m[1], ...parseOptions((k) => inner[k], depth + 1) };
    });
  }
  return o;
}
