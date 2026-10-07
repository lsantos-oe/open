-- ═══════════════════════════════════════════════════════════════════════════
-- Retros — avisar quem é colocado como dono ou envolvido numa ação.
--
-- Trigger no banco (não no app): vale seja qual for o cliente que alterou a
-- ação, e só avisa quem ENTROU na lista — salvar a ação de novo sem mudar as
-- pessoas não gera aviso repetido. Nunca avisa quem fez a alteração. Dono
-- tem prioridade: quem está nas duas listas recebe só o aviso de dono.
-- O link abre a retro já com a ação aberta (?action=<id>).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.retro_notify_action_people()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_title text;
  v_text text;
  v_old_owners jsonb := '[]'::jsonb;
  v_old_involved jsonb := '[]'::jsonb;
  v_link text;
begin
  if new.kind <> 'action' then return null; end if;

  if tg_op = 'UPDATE' then
    v_old_owners := coalesce(old.owners, '[]'::jsonb);
    v_old_involved := coalesce(old.involved, '[]'::jsonb);
  end if;

  select title into v_title from retros where id = new.retro_id;
  v_text := left(new.text, 80);
  v_link := '/retros/' || new.retro_id || '?action=' || new.id;

  -- Novos donos
  insert into notifications (user_id, message, link)
  select p.id,
         format('Você foi definido(a) como dono(a) da ação "%s" (retro "%s").', v_text, v_title),
         v_link
  from (
    select distinct o->>'memberId' as mid
    from jsonb_array_elements(coalesce(new.owners, '[]'::jsonb)) o
    where o->>'type' = 'member'
  ) n
  join profiles p on p.id::text = n.mid
  where p.id is distinct from auth.uid()
    and not exists (select 1 from jsonb_array_elements(v_old_owners) oo where oo->>'memberId' = n.mid);

  -- Novos envolvidos (que não sejam também donos)
  insert into notifications (user_id, message, link)
  select p.id,
         format('Você foi marcado(a) como envolvido(a) na ação "%s" (retro "%s").', v_text, v_title),
         v_link
  from (
    select distinct o->>'memberId' as mid
    from jsonb_array_elements(coalesce(new.involved, '[]'::jsonb)) o
    where o->>'type' = 'member'
  ) n
  join profiles p on p.id::text = n.mid
  where p.id is distinct from auth.uid()
    and not exists (select 1 from jsonb_array_elements(v_old_involved) oo where oo->>'memberId' = n.mid)
    and not exists (select 1 from jsonb_array_elements(coalesce(new.owners, '[]'::jsonb)) o where o->>'memberId' = n.mid);

  return null;
end $$;

drop trigger if exists retro_notify_action_people_trg on retro_cards;
create trigger retro_notify_action_people_trg after insert or update of owners, involved on retro_cards
  for each row execute function public.retro_notify_action_people();
