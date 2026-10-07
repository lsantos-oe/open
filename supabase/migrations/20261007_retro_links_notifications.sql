-- ═══════════════════════════════════════════════════════════════════════════
-- Retros — vínculos de cards com projetos/incidentes/clientes + aviso aos
-- participantes quando a urna abre ou fecha.
--
-- • Vínculos: um card (bom, ruim ou ação) pode apontar para vários
--   projetos, incidentes e/ou clientes. Três FKs com ON DELETE CASCADE (em
--   vez de entity_id solto) mantêm a integridade: apagar o projeto apaga o
--   vínculo. A visibilidade do vínculo herda a do card — o vínculo de um
--   card ainda sigiloso também é sigiloso.
-- • Notificações: feitas por trigger no banco (não pelo app), para valer
--   qualquer que seja o cliente que avançou a fase.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── vínculos ──────────────────────────────────────────────────────────────

create table if not exists retro_card_links (
  id          uuid primary key default gen_random_uuid(),
  card_id     uuid not null references retro_cards(id) on delete cascade,
  retro_id    uuid not null references retros(id) on delete cascade,
  project_id  uuid references projects(id) on delete cascade,
  incident_id uuid references incidents(id) on delete cascade,
  client_id   uuid references clients(id) on delete cascade,
  created_at  timestamptz not null default now(),
  check (num_nonnulls(project_id, incident_id, client_id) = 1)
);

create index if not exists retro_card_links_retro_idx on retro_card_links(retro_id);
create index if not exists retro_card_links_card_idx on retro_card_links(card_id);
create unique index if not exists retro_card_links_project_uq on retro_card_links(card_id, project_id) where project_id is not null;
create unique index if not exists retro_card_links_incident_uq on retro_card_links(card_id, incident_id) where incident_id is not null;
create unique index if not exists retro_card_links_client_uq on retro_card_links(card_id, client_id) where client_id is not null;

-- Quem pode mexer nos vínculos de um card:
--   • coisa boa/ruim: o autor durante a coleta; depois da revelação,
--     qualquer participante (o time costuma etiquetar durante a discussão)
--   • ação: quem pode engajar nela (participantes, donos, envolvidos...)
create or replace function public.retro_can_link_card(p_card uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from retro_cards c
    where c.id = p_card and (
      (c.kind in ('good', 'bad') and (
        (public.retro_phase_of(c.retro_id) = 'collecting'
          and exists (select 1 from retro_card_authors a where a.card_id = c.id and a.author_id = auth.uid()))
        or (public.retro_phase_of(c.retro_id) in ('revealed', 'discussing') and public.retro_is_participant(c.retro_id))
      ))
      or (c.kind = 'action' and public.retro_can_engage_action(c.id))
    )
  )
$$;

alter table retro_card_links enable row level security;

-- Herda a visibilidade do card (a subconsulta passa pelo RLS de retro_cards).
do $$ begin
  create policy "Vínculos: visíveis se o card é visível" on retro_card_links for select to authenticated
    using (exists (select 1 from retro_cards c where c.id = retro_card_links.card_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Vínculos: criar" on retro_card_links for insert to authenticated
    with check (
      public.retro_can_link_card(card_id)
      and retro_id = (select c.retro_id from retro_cards c where c.id = card_id)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Vínculos: remover" on retro_card_links for delete to authenticated
    using (public.retro_can_link_card(card_id));
exception when duplicate_object then null; end $$;

-- ─── retro_add_card agora aceita vínculos (atômico com o card) ──────────────

drop function if exists public.retro_add_card(uuid, text, text, uuid);

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
  -- retro_is_participant já inclui o condutor: ele também envia cards.
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

  insert into retro_cards (retro_id, kind, text, parent_card_id)
  values (p_retro, p_kind, btrim(p_text), p_parent)
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

revoke all on function public.retro_add_card(uuid, text, text, uuid, jsonb) from public, anon;
grant execute on function public.retro_add_card(uuid, text, text, uuid, jsonb) to authenticated;

-- ─── notificações: urna aberta / fechada ───────────────────────────────────
-- Avisa participantes e condutor (menos quem acabou de avançar a fase).

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

drop trigger if exists retros_notify_phase_trg on retros;
create trigger retros_notify_phase_trg after update of phase on retros
  for each row execute function public.retros_notify_phase();

-- ─── Realtime ──────────────────────────────────────────────────────────────
-- retro_card_links: vínculos aparecendo ao vivo. notifications: o sino
-- atualiza na hora (o RLS já limita cada usuário às próprias notificações).

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table retro_card_links; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table notifications; exception when duplicate_object then null; end;
  end if;
end $$;
