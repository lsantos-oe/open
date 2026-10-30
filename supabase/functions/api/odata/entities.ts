// Modelo OData do Open: entity sets ↔ tabelas do app (schema public), sem alterar nada no banco.
// Colunas conferidas com o schema de produção (schema-export, 21/10/2026).
import { parseISO } from "date-fns";
import { workdaysBetween, parseHolidays } from "../domain/businessDays.ts";
import { col, Complex, type EntitySet, Enums, type Nav, p, type Prop, TODAY_SQL } from "./edm.ts";

/** Código curto (C26000123): letra da entidade + ano (2 dígitos) + sequência de 6 dígitos. Estável; o app abre /r/<código>. */
const codeProp = () =>
  p("Code", "Edm.String", "code", {
    description: "Código curto (ex.: C26000123): letra da entidade + ano (2 dígitos) + sequência de 6 dígitos. Não muda. O app abre /r/<código>.",
  });

const tz = (sql: string) => `(${sql} at time zone 'America/Sao_Paulo')::date`;
const xmin = (a: string) => `${a}.xmin::text`;

// ─── Tasks (entries) ────────────────────────────────────────────────────────
const dueSql = (a: string) => `(case when ${a}.type = 'task' then ${a}.planned_end else ${a}.planned_date end)`;
const startSql = (a: string) => `(case when ${a}.type = 'task' then ${a}.planned_start else ${a}.planned_date end)`;
/** Etapa efetiva: status legado 'overdue' é reconstruído pelas datas (mesma regra de boardStatus no front). */
const statusSql = (a: string) =>
  `(case when ${a}.status = 'overdue' then (case when ${a}.actual_end is not null then 'done' when ${
    startSql(a)
  } <= ${TODAY_SQL} then 'in_progress' else 'pending' end) else coalesce(${a}.status, 'pending') end)`;
const lateSql = (a: string) =>
  `(${a}.actual_end is null and ${statusSql(a)} <> 'done' and ${dueSql(a)} < ${TODAY_SQL})`;

const taskNavs: Nav[] = [
  { name: "Project", target: "Projects", many: false, from: (c) => `public.projects ${c}`, where: (p, c) => `${c}.id = ${p}.project_id` },
  { name: "Phase", target: "Phases", many: false, from: (c) => `public.phases ${c}`, where: (p, c) => `${c}.id = ${p}.phase_id` },
  { name: "Incident", target: "Incidents", many: false, from: (c) => `public.incidents ${c}`, where: (p, c) => `${c}.id = ${p}.incident_id` },
  { name: "Client", target: "Clients", many: false, from: (c) => `public.clients ${c}`, where: (p, c) => `${c}.id = ${p}.client_id` },
  {
    name: "Comments",
    target: "Comments",
    many: true,
    from: (c) => `public.comments ${c}`,
    where: (p, c) => `${c}.entry_id = ${p}.id`,
    orderBy: (c) => `${c}.created_at asc`,
  },
  {
    name: "Dependencies",
    target: "Tasks",
    many: true,
    from: (c) => `public.entries ${c}`,
    where: (p, c) => `${p}.depends_on ? ${c}.id::text`,
  },
  { name: "DelayLogs", target: "DelayLogs", many: true, from: (c) => `public.delay_log ${c}`, where: (p, c) => `${c}.entry_id = ${p}.id` },
];

const Tasks: EntitySet = {
  name: "Tasks",
  type: "Task",
  description:
    "Tarefas, marcos (Milestone) e reuniões (Meeting). Uma tarefa vive em um projeto (com fase), em um incidente, ou é avulsa (Standalone, opcionalmente ligada a um cliente).",
  from: (a) => `public.entries ${a}`,
  props: [
    p("Id", "Edm.Guid", "id", { key: true, nullable: false }),
    codeProp(),
    p("Type", "Edm.String", "type", { enum: Enums.TaskType, nullable: false }),
    p("Name", "Edm.String", "name", { nullable: false }),
    p("Description", "Edm.String", "description", { heavy: true, description: "Markdown." }),
    p("Status", "Edm.String", statusSql, { enum: Enums.TaskStatus, nullable: false, description: "Etapa (raia do kanban)." }),
    p("StatusOverride", "Edm.Boolean", (a) => `coalesce(${a}.status_override, false)`, {
      description: "true quando a etapa foi escolhida manualmente (não é recalculada pelas datas).",
    }),
    p("RiskFlag", "Edm.String", (a) => `coalesce(${a}.risk_flag, 'none')`, { enum: Enums.RiskFlag }),
    p("Scope", "Edm.String", (a) =>
      `(case when ${a}.project_id is not null then 'project' when ${a}.incident_id is not null then 'incident' else 'standalone' end)`, {
      enum: Enums.TaskScope,
      computed: true,
    }),
    p("ProjectId", "Edm.Guid", "project_id"),
    p("PhaseId", "Edm.Guid", "phase_id"),
    p("IncidentId", "Edm.Guid", "incident_id"),
    p("ClientIds", "Edm.Guid", (a) => `coalesce(${a}.client_ids, '{}'::uuid[])`, {
      collection: true,
      pgArray: true,
      description: "Clientes da tarefa avulsa (um ou mais). Projeto/incidente usam os clientes do projeto/incidente.",
    }),
    p("ClientId", "Edm.Guid", "client_id", { description: "Legado: o primeiro de ClientIds." }),
    p("ParentTaskId", "Edm.Guid", "parent_entry_id", { description: "Reunião vinculada a uma tarefa." }),
    p("Owners", "Edm.String", (a) => `coalesce(${a}.owners, '[]'::jsonb)`, {
      complex: Complex.Owner,
      collection: true,
      description: "Responsáveis: Kind=Executor (obrigatório) e Kind=Validator (opcional).",
    }),
    p("Responsible", "Edm.String", "responsible", { description: "Nome do executor principal (derivado de Owners)." }),
    p("ResponsibleUserId", "Edm.Guid", "responsible_member_id"),
    p("DependsOn", "Edm.Guid", (a) => `coalesce(${a}.depends_on, '[]'::jsonb)`, {
      collection: true,
      description: "Ids das tarefas predecessoras (término → início).",
    }),
    p("PlannedStart", "Edm.Date", "planned_start"),
    p("PlannedEnd", "Edm.Date", "planned_end"),
    p("PlannedDate", "Edm.Date", "planned_date", { description: "Data de marcos e reuniões." }),
    p("DueDate", "Edm.Date", dueSql, { computed: true, description: "PlannedEnd (tarefa) ou PlannedDate (marco/reunião)." }),
    p("DurationDays", "Edm.Int32", "duration_days", { description: "Dias úteis." }),
    p("DurationHours", "Edm.Decimal", "duration_hours"),
    p("ActualStart", "Edm.Date", "actual_start"),
    p("ActualEnd", "Edm.Date", "actual_end"),
    p("BaselineStart", "Edm.Date", "baseline_start"),
    p("BaselineEnd", "Edm.Date", "baseline_end"),
    p("BaselineDate", "Edm.Date", "baseline_date"),
    p("IsCritical", "Edm.Boolean", (a) => `coalesce(${a}.is_critical, false)`),
    p("HiddenFromPlan", "Edm.Boolean", (a) => `coalesce(${a}.hidden_from_plan, false)`),
    p("Order", "Edm.Int32", (a) => `coalesce(${a}."order", 0)`),
    p("Links", "Edm.String", (a) => `coalesce(${a}.links, '[]'::jsonb)`, { complex: Complex.Link, collection: true }),
    p("Subtasks", "Edm.String", (a) => `coalesce(${a}.subtasks, '[]'::jsonb)`, {
      complex: Complex.Subtask,
      collection: true,
      heavy: true,
      description: "Somente leitura nesta versão da API.",
    }),
    p("IsOverdue", "Edm.Boolean", lateSql, { computed: true, description: "Prazo passou e não está concluída (fuso de São Paulo)." }),
    p("DaysOverdue", "Edm.Int32", (a) => `(case when ${lateSql(a)} then ${TODAY_SQL} - ${dueSql(a)} else 0 end)`, { computed: true }),
    p("IsStalled", "Edm.Boolean", (a) =>
      `(${statusSql(a)} not in ('done','blocked','pending') and ${TODAY_SQL} - ${
        tz(`coalesce(${a}.last_activity_at, ${a}.created_at)`)
      } >= 5)`, { computed: true, description: "Parada: 5+ dias sem atividade (To Do, Em andamento, Validação)." }),
    p("IsBlocked", "Edm.Boolean", (a) => `(${a}.status = 'blocked')`, { computed: true }),
    p("LastActivityAt", "Edm.DateTimeOffset", "last_activity_at"),
    p("CreatedAt", "Edm.DateTimeOffset", "created_at"),
    p("UpdatedAt", "Edm.DateTimeOffset", "updated_at"),
    p("CreatedBy", "Edm.Guid", "created_by"),
    p("UpdatedBy", "Edm.Guid", "updated_by"),
  ],
  navs: taskNavs,
  search: [col("name"), col("description"), col("responsible")],
  defaultOrder: (a) => `${dueSql(a)} asc nulls last, ${a}."order" asc, ${a}.id`,
  etag: xmin,
};

