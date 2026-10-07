-- ═══════════════════════════════════════════════════════════════════════════
-- Editor de blocos colaborativo — infraestrutura + Charter do projeto.
--
-- Formato: o TEXTO dos campos continua sendo Markdown em colunas comuns
-- (projects.charter_doc), que é o que relatórios, exportações, o assistente
-- de IA e a importação leem. Para a edição simultânea, o estado "vivo" do
-- documento (Yjs/CRDT) fica ao lado, em collab_doc_updates; o Markdown é uma
-- projeção que os editores abertos regravam automaticamente.
--
-- collab_doc_updates é append-only: cada edição é uma linha pequena, o
-- Realtime entrega as linhas aos outros editores, e como atualizações de
-- CRDT são idempotentes e comutativas, nenhuma edição se perde mesmo que
-- cheguem fora de ordem ou duplicadas.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Charter: documento único ──────────────────────────────────────────────

alter table projects add column if not exists charter_doc text;

-- Migra os 6 campos longos antigos (jsonb) para seções de um documento só.
-- Quebras de linha viram "hard breaks" do Markdown para preservar o texto
-- como era exibido (pre-wrap). Sponsor e budget continuam campos curtos.
do $$ begin
  update projects set charter_doc = nullif(btrim(concat_ws(E'\n\n',
      case when nullif(btrim(charter->>'objectives'), '') is not null
           then E'## Objetivos\n\n' || replace(btrim(charter->>'objectives'), E'\n', E'  \n') end,
      case when nullif(btrim(charter->>'scope'), '') is not null
           then E'## Escopo\n\n' || replace(btrim(charter->>'scope'), E'\n', E'  \n') end,
      case when nullif(btrim(charter->>'outOfScope'), '') is not null
           then E'## Fora do escopo\n\n' || replace(btrim(charter->>'outOfScope'), E'\n', E'  \n') end,
      case when nullif(btrim(charter->>'successCriteria'), '') is not null
           then E'## Critérios de sucesso\n\n' || replace(btrim(charter->>'successCriteria'), E'\n', E'  \n') end,
      case when nullif(btrim(charter->>'constraints'), '') is not null
           then E'## Restrições\n\n' || replace(btrim(charter->>'constraints'), E'\n', E'  \n') end,
      case when nullif(btrim(charter->>'assumptions'), '') is not null
           then E'## Premissas\n\n' || replace(btrim(charter->>'assumptions'), E'\n', E'  \n') end
    )), '')
  where charter is not null and charter_doc is null;
end $$;

-- ─── Estado colaborativo ───────────────────────────────────────────────────

create table if not exists collab_doc_updates (
  id         bigint generated always as identity primary key,
  -- "<tipo>_<uuid>_<campo>", ex.: project_3f2a..._charter. Só letras, números, hífen e underscore de propósito:
  -- o id vai num filtro do Realtime (doc_id=eq.<id>), e caracteres especiais ali são um risco desnecessário.
  doc_id     text not null check (doc_id ~ '^(project|incident|entry|client|diary)_[0-9a-fA-F-]{36}_[a-z_]{1,40}$'),
  kind       text not null default 'update' check (kind in ('update', 'snapshot', 'reset')),
  data       text not null,                       -- atualização Yjs em base64 ('' no reset)
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists collab_doc_updates_doc_idx on collab_doc_updates(doc_id, id);

alter table collab_doc_updates enable row level security;

-- Mesma abertura do resto do app: todo usuário autenticado edita projetos.
do $$ begin
  create policy "Colab: ler" on collab_doc_updates for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Colab: gravar" on collab_doc_updates for insert to authenticated
    with check (kind = 'update' and (created_by is null or created_by = auth.uid()));
exception when duplicate_object then null; end $$;
-- (sem UPDATE/DELETE direto: só as RPCs abaixo apagam, para compactar ou resetar)

-- Inicializa o documento (a partir do Markdown existente) UMA única vez, mesmo
-- que várias pessoas o abram ao mesmo tempo: quem chega primeiro vence, os
-- outros descartam a própria semente e carregam a que ficou. Retorna true se
-- esta chamada foi a que gravou.
create or replace function public.collab_init(p_doc text, p_data text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  perform pg_advisory_xact_lock(hashtext(p_doc));
  if exists (select 1 from collab_doc_updates where doc_id = p_doc and kind <> 'reset') then
    return false;
  end if;
  insert into collab_doc_updates (doc_id, kind, data, created_by) values (p_doc, 'snapshot', p_data, auth.uid());
  return true;
end $$;

-- Compacta: troca todas as linhas até p_up_to por um único snapshot. Seguro
-- porque o cliente só compacta o que ele mesmo já carregou e fundiu.
create or replace function public.collab_compact(p_doc text, p_data text, p_up_to bigint)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  perform pg_advisory_xact_lock(hashtext(p_doc));
  delete from collab_doc_updates where doc_id = p_doc and id <= p_up_to;
  insert into collab_doc_updates (doc_id, kind, data, created_by) values (p_doc, 'snapshot', p_data, auth.uid());
end $$;

-- Descarta o estado colaborativo (ex.: depois de uma importação que reescreveu
-- o Markdown). Deixa um marcador para os editores abertos saberem que devem
-- recarregar; o próximo a abrir o documento recomeça do Markdown.
create or replace function public.collab_reset(p_doc text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  perform pg_advisory_xact_lock(hashtext(p_doc));
  delete from collab_doc_updates where doc_id = p_doc;
  insert into collab_doc_updates (doc_id, kind, data, created_by) values (p_doc, 'reset', '', auth.uid());
end $$;

revoke all on function public.collab_init(text, text) from public, anon;
revoke all on function public.collab_compact(text, text, bigint) from public, anon;
revoke all on function public.collab_reset(text) from public, anon;
grant execute on function public.collab_init(text, text) to authenticated;
grant execute on function public.collab_compact(text, text, bigint) to authenticated;
grant execute on function public.collab_reset(text) to authenticated;

-- ─── Menções no charter → notificação ──────────────────────────────────────
-- Uma menção é um link markdown [@Nome](open:user/<uuid>). Só avisa quem foi
-- mencionado AGORA (não estava no texto anterior). Quem grava a projeção do
-- Markdown pode não ser quem digitou a menção, então o autor da gravação só
-- é excluído do aviso — quem está com o documento aberto já vê a menção.

create or replace function public.projects_notify_charter_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, message, link)
  select p.id,
         format('Você foi mencionado(a) no charter do projeto "%s".', new.name),
         '/projects/' || new.id
  from (
    select distinct lower(m[1]) as uid
    from regexp_matches(coalesce(new.charter_doc, ''), '\(open:user/([0-9a-fA-F-]{36})\)', 'g') m
  ) n
  join profiles p on p.id::text = n.uid
  where p.id is distinct from auth.uid()
    and not exists (
      select 1 from regexp_matches(coalesce(old.charter_doc, ''), '\(open:user/([0-9a-fA-F-]{36})\)', 'g') o
      where lower(o[1]) = n.uid
    );
  return null;
end $$;

drop trigger if exists projects_notify_charter_mentions_trg on projects;
create trigger projects_notify_charter_mentions_trg after update of charter_doc on projects
  for each row execute function public.projects_notify_charter_mentions();

-- ─── Realtime ──────────────────────────────────────────────────────────────

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table collab_doc_updates; exception when duplicate_object then null; end;
  end if;
end $$;
