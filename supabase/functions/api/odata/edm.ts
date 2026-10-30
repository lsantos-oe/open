// Tipos do modelo OData (EDM) e enums/tipos complexos do domínio do Open.
// O modelo é declarativo: cada propriedade sabe gerar o próprio SQL a partir de um alias de tabela, o que
// permite usar a mesma definição no SELECT, no $filter, no $orderby e dentro de $expand (lateral joins).

export const NS = "Open";

export type EdmPrim =
  | "Edm.Guid"
  | "Edm.String"
  | "Edm.Boolean"
  | "Edm.Int32"
  | "Edm.Decimal"
  | "Edm.Date"
  | "Edm.DateTimeOffset";

export interface EnumType {
  name: string;
  /** Membro OData (PascalCase) → valor gravado no banco. */
  members: Record<string, string>;
}

export interface ComplexProp {
  name: string;
  /** Chave dentro do JSON gravado pelo app. */
  json: string;
  type: EdmPrim;
  enum?: EnumType;
}

export interface ComplexType {
  name: string;
  props: ComplexProp[];
}

export type Alias = string;
export type SqlOf = (a: Alias) => string;

export interface PostComputed {
  /** Colunas auxiliares (SQL) que o cálculo em TypeScript precisa. */
  deps: Record<string, SqlOf>;
  // deno-lint-ignore no-explicit-any
  fn: (row: Record<string, any>, env: { today: string; holidays: string[]; workdays: "mon-fri" | "mon-sat" }) => unknown;
}

export interface Prop {
  name: string;
  type: EdmPrim;
  sql: SqlOf;
  enum?: EnumType;
  complex?: ComplexType;
  collection?: boolean;
  /** Coleção guardada como array nativo do Postgres (ex.: uuid[]) em vez de jsonb. */
  pgArray?: boolean;
  nullable?: boolean;
  key?: boolean;
  /** Calculada (somente leitura). */
  computed?: boolean;
  /** Calculada em TypeScript depois da consulta: não filtrável/ordenável. */
  post?: PostComputed;
  /** Texto longo (markdown) — fica de fora do SELECT padrão de listas; venha via $select. */
  heavy?: boolean;
  description?: string;
}

export interface Nav {
  name: string;
  target: string;
  many: boolean;
  /** Cláusula FROM do alvo (pode conter joins com tabelas de vínculo). */
  from: (c: Alias) => string;
  /** Condição que liga o pai (alias p) ao alvo (alias c). */
  where: (p: Alias, c: Alias) => string;
  orderBy?: (c: Alias) => string;
}

export interface EntitySet {
  name: string;
  type: string;
  description: string;
  from: (a: Alias) => string;
  /** Filtro sempre aplicado (além do RLS). */
  base?: (a: Alias) => string;
  props: Prop[];
  navs: Nav[];
  search: SqlOf[];
  defaultOrder: (a: Alias) => string;
  /** Coluna de versão para ETag. */
  etag?: SqlOf;
}

// ─── helpers de definição ───────────────────────────────────────────────────

export const col = (c: string): SqlOf => (a) => `${a}."${c}"`;

export function p(name: string, type: EdmPrim, column: string | SqlOf, extra: Partial<Prop> = {}): Prop {
  return { name, type, sql: typeof column === "string" ? col(column) : column, ...extra };
}

/** Expressão de "hoje" no fuso do app, no banco. */
export const TODAY_SQL = "(now() at time zone 'America/Sao_Paulo')::date";

// ─── enums ──────────────────────────────────────────────────────────────────

const e = (name: string, members: Record<string, string>): EnumType => ({ name, members });

export const Enums = {
  TaskStatus: e("TaskStatus", {
    Pending: "pending",
    Todo: "todo",
    InProgress: "in_progress",
    Validation: "validation",
    Done: "done",
    Blocked: "blocked",
  }),
  TaskType: e("TaskType", { Task: "task", Milestone: "milestone", Meeting: "meeting" }),
  TaskScope: e("TaskScope", { Project: "project", Incident: "incident", Standalone: "standalone" }),
  RiskFlag: e("RiskFlag", { None: "none", Warning: "warning", Critical: "critical" }),
  ProjectStatus: e("ProjectStatus", { Backlog: "backlog", Planning: "planning", InProgress: "in_progress", Done: "done" }),
  ProjectType: e("ProjectType", { NovaConta: "nova_conta", NovoProjeto: "novo_projeto" }),
  ClientStatus: e("ClientStatus", {
    PreVenda: "pre_venda",
    Implantacao: "implantacao",
    SustentacaoNovosProjetos: "sustentacao_novos_projetos",
  }),
  IncidentStatus: e("IncidentStatus", {
    Open: "open",
    InProgress: "in_progress",
    WaitingOnClient: "waiting_on_client",
    Resolved: "resolved",
    Closed: "closed",
  }),
  Level: e("Level", { Low: "low", Medium: "medium", High: "high" }),
  OwnerType: e("OwnerType", { Member: "member", Text: "text", Contact: "contact" }),
  OwnerKind: e("OwnerKind", { Executor: "executor", Validator: "validator" }),
  UserRole: e("UserRole", { Admin: "admin", Member: "member" }),
  OpenPointStatus: e("OpenPointStatus", { Open: "open", Resolved: "resolved" }),
  DelayResponsibility: e("DelayResponsibility", {
    Internal: "internal",
    ClientBusiness: "client_business",
    ClientIt: "client_it",
    ClientProvider: "client_provider",
  }),
  DelayType: e("DelayType", { Execution: "execution", Definition: "definition", Planning: "planning" }),
  Language: e("Language", { Pt: "pt", En: "en", Es: "es" }),
  MeetingItemType: e("MeetingItemType", { Action: "action", Decision: "decision", Info: "info" }),
  DocKind: e("DocKind", { Link: "link", File: "file", Text: "text" }),
  DocAudience: e("DocAudience", { Technical: "technical", Executive: "executive", Both: "both" }),
  DocSource: e("DocSource", { Direct: "direct", Task: "task" }),
};

