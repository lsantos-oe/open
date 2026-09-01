-- ═══════════════════════════════════════════════════════════════════════════
-- Anexos em Projetos, Incidentes e Tarefas (Entry) — nova tabela genérica em
-- vez de repetir o padrão de "attachments jsonb" já usado em meeting_logs e
-- history (que nem sequer estava sendo persistido corretamente pra
-- open_points/meeting_logs — a store nunca chamava sync() de volta). Uma
-- linha por arquivo, sem FK real pra entity_id (é polimórfico: projects,
-- incidents ou entries dependendo de entity_type) — o app garante a
-- integridade, mesma convenção já usada em outros lugares deste schema.
--
-- Reaproveita o bucket 'project-files' já existente (baseline_schema.sql) —
-- mesmas policies de storage.objects, nenhuma mudança necessária ali.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists attachments (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in ('project', 'incident', 'entry')),
  entity_id    uuid not null,
  storage_path text not null,
  name         text not null,
  size         bigint,
  uploaded_by  uuid references profiles(id),
  created_at   timestamptz default now()
);
create index if not exists attachments_entity_idx on attachments(entity_type, entity_id);

alter table attachments enable row level security;
do $$ begin
  create policy "Authenticated users manage attachments" on attachments
    for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
