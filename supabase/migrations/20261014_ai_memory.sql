-- ═══════════════════════════════════════════════════════════════════════════
-- Assistente de IA — histórico persistente e memória pessoal.
--
-- • Histórico: ai_conversations / ai_messages já existiam (migration 20260731) mas o app não as usava.
--   Agora as mensagens são gravadas e a última conversa é retomada. `position` fixa a ordem das mensagens
--   (created_at tem resolução de milissegundo e duas mensagens podem coincidir).
-- • Memória: ai_memories guarda notas curtas que o assistente (ou o próprio usuário) salva sobre o usuário —
--   preferências, correções, fatos duradouros. São PESSOAIS: só o dono lê e escreve (RLS), e o app as injeta
--   no prompt apenas daquele usuário.
-- ═══════════════════════════════════════════════════════════════════════════

alter table ai_messages add column if not exists position integer;
create index if not exists ai_messages_conversation_position_idx on ai_messages(conversation_id, position);
create index if not exists ai_conversations_user_updated_idx on ai_conversations(user_id, updated_at desc);

create table if not exists ai_memories (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  kind            text not null default 'fact' check (kind in ('preference', 'fact', 'correction', 'context')),
  content         text not null check (char_length(btrim(content)) between 1 and 500),
  source          text not null default 'assistant' check (source in ('assistant', 'user')),
  conversation_id uuid references ai_conversations(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists ai_memories_user_idx on ai_memories(user_id, updated_at desc);

alter table ai_memories enable row level security;
do $$ begin
  create policy "Usuário acessa suas memórias" on ai_memories
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- Teto por usuário: o prompt carrega todas as memórias, então a lista precisa continuar curta.
create or replace function public.ai_memories_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from ai_memories where user_id = new.user_id) >= 100 then
      raise exception 'Limite de 100 memórias atingido. Apague algumas em Configurações → Memória do assistente.';
    end if;
  else
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists ai_memories_guard_trg on ai_memories;
create trigger ai_memories_guard_trg before insert or update on ai_memories
  for each row execute function public.ai_memories_guard();