export function enumToMember(en: EnumType, dbValue: unknown): string | null {
  if (dbValue == null) return null;
  for (const [m, v] of Object.entries(en.members)) if (v === dbValue) return m;
  return String(dbValue);
}

/** Aceita 'InProgress', "Open.TaskStatus'InProgress'" (já sem prefixo) ou o próprio valor do banco ('in_progress'). */
export function memberToDb(en: EnumType, input: string): string | undefined {
  if (input in en.members) return en.members[input];
  const lower = input.toLowerCase();
  for (const [m, v] of Object.entries(en.members)) if (m.toLowerCase() === lower || v === input) return v;
  return undefined;
}

// ─── tipos complexos ────────────────────────────────────────────────────────

export const Complex = {
  Owner: {
    name: "Owner",
    props: [
      { name: "Id", json: "id", type: "Edm.String" },
      { name: "Type", json: "type", type: "Edm.String", enum: Enums.OwnerType },
      { name: "UserId", json: "memberId", type: "Edm.Guid" },
      { name: "ContactId", json: "contactId", type: "Edm.Guid" },
      { name: "Name", json: "name", type: "Edm.String" },
      { name: "Kind", json: "kind", type: "Edm.String", enum: Enums.OwnerKind },
    ],
  } as ComplexType,
  Link: {
    name: "Link",
    props: [
      { name: "Id", json: "id", type: "Edm.String" },
      { name: "Label", json: "label", type: "Edm.String" },
      { name: "Url", json: "url", type: "Edm.String" },
    ],
  } as ComplexType,
  TeamMember: {
    name: "TeamMember",
    props: [
      { name: "Id", json: "id", type: "Edm.String" },
      { name: "Name", json: "name", type: "Edm.String" },
      { name: "Role", json: "role", type: "Edm.String" },
      { name: "Email", json: "email", type: "Edm.String" },
      { name: "UserId", json: "user_id", type: "Edm.Guid" },
    ],
  } as ComplexType,
  ActionTask: {
    name: "ActionTask",
    props: [
      { name: "Id", json: "id", type: "Edm.String" },
      { name: "Description", json: "description", type: "Edm.String" },
      { name: "Responsible", json: "responsible", type: "Edm.String" },
      { name: "DueDate", json: "due_date", type: "Edm.Date" },
      { name: "Done", json: "done", type: "Edm.Boolean" },
    ],
  } as ComplexType,
  MeetingItem: {
    name: "MeetingItem",
    props: [
      { name: "Id", json: "id", type: "Edm.String" },
      { name: "Text", json: "text", type: "Edm.String" },
      { name: "Done", json: "done", type: "Edm.Boolean" },
      { name: "Type", json: "type", type: "Edm.String", enum: Enums.MeetingItemType },
      { name: "Responsible", json: "responsible", type: "Edm.String" },
      { name: "DueDate", json: "dueDate", type: "Edm.Date" },
    ],
  } as ComplexType,
  Subtask: {
    name: "Subtask",
    props: [
      { name: "Id", json: "id", type: "Edm.String" },
      { name: "Type", json: "type", type: "Edm.String", enum: Enums.TaskType },
      { name: "Name", json: "name", type: "Edm.String" },
      { name: "Status", json: "status", type: "Edm.String", enum: Enums.TaskStatus },
      { name: "Responsible", json: "responsible", type: "Edm.String" },
      { name: "ResponsibleUserId", json: "responsible_member_id", type: "Edm.Guid" },
      { name: "PlannedStart", json: "planned_start", type: "Edm.Date" },
      { name: "PlannedEnd", json: "planned_end", type: "Edm.Date" },
      { name: "PlannedDate", json: "planned_date", type: "Edm.Date" },
      { name: "ActualStart", json: "actual_start", type: "Edm.Date" },
      { name: "ActualEnd", json: "actual_end", type: "Edm.Date" },
      { name: "DurationDays", json: "duration_days", type: "Edm.Int32" },
    ],
  } as ComplexType,
};

/** JSON do app → objeto OData (PascalCase, enums como membro). */
// deno-lint-ignore no-explicit-any
export function complexOut(ct: ComplexType, v: any): Record<string, unknown> | null {
  if (v == null || typeof v !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const cp of ct.props) {
    const raw = v[cp.json];
    out[cp.name] = cp.enum ? enumToMember(cp.enum, raw) : raw ?? null;
  }
  return out;
}