// ─── Projects ───────────────────────────────────────────────────────────────
const projEntries = (a: string) => `public.entries e where e.project_id = ${a}.id`;
const progressSql = (a: string) =>
  `(select round(100.0 * sum(x.d) / nullif(count(*), 0))::int from (
     select (e.status = 'done')::int as d from ${projEntries(a)} and e.hidden_from_plan is not true
     union all
     select ((s.value->>'status') = 'done')::int from public.entries e
       cross join lateral jsonb_array_elements(case when jsonb_typeof(e.subtasks) = 'array' then e.subtasks else '[]'::jsonb end) s
       where e.project_id = ${a}.id and e.hidden_from_plan is not true) x)`;

const Projects: EntitySet = {
  name: "Projects",
  type: "Project",
  description: "Projetos de implantação/expansão (Portfólio), com fases, tarefas, riscos, atrasos e diário.",
  from: (a) => `public.projects ${a}`,
  props: [
    p("Id", "Edm.Guid", "id", { key: true, nullable: false }),
    codeProp(),
    p("Name", "Edm.String", "name", { nullable: false }),
    p("Type", "Edm.String", "type", { enum: Enums.ProjectType }),
    p("Status", "Edm.String", (a) => `coalesce(${a}.status, 'planning')`, { enum: Enums.ProjectStatus }),
    p("Language", "Edm.String", (a) => `coalesce(${a}.language, 'pt')`, { enum: Enums.Language }),
    p("Pm", "Edm.String", "pm", { description: "Nome do líder do projeto." }),
    p("PmUserId", "Edm.Guid", "pm_member_id"),
    p("DevLead", "Edm.String", "dev_lead"),
    p("DevLeadUserId", "Edm.Guid", "dev_lead_member_id"),
    p("DevType", "Edm.String", "dev_type", { description: "integration | application" }),
    p("DevIntegration", "Edm.String", "dev_integration"),
    p("Overview", "Edm.String", "overview", { heavy: true, description: "Markdown (documento colaborativo)." }),
    p("CharterDoc", "Edm.String", "charter_doc", { heavy: true, description: "Markdown (documento colaborativo)." }),
    p("ProposalLink", "Edm.String", "proposal_link"),
    p("DealLink", "Edm.String", "deal_link"),
    p("Team", "Edm.String", (a) => `coalesce(${a}.team, '[]'::jsonb)`, { complex: Complex.TeamMember, collection: true }),
    p("Links", "Edm.String", (a) => `coalesce(${a}.links, '[]'::jsonb)`, { complex: Complex.Link, collection: true }),
    p("Archived", "Edm.Boolean", (a) => `coalesce(${a}.archived, false)`),
    p("Hidden", "Edm.Boolean", (a) => `coalesce(${a}.hidden, false)`),
    p("BaselineSetAt", "Edm.DateTimeOffset", "baseline_set_at"),
    p("PlannedStart", "Edm.Date", (a) => `(select min(${startSql("e")}) from ${projEntries(a)})`, { computed: true }),
    p("PlannedEnd", "Edm.Date", (a) => `(select max(${dueSql("e")}) from ${projEntries(a)})`, { computed: true }),
    p("Progress", "Edm.Int32", progressSql, { computed: true, description: "% de entregas concluídas (ignora itens ocultos do plano)." }),
    p("OverdueCount", "Edm.Int32", (a) =>
      `(select count(*)::int from ${projEntries(a)} and e.hidden_from_plan is not true and ${lateSql("e")})`, { computed: true }),
    p("GoLiveDate", "Edm.Date", (a) =>
      `coalesce(
        (select e.planned_date from public.entries e left join public.phases ph on ph.id = e.phase_id
          where e.project_id = ${a}.id and e.type = 'milestone' and (lower(e.name) like '%go live%' or lower(e.name) like '%go-live%')
          order by ph."order" nulls last, e."order" limit 1),
        (select e.planned_date from public.entries e left join public.phases ph on ph.id = e.phase_id
          where e.project_id = ${a}.id and e.type = 'milestone' order by ph."order" desc nulls last, e."order" desc limit 1))`,
      { computed: true, description: "Marco 'Go live' (ou o último marco do plano)." }),
    p("VarianceDays", "Edm.Int32", () => "null", {
      computed: true,
      description: "Desvio do fim planejado vs. baseline, em dias úteis (positivo = atrasado). Calculado com feriados.",
      post: {
        deps: {
          __max_end: (a) => `(select max(${dueSql("e")}) from ${projEntries(a)})`,
          __max_bl: (a) =>
            `(select max(coalesce(e.baseline_end, e.baseline_date)) from ${projEntries(a)})`,
          __bl_set: (a) => `${a}.baseline_set_at`,
        },
        fn: (r, env) => {
          if (!r.__bl_set || !r.__max_end || !r.__max_bl) return null;
          return workdaysBetween(parseISO(r.__max_bl), parseISO(r.__max_end), parseHolidays(env.holidays));
        },
      },
    }),
    p("IsDelayed", "Edm.Boolean", () => "null", {
      computed: true,
      description: "Em andamento e com desvio positivo vs. baseline.",
      post: {
        deps: {
          __max_end: (a) => `(select max(${dueSql("e")}) from ${projEntries(a)})`,
          __max_bl: (a) => `(select max(coalesce(e.baseline_end, e.baseline_date)) from ${projEntries(a)})`,
          __bl_set: (a) => `${a}.baseline_set_at`,
          __status: (a) => `${a}.status`,
        },
        fn: (r, env) => {
          if (r.__status !== "in_progress" || !r.__bl_set || !r.__max_end || !r.__max_bl) return false;
          return workdaysBetween(parseISO(r.__max_bl), parseISO(r.__max_end), parseHolidays(env.holidays)) > 0;
        },
      },
    }),
    p("CreatedAt", "Edm.DateTimeOffset", "created_at"),
    p("UpdatedAt", "Edm.DateTimeOffset", "updated_at"),
    p("CreatedBy", "Edm.Guid", "created_by"),
    p("UpdatedBy", "Edm.Guid", "updated_by"),
  ],
  navs: [
    {
      name: "Clients",
      target: "Clients",
      many: true,
      from: (c) => `public.project_clients ${c}_l join public.clients ${c} on ${c}.id = ${c}_l.client_id`,
      where: (p, c) => `${c}_l.project_id = ${p}.id`,
      orderBy: (c) => `${c}.name`,
    },
    {
      name: "Phases",
      target: "Phases",
      many: true,
      from: (c) => `public.phases ${c}`,
      where: (p, c) => `${c}.project_id = ${p}.id`,
      orderBy: (c) => `${c}."order"`,
    },
    {
      name: "Tasks",
      target: "Tasks",
      many: true,
      from: (c) => `public.entries ${c}`,
      where: (p, c) => `${c}.project_id = ${p}.id`,
    },
    { name: "Risks", target: "Risks", many: true, from: (c) => `public.risks ${c}`, where: (p, c) => `${c}.project_id = ${p}.id` },
    {
      name: "Documentation",
      target: "DocumentationItems",
      many: true,
      from: (c) => docSource(c),
      where: (p, c) => `${c}.project_id = ${p}.id`,
    },
    {
      name: "DelayLogs",
      target: "DelayLogs",
      many: true,
      from: (c) => `public.delay_log ${c}`,
      where: (p, c) => `${c}.project_id = ${p}.id`,
      orderBy: (c) => `${c}.created_at desc`,
    },
    {
      name: "OpenPoints",
      target: "OpenPoints",
      many: true,
      from: (c) => `public.open_points ${c}`,
      where: (p, c) => `${c}.project_id = ${p}.id`,
    },
    {
      name: "Meetings",
      target: "Meetings",
      many: true,
      from: (c) => `public.meeting_logs ${c}`,
      where: (p, c) => `${c}.project_id = ${p}.id`,
      orderBy: (c) => `${c}.date desc`,
    },
    {
      name: "History",
      target: "History",
      many: true,
      from: (c) => `public.history ${c}`,
      where: (p, c) => `${c}.project_id = ${p}.id`,
      orderBy: (c) => `${c}.date desc`,
    },
    {
      name: "Incidents",
      target: "Incidents",
      many: true,
      from: (c) => `public.incident_projects ${c}_l join public.incidents ${c} on ${c}.id = ${c}_l.incident_id`,
      where: (p, c) => `${c}_l.project_id = ${p}.id`,
    },
    { name: "PmUser", target: "Users", many: false, from: (c) => `public.profiles ${c}`, where: (p, c) => `${c}.id = ${p}.pm_member_id` },
    {
      name: "DevLeadUser",
      target: "Users",
      many: false,
      from: (c) => `public.profiles ${c}`,
      where: (p, c) => `${c}.id = ${p}.dev_lead_member_id`,
    },
  ],
  search: [col("name"), col("pm"), col("overview")],
  defaultOrder: (a) => `${a}.name asc, ${a}.id`,
  etag: xmin,
};

