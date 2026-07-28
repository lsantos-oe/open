-- ═══════════════════════════════════════════════════════════════════════════
-- Carteira (Clients) — extend the existing skeleton `clients` table, add
-- client_contacts + client_cs_history, and migrate projects.client (free
-- text) to a real client_id reference.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Extend clients with the fields decided for Carteira ────────────────────

alter table clients add column if not exists country       text;   -- ISO code, see src/data/countries.ts
alter table clients add column if not exists ploomes_link   text;
alter table clients add column if not exists notes          text;

-- ─── client_contacts — client-side people (the stakeholder pool for Incidentes) ──

create table if not exists client_contacts (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  name       text not null,
  role       text,
  email      text,
  phone      text,
  created_at timestamptz default now()
);

create index if not exists client_contacts_client_id_idx on client_contacts(client_id);
alter table client_contacts enable row level security;

do $$ begin
  create policy "Autenticados acessam client_contacts" on client_contacts for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- ─── client_cs_history — CS/owner assignment history ────────────────────────
-- "CS atual" = linha com maior assigned_at por client_id (calculado no client, sem flag no banco)

create table if not exists client_cs_history (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  owner        jsonb not null,   -- EntryOwner-shaped: {id, type: 'member'|'text', memberId?, name, role?}
  assigned_at  date not null,
  note         text,
  created_at   timestamptz default now(),
  created_by   uuid references profiles(id)
);

create index if not exists client_cs_history_client_id_idx on client_cs_history(client_id);
alter table client_cs_history enable row level security;

do $$ begin
  create policy "Autenticados acessam client_cs_history" on client_cs_history for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- ─── projects.client_id — real reference, replacing the free-text client ────
-- (projects.client is kept for now, deprecated — dropped later once nothing reads it)

alter table projects add column if not exists client_id uuid references clients(id) on delete restrict;

-- ─── One-time backfill ───────────────────────────────────────────────────────
-- Note: an earlier version of this migration also seeded clients from
-- settings.value->'clients' (the old free-text client list in Settings).
-- Removed — the `settings` table doesn't actually exist in this database
-- (confirmed via introspection), so that list was never persisted server-side
-- in the first place; nothing to backfill from there.

-- 1. Seed clients from any distinct projects.client string not already covered
insert into clients (id, name, created_at)
select gen_random_uuid(), d.client, now()
from (select distinct client from projects where client is not null and trim(client) <> '') d
where not exists (select 1 from clients existing where existing.name = d.client);

-- 2. Point every project at the matching client by exact name match
update projects p
set client_id = c.id
from clients c
where c.name = p.client
  and p.client_id is null;

-- Note: duplicate client names (e.g. "Acme" vs "ACME Ltda") become two separate
-- `clients` rows here — merge manually in the Carteira UI afterward, by design
-- (no automatic fuzzy-merge).
