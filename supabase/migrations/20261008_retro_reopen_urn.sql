-- ═══════════════════════════════════════════════════════════════════════════
-- Retros — reabrir a urna.
--
-- Regra de negócio: o condutor (ou admin) pode reabrir a urna (volta para
-- 'collecting') a partir de 'revealed' ou 'discussing', desde que a retro
-- não esteja encerrada e a data da retro ainda não tenha passado. Se a data
-- passou, basta editá-la para o futuro e reabrir.
--
-- Para a reabertura não esconder de novo cards que todo mundo já viu, o
-- sigilo deixa de depender só da FASE da retro e passa a ser POR CARD:
-- retro_cards.revealed_at é carimbado quando o condutor fecha a urna.
--   • card revelado  → visível a todos (como antes)
--   • card não revelado (enviado depois de reabrir) → só autor e condutor
-- Votos, comentários, autoria e vínculos herdam a visibilidade do card.
-- ═══════════════════════════════════════════════════════════════════════════

alter table retro_cards add column if not exists revealed_at timestamptz;

-- Cards que já estavam revelados antes desta migration (retros em revealed+).
do $$ begin
  perform set_config('retros.revealing', 'on', true);
  update retro_cards c
     set revealed_at = coalesce(r.revealed_at, now())
    from retros r
   where r.id = c.retro_id
     and public.retro_phase_rank(r.phase) >= 2
     and c.revealed_at is null;
  perform set_config('retros.revealing', 'off', true);
end $$;

create or replace function public.retro_card_is_revealed(p_card uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from retro_cards where id = p_card and revealed_at is not null)
$$;

-- ─── policies: sigilo por card ─────────────────────────────────────────────

drop policy if exists "Cards: sigilo da urna" on retro_cards;
create policy "Cards: sigilo da urna" on retro_cards for select to authenticated
  using (
    revealed_at is not null
    or public.retro_is_conductor(retro_id)
    or exists (select 1 from retro_card_authors a where a.card_id = retro_cards.id and a.author_id = auth.uid())
  );

-- Card já revelado não muda mais (texto/exclusão), mesmo com a urna reaberta.
drop policy if exists "Cards: edição" on retro_cards;
create policy "Cards: edição" on retro_cards for update to authenticated
  using (
    (kind in ('good', 'bad')
      and revealed_at is null
      and public.retro_phase_of(retro_id) = 'collecting'
      and exists (select 1 from retro_card_authors a where a.card_id = retro_cards.id and a.author_id = auth.uid()))
    or (kind = 'action' and public.retro_can_engage_action(id))
  );

drop policy if exists "Cards: exclusão" on retro_cards;
create policy "Cards: exclusão" on retro_cards for delete to authenticated
  using (
    (kind in ('good', 'bad')
      and revealed_at is null
      and public.retro_phase_of(retro_id) = 'collecting'
      and exists (select 1 from retro_card_authors a where a.card_id = retro_cards.id and a.author_id = auth.uid()))
    or (kind = 'action' and (
      public.retro_is_manager(retro_id)
      or exists (select 1 from retro_card_authors a where a.card_id = retro_cards.id and a.author_id = auth.uid())))
  );

drop policy if exists "Autoria: própria ou pública" on retro_card_authors;
create policy "Autoria: própria ou pública" on retro_card_authors for select to authenticated
  using (
    author_id = auth.uid()
    or (public.retro_card_is_revealed(card_id)
        and not (select r.anonymous from retros r where r.id = retro_card_authors.retro_id))
  );

drop policy if exists "Autenticados veem votos" on retro_votes;
create policy "Autenticados veem votos" on retro_votes for select to authenticated
  using (public.retro_card_is_revealed(card_id));

drop policy if exists "Autenticados veem comentários" on retro_comments;
create policy "Autenticados veem comentários" on retro_comments for select to authenticated
  using (public.retro_card_is_revealed(card_id));

-- ─── guards ────────────────────────────────────────────────────────────────

-- revealed_at só é escrito pelo trigger de revelação (flag de sessão), nunca pelo cliente.
create or replace function public.retro_cards_guard()
returns trigger language plpgsql as $$
begin
  new.id := old.id;
  new.retro_id := old.retro_id;
  new.kind := old.kind;
  new.parent_card_id := old.parent_card_id;
  new.created_at := old.created_at;
  if coalesce(current_setting('retros.revealing', true), '') <> 'on' then
    new.revealed_at := old.revealed_at;
  end if;
  new.updated_at := now();
  if new.kind = 'action' then
    if new.action_status in ('done', 'dropped') and old.action_status not in ('done', 'dropped') then
      new.resolved_at := now();
    elsif new.action_status in ('open', 'in_progress') then
      new.resolved_at := null;
    end if;
  end if;
  return new;
end $$;

