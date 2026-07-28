-- ═══════════════════════════════════════════════════════════════════════════
-- OpEn — Base de usuários: papéis (admin/membro), revogação de acesso e
-- convite prévio (nome+e-mail antes do primeiro login com Google).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── profiles: role + active ────────────────────────────────────────────────

alter table profiles add column if not exists role text not null default 'member';
alter table profiles add column if not exists active boolean not null default true;

do $$ begin
  alter table profiles add constraint profiles_role_check check (role in ('admin', 'member'));
exception when duplicate_object then null; end $$;

-- ─── invited_users: convites criados antes do primeiro login ───────────────
-- profiles.id é FK de auth.users, então não dá pra "criar" um profile antes
-- de a pessoa logar de verdade. Guardamos o convite aqui e o gatilho
-- handle_new_user() consome (nome + papel) na hora do primeiro login.

create table if not exists invited_users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  name        text,
  role        text not null default 'member',
  invited_at  timestamptz not null default now(),
  invited_by  uuid references profiles(id)
);

do $$ begin
  alter table invited_users add constraint invited_users_role_check check (role in ('admin', 'member'));
exception when duplicate_object then null; end $$;

alter table invited_users enable row level security;

do $$ begin
  create policy "Admins veem convites" on invited_users for select
    using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins criam convites" on invited_users for insert
    with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins excluem convites" on invited_users for delete
    using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
exception when duplicate_object then null; end $$;

-- ─── profiles: admins podem editar qualquer perfil ─────────────────────────
-- (a policy "Usuário edita próprio perfil" já existente cobre a auto-edição
-- de nome/avatar; esta cobre um admin alterando role/active de outra pessoa)

do $$ begin
  create policy "Admins editam qualquer perfil" on profiles for update
    using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
exception when duplicate_object then null; end $$;

-- ─── trigger: impede que um usuário comum eleve o próprio papel/acesso ─────
-- A policy de auto-edição permite UPDATE na própria linha inteira (é assim
-- que já funcionava antes desta migration). Sem isso, qualquer usuário
-- logado poderia se autopromover a admin ou reativar o próprio acesso via
-- uma chamada direta ao Supabase, ainda que a UI não ofereça esse botão.

create or replace function public.prevent_self_privilege_escalation()
returns trigger as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active) then
    if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
      raise exception 'Apenas administradores podem alterar papel ou acesso.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists enforce_role_active_change on profiles;
create trigger enforce_role_active_change before update on profiles
  for each row execute function public.prevent_self_privilege_escalation();

-- ─── handle_new_user(): consome convite pendente (nome + papel) ────────────

create or replace function public.handle_new_user()
returns trigger as $$
declare
  invite invited_users%rowtype;
begin
  select * into invite from invited_users where email = new.email limit 1;

  insert into public.profiles (id, email, name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', invite.name),
    new.raw_user_meta_data->>'avatar_url',
    coalesce(invite.role, 'member')
  )
  on conflict (id) do nothing;

  if invite.id is not null then
    delete from invited_users where id = invite.id;
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- ─── bootstrap: o primeiro admin precisa ser definido manualmente ──────────
-- Depois de rodar esta migration, rode (trocando o e-mail):
--   update profiles set role = 'admin' where email = 'seu-email@dominio.com';
