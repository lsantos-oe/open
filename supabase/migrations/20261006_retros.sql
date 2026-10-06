-- ═══════════════════════════════════════════════════════════════════════════
-- Retros — área interna de retrospectivas (estilo "retro app").
--
-- Acesso: todo usuário autenticado LÊ todas as retros. Quem ESCREVE (cards,
-- votos, comentários) são participantes/condutor; quem configura a retro é o
-- criador/condutor/admin.
--
-- Sigilo da urna é garantido AQUI, no banco — o Open carrega tudo no
-- navegador, então esconder só na tela vazaria pela aba Network:
--   • fase 'collecting': cada card só é visível ao próprio autor e ao condutor
--   • a partir de 'revealed': todos veem os cards
--   • a autoria vive numa tabela separada (retro_card_authors), então numa
--     retro anônima o author_id nunca chega a quem não é o autor
--   • cards/votos só são criados via RPC (security definer) — nunca por
--     INSERT direto — para que fase/participação sejam sempre validadas
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── tabelas ───────────────────────────────────────────────────────────────

create table if not exists retros (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  retro_date        date not null,
  period_start      date,
  period_end        date,
  recording_link    text,
  conductor_id      uuid references profiles(id) on delete set null,
  phase             text not null default 'draft'
                      check (phase in ('draft', 'collecting', 'revealed', 'discussing', 'closed')),
  anonymous         boolean not null default true,
  votes_per_person  int not null default 5 check (votes_per_person >= 0),
  previous_retro_id uuid references retros(id) on delete set null,
  revealed_at       timestamptz,
  closed_at         timestamptz,
  created_by        uuid not null references profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (period_start is null or period_end is null or period_end >= period_start),
  check (previous_retro_id is null or previous_retro_id <> id)
);

create index if not exists retros_previous_retro_id_idx on retros(previous_retro_id);
create index if not exists retros_retro_date_idx on retros(retro_date desc);

create table if not exists retro_participants (
  retro_id uuid not null references retros(id) on delete cascade,
  user_id  uuid not null references profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (retro_id, user_id)
);

