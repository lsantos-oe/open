-- ═══════════════════════════════════════════════════════════════════════════
-- OpEn — baseline schema snapshot (2026-07-27)
--
-- Este arquivo documenta o estado REAL do banco de produção nesta data —
-- obtido via introspecção direta (information_schema + pg_policies), não
-- reconstruído a partir do código. Ele substitui a antiga
-- 20260430_diary.sql como referência de verdade: aquela migration estava
-- desatualizada (o schema real já evoluiu bastante além dela — ver notas
-- abaixo) e cobria só 4 das 12 tabelas existentes.
--
-- Todo `create table if not exists` e toda policy usam guards para poder
-- rodar com segurança tanto num projeto novo/vazio quanto (parcialmente,
-- de forma idempotente) contra a produção atual sem duplicar nada.
--
-- Não inclui CHECK constraints: nenhuma existe hoje em produção (os "enums"
-- de status/tipo/prioridade etc. são validados só no código TypeScript, não
-- no banco). Deixei assim de propósito — adicionar constraint numa tabela
-- com dados existentes pode falhar se algum valor divergir, e isso não fazia
-- parte do escopo desta correção.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── profiles ──────────────────────────────────────────────────────────────

create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text,
  email       text,
  avatar_url  text,
  created_at  timestamptz default now()
);

alter table profiles enable row level security;

do $$ begin
  create policy "Usuário edita próprio perfil" on profiles for update using (auth.uid() = id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Usuários veem todos os perfis" on profiles for select using (true);
exception when duplicate_object then null; end $$;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();


-- ─── clients (Carteira — só o esqueleto criado numa fase anterior) ─────────

create table if not exists clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz default now(),
  created_by  uuid references profiles(id)
);

alter table clients enable row level security;

do $$ begin
  create policy "Todos usuários autenticados veem clientes" on clients for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


-- ─── projects ──────────────────────────────────────────────────────────────

create table if not exists projects (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  client           text,
  type             text,
  pm               text,
  dev_lead         text,
  dev_type         text,
  dev_integration  text,
  language         text default 'pt',
  status           text default 'planning',
  baseline_set_at  timestamptz,
  archived         boolean default false,
  overview         text,
  charter          jsonb,
  team             jsonb default '[]'::jsonb,   -- TeamMember[] — cada item pode ter um user_id opcional (→ profiles.id)
  links            jsonb default '[]'::jsonb,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  created_by       uuid references profiles(id),
  updated_by       uuid references profiles(id)
);

alter table projects enable row level security;

do $$ begin
  create policy "Todos usuários autenticados veem projetos" on projects for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


-- ─── phases ────────────────────────────────────────────────────────────────

create table if not exists phases (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id) on delete cascade,
  name        text not null,
  "order"     integer default 0,
  created_at  timestamptz default now()
);

alter table phases enable row level security;

do $$ begin
  create policy "Autenticados acessam fases" on phases for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


-- ─── entries (subtasks embutidos como jsonb, não são linhas separadas) ──────

create table if not exists entries (
  id                     uuid primary key default gen_random_uuid(),
  project_id             uuid references projects(id) on delete cascade,
  phase_id               uuid references phases(id) on delete cascade,
  type                   text not null,
  name                   text not null,
  responsible            text,
  responsible_member_id  uuid references profiles(id),   -- exige usuário real cadastrado, não um id local de team member
  depends_on             jsonb default '[]'::jsonb,
  is_critical            boolean default false,
  planned_start          date,
  planned_end            date,
  planned_date           date,
  planned_time           text,
  baseline_start         date,
  baseline_end           date,
  baseline_date          date,
  actual_start           date,
  actual_end             date,
  duration_days          integer,
  duration_hours         numeric,
  risk_flag              text default 'none',
  status                 text default 'pending',
  status_override        boolean default false,
  "order"                integer default 0,
  links                  jsonb default '[]'::jsonb,
  subtasks               jsonb default '[]'::jsonb,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now(),
  created_by             uuid references profiles(id),
  updated_by             uuid references profiles(id),
  parent_entry_id        uuid references entries(id),
  owners                 jsonb default '[]'::jsonb,
  hidden_from_plan       boolean default false
);

alter table entries enable row level security;

do $$ begin
  create policy "Autenticados acessam entries" on entries for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


-- ─── comments (comentários de entry) ────────────────────────────────────────

create table if not exists comments (
  id             uuid primary key default gen_random_uuid(),
  entry_id       uuid references entries(id),
  project_id     uuid references projects(id),
  text           text not null,
  author_id      uuid references profiles(id),
  author_name    text,
  author_avatar  text,
  created_at     timestamptz default now()
);

alter table comments enable row level security;

