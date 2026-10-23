-- Open API / MCP — schema próprio `open_api`.
--
-- 100% aditivo: não altera nenhuma tabela, policy, função ou trigger do schema `public`.
-- O schema NÃO é exposto pelo PostgREST e nenhum papel do app (anon/authenticated) tem acesso:
-- só a Edge Function `api` (conectada como `postgres`) lê e grava aqui.
--
-- Aplicar com psql/SQL editor, revisado. NÃO usar `supabase db push` neste projeto.

create schema if not exists open_api;
revoke all on schema open_api from public, anon, authenticated;

-- User-Key (header `User-Key`, como na API do Ploomes): UMA chave por pessoa, com o mesmo acesso dela no Open.
-- Busca pelo hash (rápido, sem decifrar); o valor fica cifrado no Supabase Vault para a pessoa poder vê-lo de novo
-- na página /api/minha-chave. Trocar a chave invalida a anterior na hora.
create table if not exists open_api.user_keys (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  key_hash         text not null unique,
  prefix           text not null,
  vault_secret_id  uuid not null,
  created_at       timestamptz not null default now(),
  rotated_at       timestamptz not null default now(),
  last_used_at     timestamptz,
  created_by       uuid references public.profiles(id)
);

-- Auditoria de requisições (sem corpo). Retenção: 90 dias (open_api.cleanup()).
create table if not exists open_api.request_log (
  id           bigint generated always as identity primary key,
  user_id      uuid,
  channel      text not null default 'odata' check (channel in ('odata', 'mcp', 'other')),
  method       text not null,
  path         text not null,
  status       int not null,
  duration_ms  int not null,
  detail       text,
  created_at   timestamptz not null default now()
);
create index if not exists request_log_created_idx on open_api.request_log (created_at);
create index if not exists request_log_user_idx on open_api.request_log (user_id, created_at desc);

-- Idempotência de escritas (Idempotency-Key). Retenção: 7 dias.
create table if not exists open_api.idempotency (
  user_id       uuid not null,
  key           text not null check (char_length(key) between 8 and 200),
  request_hash  text not null,
  status        int not null,
  response      jsonb,
  created_at    timestamptz not null default now(),
  primary key (user_id, key)
);

-- Rate limit por janela de 1 minuto.
create table if not exists open_api.rate_limits (
  bucket        text not null,
  window_start  timestamptz not null,
  count         int not null default 0,
  primary key (bucket, window_start)
);

-- Templates de projeto usados pelo intake (substituem os templates que no app vivem só no localStorage).
create table if not exists open_api.project_templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique check (char_length(btrim(name)) between 1 and 120),
  description  text,
  type         text not null default 'novo_projeto' check (type in ('nova_conta', 'novo_projeto')),
  language     text not null default 'pt' check (language in ('pt', 'en', 'es')),
  structure    jsonb not null default '{"phases": []}'::jsonb,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- OAuth 2.1 para o MCP (conector do Claude: "Vincular" → login Google do Open → token da pessoa).
-- Clientes registrados dinamicamente (RFC 7591) pelos próprios apps do Claude; só clientes públicos com PKCE.
create table if not exists open_api.oauth_clients (
  client_id      text primary key,
  client_name    text not null default '',
  redirect_uris  text[] not null,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz
);

-- Códigos de autorização: uso único, 5 minutos. Guardamos só o hash.
create table if not exists open_api.oauth_codes (
  code_hash       text primary key,
  client_id       text not null,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  redirect_uri    text not null,
  code_challenge  text not null,
  resource        text not null,
  expires_at      timestamptz not null,
  used_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- Tokens (acesso: 1 hora; renovação: 30 dias, rotativo). Guardamos só o hash. Reuso de um refresh já trocado
-- revoga a família inteira (proteção contra token roubado).
create table if not exists open_api.oauth_tokens (
  token_hash    text primary key,
  kind          text not null check (kind in ('access', 'refresh')),
  family_id     uuid not null,
  client_id     text not null,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  resource      text not null,
  expires_at    timestamptz not null,
  used_at       timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists oauth_tokens_family_idx on open_api.oauth_tokens (family_id);
create index if not exists oauth_tokens_user_idx on open_api.oauth_tokens (user_id);

-- Ninguém além do dono do schema acessa (defesa em profundidade, mesmo sem exposição no PostgREST).
alter table open_api.user_keys         enable row level security;
alter table open_api.request_log       enable row level security;
alter table open_api.idempotency       enable row level security;
alter table open_api.rate_limits       enable row level security;
alter table open_api.project_templates enable row level security;
alter table open_api.oauth_clients     enable row level security;
alter table open_api.oauth_codes       enable row level security;
alter table open_api.oauth_tokens      enable row level security;
revoke all on all tables in schema open_api from public, anon, authenticated;

-- Limpeza periódica (chamada pela própria API de tempos em tempos).
create or replace function open_api.cleanup() returns void
language sql
set search_path = open_api
as $$
  delete from open_api.request_log where created_at < now() - interval '90 days';
  delete from open_api.idempotency where created_at < now() - interval '7 days';
  delete from open_api.rate_limits where window_start < now() - interval '1 hour';
  delete from open_api.oauth_codes where expires_at < now() - interval '1 day';
  delete from open_api.oauth_tokens where expires_at < now() - interval '7 days';
  delete from open_api.oauth_clients c where c.created_at < now() - interval '30 days'
    and coalesce(c.last_used_at, c.created_at) < now() - interval '30 days'
    and not exists (select 1 from open_api.oauth_tokens t where t.client_id = c.client_id and t.expires_at > now());
$$;
revoke all on function open_api.cleanup() from public, anon, authenticated;
