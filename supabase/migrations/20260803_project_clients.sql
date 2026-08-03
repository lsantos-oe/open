-- ═══════════════════════════════════════════════════════════════════════════
-- Projetos com múltiplos clientes vinculados — mesmo modelo N:N já usado em
-- incident_clients. projects.client_id/client seguem existindo como o
-- cliente "primário" (derivado do primeiro item de clientIds), consumido por
-- código legado (filtros antigos, CSV, chips) que ainda não foi migrado pra
-- lista — a fonte de verdade real passa a ser esta tabela.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists project_clients (
  project_id  uuid not null references projects(id) on delete cascade,
  client_id   uuid not null references clients(id) on delete cascade,
  primary key (project_id, client_id)
);
alter table project_clients enable row level security;

do $$ begin
  create policy "Autenticados gerenciam project_clients" on project_clients
    for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- Backfill: todo projeto que já tem client_id ganha a linha correspondente aqui.
insert into project_clients (project_id, client_id)
select id, client_id from projects where client_id is not null
on conflict do nothing;
