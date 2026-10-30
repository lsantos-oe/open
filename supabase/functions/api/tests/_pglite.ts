// Banco em memória (PGlite) com as migrations reais de grupos e códigos, e um "tx" que imita o suficiente do
// postgres.js (template tag, tx(obj), tx.array, tx.json) para rodar os serviços de escrita de verdade.
// deno-lint-ignore-file no-explicit-any
import { PGlite } from "@electric-sql/pglite";
import type { Ctx } from "../lib/context.ts";
import { runTxHooks } from "../lib/db.ts";
import { fromDbError } from "../lib/errors.ts";

const MIG = new URL("../../../migrations/", import.meta.url);
const read = (f: string) => Deno.readTextFile(new URL(f, MIG));

export const A = "00000000-0000-4000-8000-00000000a001";
export const id = (p: string, n: number) => `${p}0000000-0000-4000-8000-00000000000${n}`;
export const C = [1, 2, 3, 4].map((n) => id("c", n)); // clientes
export const P = [1, 2].map((n) => id("b", n)); // projetos
export const K = [1, 2, 3].map((n) => id("d", n)); // contatos
export const E = [1, 2, 3].map((n) => id("e", n)); // tarefas
export const ATT = id("a", 1); // anexo de tarefa de documentação

export interface Harness {
  db: PGlite;
  ctx: Ctx;
  /** Roda `fn` numa transação como o withUser: COMMIT + hooks de commit; dryRun/erro = ROLLBACK + hooks de rollback. */
  run<T>(fn: (ctx: Ctx) => Promise<T>, opts?: { dryRun?: boolean }): Promise<T>;
  q(sql: string, params?: any[]): Promise<any[]>;
}

