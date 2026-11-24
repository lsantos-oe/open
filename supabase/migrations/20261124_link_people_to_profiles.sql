-- ═══════════════════════════════════════════════════════════════════════════
-- Pessoas gravadas só pelo nome → usuários do Open.
--
-- Por que a mesma pessoa aparecia duas vezes (filtro de responsável, grupos, carga):
--   • responsáveis de tarefa em TEXTO LIVRE ("Leonardo Papst" digitado, sem vínculo com o usuário);
--   • tarefas antigas, só com `responsible` (nome) e sem `owners`/`responsible_member_id`;
--   • subtarefas (jsonb dentro de entries.subtasks) cujo `responsible_member_id` o app ignorava;
--   • líder / dev lead / equipe de projetos gravados só pelo nome.
-- Para o app, "usuário" e "nome solto" eram duas pessoas diferentes.
--
-- Esta migração liga ao usuário (perfil ativo) quem foi gravado só pelo nome, quando o nome (sem acento, sem diferenciar
-- maiúsculas) bate com UM ÚNICO usuário ativo — na equipe do projeto também vale o e-mail. Nomes de papel ("Dev",
-- "Cliente", "OE", "Urbs", "TI"…), de pessoas que não são usuárias e nomes ambíguos NÃO são tocados.
-- Não muda nome, datas nem status de nada; pode rodar de novo (só age no que ainda não está ligado).
--
-- Tudo roda num bloco só (uma transação). Ligar o responsável faz o gatilho do Discord enfileirar "você foi atribuído"
-- como se a pessoa tivesse acabado de entrar na tarefa: esses avisos são descartados no final do próprio bloco.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  n_owners   int := 0;
  n_legacy   int := 0;
  n_resp     int := 0;
  n_subtasks int := 0;
  n_pm       int := 0;
  n_dev      int := 0;
  n_team     int := 0;
  n_inc      int := 0;
  n_stake    int := 0;
  n_outbox   int := 0;