create table if not exists retro_cards (
  id             uuid primary key default gen_random_uuid(),
  retro_id       uuid not null references retros(id) on delete cascade,
  kind           text not null check (kind in ('good', 'bad', 'action')),
  text           text not null,
  -- ação → card que ela endereça; sub-ação → ação pai
  parent_card_id uuid references retro_cards(id) on delete cascade,
  -- campos só usados em kind = 'action'
  description    text,
  owners         jsonb not null default '[]'::jsonb,   -- EntryOwner[] (donos)
  involved       jsonb not null default '[]'::jsonb,   -- EntryOwner[] (envolvidos)
  success_metric text,                                  -- indicador: como saberemos que deu certo
  success_target text,                                  -- meta
  success_result text,                                  -- resultado medido (preenchido no follow-up)
  due_date       date,
  action_status  text not null default 'open'
                   check (action_status in ('open', 'in_progress', 'done', 'dropped')),
  resolution_note text,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists retro_cards_retro_id_idx on retro_cards(retro_id);
create index if not exists retro_cards_parent_idx on retro_cards(parent_card_id);

-- Autoria separada do card: é o que permite ocultar o author_id de quem não
-- é o autor, mesmo depois da revelação, numa retro anônima.
create table if not exists retro_card_authors (
  card_id   uuid primary key references retro_cards(id) on delete cascade,
  retro_id  uuid not null references retros(id) on delete cascade,  -- denormalizado p/ a policy não recursar em retro_cards
  author_id uuid not null references profiles(id) on delete cascade
);

create index if not exists retro_card_authors_author_idx on retro_card_authors(author_id, retro_id);

create table if not exists retro_votes (
  card_id    uuid not null references retro_cards(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  retro_id   uuid not null references retros(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (card_id, user_id)
);

create index if not exists retro_votes_retro_idx on retro_votes(retro_id, user_id);

create table if not exists retro_comments (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid not null references retro_cards(id) on delete cascade,
  retro_id   uuid not null references retros(id) on delete cascade,
  author_id  uuid not null references profiles(id) on delete cascade,
  text       text not null,
  created_at timestamptz not null default now()
);

create index if not exists retro_comments_card_idx on retro_comments(card_id);

-- ─── funções auxiliares (security definer: leem tabelas sem recursão de RLS) ──

create or replace function public.retro_phase_rank(p_phase text)
returns int language sql immutable as $$
  select case p_phase
    when 'draft' then 0 when 'collecting' then 1 when 'revealed' then 2
    when 'discussing' then 3 when 'closed' then 4 else -1 end
$$;

create or replace function public.retro_phase_of(p_retro uuid)
returns text language sql stable security definer set search_path = public as $$
  select phase from retros where id = p_retro
$$;

create or replace function public.retro_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

-- Condutor efetivo: o condutor definido, ou o criador quando não há condutor.
create or replace function public.retro_is_conductor(p_retro uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from retros r
    where r.id = p_retro and auth.uid() = coalesce(r.conductor_id, r.created_by)
  )
$$;

-- Quem configura a retro (título, datas, participantes...): criador, condutor ou admin.
create or replace function public.retro_is_manager(p_retro uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.retro_is_admin() or exists (
    select 1 from retros r
    where r.id = p_retro and (r.created_by = auth.uid() or r.conductor_id = auth.uid())
  )
$$;

create or replace function public.retro_is_participant(p_retro uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.retro_is_conductor(p_retro)
      or exists (select 1 from retro_participants where retro_id = p_retro and user_id = auth.uid())
$$;

-- Pode editar/comentar uma AÇÃO: participantes e condutor da retro, dono ou
-- envolvido da ação, ou quem participa de uma retro de follow-up dela.
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
        select 1 from retros f
        where f.previous_retro_id = c.retro_id
          and (public.retro_is_participant(f.id) or public.retro_is_manager(f.id))
      )
    )
  )
$$;

-- ─── RPCs: criação de card e voto ──────────────────────────────────────────

create or replace function public.retro_add_card(
  p_retro uuid, p_kind text, p_text text, p_parent uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_phase text;
  v_id uuid;
  v_parent_retro uuid;
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

  insert into retro_cards (retro_id, kind, text, parent_card_id)
  values (p_retro, p_kind, btrim(p_text), p_parent)
  returning id into v_id;

  insert into retro_card_authors (card_id, retro_id, author_id) values (v_id, p_retro, auth.uid());
  return v_id;
end $$;

-- Alterna o voto do usuário num card. Retorna true se ficou votado.
create or replace function public.retro_toggle_vote(p_card uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_retro uuid;
  v_kind text;
  v_phase text;
  v_limit int;
  v_used int;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  select retro_id, kind into v_retro, v_kind from retro_cards where id = p_card;
  if v_retro is null then raise exception 'Card não encontrado.'; end if;

  select phase, votes_per_person into v_phase, v_limit from retros where id = v_retro;
  if v_phase not in ('revealed', 'discussing') then raise exception 'Votação indisponível nesta fase.'; end if;
  if not public.retro_is_participant(v_retro) then raise exception 'Apenas participantes podem votar.'; end if;

  if exists (select 1 from retro_votes where card_id = p_card and user_id = auth.uid()) then
    delete from retro_votes where card_id = p_card and user_id = auth.uid();
    return false;
  end if;

  -- Limite de votos vale para coisas boas/ruins; apoio a ações é ilimitado.
  if v_kind in ('good', 'bad') then
    select count(*) into v_used
    from retro_votes v join retro_cards c on c.id = v.card_id
    where v.retro_id = v_retro and v.user_id = auth.uid() and c.kind in ('good', 'bad');
    if v_used >= v_limit then raise exception 'Você já usou todos os seus % votos.', v_limit; end if;
  end if;

  insert into retro_votes (card_id, user_id, retro_id) values (p_card, auth.uid(), v_retro);
  return true;
end $$;

revoke all on function public.retro_add_card(uuid, text, text, uuid) from public, anon;
revoke all on function public.retro_toggle_vote(uuid) from public, anon;
grant execute on function public.retro_add_card(uuid, text, text, uuid) to authenticated;
grant execute on function public.retro_toggle_vote(uuid) to authenticated;

-- ─── triggers ──────────────────────────────────────────────────────────────

-- retros: fase só avança uma etapa por vez e só pelo condutor/admin;
-- criador e data de criação são imutáveis.
create or replace function public.retros_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  -- Depois que a urna abre, anonimato e condutor ficam travados: trocar o
  -- anonimato exporia os autores, e trocar o condutor daria a outra pessoa
  -- acesso aos cards ainda sigilosos. (Só o admin pode trocar o condutor.)
  if old.phase <> 'draft' then
    new.anonymous := old.anonymous;
    if not public.retro_is_admin() then new.conductor_id := old.conductor_id; end if;
  end if;
  if new.phase is distinct from old.phase then
    if not (auth.uid() = coalesce(old.conductor_id, old.created_by) or public.retro_is_admin()) then
      raise exception 'Apenas o condutor pode mudar a fase da retro.';
    end if;
    if public.retro_phase_rank(new.phase) <> public.retro_phase_rank(old.phase) + 1 then
      raise exception 'A fase da retro só pode avançar uma etapa por vez.';
    end if;
    if new.phase = 'revealed' then new.revealed_at := now(); end if;
    if new.phase = 'closed' then new.closed_at := now(); end if;
  end if;
  return new;
end $$;

drop trigger if exists retros_guard_trg on retros;
create trigger retros_guard_trg before update on retros
  for each row execute function public.retros_guard();

-- retro_cards: colunas estruturais imutáveis; resolved_at acompanha o status.
create or replace function public.retro_cards_guard()
returns trigger language plpgsql as $$
begin
  new.id := old.id;
  new.retro_id := old.retro_id;
  new.kind := old.kind;
  new.parent_card_id := old.parent_card_id;
  new.created_at := old.created_at;
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

drop trigger if exists retro_cards_guard_trg on retro_cards;
create trigger retro_cards_guard_trg before update on retro_cards
  for each row execute function public.retro_cards_guard();

-- ─── RLS ───────────────────────────────────────────────────────────────────

alter table retros enable row level security;
alter table retro_participants enable row level security;
alter table retro_cards enable row level security;
alter table retro_card_authors enable row level security;
alter table retro_votes enable row level security;
alter table retro_comments enable row level security;

-- retros: leitura aberta a todo autenticado.
do $$ begin
  create policy "Autenticados veem retros" on retros for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Autenticados criam retros" on retros for insert to authenticated
    with check (created_by = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Gestores editam retros" on retros for update to authenticated
    using (public.retro_is_manager(id)) with check (public.retro_is_manager(id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Criador ou admin exclui retros" on retros for delete to authenticated
    using (created_by = auth.uid() or public.retro_is_admin());
exception when duplicate_object then null; end $$;

-- participantes: todos veem; só gestores da retro alteram.
do $$ begin
  create policy "Autenticados veem participantes" on retro_participants for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Gestores adicionam participantes" on retro_participants for insert to authenticated
    with check (public.retro_is_manager(retro_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Gestores removem participantes" on retro_participants for delete to authenticated
    using (public.retro_is_manager(retro_id));
exception when duplicate_object then null; end $$;

-- cards: SIGILO DA URNA. Antes da revelação, só o autor e o condutor veem.
do $$ begin
  create policy "Cards: sigilo da urna" on retro_cards for select to authenticated
    using (
      public.retro_phase_rank(public.retro_phase_of(retro_id)) >= 2
      or public.retro_is_conductor(retro_id)
      or exists (select 1 from retro_card_authors a where a.card_id = retro_cards.id and a.author_id = auth.uid())
    );
exception when duplicate_object then null; end $$;
-- (sem policy de INSERT: cards só nascem via retro_add_card)
do $$ begin
  create policy "Cards: edição" on retro_cards for update to authenticated
    using (
      (kind in ('good', 'bad')
        and public.retro_phase_of(retro_id) = 'collecting'
        and exists (select 1 from retro_card_authors a where a.card_id = retro_cards.id and a.author_id = auth.uid()))
      or (kind = 'action' and public.retro_can_engage_action(id))
    );
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Cards: exclusão" on retro_cards for delete to authenticated
    using (
      (kind in ('good', 'bad')
        and public.retro_phase_of(retro_id) = 'collecting'
        and exists (select 1 from retro_card_authors a where a.card_id = retro_cards.id and a.author_id = auth.uid()))
      or (kind = 'action' and (
        public.retro_is_manager(retro_id)
        or exists (select 1 from retro_card_authors a where a.card_id = retro_cards.id and a.author_id = auth.uid())))
    );
exception when duplicate_object then null; end $$;

-- autoria: o autor sempre vê a própria; os demais só em retro NÃO anônima, já revelada.
do $$ begin
  create policy "Autoria: própria ou pública" on retro_card_authors for select to authenticated
    using (
      author_id = auth.uid()
      or (public.retro_phase_rank(public.retro_phase_of(retro_id)) >= 2
          and not (select r.anonymous from retros r where r.id = retro_card_authors.retro_id))
    );
exception when duplicate_object then null; end $$;

-- votos: visíveis a todos (só existem depois da revelação). O anonimato da
-- retro cobre a autoria dos CARDS, não quem votou. Escrita só via RPC.
do $$ begin
  create policy "Autenticados veem votos" on retro_votes for select to authenticated
    using (public.retro_phase_rank(public.retro_phase_of(retro_id)) >= 2);
exception when duplicate_object then null; end $$;

-- comentários (só em ações).
do $$ begin
  create policy "Autenticados veem comentários" on retro_comments for select to authenticated
    using (public.retro_phase_rank(public.retro_phase_of(retro_id)) >= 2);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Comentar em ações" on retro_comments for insert to authenticated
    with check (
      author_id = auth.uid()
      and public.retro_can_engage_action(card_id)
      and retro_id = (select c.retro_id from retro_cards c where c.id = card_id)
    );
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Autor edita comentário" on retro_comments for update to authenticated
    using (author_id = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Autor ou admin exclui comentário" on retro_comments for delete to authenticated
    using (author_id = auth.uid() or public.retro_is_admin());
exception when duplicate_object then null; end $$;

-- ─── Realtime (retro ao vivo) ──────────────────────────────────────────────
-- postgres_changes respeita o RLS do assinante, então o sigilo da urna vale
-- também para os eventos em tempo real.

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table retros; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table retro_participants; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table retro_cards; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table retro_votes; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table retro_comments; exception when duplicate_object then null; end;
  end if;
end $$;
