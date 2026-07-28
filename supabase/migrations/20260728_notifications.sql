-- ═══════════════════════════════════════════════════════════════════════════
-- Notificações in-app — aviso simples quando você é adicionado como
-- responsável numa tarefa, adicionado como stakeholder de um incidente, ou
-- quando um incidente que você acompanha muda de status.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  message    text not null,
  link       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on notifications(user_id);

alter table notifications enable row level security;

do $$ begin
  create policy "Usuário vê suas notificações" on notifications for select
    using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Usuário marca suas notificações como lidas" on notifications for update
    using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Autenticados criam notificações" on notifications for insert
    with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