// ─── Phases ─────────────────────────────────────────────────────────────────
const Phases: EntitySet = {
  name: "Phases",
  type: "Phase",
  description: "Fases de um projeto. IsUnassigned marca o balde interno 'Sem fase'.",
  from: (a) => `public.phases ${a}`,
  props: [
    p("Id", "Edm.Guid", "id", { key: true, nullable: false }),
    p("ProjectId", "Edm.Guid", "project_id"),
    p("Name", "Edm.String", "name", { nullable: false }),
    p("Order", "Edm.Int32", (a) => `coalesce(${a}."order", 0)`),
    p("IsUnassigned", "Edm.Boolean", "is_unassigned"),
    p("CreatedAt", "Edm.DateTimeOffset", "created_at"),
  ],
  navs: [
    { name: "Project", target: "Projects", many: false, from: (c) => `public.projects ${c}`, where: (p, c) => `${c}.id = ${p}.project_id` },
    {
      name: "Tasks",
      target: "Tasks",
      many: true,
      from: (c) => `public.entries ${c}`,
      where: (p, c) => `${c}.phase_id = ${p}.id`,
      orderBy: (c) => `${c}."order"`,
    },
  ],
  search: [col("name")],
  defaultOrder: (a) => `${a}.project_id, ${a}."order", ${a}.id`,
  etag: xmin,
};

