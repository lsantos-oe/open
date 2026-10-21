-- ═══════════════════════════════════════════════════════════════════════════
-- Correção: alterar a descrição de uma tarefa falhava com "malformed array literal: descrição alterada".
--
-- No gatilho dos alertas do Discord, `v_changes || 'descrição alterada'` faz o Postgres tratar o texto solto como
-- um array literal. Todas as outras alterações usavam format(), que devolve text, e por isso funcionavam. Trocado por
-- array_append. O erro derrubava o salvamento da tarefa inteira (o gatilho roda antes de saber se há destinatário),
-- então valia para qualquer pessoa, tendo ou não conectado o Discord.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.discord_enqueue_entry_events()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor      uuid := auth.uid();
  v_actor_name text;
  v_link       text;
  v_old        text[] := '{}';
  v_new        text[];
  v_changes    text[] := '{}';
  v_detail     text;
begin
  if new.type is distinct from 'task' then return null; end if;

  if tg_op = 'UPDATE' then
    v_old := public.discord_entry_members(old.owners, old.responsible_member_id);
  end if;
  v_new := public.discord_entry_members(new.owners, new.responsible_member_id);

  select coalesce(nullif(btrim(name), ''), 'Alguém') into v_actor_name from profiles where id = v_actor;
  v_actor_name := coalesce(v_actor_name, 'Alguém');

  v_link := case
    when new.project_id is not null then '/projects/' || new.project_id || '?task=' || new.id
    when new.incident_id is not null then '/support/' || new.incident_id || '?task=' || new.id
    else '/tasks?task=' || new.id
  end;

  -- Atribuída (inclui "criada já com você")
  insert into discord_outbox (user_id, kind, entry_id, task_name, detail, actor_name, link)
  select p.id, 'assigned', new.id, new.name,
         case when new.planned_end is not null then 'Prazo: ' || public.discord_date_label(new.planned_end) end,
         v_actor_name, v_link
  from unnest(v_new) as u(uid)
  join profiles p on p.id::text = u.uid
  where p.id is distinct from v_actor
    and p.discord_user_id is not null
    and coalesce(p.discord_prefs->>'assigned', 'true') <> 'false'
    and not (u.uid = any (v_old));

  if tg_op <> 'UPDATE' then return null; end if;

  -- Alterações relevantes
  if new.status is distinct from old.status then
    v_changes := v_changes || format('status: %s → %s', public.discord_status_label(old.status), public.discord_status_label(new.status));
  end if;
  if new.planned_end is distinct from old.planned_end then
    v_changes := v_changes || format('prazo: %s → %s', public.discord_date_label(old.planned_end), public.discord_date_label(new.planned_end));
  end if;
  if new.name is distinct from old.name then
    v_changes := v_changes || format('nome (antes: "%s")', left(old.name, 60));
  end if;
  if new.description is distinct from old.description then
    v_changes := array_append(v_changes, 'descrição alterada');
  end if;
  if new.risk_flag is distinct from old.risk_flag then
    v_changes := v_changes || format('risco: %s → %s', public.discord_risk_label(old.risk_flag), public.discord_risk_label(new.risk_flag));
  end if;

  if cardinality(v_changes) > 0 then
    v_detail := array_to_string(v_changes, '; ');
    insert into discord_outbox (user_id, kind, entry_id, task_name, detail, actor_name, link)
    select p.id, 'changed', new.id, new.name, v_detail, v_actor_name, v_link
    from unnest(v_new) as u(uid)
    join profiles p on p.id::text = u.uid
    where p.id is distinct from v_actor
      and p.discord_user_id is not null
      and coalesce(p.discord_prefs->>'changed', 'true') <> 'false'
      and u.uid = any (v_old);   -- quem acabou de entrar já recebeu o aviso de atribuição
  end if;

  -- Saiu da tarefa
  insert into discord_outbox (user_id, kind, entry_id, task_name, detail, actor_name, link)
  select p.id, 'changed', new.id, new.name, 'você foi removido(a) da tarefa', v_actor_name, v_link
  from unnest(v_old) as u(uid)
  join profiles p on p.id::text = u.uid
  where p.id is distinct from v_actor
    and p.discord_user_id is not null
    and coalesce(p.discord_prefs->>'changed', 'true') <> 'false'
    and not (u.uid = any (v_new));

  return null;
end $$;
