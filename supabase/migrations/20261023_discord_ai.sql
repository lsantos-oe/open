-- ═══════════════════════════════════════════════════════════════════════════
-- Assistente de IA no Discord (/open).
--
-- • ai_conversations.source: de onde veio a conversa ('app' = painel do Open, 'discord' = comando /open). O Discord
--   mantém uma conversa própria por pessoa, separada da do painel.
-- • discord_ai_pending: ação de escrita que o assistente propôs e está esperando o clique em Confirmar/Cancelar no
--   Discord. A função do Discord não guarda estado entre cliques, então o que o painel guarda na memória do navegador
--   (cartão de confirmação, confirmações na fila, resultados de leitura já resolvidos) fica aqui, em JSON, até a pessoa
--   decidir ou o prazo vencer. Só o service role lê e escreve (RLS ligada, sem políticas).
-- ═══════════════════════════════════════════════════════════════════════════

alter table ai_conversations add column if not exists source text not null default 'app';

do $$ begin
  alter table ai_conversations add constraint ai_conversations_source_check check (source in ('app', 'discord'));
exception when duplicate_object then null; end $$;

create index if not exists ai_conversations_user_source_idx on ai_conversations(user_id, source, updated_at desc);

create table if not exists discord_ai_pending (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  conversation_id  uuid not null references ai_conversations(id) on delete cascade,
  state            jsonb not null,            -- { pending, queued, pendingToolResults }
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default (now() + interval '1 hour')
);

create index if not exists discord_ai_pending_user_idx on discord_ai_pending(user_id, created_at desc);

alter table discord_ai_pending enable row level security;