// ─── Clients / Contacts / CS ────────────────────────────────────────────────
const Clients: EntitySet = {
  name: "Clients",
  type: "Client",
  description: "Carteira de clientes.",
  from: (a) => `public.clients ${a}`,
  props: [
    p("Id", "Edm.Guid", "id", { key: true, nullable: false }),
    codeProp(),
    p("Name", "Edm.String", "name", { nullable: false }),
    p("Country", "Edm.String", "country", { description: "Código ISO-2 (ex.: BR)." }),
    p("Status", "Edm.String", "status", { enum: Enums.ClientStatus, nullable: false }),
    p("PloomesLink", "Edm.String", "ploomes_link"),
    p("Notes", "Edm.String", "notes", { heavy: true, description: "Markdown (documento colaborativo)." }),
    p("Owners", "Edm.String", (a) => `coalesce(${a}.owners, '[]'::jsonb)`, { complex: Complex.Owner, collection: true }),
    p("CurrentCs", "Edm.String", (a) =>
      `(select h.owner from public.client_cs_history h where h.client_id = ${a}.id order by h.assigned_at desc, h.created_at desc limit 1)`, {
      complex: Complex.Owner,
      computed: true,
      description: "CS atual (última atribuição do histórico).",
    }),
    p("Archived", "Edm.Boolean", "archived"),
    p("CreatedAt", "Edm.DateTimeOffset", "created_at"),
    p("CreatedBy", "Edm.Guid", "created_by"),
  ],
  navs: [
    {
      name: "Contacts",
      target: "Contacts",
      many: true,
      from: (c) => `public.contact_clients ${c}_l join public.contacts ${c} on ${c}.id = ${c}_l.contact_id`,
      where: (p, c) => `${c}_l.client_id = ${p}.id`,
      orderBy: (c) => `${c}.name`,
    },
    {
      name: "Projects",
      target: "Projects",
      many: true,
      from: (c) => `public.project_clients ${c}_l join public.projects ${c} on ${c}.id = ${c}_l.project_id`,
      where: (p, c) => `${c}_l.client_id = ${p}.id`,
      orderBy: (c) => `${c}.name`,
    },
    {
      name: "Incidents",
      target: "Incidents",
      many: true,
      from: (c) => `public.incident_clients ${c}_l join public.incidents ${c} on ${c}.id = ${c}_l.incident_id`,
      where: (p, c) => `${c}_l.client_id = ${p}.id`,
    },
    {
      name: "Tasks",
      target: "Tasks",
      many: true,
      from: (c) => `public.entries ${c}`,
      where: (p, c) => `${p}.id = any(coalesce(${c}.client_ids, '{}'::uuid[])) and ${c}.project_id is null and ${c}.incident_id is null`,
    },
    {
      name: "Groups",
      target: "ClientGroups",
      many: true,
      from: (c) => `public.client_group_members ${c}_l join public.client_groups ${c} on ${c}.id = ${c}_l.group_id`,
      where: (p, c) => `${c}_l.client_id = ${p}.id`,
      orderBy: (c) => `${c}.name`,
    },
    {
      name: "Documentation",
      target: "DocumentationItems",
      many: true,
      from: (c) => docSource(c),
      where: (p, c) => `${c}.client_id = ${p}.id`,
    },
    {
      name: "CsHistory",
      target: "CsAssignments",
      many: true,
      from: (c) => `public.client_cs_history ${c}`,
      where: (p, c) => `${c}.client_id = ${p}.id`,
      orderBy: (c) => `${c}.assigned_at desc`,
    },
  ],
  search: [col("name"), col("notes"), col("country")],
  defaultOrder: (a) => `${a}.name asc, ${a}.id`,
  etag: xmin,
};

const Contacts: EntitySet = {
  name: "Contacts",
  type: "Contact",
  description: "Base compartilhada de contatos (uma pessoa pode estar ligada a vários clientes).",
  from: (a) => `public.contacts ${a}`,
  props: [
    p("Id", "Edm.Guid", "id", { key: true, nullable: false }),
    codeProp(),
    p("Name", "Edm.String", "name", { nullable: false }),
    p("Role", "Edm.String", "role", { description: "Cargo." }),
    p("Email", "Edm.String", "email"),
    p("Phone", "Edm.String", "phone"),
    p("CreatedAt", "Edm.DateTimeOffset", "created_at"),
  ],
  navs: [
    {
      name: "Clients",
      target: "Clients",
      many: true,
      from: (c) => `public.contact_clients ${c}_l join public.clients ${c} on ${c}.id = ${c}_l.client_id`,
      where: (p, c) => `${c}_l.contact_id = ${p}.id`,
    },
    {
      name: "Groups",
      target: "ClientGroups",
      many: true,
      from: (c) => `public.client_group_contacts ${c}_l join public.client_groups ${c} on ${c}.id = ${c}_l.group_id`,
      where: (p, c) => `${c}_l.contact_id = ${p}.id`,
    },
  ],
  search: [col("name"), col("email"), col("role")],
  defaultOrder: (a) => `${a}.name asc, ${a}.id`,
  etag: xmin,
};

const CsAssignments: EntitySet = {
  name: "CsAssignments",
  type: "CsAssignment",
  description: "Histórico de CS (Customer Success) de cada cliente.",
  from: (a) => `public.client_cs_history ${a}`,
  props: [
    p("Id", "Edm.Guid", "id", { key: true, nullable: false }),
    p("ClientId", "Edm.Guid", "client_id"),
    p("Owner", "Edm.String", "owner", { complex: Complex.Owner }),
    p("AssignedAt", "Edm.Date", "assigned_at"),
    p("Note", "Edm.String", "note"),
    p("CreatedAt", "Edm.DateTimeOffset", "created_at"),
  ],
  navs: [{ name: "Client", target: "Clients", many: false, from: (c) => `public.clients ${c}`, where: (p, c) => `${c}.id = ${p}.client_id` }],
  search: [col("note")],
  defaultOrder: (a) => `${a}.assigned_at desc, ${a}.id`,
  etag: xmin,
};


