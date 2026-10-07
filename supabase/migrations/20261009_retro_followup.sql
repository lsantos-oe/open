-- ═══════════════════════════════════════════════════════════════════════════
-- Retros — follow-up: revisar, na retro seguinte, as ações da anterior.
--
-- • retro_action_reviews: um registro por (ação, retro de follow-up) com o
--   desfecho (resolvida / descartada / levada adiante), a nota e o resultado
--   medido naquele momento — é o histórico da ação ao longo das retros.
--   O status "atual" continua no próprio card da ação.
-- • retro_review_action(): única porta de escrita. Atualiza o review E o card
--   de forma atômica, e valida que a retro informada é de fato um follow-up
--   (direto ou indireto) da retro da ação.
-- • retro_can_engage_action(): participantes de QUALQUER retro posterior da
--   cadeia (não só a seguinte) passam a poder editar/comentar a ação —
--   uma ação levada adiante em março precisa ser revisável em abril.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists retro_action_reviews (
  id          uuid primary key default gen_random_uuid(),
  card_id     uuid not null references retro_cards(id) on delete cascade,
  retro_id    uuid not null references retros(id) on delete cascade,  -- a retro de follow-up em que foi revisada
  outcome     text not null check (outcome in ('resolved', 'dropped', 'carried')),
  note        text,
  result      text,                                                   -- resultado medido nesta revisão
  reviewed_by uuid not null references profiles(id),
  created_at  timestamptz not null default now(),
  unique (card_id, retro_id)
);

create index if not exists retro_action_reviews_retro_idx on retro_action_reviews(retro_id);

alter table retro_action_reviews enable row level security;

-- Visível a todos junto com a ação (ações nascem reveladas). Escrita só via RPC.
do $$ begin
  create policy "Revisões: visíveis se a ação é visível" on retro_action_reviews for select to authenticated
    using (public.retro_card_is_revealed(card_id));
exception when duplicate_object then null; end $$;

-- ─── cadeia de follow-up ───────────────────────────────────────────────────
-- `union` (e não `union all`) deduplica: mesmo que alguém crie um ciclo em
-- previous_retro_id, a recursão termina.

create or replace function public.retro_is_followup_of(p_retro uuid, p_ancestor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with recursive down(id) as (
    select id from retros where previous_retro_id = p_ancestor
    union
    select r.id from retros r join down d on r.previous_retro_id = d.id
  )
  select exists (select 1 from down where id = p_retro)
$$;

create or replace function public.retro_can_engage_action(p_card uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from retro_cards c
    where c.id = p_card and c.kind = 'action' and (
      public.retro_is_manager(c.retro_id)
      or public.retro_is_participant(c.retro_id)
      or exists (select 1 from jsonb_array_elements(c.owners) o where o->>'memberId' = auth.uid()::text)
      or exists (select 1 from jsonb_array_elements(c.involved) o where o->>'memberId' = auth.uid()::text)
      or exists (
        with recursive down(id) as (
          select id from retros where previous_retro_id = c.retro_id
          union
          select r.id from retros r join down d on r.previous_retro_id = d.id
        )
        select 1 from down f
        where public.retro_is_participant(f.id) or public.retro_is_manager(f.id)
      )
    )
  )
$$;

-- ─── RPC: revisar uma ação na retro de follow-up ───────────────────────────

create or replace function public.retro_review_action(
  p_card uuid, p_retro uuid, p_outcome text, p_note text default null, p_result text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_card_retro uuid;
  v_kind text;
  v_phase text;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  if p_outcome not in ('resolved', 'dropped', 'carried') then raise exception 'Desfecho inválido.'; end if;

  select retro_id, kind into v_card_retro, v_kind from retro_cards where id = p_card;
  if v_card_retro is null then raise exception 'Ação não encontrada.'; end if;
  if v_kind <> 'action' then raise exception 'Só ações podem ser revisadas.'; end if;

  select phase into v_phase from retros where id = p_retro;
  if v_phase is null then raise exception 'Retro não encontrada.'; end if;
  if v_phase = 'closed' then raise exception 'Esta retro já foi encerrada.'; end if;

  if not public.retro_is_followup_of(p_retro, v_card_retro) then
    raise exception 'Esta retro não é um follow-up da retro em que a ação foi criada.';
  end if;
  if not (public.retro_is_participant(p_retro) or public.retro_is_manager(p_retro)) then
    raise exception 'Apenas participantes da retro de follow-up podem revisar ações.';
  end if;

  insert into retro_action_reviews (card_id, retro_id, outcome, note, result, reviewed_by)
  values (p_card, p_retro, p_outcome, nullif(btrim(coalesce(p_note, '')), ''), nullif(btrim(coalesce(p_result, '')), ''), auth.uid())
  on conflict (card_id, retro_id) do update
    set outcome = excluded.outcome, note = excluded.note, result = excluded.result,
        reviewed_by = excluded.reviewed_by, created_at = now();

  -- Reflete no card: o status atual da ação é o da última revisão.
  update retro_cards set
    action_status = case p_outcome
      when 'resolved' then 'done'
      when 'dropped' then 'dropped'
      else case when action_status in ('done', 'dropped') then 'open' else action_status end  -- levar adiante reabre
    end,
    success_result = coalesce(nullif(btrim(coalesce(p_result, '')), ''), success_result),
    resolution_note = case
      when p_outcome in ('resolved', 'dropped') then coalesce(nullif(btrim(coalesce(p_note, '')), ''), resolution_note)
      else resolution_note
    end
  where id = p_card;
end $$;

revoke all on function public.retro_review_action(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.retro_review_action(uuid, uuid, text, text, text) to authenticated;

-- ─── Realtime ──────────────────────────────────────────────────────────────

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table retro_action_reviews; exception when duplicate_object then null; end;
  end if;
end $$;
