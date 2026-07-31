-- ═══════════════════════════════════════════════════════════════════════════
-- Assistente de IA (Claude, BYOK) — cada usuário guarda a própria API key da
-- Anthropic, criptografada em repouso (pgcrypto), nunca em texto puro e nunca
-- na tabela `profiles` (que tem select aberto pra qualquer autenticado —
-- guardar um segredo ali vazaria o ciphertext pra todo mundo). Leitura/escrita
-- da chave só acontece via as 4 functions security-definer abaixo, que
-- reconfirmam auth.uid() internamente — o client nunca faz select/update
-- direto em user_ai_keys.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

create table if not exists user_ai_keys (
  user_id           uuid primary key references profiles(id) on delete cascade,
  api_key_encrypted bytea not null,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
alter table user_ai_keys enable row level security;
do $$ begin
  create policy "Usuário gerencia sua própria chave" on user_ai_keys
    for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create table if not exists ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  title      text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table ai_conversations enable row level security;
do $$ begin
  create policy "Usuário acessa suas conversas" on ai_conversations
    for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create table if not exists ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  role            text not null check (role in ('user','assistant')),
  content         jsonb not null,   -- content blocks (text/tool_use/tool_result) — nunca bytes de imagem
  created_at      timestamptz default now()
);
alter table ai_messages enable row level security;
do $$ begin
  create policy "Usuário acessa suas mensagens" on ai_messages
    for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create index if not exists ai_conversations_user_id_idx on ai_conversations(user_id);
create index if not exists ai_messages_conversation_id_idx on ai_messages(conversation_id);
create index if not exists ai_messages_user_id_idx on ai_messages(user_id);

-- Passphrase fixa gerada uma única vez (openssl rand -base64 32). Vive só aqui
-- dentro do banco — nunca é exposta a nenhum client, nunca trafega em nenhuma
-- resposta de API. Trocar essa string invalida todas as chaves já salvas
-- (ai_get_key passaria a retornar lixo/erro pra quem já tinha uma chave salva
-- antes da troca), então só mude isso de propósito, sabendo da consequência.
create or replace function ai_set_key(p_key text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  insert into user_ai_keys (user_id, api_key_encrypted, updated_at)
  values (auth.uid(), pgp_sym_encrypt(p_key, 'S1BP7aOTCd4HwRQfL7uPKG3NFP1Qymk9ikCuZe9n12c='), now())
  on conflict (user_id) do update
    set api_key_encrypted = excluded.api_key_encrypted, updated_at = now();
end $$;

create or replace function ai_get_key() returns text
  language plpgsql security definer set search_path = public as $$
declare
  v_key text;
begin
  select pgp_sym_decrypt(api_key_encrypted, 'S1BP7aOTCd4HwRQfL7uPKG3NFP1Qymk9ikCuZe9n12c=')
    into v_key
  from user_ai_keys
  where user_id = auth.uid();
  return v_key;
end $$;

create or replace function ai_has_key() returns boolean
  language sql security definer set search_path = public as $$
  select exists(select 1 from user_ai_keys where user_id = auth.uid());
$$;

create or replace function ai_clear_key() returns void
  language sql security definer set search_path = public as $$
  delete from user_ai_keys where user_id = auth.uid();
$$;

-- Revoga o EXECUTE de PUBLIC e concede só a authenticated, pra deixar explícito
-- que usuários anônimos não podem sequer chamar essas functions.
revoke all on function ai_set_key(text) from public;
revoke all on function ai_get_key() from public;
revoke all on function ai_has_key() from public;
revoke all on function ai_clear_key() from public;
grant execute on function ai_set_key(text) to authenticated;
grant execute on function ai_get_key() to authenticated;
grant execute on function ai_has_key() to authenticated;
grant execute on function ai_clear_key() to authenticated;