// ─── Grupos de clientes ─────────────────────────────────────────────────────
const groupMembers = (a: string) => `select m.client_id from public.client_group_members m where m.group_id = ${a}.id`;

const ClientGroups: EntitySet = {
  name: "ClientGroups",
  type: "ClientGroup",
  description:
    "Grupos de clientes (2 ou mais clientes, ex.: empresas do mesmo conglomerado). Um contato colocado direto no grupo (ContactIds) fica ligado a TODOS os clientes membros; um cliente só pode estar em um grupo, salvo se a configuração do sistema permitir vários. Somente leitura na API.",
  from: (a) => `public.client_groups ${a}`,
  props: [
    p("Id", "Edm.Guid", "id", { key: true, nullable: false }),
    codeProp(),
    p("Name", "Edm.String", "name", { nullable: false }),
    p("ClientIds", "Edm.Guid", (a) => `coalesce((select array_agg(m.client_id order by m.added_at) from public.client_group_members m where m.group_id = ${a}.id), '{}'::uuid[])`, {
      collection: true,
      pgArray: true,
      computed: true,
      description: "Clientes membros.",
    }),
    p("ContactIds", "Edm.Guid", (a) => `coalesce((select array_agg(c.contact_id order by c.added_at) from public.client_group_contacts c where c.group_id = ${a}.id), '{}'::uuid[])`, {
      collection: true,
      pgArray: true,
      computed: true,
      description: "Contatos colocados direto no grupo (ligados a todos os clientes membros). Os contatos próprios de cada cliente vêm por Clients/Contacts.",
    }),
    p("ClientCount", "Edm.Int32", (a) => `(select count(*)::int from public.client_group_members m where m.group_id = ${a}.id)`, { computed: true }),
    p("BelowMinimum", "Edm.Boolean", (a) => `((select count(*) from public.client_group_members m where m.group_id = ${a}.id) < 2)`, {
      computed: true,
      description: "true quando o grupo tem menos de 2 clientes (o app só avisa, não apaga).",
    }),
    p("CreatedAt", "Edm.DateTimeOffset", "created_at"),
    p("UpdatedAt", "Edm.DateTimeOffset", "updated_at"),
    p("CreatedBy", "Edm.Guid", "created_by"),
  ],
  navs: [
    {
      name: "Clients",
      target: "Clients",
      many: true,
      from: (c) => `public.client_group_members ${c}_l join public.clients ${c} on ${c}.id = ${c}_l.client_id`,
      where: (p, c) => `${c}_l.group_id = ${p}.id`,
      orderBy: (c) => `${c}.name`,
    },
    {
      name: "Contacts",
      target: "Contacts",
      many: true,
      from: (c) => `public.client_group_contacts ${c}_l join public.contacts ${c} on ${c}.id = ${c}_l.contact_id`,
      where: (p, c) => `${c}_l.group_id = ${p}.id`,
      orderBy: (c) => `${c}.name`,
    },
    {
      name: "Projects",
      target: "Projects",
      many: true,
      from: (c) => `public.projects ${c}`,
      where: (p, c) => `exists (select 1 from public.project_clients pc where pc.project_id = ${c}.id and pc.client_id in (${groupMembers(p)}))`,
      orderBy: (c) => `${c}.name`,
    },
    {
      name: "Incidents",
      target: "Incidents",
      many: true,
      from: (c) => `public.incidents ${c}`,
      where: (p, c) => `exists (select 1 from public.incident_clients ic where ic.incident_id = ${c}.id and ic.client_id in (${groupMembers(p)}))`,
    },
    {
      name: "Documentation",
      target: "DocumentationItems",
      many: true,
      from: (c) => docSource(c),
      where: (p, c) =>
        `(${c}.client_id in (${groupMembers(p)}) or ${c}.project_id in (select pc.project_id from public.project_clients pc where pc.client_id in (${groupMembers(p)})))`,
    },
  ],
  search: [col("name"), col("code")],
  defaultOrder: (a) => `${a}.name asc, ${a}.id`,
  etag: xmin,
};

// ─── Documentação ───────────────────────────────────────────────────────────
/** Itens diretos (documentation_items) + links e anexos das tarefas de documentação (espelhados), numa tabela só.
 *  O Id dos espelhados é um uuid estável derivado de 'entry-link:<tarefa>:<link>' / 'entry-file:<anexo>' (md5). */
const docSource = (a: string) =>
  `(select d.id, d.code, 'direct'::text as source, d.kind, d.title, d.url, d.file_name, d.file_size, d.body, d.audience,
          coalesce(d.tags, '{}'::text[]) as tags, d.project_id, d.client_id, null::uuid as entry_id, (d.storage_path is not null) as has_file,
          d.created_by, d.created_at, d.updated_at
     from public.documentation_items d
   union all
   select md5('entry-link:' || e.id::text || ':' || (l.value->>'id'))::uuid, m.code, 'task'::text, 'link'::text,
          coalesce(nullif(btrim(l.value->>'label'), ''), l.value->>'url'), l.value->>'url', null::text, null::bigint, null::text,
          coalesce(m.audience, 'both'), coalesce(m.tags, '{}'::text[]), e.project_id, null::uuid, e.id, false,
          null::uuid, e.created_at, coalesce(m.updated_at, e.updated_at)
     from public.entries e
     cross join lateral jsonb_array_elements(case when jsonb_typeof(e.links) = 'array' then e.links else '[]'::jsonb end) l
     left join public.documentation_meta m on m.source_key = 'entry-link:' || e.id::text || ':' || (l.value->>'id')
    where e.is_documentation and e.type = 'task' and e.project_id is not null and coalesce(l.value->>'url', '') <> ''
   union all
   select md5('entry-file:' || at.id::text)::uuid, m.code, 'task'::text, 'file'::text, at.name, null::text, at.name, at.size, null::text,
          coalesce(m.audience, 'both'), coalesce(m.tags, '{}'::text[]), e.project_id, null::uuid, e.id, true,
          at.uploaded_by, at.created_at, coalesce(m.updated_at, at.created_at)
     from public.attachments at
     join public.entries e on e.id = at.entity_id
     left join public.documentation_meta m on m.source_key = 'entry-file:' || at.id::text
    where at.entity_type = 'entry' and e.is_documentation and e.type = 'task' and e.project_id is not null) ${a}`;

