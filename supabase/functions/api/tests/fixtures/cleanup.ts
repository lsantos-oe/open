// Limpeza do STAGING depois dos testes: apaga só o que os usuários FICTÍCIOS de teste criaram a partir de `since`.
// Nunca toca no seed (ids fixos 00000000-0000-4000-8000-…) nem em dados de outras pessoas.
import type postgres from "postgres";

const TEST_EMAILS = ["ana.teste@ploomes.com", "bruno.teste@ploomes.com", "carla.inativa@ploomes.com", "dani.limite@ploomes.com", "eva.externa@example.com"];
const SEED = "00000000-0000-4000-8000-%";

export async function cleanupTestData(sql: postgres.Sql, since: Date | string): Promise<Record<string, number>> {
  const users = (await sql<{ id: string }[]>`select id from profiles where email = any(${TEST_EMAILS})`).map((u) => u.id);
  if (!users.length) return {};
  return await sql.begin(async (tx) => {
    const r: Record<string, number> = {};
    // ordem importa: projetos antes de clientes (projects.client_id é RESTRICT)
    r.projetos = (await tx`delete from projects where created_by = any(${users}::uuid[]) and created_at >= ${since} and id::text not like ${SEED} returning id`).length;
    r.incidentes = (await tx`delete from incidents where created_by = any(${users}::uuid[]) and created_at >= ${since} and id::text not like ${SEED} returning id`).length;
    r.tarefas = (await tx`delete from entries where created_by = any(${users}::uuid[]) and created_at >= ${since} and id::text not like ${SEED} returning id`).length;
    r.clientes = (await tx`delete from clients c where created_by = any(${users}::uuid[]) and created_at >= ${since} and id::text not like ${SEED}
                             and not exists (select 1 from projects p where p.client_id = c.id) returning id`).length;
    r.contatos = (await tx`delete from contacts where created_at >= ${since} and email like '%@exemplo.com' returning id`).length;
    r.templates = (await tx`delete from open_api.project_templates where created_by = any(${users}::uuid[]) and created_at >= ${since} returning id`).length;
    r.notificacoes = (await tx`delete from notifications where user_id = any(${users}::uuid[]) and created_at >= ${since} returning id`).length;
    r.fila_discord = (await tx`delete from discord_outbox where user_id = any(${users}::uuid[]) and created_at >= ${since} returning id`).length;
    return r;
  });
}