create or replace function public.retros_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  -- Depois que a urna abre, anonimato e condutor ficam travados (só admin troca o condutor).
  if old.phase <> 'draft' then
    new.anonymous := old.anonymous;
    if not public.retro_is_admin() then new.conductor_id := old.conductor_id; end if;
  end if;
  if new.phase is distinct from old.phase then
    if not (auth.uid() = coalesce(old.conductor_id, old.created_by) or public.retro_is_admin()) then
      raise exception 'Apenas o condutor pode mudar a fase da retro.';
    end if;
    if old.phase in ('revealed', 'discussing') and new.phase = 'collecting' then
      -- Reabrir a urna: só com a data da retro ainda no futuro (ou hoje, no fuso de São Paulo).
      if new.retro_date < (now() at time zone 'America/Sao_Paulo')::date then
        raise exception 'A data da retro já passou. Altere a data para uma data futura para reabrir a urna.';
      end if;
    elsif public.retro_phase_rank(new.phase) <> public.retro_phase_rank(old.phase) + 1 then
      raise exception 'A fase da retro só pode avançar uma etapa por vez.';
    end if;
    if new.phase = 'revealed' then new.revealed_at := now(); end if;
    if new.phase = 'closed' then new.closed_at := now(); end if;
  end if;
  return new;
end $$;

-- Fechar a urna carimba todos os cards ainda sigilosos.
create or replace function public.retros_reveal_cards()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.phase = 'collecting' and new.phase = 'revealed' then
    perform set_config('retros.revealing', 'on', true);
    update retro_cards set revealed_at = now() where retro_id = new.id and revealed_at is null;
    perform set_config('retros.revealing', 'off', true);
  end if;
  return null;
end $$;

drop trigger if exists retros_reveal_cards_trg on retros;
create trigger retros_reveal_cards_trg after update of phase on retros
  for each row execute function public.retros_reveal_cards();

-- Ações nascem reveladas (só existem com a urna já fechada).
create or replace function public.retro_add_card(
  p_retro uuid, p_kind text, p_text text, p_parent uuid default null, p_links jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_phase text;
  v_id uuid;
  v_parent_retro uuid;
  v_link jsonb;
  v_type text;
  v_eid uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  if p_kind not in ('good', 'bad', 'action') then raise exception 'Tipo de card inválido.'; end if;
  if btrim(coalesce(p_text, '')) = '' then raise exception 'O texto do card não pode ficar vazio.'; end if;

  select phase into v_phase from retros where id = p_retro;
  if v_phase is null then raise exception 'Retro não encontrada.'; end if;
  if not public.retro_is_participant(p_retro) then
    raise exception 'Apenas participantes da retro podem criar cards.';
  end if;

  if p_kind in ('good', 'bad') then
    if v_phase <> 'collecting' then raise exception 'A urna não está aberta para novos cards.'; end if;
    if p_parent is not null then raise exception 'Cards de coisas boas/ruins não têm card pai.'; end if;
  else
    if v_phase not in ('revealed', 'discussing') then
      raise exception 'Ações só podem ser criadas depois que a urna for fechada.';
    end if;
    if p_parent is not null then
      select retro_id into v_parent_retro from retro_cards where id = p_parent;
      if v_parent_retro is distinct from p_retro then raise exception 'Card pai inválido.'; end if;
    end if;
  end if;

  insert into retro_cards (retro_id, kind, text, parent_card_id, revealed_at)
  values (p_retro, p_kind, btrim(p_text), p_parent, case when p_kind = 'action' then now() end)
  returning id into v_id;

  insert into retro_card_authors (card_id, retro_id, author_id) values (v_id, p_retro, auth.uid());

  for v_link in select * from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) loop
    v_type := v_link->>'type';
    v_eid := (v_link->>'id')::uuid;
    if v_type = 'project' then
      if not exists (select 1 from projects where id = v_eid) then raise exception 'O projeto vinculado não existe.'; end if;
      insert into retro_card_links (card_id, retro_id, project_id) values (v_id, p_retro, v_eid) on conflict do nothing;
    elsif v_type = 'incident' then
      if not exists (select 1 from incidents where id = v_eid) then raise exception 'O incidente vinculado não existe.'; end if;
      insert into retro_card_links (card_id, retro_id, incident_id) values (v_id, p_retro, v_eid) on conflict do nothing;
    elsif v_type = 'client' then
      if not exists (select 1 from clients where id = v_eid) then raise exception 'O cliente vinculado não existe.'; end if;
      insert into retro_card_links (card_id, retro_id, client_id) values (v_id, p_retro, v_eid) on conflict do nothing;
    else
      raise exception 'Tipo de vínculo inválido.';
    end if;
  end loop;

  return v_id;
end $$;

-- ─── notificações: agora também a reabertura ───────────────────────────────

create or replace function public.retros_notify_phase()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_msg text;
begin
  if new.phase = old.phase then return null; end if;

  if old.phase = 'draft' and new.phase = 'collecting' then
    v_msg := format('A urna da retro "%s" foi aberta — já dá para enviar seus cards.', new.title);
  elsif old.phase = 'collecting' and new.phase = 'revealed' then
    v_msg := format('A urna da retro "%s" foi fechada — os cards foram revelados.', new.title);
  elsif old.phase in ('revealed', 'discussing') and new.phase = 'collecting' then
    v_msg := format('A urna da retro "%s" foi reaberta — você pode enviar novos cards.', new.title);
  else
    return null;
  end if;

  insert into notifications (user_id, message, link)
  select s.uid, v_msg, '/retros/' || new.id
  from (
    select user_id as uid from retro_participants where retro_id = new.id
    union
    select coalesce(new.conductor_id, new.created_by)
  ) s
  where s.uid is distinct from auth.uid();

  return null;
end $$;