const DocumentationItems: EntitySet = {
  name: "DocumentationItems",
  type: "DocumentationItem",
  description:
    "Documentação de projetos e clientes: links, arquivos e textos, cada um com público (Technical/Executive/Both) e etiquetas. Source=Direct são itens colocados direto na aba Documentação (de um projeto OU de um cliente); Source=Task são os links e anexos das tarefas de documentação dos projetos (espelhados: o conteúdo mora na tarefa, TaskId). O conteúdo de arquivos não é baixado pela API (HasFile indica que existe). Somente leitura.",
  from: docSource,
  props: [
    p("Id", "Edm.Guid", "id", { key: true, nullable: false }),
    p("Code", "Edm.String", "code", {
      description: "Código curto D26000123 (link: /r/<código>). Itens espelhados só ganham código depois de vistos no app.",
    }),
    p("Source", "Edm.String", "source", { enum: Enums.DocSource, nullable: false }),
    p("Kind", "Edm.String", "kind", { enum: Enums.DocKind, nullable: false }),
    p("Title", "Edm.String", "title", { nullable: false }),
    p("Url", "Edm.String", "url", { description: "Kind=Link." }),
    p("FileName", "Edm.String", "file_name"),
    p("FileSize", "Edm.Int32", "file_size", { description: "Bytes (Kind=File)." }),
    p("HasFile", "Edm.Boolean", "has_file"),
    p("Body", "Edm.String", "body", { heavy: true, description: "Kind=Text: Markdown (documento colaborativo)." }),
    p("Audience", "Edm.String", "audience", { enum: Enums.DocAudience, nullable: false, description: "Technical e Executive; Both serve aos dois públicos." }),
    p("Tags", "Edm.String", "tags", { collection: true, pgArray: true, description: "Etiquetas livres." }),
    p("ProjectId", "Edm.Guid", "project_id", { description: "Item de projeto (direto ou espelhado)." }),
    p("ClientId", "Edm.Guid", "client_id", { description: "Item direto de cliente." }),
    p("TaskId", "Edm.Guid", "entry_id", { description: "Source=Task: a tarefa de documentação onde o link/anexo mora." }),
    p("CreatedAt", "Edm.DateTimeOffset", "created_at"),
    p("UpdatedAt", "Edm.DateTimeOffset", "updated_at"),
    p("CreatedBy", "Edm.Guid", "created_by"),
  ],
  navs: [
    { name: "Project", target: "Projects", many: false, from: (c) => `public.projects ${c}`, where: (p, c) => `${c}.id = ${p}.project_id` },
    { name: "Client", target: "Clients", many: false, from: (c) => `public.clients ${c}`, where: (p, c) => `${c}.id = ${p}.client_id` },
    { name: "Task", target: "Tasks", many: false, from: (c) => `public.entries ${c}`, where: (p, c) => `${c}.id = ${p}.entry_id` },
  ],
  search: [col("title"), col("url"), col("body"), col("file_name"), col("code")],
  defaultOrder: (a) => `${a}.created_at desc nulls last, ${a}.id`,
};

// ─── Users ──────────────────────────────────────────────────────────────────
const Users: EntitySet = {
  name: "Users",
  type: "User",
  description: "Pessoas do time (perfis do Open).",
  from: (a) => `public.profiles ${a}`,
  props: [
    p("Id", "Edm.Guid", "id", { key: true, nullable: false }),
    p("Name", "Edm.String", "name"),
    p("Email", "Edm.String", "email"),
    p("Role", "Edm.String", "role", { enum: Enums.UserRole }),
    p("Active", "Edm.Boolean", "active"),
    p("AvatarUrl", "Edm.String", "avatar_url"),
  ],
  navs: [],
  search: [col("name"), col("email")],
  defaultOrder: (a) => `${a}.name asc nulls last, ${a}.id`,
};

// ─── Comments ───────────────────────────────────────────────────────────────
const Comments: EntitySet = {
  name: "Comments",
  type: "Comment",
  description: "Comentários de tarefas (um nível de resposta). Menções: [@Nome](open:user/<id>).",
  from: (a) => `public.comments ${a}`,
  props: [
    p("Id", "Edm.Guid", "id", { key: true, nullable: false }),
    p("TaskId", "Edm.Guid", "entry_id"),
    p("ProjectId", "Edm.Guid", "project_id"),
    p("ParentId", "Edm.Guid", "parent_id"),
    p("AuthorId", "Edm.Guid", "author_id"),
    p("AuthorName", "Edm.String", "author_name"),
    p("Text", "Edm.String", "text", { nullable: false }),
    p("CreatedAt", "Edm.DateTimeOffset", "created_at"),
    p("UpdatedAt", "Edm.DateTimeOffset", "updated_at"),
  ],
  navs: [
    { name: "Task", target: "Tasks", many: false, from: (c) => `public.entries ${c}`, where: (p, c) => `${c}.id = ${p}.entry_id` },
    {
      name: "Replies",
      target: "Comments",
      many: true,
      from: (c) => `public.comments ${c}`,
      where: (p, c) => `${c}.parent_id = ${p}.id`,
      orderBy: (c) => `${c}.created_at`,
    },
  ],
  search: [col("text")],
  defaultOrder: (a) => `${a}.created_at asc, ${a}.id`,
  etag: xmin,
};

