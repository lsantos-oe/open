-- ═══════════════════════════════════════════════════════════════════════════
-- Comentários de tarefa em cadeia (como numa rede social): respostas, edição, menções e avisos.
--
-- comments já existia (uma linha por comentário de tarefa, com RLS aberta a qualquer autenticado e author_id
-- sempre nulo). Agora:
--   • parent_id: resposta a outro comentário (um nível de aninhamento; responder a uma resposta anexa à mesma
--     cadeia, como no Facebook);
--   • updated_at: marca "editado";
--   • autor confiável: o banco grava author_id/author_name a partir de quem está logado (o cliente não pode se
--     passar por outra pessoa) e só o autor — ou um admin — edita/apaga (comentários antigos, sem autor, seguem
--     livres para todos, como eram);
--   • avisos: quem foi mencionado ([@Nome](open:user/<uuid>)) e o autor do comentário respondido recebem uma
--     notificação com link direto para a tarefa (?task=<id>);
--   • Realtime: a conversa de uma tarefa aberta atualiza sozinha.
-- ═══════════════════════════════════════════════════════════════════════════

alter table comments add column if not exists parent_id  uuid references comments(id) on delete cascade;
alter table comments add column if not exists updated_at timestamptz;

create index if not exists comments_entry_created_idx on comments(entry_id, created_at);
create index if not exists comments_parent_idx on comments(parent_id);

-- ─── Integridade e autoria ─────────────────────────────────────────────────

create or replace function public.comments_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_parent comments%rowtype;
begin
  if tg_op = 'INSERT' then
    -- Quem informa um autor só pode informar a si mesmo: o banco troca por quem está logado (e pelo nome/avatar
    -- do perfil). Linhas SEM autor (restauração/importação de backup, comentários antigos) seguem como vierem.
    if auth.uid() is not null and new.author_id is not null then
      new.author_id := auth.uid();
      new.author_name := coalesce((select name from profiles where id = auth.uid()), new.author_name);
      new.author_avatar := coalesce((select avatar_url from profiles where id = auth.uid()), new.author_avatar);
    end if;
    if new.parent_id is not null then
      select * into v_parent from comments where id = new.parent_id;
      if not found then raise exception 'O comentário respondido não existe mais.'; end if;
      if v_parent.entry_id is distinct from new.entry_id then raise exception 'A resposta precisa ser da mesma tarefa.'; end if;
      -- Um nível só: responder a uma resposta anexa à cadeia do comentário original.
      if v_parent.parent_id is not null then new.parent_id := v_parent.parent_id; end if;
    end if;
    return new;
  end if;

  -- UPDATE: só o texto muda.
  if new.entry_id is distinct from old.entry_id or new.project_id is distinct from old.project_id
     or new.parent_id is distinct from old.parent_id or new.author_id is distinct from old.author_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Só o texto do comentário pode ser editado.';
  end if;
  if new.text is distinct from old.text then new.updated_at := now(); end if;
  return new;
end $$;

drop trigger if exists comments_before_write_trg on comments;
create trigger comments_before_write_trg before insert or update on comments
  for each row execute function public.comments_before_write();

-- ─── RLS: todos leem e comentam; só o autor (ou admin) edita/apaga ─────────

drop policy if exists "Autenticados acessam comentários" on comments;

do $$ begin
  create policy "Comentários: ler" on comments for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Comentários: criar" on comments for insert to authenticated
    with check (author_id is null or author_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Comentários: editar" on comments for update to authenticated
    using (author_id is null or author_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
    with check (author_id is null or author_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Comentários: apagar" on comments for delete to authenticated
    using (author_id is null or author_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
exception when duplicate_object then null; end $$;

-- ─── Avisos: menções e respostas ───────────────────────────────────────────

create or replace function public.comments_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_task   text;
  v_pid    uuid;
  v_iid    uuid;
  v_link   text;
  v_author text := coalesce(new.author_name, 'Alguém');
  v_old    text := case when tg_op = 'UPDATE' then coalesce(old.text, '') else '' end;
  v_parent_author uuid;
begin
  select e.name, e.project_id, e.incident_id into v_task, v_pid, v_iid from entries e where e.id = new.entry_id;
  if v_task is null then return null; end if;   -- comentário de subtarefa (não é linha de entries): sem aviso
  v_link := case
    when v_pid is not null then '/projects/' || v_pid || '?task=' || new.entry_id
    when v_iid is not null then '/support/'  || v_iid || '?task=' || new.entry_id
    else '/tasks?task=' || new.entry_id
  end;

  -- Menções novas neste texto (não estavam no anterior), exceto o próprio autor.
  insert into notifications (user_id, message, link)
  select p.id, format('%s mencionou você num comentário da tarefa "%s".', v_author, v_task), v_link
  from (
    select distinct lower(m[1]) as uid
    from regexp_matches(coalesce(new.text, ''), '\(open:user/([0-9a-fA-F-]{36})\)', 'g') m
  ) n
  join profiles p on p.id::text = n.uid
  where p.id is distinct from new.author_id
    and not exists (
      select 1 from regexp_matches(v_old, '\(open:user/([0-9a-fA-F-]{36})\)', 'g') o where lower(o[1]) = n.uid
    );

  -- Resposta: avisa o autor do comentário respondido (se ainda não foi avisado por menção).
  if tg_op = 'INSERT' and new.parent_id is not null then
    select author_id into v_parent_author from comments where id = new.parent_id;
    if v_parent_author is not null and v_parent_author is distinct from new.author_id
       and coalesce(new.text, '') !~* ('\(open:user/' || v_parent_author::text || '\)') then
      insert into notifications (user_id, message, link)
      values (v_parent_author, format('%s respondeu ao seu comentário na tarefa "%s".', v_author, v_task), v_link);
    end if;
  end if;
  return null;
end $$;

drop trigger if exists comments_notify_trg on comments;
create trigger comments_notify_trg after insert or update of text on comments
  for each row execute function public.comments_notify();

-- ─── Realtime ──────────────────────────────────────────────────────────────

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table comments; exception when duplicate_object then null; end;
  end if;
end $$;
