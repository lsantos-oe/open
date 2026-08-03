-- ═══════════════════════════════════════════════════════════════════════════
-- Defesa em profundidade: hoje a checagem de domínio (@ploomes.com) só existe
-- no client (AuthCallback.tsx via VITE_ALLOWED_EMAIL_DOMAIN). Se alguém
-- chamar o Supabase direto (bypassando o JS), qualquer conta Google que
-- completar o OAuth ganhava profile com active=true automaticamente.
--
-- Passa a marcar active=false já na criação do profile pra qualquer e-mail
-- fora de @ploomes.com — reaproveita o mesmo fluxo de "acesso revogado" que
-- já existe (AuthCallback.tsx desloga e manda pra /login?error=revoked).
-- Um admin pode reativar manualmente (ex: parceiro externo) via
-- Configurações → Usuários, igual já faz hoje pra revogar/reativar.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger as $$
declare
  invite invited_users%rowtype;
  is_allowed_domain boolean;
begin
  select * into invite from invited_users where email = new.email limit 1;
  is_allowed_domain := new.email ilike '%@ploomes.com';

  insert into public.profiles (id, email, name, avatar_url, role, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', invite.name),
    new.raw_user_meta_data->>'avatar_url',
    coalesce(invite.role, 'member'),
    is_allowed_domain
  )
  on conflict (id) do nothing;

  if invite.id is not null then
    delete from invited_users where id = invite.id;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
