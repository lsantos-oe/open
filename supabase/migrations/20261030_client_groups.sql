-- ═══════════════════════════════════════════════════════════════════════════
-- Grupos de clientes.
--
-- Um grupo reúne 2 ou mais clientes (ex.: empresas do mesmo conglomerado). A página do grupo compila tudo dos
-- clientes membros (contatos, projetos, incidentes, documentação…). Um CONTATO pode ser colocado direto no grupo:
-- aí ele passa a estar ligado a todos os clientes membros (contact_clients), inclusive os que entrarem depois, e
-- deixa de estar ligado a quem sair do grupo. Esse vínculo é MATERIALIZADO — vira linha em contact_clients — para o
-- resto do app (seleção de contatos de tarefas, stakeholders, relatórios…) continuar funcionando como sempre.
--
-- • client_groups / client_group_members / client_group_contacts: o grupo, seus clientes e seus contatos diretos.
-- • client_group_contact_links: controle do que o grupo materializou em contact_clients. `created_link` diz se foi o
--   grupo que criou a linha (se a pessoa já estava ligada ao cliente à mão, o vínculo manual nunca é apagado pelo
--   grupo). Com vários grupos cobrindo o mesmo cliente, a "autoria" da linha passa para outro grupo quando o primeiro
--   sai, e a linha só some quando nenhum grupo a sustenta mais.
-- • Um cliente só pode estar em UM grupo, a menos que a configuração do sistema allowMultipleClientGroups esteja
--   ligada (settings.config). O banco confere isso: vale para a tela, a IA e a API.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists client_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists client_groups_name_uniq on client_groups (lower(btrim(name)));

create table if not exists client_group_members (
  group_id   uuid not null references client_groups(id) on delete cascade,
  client_id  uuid not null references clients(id) on delete cascade,
  added_by   uuid references profiles(id),
  added_at   timestamptz not null default now(),
  primary key (group_id, client_id)
);
create index if not exists client_group_members_client_idx on client_group_members(client_id);