do $$ begin
  create policy "Autenticados acessam comentários" on comments for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


-- ─── delay_log ─────────────────────────────────────────────────────────────

create table if not exists delay_log (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references projects(id),
  entry_id        uuid references entries(id),
  entry_name      text,
  days            integer,
  responsibility  text,
  type            text,
  description     text,
  triggered_by    text default 'manual',
  created_at      timestamptz default now(),
  created_by      uuid references profiles(id)
);

alter table delay_log enable row level security;

do $$ begin
  create policy "Autenticados acessam delay log" on delay_log for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


-- ─── risks ─────────────────────────────────────────────────────────────────

create table if not exists risks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references projects(id),
  description   text not null,
  probability   text,
  impact        text,
  score         integer,
  status        text default 'open',
  owner         text,
  due_date      date,
  linked_entry_ids  jsonb default '[]'::jsonb,
  action_tasks      jsonb default '[]'::jsonb,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  created_by    uuid references profiles(id)
);

alter table risks enable row level security;

do $$ begin
  create policy "Autenticados acessam riscos" on risks for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


-- ─── open_points (Diário) ────────────────────────────────────────────────────

create table if not exists open_points (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid references projects(id),
  title             text,
  description       text not null,
  status            text default 'open',
  priority          text default 'medium',
  owner             text,                              -- texto livre (fallback)
  owner_user_id     uuid references profiles(id),       -- vínculo real, quando aplicável
  due_date          date,
  linked_entry_id   uuid references entries(id),
  linked_phase_id   uuid references phases(id),
  resolution_note   text,
  resolved_at       timestamptz,
  resolved_by       uuid references profiles(id),
  created_at        timestamptz default now(),
  created_by        uuid references profiles(id),
  created_by_name   text,
  created_by_avatar text
);

alter table open_points enable row level security;

do $$ begin
  create policy "Autenticados acessam open_points" on open_points for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


-- ─── meeting_logs (Diário) ───────────────────────────────────────────────────

create table if not exists meeting_logs (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid references projects(id),
  title               text not null,
  date                date not null,
  participants        jsonb default '[]'::jsonb,   -- EntryOwner[] — membro real ou texto livre
  notes               text,
  items               jsonb default '[]'::jsonb,   -- MeetingItem[]
  attachments         jsonb default '[]'::jsonb,   -- FileAttachment[]
  created_at          timestamptz default now(),
  created_by          uuid references profiles(id),
  created_by_name     text,
  created_by_avatar   text,
  updated_at          timestamptz,
  updated_by          uuid references profiles(id),
  updated_by_name     text
);

alter table meeting_logs enable row level security;

do $$ begin
  create policy "Autenticados acessam meeting_logs" on meeting_logs for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


-- ─── history (Diário) ────────────────────────────────────────────────────────

create table if not exists history (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid references projects(id),
  type           text default 'auto',      -- 'auto' | 'manual'
  event          text not null,
  title          text not null,
  detail         text,
  linked_id      text,
  linked_type    text,
  attachments    jsonb default '[]'::jsonb,
  date           timestamptz default now(),
  author_id      uuid references profiles(id),
  author_name    text,
  author_avatar  text
);

alter table history enable row level security;

do $$ begin
  create policy "Autenticados acessam history" on history for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


-- ─── diary_comments (comentários de open_points/meetings/history) ───────────

create table if not exists diary_comments (
  id             uuid primary key default gen_random_uuid(),
  parent_id      uuid not null,
  parent_type    text not null,   -- 'open_point' | 'meeting' | 'history'
  project_id     uuid references projects(id),
  text           text not null,
  author_id      uuid references profiles(id),
  author_name    text,
  author_avatar  text,
  author_role    text,
  created_at     timestamptz default now()
);

alter table diary_comments enable row level security;

do $$ begin
  create policy "Autenticados acessam diary_comments" on diary_comments for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


-- ─── settings (linha única compartilhada, key='config') ─────────────────────

create table if not exists settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz,
  updated_by  uuid references profiles(id)
);

alter table settings enable row level security;

do $$ begin
  create policy "Autenticados leem e escrevem settings" on settings for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- Storage — bucket "project-files" (nunca foi criado de verdade em produção;
-- só existia como SQL comentado na migration antiga. Sem isso, upload de
-- anexo em Open Points/Reuniões falha.)
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

do $$ begin
  create policy "Authenticated users can upload project files"
    on storage.objects for insert
    with check (bucket_id = 'project-files' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Authenticated users can read project files"
    on storage.objects for select
    using (bucket_id = 'project-files' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Authenticated users can delete project files"
    on storage.objects for delete
    using (bucket_id = 'project-files' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