// ─── Incidents ──────────────────────────────────────────────────────────────
const Incidents: EntitySet = {
  name: "Incidents",
  type: "Incident",
  description: "Incidentes de Sustentação.",
  from: (a) => `public.incidents ${a}`,
  props: [
    p("Id", "Edm.Guid", "id", { key: true, nullable: false }),
    codeProp(),
    p("Title", "Edm.String", "title", { nullable: false }),
    p("Description", "Edm.String", "description", { heavy: true, description: "Markdown (documento colaborativo)." }),
    p("Owner", "Edm.String", "owner", { complex: Complex.Owner }),
    p("Status", "Edm.String", "status", { enum: Enums.IncidentStatus, nullable: false }),
    p("Priority", "Edm.String", "priority", { enum: Enums.Level, nullable: false }),
    p("Impact", "Edm.String", "impact", { enum: Enums.Level, nullable: false }),
    p("Deadline", "Edm.Date", "deadline"),
    p("StatusChangedAt", "Edm.DateTimeOffset", "status_changed_at"),
    p("ResolvedAt", "Edm.DateTimeOffset", "resolved_at"),
    p("AgeDays", "Edm.Int32", (a) => `(${TODAY_SQL} - ${tz(`${a}.created_at`)})`, { computed: true }),
    p("DaysInStatus", "Edm.Int32", (a) => `(${TODAY_SQL} - ${tz(`${a}.status_changed_at`)})`, { computed: true }),
    p("IsOverdue", "Edm.Boolean", (a) =>
      `(${a}.deadline is not null and ${a}.deadline < ${TODAY_SQL} and ${a}.status not in ('resolved','closed'))`, {
      computed: true,
    }),
    p("CreatedAt", "Edm.DateTimeOffset", "created_at"),
    p("UpdatedAt", "Edm.DateTimeOffset", "updated_at"),
    p("CreatedBy", "Edm.Guid", "created_by"),
  ],
  navs: [
    {
      name: "Clients",
      target: "Clients",
      many: true,
      from: (c) => `public.incident_clients ${c}_l join public.clients ${c} on ${c}.id = ${c}_l.client_id`,
      where: (p, c) => `${c}_l.incident_id = ${p}.id`,
    },
    {
      name: "Projects",
      target: "Projects",
      many: true,
      from: (c) => `public.incident_projects ${c}_l join public.projects ${c} on ${c}.id = ${c}_l.project_id`,
      where: (p, c) => `${c}_l.incident_id = ${p}.id`,
    },
    {
      name: "Stakeholders",
      target: "IncidentStakeholders",
      many: true,
      from: (c) => `public.incident_stakeholders ${c}`,
      where: (p, c) => `${c}.incident_id = ${p}.id`,
    },
    {
      name: "Tasks",
      target: "Tasks",
      many: true,
      from: (c) => `public.entries ${c}`,
      where: (p, c) => `${c}.incident_id = ${p}.id`,
    },
    {
      name: "OpenPoints",
      target: "OpenPoints",
      many: true,
      from: (c) => `public.open_points ${c}`,
      where: (p, c) => `${c}.incident_id = ${p}.id`,
    },
    {
      name: "History",
      target: "History",
      many: true,
      from: (c) => `public.history ${c}`,
      where: (p, c) => `${c}.incident_id = ${p}.id`,
      orderBy: (c) => `${c}.date desc`,
    },
  ],
  search: [col("title"), col("description")],
  defaultOrder: (a) => `${a}.created_at desc, ${a}.id`,
  etag: xmin,
};

const IncidentStakeholders: EntitySet = {
  name: "IncidentStakeholders",
  type: "IncidentStakeholder",
  description: "Pessoas interessadas em um incidente (recebem avisos de mudança de status).",
  from: (a) => `public.incident_stakeholders ${a}`,
  props: [
    p("Id", "Edm.Guid", "id", { key: true, nullable: false }),
    p("IncidentId", "Edm.Guid", "incident_id"),
    p("Owner", "Edm.String", "owner", { complex: Complex.Owner }),
    p("CreatedAt", "Edm.DateTimeOffset", "created_at"),
  ],
  navs: [{ name: "Incident", target: "Incidents", many: false, from: (c) => `public.incidents ${c}`, where: (p, c) => `${c}.id = ${p}.incident_id` }],
  search: [],
  defaultOrder: (a) => `${a}.created_at, ${a}.id`,
};

// ─── Diário, riscos, atrasos ────────────────────────────────────────────────
const projectNav: Nav = {
  name: "Project",
  target: "Projects",
  many: false,
  from: (c) => `public.projects ${c}`,
  where: (p, c) => `${c}.id = ${p}.project_id`,
};
const incidentNav: Nav = {
  name: "Incident",
  target: "Incidents",
  many: false,
  from: (c) => `public.incidents ${c}`,
  where: (p, c) => `${c}.id = ${p}.incident_id`,
};

const Risks: EntitySet = {
  name: "Risks",
  type: "Risk",
  description: "Riscos do projeto (Score = probabilidade × impacto, escala 1..3).",
  from: (a) => `public.risks ${a}`,
  props: [
    p("Id", "Edm.Guid", "id", { key: true, nullable: false }),
    codeProp(),
    p("ProjectId", "Edm.Guid", "project_id"),
    p("Description", "Edm.String", "description", { nullable: false }),
    p("Probability", "Edm.String", "probability", { enum: Enums.Level }),
    p("Impact", "Edm.String", "impact", { enum: Enums.Level }),
    p("Score", "Edm.Int32", "score"),
    p("Status", "Edm.String", "status"),
    p("Owner", "Edm.String", "owner", { description: "Responsável (texto livre)." }),
    p("DueDate", "Edm.Date", "due_date"),
    p("LinkedTaskIds", "Edm.Guid", (a) => `coalesce(${a}.linked_entry_ids, '[]'::jsonb)`, { collection: true }),
    p("ActionTasks", "Edm.String", (a) => `coalesce(${a}.action_tasks, '[]'::jsonb)`, {
      complex: Complex.ActionTask,
      collection: true,
    }),
    p("CreatedAt", "Edm.DateTimeOffset", "created_at"),
    p("UpdatedAt", "Edm.DateTimeOffset", "updated_at"),
  ],
  navs: [projectNav],
  search: [col("description"), col("owner")],
  defaultOrder: (a) => `${a}.score desc nulls last, ${a}.created_at, ${a}.id`,
  etag: xmin,
};

const DelayLogs: EntitySet = {
  name: "DelayLogs",
  type: "DelayLog",
  description: "Registro de atrasos (criado pela action Tasks/Open.ChangeDates com justificativa).",
  from: (a) => `public.delay_log ${a}`,
  props: [
    p("Id", "Edm.Guid", "id", { key: true, nullable: false }),
    p("ProjectId", "Edm.Guid", "project_id"),
    p("TaskId", "Edm.Guid", "entry_id"),
    p("TaskName", "Edm.String", "entry_name"),
    p("Days", "Edm.Int32", "days", { description: "Dias úteis de desvio." }),
    p("Responsibility", "Edm.String", "responsibility", { enum: Enums.DelayResponsibility }),
    p("Type", "Edm.String", "type", { enum: Enums.DelayType }),
    p("Description", "Edm.String", "description"),
    p("CreatedAt", "Edm.DateTimeOffset", "created_at"),
    p("CreatedBy", "Edm.Guid", "created_by"),
  ],
  navs: [projectNav, { name: "Task", target: "Tasks", many: false, from: (c) => `public.entries ${c}`, where: (p, c) => `${c}.id = ${p}.entry_id` }],
  search: [col("description"), col("entry_name")],
  defaultOrder: (a) => `${a}.created_at desc, ${a}.id`,
};