create table if not exists client_group_contacts (
  group_id    uuid not null references client_groups(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  added_by    uuid references profiles(id),
  added_at    timestamptz not null default now(),
  primary key (group_id, contact_id)
);
create index if not exists client_group_contacts_contact_idx on client_group_contacts(contact_id);

create table if not exists client_group_contact_links (
  group_id      uuid not null references client_groups(id) on delete cascade,
  contact_id    uuid not null references contacts(id) on delete cascade,
  client_id     uuid not null references clients(id) on delete cascade,
  created_link  boolean not null,
  primary key (group_id, contact_id, client_id)
);
create index if not exists client_group_contact_links_pair_idx on client_group_contact_links(contact_id, client_id);

alter table client_groups enable row level security;
alter table client_group_members enable row level security;
alter table client_group_contacts enable row level security;
alter table client_group_contact_links enable row level security;   -- sem política: só as funções abaixo mexem

do $$ begin
  create policy "Autenticados acessam grupos" on client_groups for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Autenticados acessam membros de grupos" on client_group_members for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Autenticados acessam contatos de grupos" on client_group_contacts for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

create or replace function public.client_groups_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  new.name := btrim(new.name);
  return new;
end $$;

drop trigger if exists client_groups_touch_trg on client_groups;
create trigger client_groups_touch_trg before insert or update on client_groups
  for each row execute function public.client_groups_touch();

-- ─── Um grupo por cliente (a menos que a configuração permita mais) ────────

create or replace function public.client_group_members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_other text;
begin
  if new.added_by is null then new.added_by := auth.uid(); end if;
  if coalesce((select value->>'allowMultipleClientGroups' from settings where key = 'config'), 'false') = 'true' then
    return new;
  end if;
  select g.name into v_other
    from client_group_members m join client_groups g on g.id = m.group_id
   where m.client_id = new.client_id and m.group_id <> new.group_id
   limit 1;
  if v_other is not null then
    raise exception 'Este cliente já faz parte do grupo "%". Para permitir mais de um grupo por cliente, ative a opção em Configurações.', v_other;
  end if;
  return new;
end $$;

drop trigger if exists client_group_members_guard_trg on client_group_members;
create trigger client_group_members_guard_trg before insert on client_group_members
  for each row execute function public.client_group_members_guard();

-- ─── Materialização dos contatos do grupo em contact_clients ───────────────

create or replace function public.client_group_link(p_group uuid, p_contact uuid, p_client uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_existed boolean := exists (select 1 from contact_clients where contact_id = p_contact and client_id = p_client);
begin
  insert into client_group_contact_links (group_id, contact_id, client_id, created_link)
  values (p_group, p_contact, p_client, not v_existed)
  on conflict do nothing;
  insert into contact_clients (contact_id, client_id) values (p_contact, p_client) on conflict do nothing;
end $$;

create or replace function public.client_group_unlink(p_group uuid, p_contact uuid, p_client uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t client_group_contact_links%rowtype;
begin
  select * into t from client_group_contact_links where group_id = p_group and contact_id = p_contact and client_id = p_client;
  if not found then return; end if;
  delete from client_group_contact_links where group_id = p_group and contact_id = p_contact and client_id = p_client;
  if not t.created_link then return; end if;   -- o vínculo já existia à mão: continua
  -- outro grupo ainda sustenta o vínculo? A "autoria" passa para ele; senão a linha de contact_clients sai.
  update client_group_contact_links set created_link = true
   where (group_id, contact_id, client_id) = (
     select o.group_id, o.contact_id, o.client_id from client_group_contact_links o
      where o.contact_id = p_contact and o.client_id = p_client limit 1);
  if not found then
    delete from contact_clients where contact_id = p_contact and client_id = p_client;
  end if;
end $$;

revoke all on function public.client_group_link(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.client_group_unlink(uuid, uuid, uuid) from public, anon, authenticated;

-- Contato colocado / tirado do grupo
create or replace function public.client_group_contacts_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if tg_op = 'INSERT' then
    if new.added_by is null then new.added_by := auth.uid(); end if;
    for r in select client_id from client_group_members where group_id = new.group_id loop
      perform public.client_group_link(new.group_id, new.contact_id, r.client_id);
    end loop;
    return new;
  else
    for r in select client_id from client_group_contact_links where group_id = old.group_id and contact_id = old.contact_id loop
      perform public.client_group_unlink(old.group_id, old.contact_id, r.client_id);
    end loop;
    return old;
  end if;
end $$;

drop trigger if exists client_group_contacts_ins_trg on client_group_contacts;
create trigger client_group_contacts_ins_trg before insert on client_group_contacts
  for each row execute function public.client_group_contacts_sync();
drop trigger if exists client_group_contacts_del_trg on client_group_contacts;
create trigger client_group_contacts_del_trg before delete on client_group_contacts
  for each row execute function public.client_group_contacts_sync();

-- Cliente entrou / saiu do grupo
create or replace function public.client_group_members_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if tg_op = 'INSERT' then
    for r in select contact_id from client_group_contacts where group_id = new.group_id loop
      perform public.client_group_link(new.group_id, r.contact_id, new.client_id);
    end loop;
    return new;
  else
    for r in select contact_id from client_group_contact_links where group_id = old.group_id and client_id = old.client_id loop
      perform public.client_group_unlink(old.group_id, r.contact_id, old.client_id);
    end loop;
    return old;   -- BEFORE DELETE: devolver null cancelaria a exclusão
  end if;
end $$;

drop trigger if exists client_group_members_ins_trg on client_group_members;
create trigger client_group_members_ins_trg after insert on client_group_members
  for each row execute function public.client_group_members_sync();
drop trigger if exists client_group_members_del_trg on client_group_members;
create trigger client_group_members_del_trg before delete on client_group_members
  for each row execute function public.client_group_members_sync();

-- Grupo desfeito: solta os vínculos que ele criou ANTES de a cascata apagar o controle.
create or replace function public.client_groups_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select contact_id, client_id from client_group_contact_links where group_id = old.id loop
    perform public.client_group_unlink(old.id, r.contact_id, r.client_id);
  end loop;
  return old;
end $$;

drop trigger if exists client_groups_before_delete_trg on client_groups;
create trigger client_groups_before_delete_trg before delete on client_groups
  for each row execute function public.client_groups_before_delete();

-- Alguém desligou à mão o contato de um cliente do grupo: a decisão manual vale; o controle do grupo é descartado.
create or replace function public.contact_clients_manual_unlink()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from client_group_contact_links where contact_id = old.contact_id and client_id = old.client_id;
  return old;
end $$;

drop trigger if exists contact_clients_manual_unlink_trg on contact_clients;
create trigger contact_clients_manual_unlink_trg after delete on contact_clients
  for each row execute function public.contact_clients_manual_unlink();

-- ─── Realtime ──────────────────────────────────────────────────────────────

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table client_groups; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table client_group_members; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table client_group_contacts; exception when duplicate_object then null; end;
  end if;
end $$;
