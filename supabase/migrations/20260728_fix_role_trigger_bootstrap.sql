-- ═══════════════════════════════════════════════════════════════════════════
-- Corrige prevent_self_privilege_escalation(): rodando pelo SQL Editor (ou
-- qualquer acesso direto ao banco, fora do app), auth.uid() vem NULL — a
-- checagem "sou admin?" então falhava sempre, bloqueando até o bootstrap do
-- primeiro admin. Acesso direto ao banco já é mais privilegiado que qualquer
-- sessão de app, então só bloqueamos quando há um usuário autenticado de
-- verdade tentando se autopromover.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.prevent_self_privilege_escalation()
returns trigger as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active) then
    if auth.uid() is not null and not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
      raise exception 'Apenas administradores podem alterar papel ou acesso.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;
