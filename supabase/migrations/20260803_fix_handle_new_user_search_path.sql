-- ═══════════════════════════════════════════════════════════════════════════
-- Corrige "relation invited_users does not exist" no primeiro login de cada
-- usuário. Causa: handle_new_user() é security definer mas nunca definiu
-- search_path — ela roda com o search_path de quem chama (o processo interno
-- do Supabase Auth ao inserir em auth.users), que pode não incluir `public`,
-- deixando a referência solta a invited_users/profiles sem resolver. Mesma
-- classe de bug já corrigida pras funções da chave da IA em
-- 20260803_fix_pgcrypto_search_path.sql.
-- ═══════════════════════════════════════════════════════════════════════════

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
$$ language plpgsql security definer set search_path = public;
