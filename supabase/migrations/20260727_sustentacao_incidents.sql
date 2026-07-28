-- ═══════════════════════════════════════════════════════════════════════════
-- Sustentação (Incidents) — new entity, linked N:N to clients and projects,
-- reusing the Diary's Open Points + History (not Meetings) via a new
-- incident_id scope column alongside the existing project_id.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists incidents (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  description         text,
  owner               jsonb,                      -- EntryOwner-shaped
  status              text not null default 'open',   -- open|in_progress|waiting_on_client|resolved|closed
  status_changed_at   timestamptz not null default now(),
  resolved_at         timestamptz,                -- set once, first time status enters resolved/closed — never cleared on reopen
  priority            text not null default 'medium', -- low|medium|high
  impact              text not null default 'medium', -- low|medium|high
  deadline            date,
  created_at          timestamptz default now(),
  created_by          uuid references profiles(id),
  updated_at          timestamptz default now(),
  updated_by          uuid references profiles(id)
);

alter table incidents enable row level security;

do $$ begin
  create policy "Autenticados acessam incidents" on incidents for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- ─── join tables (N:N) ───────────────────────────────────────────────────────

create table if not exists incident_clients (
  incident_id  uuid not null references incidents(id) on delete cascade,
  client_id    uuid not null references clients(id) on delete cascade,
  primary key (incident_id, client_id)
);

alter table incident_clients enable row level security;

do $$ begin
  create policy "Autenticados acessam incident_clients" on incident_clients for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

create table if not exists incident_projects (
  incident_id  uuid not null references incidents(id) on delete cascade,
  project_id   uuid not null references projects(id) on delete cascade,
  primary key (incident_id, project_id)
);

alter table incident_projects enable row level security;

do $$ begin
  create policy "Autenticados acessam incident_projects" on incident_projects for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- ─── stakeholders (owner jsonb — member, free-text, or a client_contacts row) ──

create table if not exists incident_stakeholders (
  id           uuid primary key default gen_random_uuid(),
  incident_id  uuid not null references incidents(id) on delete cascade,
  owner        jsonb not null,   -- EntryOwner-shaped, type also allows 'contact' w/ contactId
  created_at   timestamptz default now()
);

create index if not exists incident_stakeholders_incident_id_idx on incident_stakeholders(incident_id);
alter table incident_stakeholders enable row level security;

do $$ begin
  create policy "Autenticados acessam incident_stakeholders" on incident_stakeholders for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- ─── Diary reuse: open_points + history gain an optional incident_id ─────────
-- (project_id is already nullable on both tables — confirmed via introspection)

alter table open_points add column if not exists incident_id uuid references incidents(id) on delete cascade;
alter table history      add column if not exists incident_id uuid references incidents(id) on delete cascade;
alter table diary_comments add column if not exists incident_id uuid references incidents(id) on delete cascade;

create index if not exists open_points_incident_id_idx on open_points(incident_id);
create index if not exists history_incident_id_idx on history(incident_id);
create index if not exists diary_comments_incident_id_idx on diary_comments(incident_id);

-- Meetings are intentionally NOT extended — Incidents don't get a Meetings sub-tab (confirmed).
