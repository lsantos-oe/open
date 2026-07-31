-- ═══════════════════════════════════════════════════════════════════════════
-- Corrige "function pgp_sym_encrypt(text, unknown) does not exist" ao salvar
-- a chave da IA. Causa: o Supabase instala extensões (pgcrypto incluído) no
-- schema `extensions`, não em `public` — e as functions ai_set_key/ai_get_key
-- (Fase 9.1) tinham `set search_path = public`, que TRAVA a busca só nesse
-- schema, deixando pgp_sym_encrypt/pgp_sym_decrypt inalcançáveis mesmo com a
-- extensão instalada. Adiciona `extensions` ao search_path das duas.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function ai_set_key(p_key text) returns void
  language plpgsql security definer set search_path = public, extensions as $$
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
  language plpgsql security definer set search_path = public, extensions as $$
declare
  v_key text;
begin
  select pgp_sym_decrypt(api_key_encrypted, 'S1BP7aOTCd4HwRQfL7uPKG3NFP1Qymk9ikCuZe9n12c=')
    into v_key
  from ai_shared_key
  where id = '00000000-0000-0000-0000-000000000001';
  return v_key;
end $$;

-- create/replace function resets grants to the function owner's defaults in
-- some Postgres versions — reassert them explicitly to be safe.
revoke all on function ai_set_key(text) from public;
grant execute on function ai_set_key(text) to authenticated;
revoke all on function ai_get_key() from public;
revoke all on function ai_get_key() from authenticated;
grant execute on function ai_get_key() to service_role;
