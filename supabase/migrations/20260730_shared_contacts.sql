-- ═══════════════════════════════════════════════════════════════════════════
-- Contatos deixam de pertencer a um único cliente e passam a ser uma base
-- compartilhada — o mesmo contato pode estar vinculado a vários clientes, e
-- também vira um tipo de responsável/stakeholder pickável em tarefas de
-- projetos/incidentes (já previsto no owner jsonb, type:'contact').
--
-- client_contacts (client_id not null, 1 contato = 1 cliente) vira contacts
-- (sem client_id) + contact_clients (many-to-many). Os ids dos contatos são
-- preservados, então qualquer EntryOwner{type:'contact', contactId} já salvo
-- continua resolvendo pro mesmo registro sem precisar tocar em entries/
-- incident_stakeholders.
-- ═══════════════════════════════════════════════════════════════════════════

alter table client_contacts rename to contacts;

create table if not exists contact_clients (
  contact_id  uuid not null references contacts(id) on delete cascade,
  client_id   uuid not null references clients(id) on delete cascade,
  primary key (contact_id, client_id)
);

insert into contact_clients (contact_id, client_id)
select id, client_id from contacts where client_id is not null
on conflict do nothing;

alter table contacts drop column if exists client_id;

create index if not exists contact_clients_client_id_idx on contact_clients(client_id);
create index if not exists contact_clients_contact_id_idx on contact_clients(contact_id);

alter table contact_clients enable row level security;

do $$ begin
  create policy "Autenticados acessam contact_clients" on contact_clients for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
