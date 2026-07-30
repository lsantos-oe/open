-- ═══════════════════════════════════════════════════════════════════════════
-- Tarefas (entries) ganham um campo de descrição longa, separado do nome.
-- ═══════════════════════════════════════════════════════════════════════════

alter table entries add column if not exists description text;