begin
  -- nome sem acento, minúsculo, espaços normalizados
  execute $f$
    create or replace function pg_temp._fold(t text) returns text language sql immutable as
    $b$ select btrim(regexp_replace(translate(lower(coalesce(t, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '\s+', ' ', 'g')) $b$
  $f$;

  -- usuários ativos com nome ÚNICO (nome ambíguo não liga ninguém)
  create temp table _by_name on commit drop as
    select (array_agg(id))[1] as id, (array_agg(name))[1] as name, pg_temp._fold(name) as k
      from profiles
     where active and btrim(coalesce(name, '')) <> ''
     group by pg_temp._fold(name)
    having count(*) = 1;
  create temp table _by_email on commit drop as
    select (array_agg(id))[1] as id, (array_agg(name))[1] as name, lower(btrim(email)) as k
      from profiles
     where active and btrim(coalesce(email, '')) <> ''
     group by lower(btrim(email))
    having count(*) = 1;

  -- 1) responsáveis em texto livre (entries.owners) → usuário
  with fixed as (
    select e.id,
           (select jsonb_agg(
                     case when o->>'type' = 'text' and nullif(o->>'memberId', '') is null and nullif(o->>'contactId', '') is null and m.id is not null
                          then jsonb_strip_nulls(jsonb_build_object(
                                 'id', case when o->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then o->>'id' else gen_random_uuid()::text end,
                                 'type', 'member', 'memberId', m.id, 'name', m.name, 'kind', o->'kind'))
                          else o end
                     order by t.ord)
              from jsonb_array_elements(e.owners) with ordinality t(o, ord)
              left join _by_name m on m.k = pg_temp._fold(o->>'name')) as new_owners
      from entries e
     where jsonb_typeof(e.owners) = 'array'
       and exists (select 1 from jsonb_array_elements(e.owners) o join _by_name m on m.k = pg_temp._fold(o->>'name')
                    where o->>'type' = 'text' and nullif(o->>'memberId', '') is null and nullif(o->>'contactId', '') is null)
  ), done as (
    update entries e set owners = f.new_owners from fixed f where e.id = f.id and e.owners is distinct from f.new_owners returning e.id
  ) select count(*) into n_owners from done;

  -- 2) tarefas antigas: só `responsible` (nome), sem owners → executor ligado ao usuário
  with done as (
    update entries e
       set responsible_member_id = m.id,
           owners = jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'type', 'member', 'memberId', m.id, 'name', m.name, 'kind', 'executor'))
      from _by_name m
     where (e.owners is null or e.owners = '[]'::jsonb)
       and e.responsible_member_id is null
       and m.k = pg_temp._fold(e.responsible)
    returning e.id
  ) select count(*) into n_legacy from done;

  -- 3) responsável principal (coluna) sem usuário, mas com nome de usuário
  with done as (
    update entries e set responsible_member_id = m.id
      from _by_name m
     where e.responsible_member_id is null and m.k = pg_temp._fold(e.responsible)
       and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(e.owners) = 'array' then e.owners else '[]'::jsonb end) o where o->>'type' = 'contact')
    returning e.id
  ) select count(*) into n_resp from done;

  -- 4) subtarefas (jsonb em entries.subtasks): responsible_member_id pelo nome
  with fixed as (
    select e.id,
           (select jsonb_agg(
                     case when nullif(s->>'responsible_member_id', '') is null and m.id is not null
                          then s || jsonb_build_object('responsible_member_id', m.id)
                          else s end
                     order by t.ord)
              from jsonb_array_elements(e.subtasks) with ordinality t(s, ord)
              left join _by_name m on m.k = pg_temp._fold(s->>'responsible')) as new_subtasks
      from entries e
     where jsonb_typeof(e.subtasks) = 'array'
       and exists (select 1 from jsonb_array_elements(e.subtasks) s join _by_name m on m.k = pg_temp._fold(s->>'responsible')
                    where nullif(s->>'responsible_member_id', '') is null)
  ), done as (
    update entries e set subtasks = f.new_subtasks from fixed f where e.id = f.id and e.subtasks is distinct from f.new_subtasks returning e.id
  ) select count(*) into n_subtasks from done;

  -- 5) projetos: líder e dev lead
  with done as (
    update projects p set pm_member_id = m.id from _by_name m
     where p.pm_member_id is null and m.k = pg_temp._fold(p.pm) returning p.id
  ) select count(*) into n_pm from done;
  with done as (
    update projects p set dev_lead_member_id = m.id from _by_name m
     where p.dev_lead_member_id is null and m.k = pg_temp._fold(p.dev_lead) returning p.id
  ) select count(*) into n_dev from done;

  -- 6) projetos: equipe (jsonb) — pelo e-mail ou, na falta, pelo nome
  with fixed as (
    select p.id,
           (select jsonb_agg(
                     case when nullif(x->>'user_id', '') is null and coalesce(me.id, mn.id) is not null
                          then x || jsonb_build_object('user_id', coalesce(me.id, mn.id))
                          else x end
                     order by t.ord)
              from jsonb_array_elements(p.team) with ordinality t(x, ord)
              left join _by_email me on me.k = lower(btrim(x->>'email'))
              left join _by_name mn on mn.k = pg_temp._fold(x->>'name')) as new_team
      from projects p
     where jsonb_typeof(p.team) = 'array'
       and exists (select 1 from jsonb_array_elements(p.team) x
                    left join _by_email me on me.k = lower(btrim(x->>'email'))
                    left join _by_name mn on mn.k = pg_temp._fold(x->>'name')
                    where nullif(x->>'user_id', '') is null and coalesce(me.id, mn.id) is not null)
  ), done as (
    update projects p set team = f.new_team from fixed f where p.id = f.id and p.team is distinct from f.new_team returning p.id
  ) select count(*) into n_team from done;

  -- 7) incidentes: responsável e interessados em texto livre
  with done as (
    update incidents i
       set owner = jsonb_strip_nulls(jsonb_build_object(
             'id', case when i.owner->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then i.owner->>'id' else gen_random_uuid()::text end,
             'type', 'member', 'memberId', m.id, 'name', m.name, 'kind', i.owner->'kind'))
      from _by_name m
     where i.owner->>'type' = 'text' and nullif(i.owner->>'memberId', '') is null and nullif(i.owner->>'contactId', '') is null
       and m.k = pg_temp._fold(i.owner->>'name')
    returning i.id
  ) select count(*) into n_inc from done;
  with done as (
    update incident_stakeholders s
       set owner = jsonb_strip_nulls(jsonb_build_object(
             'id', case when s.owner->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then s.owner->>'id' else gen_random_uuid()::text end,
             'type', 'member', 'memberId', m.id, 'name', m.name, 'kind', s.owner->'kind'))
      from _by_name m
     where s.owner->>'type' = 'text' and nullif(s.owner->>'memberId', '') is null and nullif(s.owner->>'contactId', '') is null
       and m.k = pg_temp._fold(s.owner->>'name')
    returning s.id
  ) select count(*) into n_stake from done;

  -- Avisos de Discord que esta própria migração gerou (todos nascem com created_at = início da transação).
  delete from discord_outbox where created_at = now() and kind in ('assigned', 'changed') and sent_at is null;
  get diagnostics n_outbox = row_count;

  raise notice 'pessoas ligadas a usuários — responsáveis em texto: %, tarefas antigas: %, responsável principal: %, subtarefas: %, líder: %, dev lead: %, equipes: %, incidentes: %, interessados: %. Avisos de Discord descartados: %',
    n_owners, n_legacy, n_resp, n_subtasks, n_pm, n_dev, n_team, n_inc, n_stake, n_outbox;
end $$;
