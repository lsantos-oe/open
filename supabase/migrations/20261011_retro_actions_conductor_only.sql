-- ═══════════════════════════════════════════════════════════════════════════
-- Retros — quem pode criar ações.
--
-- retros.actions_conductor_only (padrão true): só o condutor cria ações e
-- subações; com false, qualquer participante cria. Editar, comentar e
-- apoiar ações continua valendo para quem já podia. A regra vale no banco
-- (retro_add_card), não só na tela. Retros já existentes ficam com o novo
-- padrão (true); quem conduz pode liberar nas configurações da retro.
-- ═══════════════════════════════════════════════════════════════════════════

alter table retros add column if not exists actions_conductor_only boolean not null default true;

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
    -- Padrão: só o condutor cria ações (o time as discute; quem registra é quem conduz).
    -- O condutor pode liberar para todos os participantes nas configurações da retro.
    if (select actions_conductor_only from retros where id = p_retro)
       and not public.retro_is_conductor(p_retro) then
      raise exception 'Nesta retro, só o condutor pode criar ações.';
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
