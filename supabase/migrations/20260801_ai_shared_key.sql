-- ═══════════════════════════════════════════════════════════════════════════
-- Assistente de IA deixa de ser BYOK (uma chave por usuário) e passa a usar
-- uma única chave da Anthropic compartilhada por todo o time. Substitui
-- user_ai_keys (Fase 9.1) por uma tabela singleton — mesmas 4 functions
-- security-definer de antes (ai_set_key/ai_get_key/ai_has_key/ai_clear_key),
-- só que agora ai_get_key()/ai_has_key() valem pra qualquer autenticado (é a
-- MESMA chave pra todo mundo), e ai_set_key()/ai_clear_key() só podem ser
-- chamadas por admin — configurar a chave vira uma decisão de workspace, não
-- de perfil pessoal.
--
-- Se a Fase 9.1 (20260731_ai_assistant.sql) ainda não foi rodada em produção,
-- rode só esta migration — o "drop table if exists" cobre os dois casos.
-- ═══════════════════════════════════════════════════════════════════════════

drop table if exists user_ai_keys cascade;

create table if not exists ai_shared_key (
  id                uuid primary key default '00000000-0000-0000-0000-000000000001',
  api_key_encrypted bytea,
  updated_at        timestamptz default now(),
  updated_by        uuid references profiles(id),
  constraint ai_shared_key_singleton check (id = '00000000-0000-0000-0000-000000000001')
);
alter table ai_shared_key enable row level security;

-- Ninguém lê a linha direto (nem o ciphertext) — só via as functions abaixo.
do $$ begin
  create policy "Ninguém acessa ai_shared_key diretamente" on ai_shared_key for all using (false);
exception when duplicate_object then null; end $$;

create or replace function ai_set_key(p_key text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Somente administradores podem configurar a chave da API.';
  end if;
  insert into ai_shared_key (id, api_key_encrypted, updated_at, updated_by)
  values ('00000000-0000-0000-0000-000000000001', pgp_sym_encrypt(p_key, 'S1BP7aOTCd4HwRQfL7uPKG3NFP1Qymk9ikCuZe9n12c='), now(), auth.uid())
  on conflict (id) do update
    set api_key_encrypted = excluded.api_key_encrypted, updated_at = now(), updated_by = auth.uid();
end $$;

create or replace function ai_get_key() returns text
  language plpgsql security definer set search_path = public as $$
declare
  v_key text;
begin
  -- Any authenticated user gets the same shared key — that's the point of
  -- switching away from BYOK. There is no per-user secrecy left to protect here.
  select pgp_sym_decrypt(api_key_encrypted, 'S1BP7aOTCd4HwRQfL7uPKG3NFP1Qymk9ikCuZe9n12c=')
    into v_key
  from ai_shared_key
  where id = '00000000-0000-0000-0000-000000000001';
  return v_key;
end $$;

create or replace function ai_has_key() returns boolean
  language sql security definer set search_path = public as $$
  select exists(
    select 1 from ai_shared_key
    where id = '00000000-0000-0000-0000-000000000001' and api_key_encrypted is not null
  );
$$;

create or replace function ai_clear_key() returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Somente administradores podem remover a chave da API.';
  end if;
  delete from ai_shared_key where id = '00000000-0000-0000-0000-000000000001';
end $$;

revoke all on function ai_set_key(text) from public;
revoke all on function ai_get_key() from public;
revoke all on function ai_has_key() from public;
revoke all on function ai_clear_key() from public;
grant execute on function ai_set_key(text) to authenticated;
grant execute on function ai_get_key() to authenticated;
grant execute on function ai_has_key() to authenticated;
grant execute on function ai_clear_key() to authenticated;
