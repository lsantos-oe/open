-- ═══════════════════════════════════════════════════════════════════════════
-- Tarefa solta com vários clientes.
--
-- entries.client_id (um cliente só) continua existindo e passa a espelhar o PRIMEIRO cliente; a lista completa fica
-- em client_ids. Quem ainda só conhece client_id segue funcionando. Sem FK por elemento (uuid[]): o app descarta no
-- display ids de clientes que não existem mais. Só tarefas soltas usam (projeto e incidente têm project_clients /
-- incident_clients).
-- ═══════════════════════════════════════════════════════════════════════════

alter table entries add column if not exists client_ids uuid[] not null default '{}';

-- Quem já tinha um cliente vira lista de um.
update entries set client_ids = array[client_id] where client_id is not null and cardinality(client_ids) = 0;

create index if not exists entries_client_ids_idx on entries using gin (client_ids);
