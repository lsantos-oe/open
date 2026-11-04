-- ═══════════════════════════════════════════════════════════════════════════
-- Notificações: o link leva ao item de que o aviso fala (a tarefa, o comentário, o risco…), não só à tela.
--
--   ?task=<id>      abre a tarefa por cima da página
--   &comment=<id>   com a tarefa aberta, rola até o comentário e o destaca
--   ?tab=<aba>      aba do projeto (overview, plan, risks, diary…)
--   &risk=<id>      na aba de riscos, abre o risco
--   &sub=<seção>    no diário: openPoints, meetings, delayLog ou history
--
-- Só redefine as funções de gatilho (os gatilhos continuam os mesmos). Avisos já gravados não mudam.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Comentário (menção ou resposta) → a tarefa, no comentário ─────────────

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
  end || '&comment=' || new.id;

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

-- ─── Menções em campos de texto → o item mencionado ────────────────────────

create or replace function public.collab_notify_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  col  text := tg_argv[0];
  rec  jsonb := to_jsonb(new);
  v_new text := coalesce(rec ->> col, '');
  v_old text := coalesce(to_jsonb(old) ->> col, '');
  ctx  text;
  lnk  text;
  pid  uuid := nullif(rec ->> 'project_id', '')::uuid;
  iid  uuid := nullif(rec ->> 'incident_id', '')::uuid;
begin
  if v_new = v_old or v_new !~ '\(open:user/' then return null; end if;

  case tg_table_name
    when 'incidents'    then ctx := format('no incidente "%s"', new.title);          lnk := '/support/' || new.id;
    when 'clients'      then ctx := format('nas notas do cliente "%s"', new.name);  lnk := '/wallet/' || new.id;
    when 'projects'     then ctx := format('no projeto "%s"', new.name);            lnk := '/projects/' || new.id || '?tab=overview';
    when 'meeting_logs' then ctx := format('nas notas da reunião "%s"', new.title); lnk := '/projects/' || pid || '?tab=diary&sub=meetings';
    when 'open_points'  then ctx := format('no ponto em aberto "%s"', new.title);
                             lnk := case when iid is not null then '/support/' || iid else '/projects/' || pid || '?tab=diary&sub=openPoints' end;
    when 'history'      then ctx := format('numa nota do histórico ("%s")', new.title);
                             lnk := case when iid is not null then '/support/' || iid else '/projects/' || pid || '?tab=diary&sub=history' end;
    when 'entries'      then ctx := format('na tarefa "%s"', new.name);
                             lnk := case when pid is not null then '/projects/' || pid when iid is not null then '/support/' || iid else '/tasks' end
                                    || '?task=' || new.id;
    when 'risks'        then ctx := 'num risco';                                    lnk := '/projects/' || pid || '?tab=risks&risk=' || new.id;
    when 'delay_log'    then ctx := 'num registro de atraso';                       lnk := '/projects/' || pid || '?tab=diary&sub=delayLog';
    else return null;
  end case;

  insert into notifications (user_id, message, link)
  select p.id, format('Você foi mencionado(a) %s.', ctx), lnk
  from (
    select distinct lower(m[1]) as uid
    from regexp_matches(v_new, '\(open:user/([0-9a-fA-F-]{36})\)', 'g') m
  ) n
  join profiles p on p.id::text = n.uid
  where p.id is distinct from auth.uid()
    and not exists (
      select 1 from regexp_matches(v_old, '\(open:user/([0-9a-fA-F-]{36})\)', 'g') o
      where lower(o[1]) = n.uid
    );
  return null;
end $$;

-- ─── Charter → a seção do charter (aba Visão geral) ────────────────────────

create or replace function public.projects_notify_charter_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, message, link)
  select p.id,
         format('Você foi mencionado(a) no charter do projeto "%s".', new.name),
         '/projects/' || new.id || '?tab=overview'
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
