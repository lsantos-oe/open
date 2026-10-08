-- ═══════════════════════════════════════════════════════════════════════════
-- Editor de blocos — demais campos de texto.
--
-- Dois tipos de campo:
--   • COLABORATIVOS (documento vivo, vários editores ao mesmo tempo): descrição do incidente, notas do
--     cliente, anotações do projeto, notas de reunião, descrição do ponto em aberto e detalhe de histórico.
--     O estado vivo (Yjs) fica em collab_doc_updates; a coluna comum guarda a projeção em Markdown, que é o
--     que relatórios, exportações, IA e importação leem.
--   • LOCAIS (editor de blocos num formulário com "Salvar"): descrição de tarefa, risco, atraso etc.
--     Nesses a coluna comum já é a fonte da verdade — só passa a guardar Markdown. Nada a fazer aqui,
--     exceto avisar quem foi mencionado.
--
-- Proteção da projeção: enquanto existe um documento colaborativo para o campo, só a função
-- collab_set_projection() (chamada pelo editor) altera a coluna. Qualquer outra gravação — por exemplo o
-- UPDATE de linha inteira feito por um navegador com a tela desatualizada — é descartada em silêncio, em vez
-- de apagar o texto que outra pessoa acabou de escrever. Quem quer mesmo substituir o texto por fora (IA,
-- importação, formulário) chama collab_reset() antes, o que descarta o documento vivo.
-- ═══════════════════════════════════════════════════════════════════════════

-- collab_reset sem documento = nada a descartar (evita marcadores inúteis a cada gravação externa).
create or replace function public.collab_reset(p_doc text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  perform pg_advisory_xact_lock(hashtext(p_doc));
  if not exists (select 1 from collab_doc_updates where doc_id = p_doc) then return; end if;
  delete from collab_doc_updates where doc_id = p_doc;
  insert into collab_doc_updates (doc_id, kind, data, created_by) values (p_doc, 'reset', '', auth.uid());
end $$;

-- ─── Campos colaborativos: tabela.coluna → id do documento ─────────────────

-- Retorna "<prefixo>|<campo>" do id do documento, ou null se o campo não é colaborativo.
create or replace function public.collab_field_doc(p_table text, p_column text)
returns text language sql immutable as $$
  select case p_table || '.' || p_column
    when 'incidents.description'   then 'incident|description'
    when 'clients.notes'           then 'client|notes'
    when 'projects.overview'       then 'project|overview'
    when 'meeting_logs.notes'      then 'diary|meeting_notes'
    when 'open_points.description' then 'diary|op_description'
    when 'history.detail'          then 'diary|history_detail'
  end
$$;

-- Grava a projeção Markdown (chamada pelo editor). Só campos da lista acima.
create or replace function public.collab_set_projection(p_table text, p_id uuid, p_column text, p_md text)
returns void
language plpgsql security definer set search_path = public as $$
declare spec text := collab_field_doc(p_table, p_column);
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  if spec is null then raise exception 'Campo não é um documento colaborativo: %.%', p_table, p_column; end if;
  perform set_config('app.collab_projection', split_part(spec, '|', 1) || '_' || p_id || '_' || split_part(spec, '|', 2), true);
  execute format('update public.%I set %I = $1 where id = $2', p_table, p_column) using coalesce(p_md, ''), p_id;
end $$;

revoke all on function public.collab_set_projection(text, uuid, text, text) from public, anon;
grant execute on function public.collab_set_projection(text, uuid, text, text) to authenticated;

-- Guarda: enquanto há documento vivo, só a projeção do editor muda a coluna.
-- Argumentos do trigger: coluna, prefixo do doc_id, nome do campo.
create or replace function public.collab_guard_projection()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  col text := tg_argv[0];
  doc text := tg_argv[1] || '_' || new.id || '_' || tg_argv[2];
begin
  if (to_jsonb(new) ->> col) is not distinct from (to_jsonb(old) ->> col) then return new; end if;
  if coalesce(current_setting('app.collab_projection', true), '') = doc then return new; end if;
  if exists (select 1 from collab_doc_updates where doc_id = doc and kind <> 'reset') then
    new := jsonb_populate_record(new, jsonb_build_object(col, to_jsonb(old) -> col));
  end if;
  return new;
end $$;

do $$
declare r record;
begin
  for r in
    select * from (values
      ('incidents',    'description', 'incident', 'description'),
      ('clients',      'notes',       'client',   'notes'),
      ('projects',     'overview',    'project',  'overview'),
      ('meeting_logs', 'notes',       'diary',    'meeting_notes'),
      ('open_points',  'description', 'diary',    'op_description'),
      ('history',      'detail',      'diary',    'history_detail')
    ) as v(tbl, col, prefix, field)
  loop
    execute format('drop trigger if exists collab_guard_%s_%s on public.%I', r.tbl, r.col, r.tbl);
    execute format(
      'create trigger collab_guard_%s_%s before update of %I on public.%I for each row execute function public.collab_guard_projection(%L, %L, %L)',
      r.tbl, r.col, r.col, r.tbl, r.col, r.prefix, r.field);
  end loop;
end $$;

-- ─── Menções → notificação ─────────────────────────────────────────────────
-- Uma menção é um link markdown [@Nome](open:user/<uuid>). Só avisa quem foi mencionado AGORA (não estava no
-- texto anterior) e nunca quem gravou. Vale para os campos colaborativos e para os locais.
-- Argumentos do trigger: coluna.

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
    when 'projects'     then ctx := format('no projeto "%s"', new.name);            lnk := '/projects/' || new.id;
    when 'meeting_logs' then ctx := format('nas notas da reunião "%s"', new.title); lnk := '/projects/' || pid;
    when 'open_points'  then ctx := format('no ponto em aberto "%s"', new.title);
                             lnk := case when iid is not null then '/support/' || iid else '/projects/' || pid end;
    when 'history'      then ctx := format('numa nota do histórico ("%s")', new.title);
                             lnk := case when iid is not null then '/support/' || iid else '/projects/' || pid end;
    when 'entries'      then ctx := format('na tarefa "%s"', new.name);
                             lnk := case when pid is not null then '/projects/' || pid when iid is not null then '/support/' || iid else '/tasks' end;
    when 'risks'        then ctx := 'num risco';                                    lnk := '/projects/' || pid;
    when 'delay_log'    then ctx := 'num registro de atraso';                       lnk := '/projects/' || pid;
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

do $$
declare r record;
begin
  for r in
    select * from (values
      ('incidents',    'description'),
      ('clients',      'notes'),
      ('projects',     'overview'),
      ('meeting_logs', 'notes'),
      ('open_points',  'description'),
      ('open_points',  'resolution_note'),
      ('history',      'detail'),
      ('entries',      'description'),
      ('risks',        'description'),
      ('delay_log',    'description')
    ) as v(tbl, col)
  loop
    execute format('drop trigger if exists collab_mentions_%s_%s on public.%I', r.tbl, r.col, r.tbl);
    execute format(
      'create trigger collab_mentions_%s_%s after update of %I on public.%I for each row when (old.%I is distinct from new.%I) execute function public.collab_notify_mentions(%L)',
      r.tbl, r.col, r.col, r.tbl, r.col, r.col, r.col);
  end loop;
end $$;