const OpenPoints: EntitySet = {
  name: "OpenPoints",
  type: "OpenPoint",
  description: "Pontos em aberto do diário (projeto ou incidente).",
  from: (a) => `public.open_points ${a}`,
  props: [
    p("Id", "Edm.Guid", "id", { key: true, nullable: false }),
    p("ProjectId", "Edm.Guid", "project_id"),
    p("IncidentId", "Edm.Guid", "incident_id"),
    p("Title", "Edm.String", (a) => `coalesce(${a}.title, ${a}.description)`),
    p("Description", "Edm.String", "description", { heavy: true }),
    p("Status", "Edm.String", (a) => `coalesce(${a}.status, 'open')`, { enum: Enums.OpenPointStatus }),
    p("Priority", "Edm.String", (a) => `coalesce(${a}.priority, 'medium')`, { enum: Enums.Level }),
    p("Owner", "Edm.String", "owner", { description: "Responsável (nome)." }),
    p("OwnerUserId", "Edm.Guid", "owner_user_id"),
    p("DueDate", "Edm.Date", "due_date"),
    p("IsOverdue", "Edm.Boolean", (a) =>
      `(coalesce(${a}.status, 'open') = 'open' and ${a}.due_date is not null and ${a}.due_date < ${TODAY_SQL})`, {
      computed: true,
    }),
    p("LinkedTaskId", "Edm.Guid", "linked_entry_id"),
    p("LinkedPhaseId", "Edm.Guid", "linked_phase_id"),
    p("ResolutionNote", "Edm.String", "resolution_note"),
    p("ResolvedAt", "Edm.DateTimeOffset", "resolved_at"),
    p("ResolvedBy", "Edm.Guid", "resolved_by"),
    p("CreatedAt", "Edm.DateTimeOffset", "created_at"),
    p("CreatedBy", "Edm.Guid", "created_by"),
    p("CreatedByName", "Edm.String", "created_by_name"),
  ],
  navs: [projectNav, incidentNav],
  search: [col("title"), col("description"), col("owner")],
  defaultOrder: (a) => `${a}.due_date asc nulls last, ${a}.created_at, ${a}.id`,
  etag: xmin,
};

const Meetings: EntitySet = {
  name: "Meetings",
  type: "Meeting",
  description: "Atas de reunião do projeto.",
  from: (a) => `public.meeting_logs ${a}`,
  props: [
    p("Id", "Edm.Guid", "id", { key: true, nullable: false }),
    p("ProjectId", "Edm.Guid", "project_id"),
    p("Title", "Edm.String", "title", { nullable: false }),
    p("Date", "Edm.Date", "date", { nullable: false }),
    p("Participants", "Edm.String", (a) => `coalesce(${a}.participants, '[]'::jsonb)`, {
      complex: Complex.Owner,
      collection: true,
    }),
    p("Notes", "Edm.String", "notes", { heavy: true, description: "Markdown (documento colaborativo)." }),
    p("Items", "Edm.String", (a) => `coalesce(${a}.items, '[]'::jsonb)`, { complex: Complex.MeetingItem, collection: true }),
    p("CreatedAt", "Edm.DateTimeOffset", "created_at"),
    p("CreatedByName", "Edm.String", "created_by_name"),
  ],
  navs: [projectNav],
  search: [col("title"), col("notes")],
  defaultOrder: (a) => `${a}.date desc, ${a}.id`,
  etag: xmin,
};

const History: EntitySet = {
  name: "History",
  type: "HistoryEvent",
  description: "Linha do tempo do projeto/incidente (eventos automáticos e notas manuais).",
  from: (a) => `public.history ${a}`,
  props: [
    p("Id", "Edm.Guid", "id", { key: true, nullable: false }),
    p("ProjectId", "Edm.Guid", "project_id"),
    p("IncidentId", "Edm.Guid", "incident_id"),
    p("Type", "Edm.String", "type", { description: "auto | manual" }),
    p("Event", "Edm.String", "event", { description: "project_created, status_changed, note, ..." }),
    p("Title", "Edm.String", "title"),
    p("Detail", "Edm.String", "detail", { heavy: true }),
    p("LinkedId", "Edm.String", "linked_id"),
    p("LinkedType", "Edm.String", "linked_type"),
    p("Date", "Edm.DateTimeOffset", "date"),
    p("AuthorId", "Edm.Guid", "author_id"),
    p("AuthorName", "Edm.String", "author_name"),
  ],
  navs: [projectNav, incidentNav],
  search: [col("title"), col("detail")],
  defaultOrder: (a) => `${a}.date desc, ${a}.id`,
};

const Notifications: EntitySet = {
  name: "Notifications",
  type: "Notification",
  description: "Notificações do usuário autenticado (o RLS do app mostra só as suas).",
  from: (a) => `public.notifications ${a}`,
  base: (a) => `${a}.user_id = auth.uid()`,
  props: [
    p("Id", "Edm.Guid", "id", { key: true, nullable: false }),
    p("Message", "Edm.String", "message", { nullable: false }),
    p("Link", "Edm.String", "link"),
    p("Read", "Edm.Boolean", "read"),
    p("CreatedAt", "Edm.DateTimeOffset", "created_at"),
  ],
  navs: [],
  search: [col("message")],
  defaultOrder: (a) => `${a}.created_at desc, ${a}.id`,
};

export const SETS: Record<string, EntitySet> = Object.fromEntries(
  [
    Clients,
    Contacts,
    ClientGroups,
    CsAssignments,
    Projects,
    Phases,
    Tasks,
    Comments,
    Incidents,
    IncidentStakeholders,
    Risks,
    DelayLogs,
    OpenPoints,
    Meetings,
    History,
    DocumentationItems,
    Users,
    Notifications,
  ].map((s) => [s.name, s]),
);

export function getSet(name: string): EntitySet {
  const s = SETS[name];
  if (!s) throw new Error(`Entity set desconhecido: ${name}`);
  return s;
}

export function findSet(name: string): EntitySet | undefined {
  return SETS[name] ?? Object.values(SETS).find((s) => s.name.toLowerCase() === name.toLowerCase());
}

export function keyProp(set: EntitySet): Prop {
  return set.props.find((x) => x.key)!;
}
