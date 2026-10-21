-- ═══════════════════════════════════════════════════════════════════════════
-- Alertas no Discord (mensagem direta) para tarefas.
--
-- Cada pessoa liga o próprio Discord no perfil (Edge Function `discord-link`, que confirma com uma DM de teste)
-- e escolhe quais avisos quer:
--   • assigned — alguém atribuiu uma tarefa a você (ou criou já com você);
--   • changed  — outra pessoa alterou uma tarefa sua (status, prazo, nome, descrição, risco ou saída da tarefa);
--   • due      — a tarefa vence amanhã e no dia (fuso America/Sao_Paulo; tarefas concluídas não avisam).
--
-- Como funciona: gatilhos no banco (valem seja qual for o cliente que gravou: tela, IA, importação) só ENFILEIRAM
-- linhas em discord_outbox; a Edge Function `discord-dispatch` (chamada a cada minuto por pg_cron — ver
-- supabase/discord_cron.sql) agrupa por pessoa e envia. Assim uma importação de 500 tarefas vira UMA mensagem.
-- Nunca avisa quem fez a alteração. Só tarefas (type = 'task'); subtarefas (embutidas em jsonb) não avisam.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Perfil ────────────────────────────────────────────────────────────────

alter table profiles add column if not exists discord_user_id  text;
alter table profiles add column if not exists discord_username text;
alter table profiles add column if not exists discord_prefs    jsonb not null
  default '{"assigned": true, "changed": true, "due": true}'::jsonb;

do $$ begin
  alter table profiles add constraint profiles_discord_user_id_check check (discord_user_id is null or discord_user_id ~ '^[0-9]{15,25}$');
exception when duplicate_object then null; end $$;

-- Uma conta do Discord por pessoa.
create unique index if not exists profiles_discord_user_id_uniq on profiles(discord_user_id) where discord_user_id is not null;

-- A ligação com o Discord só muda pela Edge Function (service role, auth.uid() nulo): ela confirma com uma DM que a
-- conta existe, está no servidor e aceita mensagens. O cliente continua livre para mudar as preferências.
create or replace function public.profiles_discord_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null
     and (new.discord_user_id is distinct from old.discord_user_id or new.discord_username is distinct from old.discord_username) then
    raise exception 'A conta do Discord só pode ser ligada pelo botão Conectar do perfil.';
  end if;
  return new;
end $$;

drop trigger if exists profiles_discord_guard_trg on profiles;
create trigger profiles_discord_guard_trg before update on profiles
  for each row execute function public.profiles_discord_guard();

-- ─── Fila de envio ─────────────────────────────────────────────────────────

create table if not exists discord_outbox (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references profiles(id) on delete cascade,
  kind        text not null check (kind in ('assigned', 'changed', 'due_tomorrow', 'due_today')),
  entry_id    uuid references entries(id) on delete cascade,
  task_name   text not null,
  detail      text,          -- changed: o que mudou; assigned: prazo
  actor_name  text,
  link        text,          -- relativo ao app (/projects/<id>?task=<id>)
  ref_date    date,          -- due_*: o prazo avisado (reagendar a tarefa gera novo aviso)
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  attempts    integer not null default 0,
  last_error  text
);

create unique index if not exists discord_outbox_due_uniq on discord_outbox(user_id, entry_id, kind, ref_date)
  where kind in ('due_tomorrow', 'due_today');
create index if not exists discord_outbox_pending_idx on discord_outbox(id) where sent_at is null;

-- Só o service role (Edge Function e gatilhos security definer) lê e escreve.
alter table discord_outbox enable row level security;

-- ─── Rótulos ───────────────────────────────────────────────────────────────

create or replace function public.discord_status_label(s text)
returns text language sql immutable as $$
  select case coalesce(s, 'pending')
    when 'pending' then 'Backlog'
    when 'todo' then 'To Do'
    when 'in_progress' then 'Em andamento'
    when 'validation' then 'Validação/Teste'
    when 'done' then 'Concluído'
    when 'blocked' then 'Bloqueado'
    when 'overdue' then 'Atrasado'
    else s
  end
$$;

create or replace function public.discord_risk_label(s text)
returns text language sql immutable as $$
  select case coalesce(s, 'none') when 'none' then 'OK' when 'warning' then 'Atenção' when 'critical' then 'Crítico' else s end
$$;

create or replace function public.discord_date_label(d date)
returns text language sql immutable as $$
  select coalesce(to_char(d, 'DD/MM/YYYY'), 'sem prazo')
$$;

-- Quem está na tarefa: donos do tipo "member" (executor e validador) + o responsável legado.
create or replace function public.discord_entry_members(p_owners jsonb, p_responsible uuid, p_executors_only boolean default false)
returns text[] language sql immutable as $$
  select coalesce(array_agg(distinct x), '{}'::text[]) from (
    select o->>'memberId' as x
    from jsonb_array_elements(case when jsonb_typeof(p_owners) = 'array' then p_owners else '[]'::jsonb end) o
    where o->>'type' = 'member'
      and (not p_executors_only or coalesce(o->>'kind', 'executor') <> 'validator')
    union
    select p_responsible::text
  ) s where x is not null
$$;

-- ─── Gatilho: tarefa atribuída / alterada por outra pessoa ─────────────────

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

drop trigger if exists discord_enqueue_entry_events_trg on entries;
create trigger discord_enqueue_entry_events_trg
  after insert or update of name, description, status, planned_end, risk_flag, owners, responsible_member_id on entries
  for each row execute function public.discord_enqueue_entry_events();

-- ─── Vencimentos: 1 dia antes e no dia (rodado 1x por dia pelo pg_cron) ────

create or replace function public.discord_enqueue_due()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_count integer;
begin
  with t as (
    select e.id, e.name, e.planned_end, e.project_id, e.incident_id, e.owners, e.responsible_member_id
    from entries e
    left join projects pr on pr.id = e.project_id
    where e.type = 'task'
      and e.planned_end in (v_today, v_today + 1)
      and coalesce(e.status, 'pending') <> 'done'
      and (e.project_id is null or coalesce(pr.archived, false) = false)
  ), ins as (
    insert into discord_outbox (user_id, kind, entry_id, task_name, link, ref_date)
    select p.id,
           case when t.planned_end = v_today then 'due_today' else 'due_tomorrow' end,
           t.id, t.name,
           case
             when t.project_id is not null then '/projects/' || t.project_id || '?task=' || t.id
             when t.incident_id is not null then '/support/' || t.incident_id || '?task=' || t.id
             else '/tasks?task=' || t.id
           end,
           t.planned_end
    from t
    cross join lateral unnest(public.discord_entry_members(t.owners, t.responsible_member_id, true)) as u(uid)
    join profiles p on p.id::text = u.uid
    where p.active
      and p.discord_user_id is not null
      and coalesce(p.discord_prefs->>'due', 'true') <> 'false'
    on conflict do nothing
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end $$;

-- Só o cron/service role chama.
revoke all on function public.discord_enqueue_due() from public, anon, authenticated;

-- Falha de envio: conta a tentativa e guarda o motivo (usada pelo discord-dispatch).
create or replace function public.discord_outbox_fail(p_ids bigint[], p_error text)
returns void language sql security definer set search_path = public as $$
  update discord_outbox set attempts = attempts + 1, last_error = p_error where id = any (p_ids) and sent_at is null
$$;

revoke all on function public.discord_outbox_fail(bigint[], text) from public, anon, authenticated;
