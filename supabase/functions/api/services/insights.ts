// Leituras analíticas para agentes: status report (markdown) e carga por pessoa.
import type { Ctx } from "../lib/context.ts";
import { uiLink } from "../lib/context.ts";
import { notFound } from "../lib/errors.ts";
import { getSet } from "../odata/entities.ts";
import { readCollection, readOne } from "../odata/read.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const STATUS_PT: Record<string, string> = {
  Pending: "Backlog",
  Todo: "To Do",
  InProgress: "Em andamento",
  Validation: "Validação",
  Done: "Concluído",
  Blocked: "Bloqueado",
  Backlog: "Backlog",
  Planning: "Planejamento",
};

const cell = (s: unknown) => String(s ?? "—").replace(/\|/g, "\\|").replace(/\n/g, " ");

export async function statusReport(ctx: Ctx, projectId: string): Promise<string> {
  const p = await readOne(ctx, getSet("Projects"), projectId, {
    expand: [
      { nav: "Clients", select: ["Name"] },
      {
        nav: "Phases",
        orderby: [{ path: ["Order"], desc: false }],
        expand: [{ nav: "Tasks", select: ["Name", "Type", "Status", "DueDate", "IsOverdue", "Responsible", "HiddenFromPlan"], top: 200 }],
      },
      { nav: "Risks", select: ["Description", "Probability", "Impact", "Score", "Status", "Owner"], top: 20 },
      { nav: "DelayLogs", select: ["TaskName", "Days", "Responsibility", "Description", "CreatedAt"], top: 10 },
      { nav: "OpenPoints", select: ["Title", "Status", "Owner", "DueDate", "IsOverdue"], filter: undefined, top: 30 },
    ],
  }) as Row;
  if (!p) throw notFound();
  const lines: string[] = [];
  lines.push(`# Status report — ${p.Name}`);
  lines.push("");
  lines.push(`**Clientes:** ${(p.Clients ?? []).map((c: Row) => c.Name).join(", ") || "—"}  `);
  lines.push(`**Líder:** ${p.Pm ?? "—"} · **Status:** ${STATUS_PT[p.Status] ?? p.Status} · **Progresso:** ${p.Progress ?? 0}%  `);
  lines.push(`**Início:** ${p.PlannedStart ?? "—"} · **Fim planejado:** ${p.PlannedEnd ?? "—"} · **Go-live:** ${p.GoLiveDate ?? "—"}  `);
  if (p.VarianceDays != null) lines.push(`**Desvio vs. baseline:** ${p.VarianceDays > 0 ? "+" : ""}${p.VarianceDays} dia(s) útil(eis)${p.IsDelayed ? " ⚠️ atrasado" : ""}  `);
  lines.push(`**Tarefas atrasadas:** ${p.OverdueCount ?? 0}  `);
  lines.push(`[Abrir no Open](${uiLink.project(projectId)})`);
  lines.push("");
  lines.push("## Fases");
  for (const ph of p.Phases ?? []) {
    if (ph.IsUnassigned) continue;
    const tasks = (ph.Tasks ?? []).filter((t: Row) => !t.HiddenFromPlan);
    const done = tasks.filter((t: Row) => t.Status === "Done").length;
    lines.push(`### ${ph.Name} (${done}/${tasks.length})`);
    if (!tasks.length) continue;
    lines.push("| Entrega | Responsável | Prazo | Etapa |");
    lines.push("|---|---|---|---|");
    for (const t of tasks) {
      lines.push(`| ${cell(t.Name)}${t.Type === "Milestone" ? " ◆" : ""} | ${cell(t.Responsible)} | ${cell(t.DueDate)}${t.IsOverdue ? " ⚠️" : ""} | ${STATUS_PT[t.Status] ?? t.Status} |`);
    }
  }
  const risks = (p.Risks ?? []).filter((r: Row) => (r.Status ?? "open") !== "closed");
  if (risks.length) {
    lines.push("", "## Riscos", "| Risco | P × I | Responsável |", "|---|---|---|");
    for (const r of risks) lines.push(`| ${cell(r.Description)} | ${r.Probability ?? "—"} × ${r.Impact ?? "—"} (${r.Score ?? "—"}) | ${cell(r.Owner)} |`);
  }
  const ops = (p.OpenPoints ?? []).filter((o: Row) => o.Status === "Open");
  if (ops.length) {
    lines.push("", "## Pontos em aberto");
    for (const o of ops) lines.push(`- ${o.Title}${o.Owner ? ` — ${o.Owner}` : ""}${o.DueDate ? ` (até ${o.DueDate}${o.IsOverdue ? " ⚠️" : ""})` : ""}`);
  }
  if ((p.DelayLogs ?? []).length) {
    lines.push("", "## Atrasos registrados");
    for (const d of p.DelayLogs) lines.push(`- ${d.TaskName}: ${d.Days > 0 ? "+" : ""}${d.Days}d (${d.Responsibility}) — ${d.Description ?? ""}`);
  }
  return lines.join("\n");
}

export interface WorkloadFilter {
  projectId?: string;
  incidentId?: string;
  from?: string;
  to?: string;
}

/** Carga por executor: tarefas abertas por etapa, atrasadas, paradas e dias planejados no período. */
export async function workload(ctx: Ctx, f: WorkloadFilter) {
  const page = await readCollection(ctx, getSet("Tasks"), {
    select: ["Id", "Status", "IsOverdue", "IsStalled", "DurationDays", "Owners", "DueDate", "Type"],
    top: 200,
  }, {
    where: (a, params) => {
      const parts = [`${a}.type = 'task'`];
      if (f.projectId) parts.push(`${a}.project_id = ${params.add(f.projectId)}::uuid`);
      if (f.incidentId) parts.push(`${a}.incident_id = ${params.add(f.incidentId)}::uuid`);
      if (f.from) parts.push(`coalesce(${a}.planned_end, ${a}.planned_date) >= ${params.add(f.from)}::date`);
      if (f.to) parts.push(`coalesce(${a}.planned_start, ${a}.planned_date) <= ${params.add(f.to)}::date`);
      return parts.join(" and ");
    },
  });
  const people = new Map<string, Row>();
  for (const t of page.rows as Row[]) {
    for (const o of (t.Owners ?? []) as Row[]) {
      if ((o.Kind ?? "Executor") !== "Executor") continue;
      const key = o.UserId ?? `texto:${o.Name}`;
      const p = people.get(key) ?? { UserId: o.UserId ?? null, Name: o.Name, Open: 0, Done: 0, Overdue: 0, Stalled: 0, PlannedDays: 0, ByStatus: {} as Record<string, number> };
      p.ByStatus[t.Status] = (p.ByStatus[t.Status] ?? 0) + 1;
      if (t.Status === "Done") p.Done++;
      else {
        p.Open++;
        p.PlannedDays += t.DurationDays ?? 0;
      }
      if (t.IsOverdue) p.Overdue++;
      if (t.IsStalled) p.Stalled++;
      people.set(key, p);
    }
  }
  const total = [...people.values()].reduce((s, p) => s + p.Open, 0) || 1;
  return [...people.values()]
    .map((p): Row => ({ ...p, SharePct: Math.round((p.Open / total) * 100) }))
    .sort((a, b) => b.Open - a.Open);
}
