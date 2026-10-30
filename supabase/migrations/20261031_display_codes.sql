-- ═══════════════════════════════════════════════════════════════════════════
-- Códigos curtos (IDs de exibição).
--
-- Cada coisa ganha, além do uuid interno, um código legível: letra da entidade + ano + sequência de 6 dígitos,
-- crescente dentro de cada letra e ano. Ex.: C-2026-000123 (cliente), P-2026-000045 (projeto).
--
--   C cliente · P projeto · I incidente · T tarefa/marco/reunião · K contato · G grupo de clientes
--   R risco · D item de documentação
--
-- O uuid continua sendo a chave (FKs, RLS, API e links antigos seguem valendo); o código é só o nome curto, único,
-- que não muda depois de criado. Linhas antigas recebem código na ordem em que foram criadas; as novas, na inserção.
-- resolve_code() traduz um código em "o que é e onde abrir" (usado pelo link /r/<código> e pela busca).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists display_counters (
  prefix  text   not null,
  year    int    not null,
  last    bigint not null default 0,
  primary key (prefix, year)
);
alter table display_counters enable row level security;   -- sem política: só as funções abaixo mexem

create or replace function public.next_display_code(p_prefix text, p_at timestamptz default now())
returns text language plpgsql security definer set search_path = public as $$
declare
  v_year int := extract(year from coalesce(p_at, now()))::int;
  v_n bigint;
begin
  insert into display_counters (prefix, year, last) values (p_prefix, v_year, 1)
  on conflict (prefix, year) do update set last = display_counters.last + 1
  returning last into v_n;
  return p_prefix || '-' || v_year || '-' || lpad(v_n::text, 6, '0');
end $$;
revoke all on function public.next_display_code(text, timestamptz) from public, anon, authenticated;

create or replace function public.set_display_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.code is null then
    new.code := public.next_display_code(tg_argv[0], coalesce((to_jsonb(new)->>'created_at')::timestamptz, now()));
  end if;
  return new;
end $$;
revoke all on function public.set_display_code() from public, anon, authenticated;

-- O código não muda depois de criado (nem por update direto).
create or replace function public.keep_display_code()
returns trigger language plpgsql as $$
begin
  if old.code is not null then new.code := old.code; end if;
  return new;
end $$;

do $$
declare
  spec record;
  r record;
begin
  for spec in
    select * from (values
      ('clients', 'C'), ('projects', 'P'), ('incidents', 'I'), ('entries', 'T'), ('contacts', 'K'),
      ('client_groups', 'G'), ('risks', 'R'), ('documentation_items', 'D'), ('documentation_meta', 'D')
    ) as t(tbl, prefix)
  loop
    if to_regclass('public.' || spec.tbl) is null then continue; end if;
    execute format('alter table %I add column if not exists code text', spec.tbl);
    execute format('create unique index if not exists %I on %I (code)', spec.tbl || '_code_uniq', spec.tbl);
    execute format('drop trigger if exists set_display_code_trg on %I', spec.tbl);
    execute format('create trigger set_display_code_trg before insert on %I for each row execute function public.set_display_code(%L)', spec.tbl, spec.prefix);
    execute format('drop trigger if exists keep_display_code_trg on %I', spec.tbl);
    execute format('create trigger keep_display_code_trg before update on %I for each row execute function public.keep_display_code()', spec.tbl);
    -- linhas que já existiam: na ordem de criação
    for r in execute format(
      'select ctid, %s as at from %I where code is null order by %s ctid',
      case when spec.tbl in ('documentation_meta') then 'updated_at' else 'created_at' end, spec.tbl,
      case when spec.tbl in ('documentation_meta') then 'updated_at nulls last,' else 'created_at nulls last,' end)
    loop
      execute format('update %I set code = $1 where ctid = $2', spec.tbl) using public.next_display_code(spec.prefix, r.at), r.ctid;
    end loop;
  end loop;
end $$;

-- ─── Itens espelhados da documentação: código sob demanda ──────────────────
-- Links e anexos das tarefas de documentação não têm linha própria; a classificação (documentation_meta) passa a
-- existir assim que o item é visto, e é ela que carrega o código.

create or replace function public.documentation_ensure_codes(p_keys text[])
returns table (source_key text, code text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  insert into documentation_meta (source_key, updated_by)
  select k, auth.uid() from unnest(p_keys) k
  on conflict on constraint documentation_meta_pkey do nothing;   -- (source_key também é coluna de saída)
  return query select m.source_key, m.code from documentation_meta m where m.source_key = any (p_keys);
end $$;
revoke all on function public.documentation_ensure_codes(text[]) from public, anon;
grant execute on function public.documentation_ensure_codes(text[]) to authenticated;

-- ─── Código → onde abrir ───────────────────────────────────────────────────

create or replace function public.resolve_code(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_code text := upper(btrim(p_code));
  v_prefix text := split_part(v_code, '-', 1);
  v_id uuid;
  v jsonb;
  m documentation_meta%rowtype;
  v_entry uuid;
begin
  if auth.uid() is null then return null; end if;
  if v_code !~ '^[A-Z]-[0-9]{4}-[0-9]{6}$' then return null; end if;
  case v_prefix
    when 'C' then select id into v_id from clients where code = v_code; if found then return jsonb_build_object('kind','client','id',v_id); end if;
    when 'P' then select id into v_id from projects where code = v_code; if found then return jsonb_build_object('kind','project','id',v_id); end if;
    when 'I' then select id into v_id from incidents where code = v_code; if found then return jsonb_build_object('kind','incident','id',v_id); end if;
    when 'G' then select id into v_id from client_groups where code = v_code; if found then return jsonb_build_object('kind','group','id',v_id); end if;
    when 'K' then select id into v_id from contacts where code = v_code; if found then return jsonb_build_object('kind','contact','id',v_id); end if;
    when 'T' then
      select jsonb_build_object('kind','entry','id',id,'projectId',project_id,'incidentId',incident_id) into v from entries where code = v_code;
      if v is not null then return v; end if;
    when 'R' then
      select jsonb_build_object('kind','risk','id',id,'projectId',project_id) into v from risks where code = v_code;
      if v is not null then return v; end if;
    when 'D' then
      select jsonb_build_object('kind','doc','id',id,'projectId',project_id,'clientId',client_id) into v from documentation_items where code = v_code;
      if v is not null then return v; end if;
      select * into m from documentation_meta where code = v_code;
      if found then
        if m.source_key like 'entry-link:%' then v_entry := nullif(split_part(m.source_key, ':', 2), '')::uuid;
        elsif m.source_key like 'entry-file:%' then
          select entity_id into v_entry from attachments where id::text = split_part(m.source_key, ':', 2);
        end if;
        select jsonb_build_object('kind','doc','id',m.source_key,'projectId',project_id,'entryId',id) into v from entries where id = v_entry;
        if v is not null then return v; end if;
      end if;
    else null;
  end case;
  return null;
end $$;
revoke all on function public.resolve_code(text) from public, anon;
grant execute on function public.resolve_code(text) to authenticated;
