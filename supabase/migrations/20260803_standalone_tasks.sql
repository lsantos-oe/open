-- ═══════════════════════════════════════════════════════════════════════════
-- Tarefas soltas — uma Entry pode agora existir sem projeto E sem incidente
-- (project_id, phase_id e incident_id todos nulos), opcionalmente vinculada
-- a um cliente via a nova coluna client_id. Mesma convenção já usada pra
-- incident_id: sem CHECK constraint reforçando "só um escopo por vez" — o
-- app é responsável por nunca setar mais de um escopo na mesma linha.
-- ═══════════════════════════════════════════════════════════════════════════

alter table entries add column if not exists client_id uuid references clients(id) on delete set null;
create index if not exists entries_client_id_idx on entries(client_id);