export async function newHarness(): Promise<Harness> {
  const db = new PGlite();
  const conv = (v: any) => (v && typeof v === "object" && "__json" in v ? JSON.stringify(v.__json) : v);
  const make = async (strings: TemplateStringsArray, ...vals: any[]) => {
    let sql = "";
    const params: any[] = [];
    strings.forEach((s, i) => {
      sql += s;
      if (i >= vals.length) return;
      const v = vals[i];
      if (v && typeof v === "object" && "__set" in v) {
        sql += Object.entries(v.__set).map(([c, x]) => {
          params.push(conv(x));
          return `"${c}" = $${params.length}`;
        }).join(", ");
      } else {
        params.push(conv(v));
        sql += `$${params.length}`;
      }
    });
    return (await db.query(sql, params)).rows;
  };
  const tx: any = (first: any, ...rest: any[]) => (Array.isArray(first) && "raw" in first ? make(first as any, ...rest) : { __set: first });
  tx.array = (v: unknown[]) => v;
  tx.json = (v: unknown) => ({ __json: v });
  tx.unsafe = async (sql: string, params: unknown[] = []) => (await db.query(sql, params as any[])).rows;
  const ctx: Ctx = {
    user: { id: A, name: "Ana", email: "ana@ploomes.com" } as any,
    tx,
    today: "2026-10-30",
    settings: { holidays: [], workdays: "mon-fri", defaultLanguage: "pt" },
    dryRun: false,
  };
  const run = async <T>(fn: (c: Ctx) => Promise<T>, opts: { dryRun?: boolean } = {}): Promise<T> => {
    await db.exec("begin");
    ctx.dryRun = !!opts.dryRun;
    try {
      const r = await fn(ctx);
      if (opts.dryRun) {
        await db.exec("rollback");
        await runTxHooks(tx, "rollback");
      } else {
        await db.exec("commit");
        await runTxHooks(tx, "commit");
      }
      return r;
    } catch (e) {
      await db.exec("rollback").catch(() => {});
      await runTxHooks(tx, "rollback");
      // o app (withUser) converte erro do banco em ApiError; aqui também, para os testes verem o status
      throw e && typeof e === "object" && "status" in (e as any) ? e : fromDbError(e);
    } finally {
      ctx.dryRun = false;
    }
  };

  await db.exec(`
    create role authenticated; create role anon; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select '${A}'::uuid $$;
    create table profiles (id uuid primary key);
    insert into profiles values ('${A}');
    create table settings (key text primary key, value jsonb);
    create table clients (id uuid primary key default gen_random_uuid(), name text, country text, status text default 'implantacao', archived boolean default false, created_at timestamptz default now());
    create table contacts (id uuid primary key default gen_random_uuid(), name text, role text, email text, phone text, created_at timestamptz default now());
    create table contact_clients (contact_id uuid not null references contacts(id) on delete cascade, client_id uuid not null references clients(id) on delete cascade, primary key (contact_id, client_id));
    create table projects (id uuid primary key default gen_random_uuid(), name text, status text default 'in_progress', pm text, archived boolean default false, created_at timestamptz default now());
    create table project_clients (project_id uuid references projects(id) on delete cascade, client_id uuid references clients(id) on delete cascade);
    create table incidents (id uuid primary key default gen_random_uuid(), title text, status text default 'open', priority text default 'medium', impact text default 'medium', deadline date, created_at timestamptz default now(), status_changed_at timestamptz default now());
    create table incident_clients (incident_id uuid references incidents(id) on delete cascade, client_id uuid references clients(id) on delete cascade);
    create table entries (id uuid primary key default gen_random_uuid(), type text default 'task', name text, project_id uuid, phase_id uuid, incident_id uuid, status text default 'pending',
      planned_start date, planned_end date, planned_date date, actual_end date, hidden_from_plan boolean, "order" int default 0, client_ids uuid[], responsible text, subtasks jsonb default '[]', links jsonb default '[]',
      is_documentation boolean not null default false, created_at timestamptz default now(), updated_at timestamptz default now());
    create table risks (id uuid primary key default gen_random_uuid(), project_id uuid, description text, created_at timestamptz default now());
    create table attachments (id uuid primary key default gen_random_uuid(), entity_type text, entity_id uuid, storage_path text, name text, size bigint, uploaded_by uuid, created_at timestamptz default now());
    create table documentation_items (id uuid primary key default gen_random_uuid(), project_id uuid references projects(id) on delete cascade, client_id uuid references clients(id) on delete cascade,
      kind text not null check (kind in ('link','file','text')), title text not null check (char_length(btrim(title)) between 1 and 200), url text, storage_path text, file_name text, file_size bigint, body text,
      audience text not null default 'both' check (audience in ('technical','executive','both')), tags text[] not null default '{}',
      created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      constraint documentation_items_scope_check check ((project_id is not null) <> (client_id is not null)),
      constraint documentation_items_content_check check ((kind = 'link' and url is not null and btrim(url) <> '') or (kind = 'file' and storage_path is not null) or (kind = 'text')));
    create table documentation_meta (source_key text primary key, audience text not null default 'both', tags text[] not null default '{}', updated_by uuid, updated_at timestamptz not null default now());
    -- collab_reset: o app descarta o documento vivo do editor; aqui só registramos que foi chamado
    create table collab_resets (doc_id text, at timestamptz default now());
    create function collab_reset(p_doc text) returns void language sql as $$ insert into collab_resets (doc_id) values (p_doc) $$;
  `);
  await db.exec(await read("20261030_client_groups.sql"));
  await db.exec(await read("20261031_display_codes.sql"));
  await db.exec(`
    insert into clients (id, name, country) values ('${C[0]}', 'Lockton Brasil', 'BR'), ('${C[1]}', 'Lockton México', 'MX'), ('${C[2]}', 'Acme', 'BR'), ('${C[3]}', 'Beta', 'BR');
    insert into contacts (id, name, role, email) values ('${K[0]}', 'Marina Alves', 'Diretora', 'm@x.com'), ('${K[1]}', 'Pedro Lima', null, null), ('${K[2]}', 'Contato do grupo', 'Sponsor', null);
    insert into contact_clients values ('${K[0]}', '${C[0]}');
    insert into projects (id, name) values ('${P[0]}', 'Implantação Lockton'), ('${P[1]}', 'Projeto da Acme');
    insert into project_clients values ('${P[0]}', '${C[0]}'), ('${P[1]}', '${C[2]}');
    insert into entries (id, name, project_id, is_documentation, links) values
      ('${E[0]}', 'Documentação', '${P[0]}', true, '[{"id":"l1","label":"Manual do administrador","url":"https://wiki/manual"}]'),
      ('${E[1]}', 'Treinamento', '${P[0]}', false, '[{"id":"l9","label":"Fora","url":"https://nao.deve/aparecer"}]');
    insert into attachments (id, entity_type, entity_id, storage_path, name, size) values ('${ATT}', 'entry', '${E[0]}', 'entry/e1/arq.pdf', 'arquitetura.pdf', 2048);
  `);
  return { db, ctx, run, q: async (sql, params = []) => (await db.query(sql, params)).rows };
}
