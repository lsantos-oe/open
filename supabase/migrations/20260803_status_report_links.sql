-- ═══════════════════════════════════════════════════════════════════════════
-- Status report como link público (em vez de só HTML baixado/aba nova).
-- O relatório é gerado como HOJE (client-side, a partir do estado atual do
-- projeto) e o HTML resultante é enviado como um snapshot estático pro bucket
-- público abaixo — a pessoa externa nunca acessa dado autenticado, só esse
-- arquivo. A proteção é a URL ser um path aleatório (mesmo modelo "quem tem o
-- link acessa" do Google Docs) — sem senha, sem expiração.
--
-- A tabela status_report_links só é lida/escrita por usuários autenticados
-- (é o "painel de controle" de quem já gerou o quê); o público nunca consulta
-- essa tabela, só acessa o arquivo direto pela URL pública do Storage.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists status_report_links (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  storage_path  text not null,
  label         text not null,
  generated_at  timestamptz not null default now(),
  created_by    uuid references profiles(id)
);
alter table status_report_links enable row level security;

do $$ begin
  create policy "Autenticados gerenciam links de report" on status_report_links
    for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- Storage — bucket público "status-reports"
insert into storage.buckets (id, name, public)
values ('status-reports', 'status-reports', true)
on conflict (id) do nothing;

do $$ begin
  create policy "Qualquer um lê status-reports"
    on storage.objects for select
    using (bucket_id = 'status-reports');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Autenticados enviam status-reports"
    on storage.objects for insert
    with check (bucket_id = 'status-reports' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Autenticados sobrescrevem status-reports"
    on storage.objects for update
    using (bucket_id = 'status-reports' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Autenticados removem status-reports"
    on storage.objects for delete
    using (bucket_id = 'status-reports' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
