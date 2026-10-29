-- ═══════════════════════════════════════════════════════════════════════════
-- Documentação de projetos e clientes.
--
-- • entries.is_documentation: marca a tarefa de projeto cujos links e arquivos alimentam a aba Documentação (do
--   projeto e, somados, do cliente). Pode haver mais de uma por projeto. As tarefas que já se chamam "Documentação"
--   (pt/en/es) são marcadas aqui; o app marca as novas (template e botão na tarefa).
-- • documentation_items: itens colocados DIRETO na aba (link, arquivo ou caixa de texto), de um projeto OU de um
--   cliente. Cada item tem o público (técnico, executivo ou ambos) e etiquetas livres. A caixa de texto é um
--   documento colaborativo (editor de blocos, várias pessoas ao mesmo tempo); a coluna body guarda a projeção em
--   Markdown, como nos demais campos colaborativos.
-- • documentation_meta: público e etiquetas dos itens ESPELHADOS (links e arquivos que moram na tarefa de
--   documentação). O conteúdo continua na tarefa — a aba só espelha —; aqui fica só a classificação.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Tarefa de documentação ────────────────────────────────────────────────

alter table entries add column if not exists is_documentation boolean not null default false;

update entries
   set is_documentation = true
 where project_id is not null
   and type = 'task'
   and not is_documentation
   and lower(translate(btrim(name), 'ãáâàçéêíóôõúüÃÁÂÀÇÉÊÍÓÔÕÚÜ', 'aaaaceeiooouuAAAACEEIOOOUU')) in ('documentacao', 'documentation', 'documentacion');

create index if not exists entries_documentation_idx on entries(project_id) where is_documentation;

-- ─── Itens diretos ─────────────────────────────────────────────────────────

create table if not exists documentation_items (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references projects(id) on delete cascade,
  client_id     uuid references clients(id) on delete cascade,
  kind          text not null check (kind in ('link', 'file', 'text')),
  title         text not null check (char_length(btrim(title)) between 1 and 200),
  url           text,
  storage_path  text,
  file_name     text,
  file_size     bigint,
  body          text,
  audience      text not null default 'both' check (audience in ('technical', 'executive', 'both')),
  tags          text[] not null default '{}',
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- um item é de um projeto OU de um cliente
  constraint documentation_items_scope_check check ((project_id is not null) <> (client_id is not null)),
  -- cada tipo traz o que precisa
  constraint documentation_items_content_check check (
    (kind = 'link' and url is not null and btrim(url) <> '')
    or (kind = 'file' and storage_path is not null)
    or (kind = 'text')
  )
);

create index if not exists documentation_items_project_idx on documentation_items(project_id, created_at desc) where project_id is not null;
create index if not exists documentation_items_client_idx on documentation_items(client_id, created_at desc) where client_id is not null;

create or replace function public.documentation_items_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;

drop trigger if exists documentation_items_touch_trg on documentation_items;
create trigger documentation_items_touch_trg before insert or update on documentation_items
  for each row execute function public.documentation_items_touch();

alter table documentation_items enable row level security;
do $$ begin
  create policy "Autenticados acessam a documentação" on documentation_items for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- ─── Classificação dos itens espelhados ────────────────────────────────────
-- source_key: 'entry-link:<entry_id>:<link_id>' ou 'entry-file:<attachment_id>'.

create table if not exists documentation_meta (
  source_key  text primary key,
  audience    text not null default 'both' check (audience in ('technical', 'executive', 'both')),
  tags        text[] not null default '{}',
  updated_by  uuid references profiles(id),
  updated_at  timestamptz not null default now()
);

alter table documentation_meta enable row level security;
do $$ begin
  create policy "Autenticados acessam a classificação da documentação" on documentation_meta for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- ─── Caixa de texto = documento colaborativo ───────────────────────────────

create or replace function public.collab_field_doc(p_table text, p_column text)
returns text language sql immutable as $$
  select case p_table || '.' || p_column
    when 'incidents.description'      then 'incident|description'
    when 'clients.notes'              then 'client|notes'
    when 'projects.overview'          then 'project|overview'
    when 'meeting_logs.notes'         then 'diary|meeting_notes'
    when 'open_points.description'    then 'diary|op_description'
    when 'history.detail'             then 'diary|history_detail'
    when 'documentation_items.body'   then 'doc|body'
  end
$$;

drop trigger if exists collab_guard_documentation_items_body on documentation_items;
create trigger collab_guard_documentation_items_body before update of body on documentation_items
  for each row execute function public.collab_guard_projection('body', 'doc', 'body');

-- ─── Realtime: a aba atualiza quando outra pessoa mexe ─────────────────────

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table documentation_items; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table documentation_meta; exception when duplicate_object then null; end;
  end if;
end $$;
