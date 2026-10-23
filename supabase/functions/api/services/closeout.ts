// Encerramento: ao concluir um projeto ou resolver/fechar um incidente, o app pergunta se as tarefas abertas também
// devem ser concluídas (CloseOutModal → completeTasks). Mesma regra aqui: só tarefas (não marcos/reuniões) ainda não
// concluídas; ficam Concluído, etapa manual (StatusOverride) e Fim real = hoje (fuso de São Paulo).
import { z } from "zod";
import type { Ctx } from "../lib/context.ts";
import { notFound } from "../lib/errors.ts";
import { Guid, lockScope, parseBody } from "./shared.ts";

export const CompleteOpenTasksInput = z.object({
  TaskIds: z.array(Guid).max(500).optional().describe("Quais concluir. Vazio/ausente = todas as abertas."),
}).strict();

type Kind = "project" | "incident";

async function ensure(ctx: Ctx, kind: Kind, id: string) {
  const [r] = kind === "project"
    ? await ctx.tx`select id from projects where id = ${id}`
    : await ctx.tx`select id from incidents where id = ${id}`;
  if (!r) throw notFound();
}

/** Tarefas abertas (o que o modal do app lista). */
export async function openTasks(ctx: Ctx, kind: Kind, id: string) {
  await ensure(ctx, kind, id);
  const rows = kind === "project"
    ? await ctx.tx`select id, name, status, planned_end, responsible from entries
                   where project_id = ${id} and type = 'task' and coalesce(status, 'pending') <> 'done' order by planned_end nulls last, name`
    : await ctx.tx`select id, name, status, planned_end, responsible from entries
                   where incident_id = ${id} and type = 'task' and coalesce(status, 'pending') <> 'done' order by planned_end nulls last, name`;
  return rows.map((r) => ({ Id: r.id, Name: r.name, Status: r.status, PlannedEnd: r.planned_end, Responsible: r.responsible }));
}

export async function completeOpenTasks(ctx: Ctx, kind: Kind, id: string, body: unknown) {
  const d = parseBody(CompleteOpenTasksInput, body ?? {});
  await ensure(ctx, kind, id);
  await lockScope(ctx, { kind, id });
  const only = d.TaskIds?.length ? d.TaskIds : null;
  const col = kind === "project" ? "project_id" : "incident_id";
  const rows = await ctx.tx.unsafe(
    `update public.entries set status = 'done', status_override = true, actual_end = $2::date,
            last_activity_at = now(), updated_by = $3
     where ${col} = $1 and type = 'task' and coalesce(status, 'pending') <> 'done'
       ${only ? "and id = any($4::uuid[])" : ""}
     returning id`,
    only ? [id, ctx.today, ctx.user.id, only] : [id, ctx.today, ctx.user.id],
  );
  return { Completed: rows.length, TaskIds: (rows as unknown as { id: string }[]).map((r) => r.id) };
}
