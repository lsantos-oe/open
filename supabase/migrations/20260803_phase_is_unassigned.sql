-- ═══════════════════════════════════════════════════════════════════════════
-- Suporte a tarefa sem fase vinculada, quando marcada como oculta do Plano
-- (hiddenFromPlan). Como toda tarefa vive dentro de phases.entries, criamos
-- uma fase "bucket" oculta por projeto (is_unassigned = true) só pra guardar
-- essas tarefas — ela nunca aparece nos seletores/lista de fases do Plano.
-- ═══════════════════════════════════════════════════════════════════════════

alter table phases add column if not exists is_unassigned boolean not null default false;
