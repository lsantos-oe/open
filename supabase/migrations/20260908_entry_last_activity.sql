-- ═══════════════════════════════════════════════════════════════════════════
-- last_activity_at em entries — base pro sinal "parado" (tracking upgrade).
-- Atualizado explicitamente pelas próprias actions da store quando algo que
-- conta como atividade de verdade acontece (status, dono, data, descrição,
-- comentário) — deliberadamente NÃO é um trigger genérico de "qualquer
-- UPDATE": dbSyncAllEntries faz upsert de TODAS as entries de um projeto de
-- uma vez (reorder, mover de fase, cascata de data), e um trigger ingênuo
-- resetaria last_activity_at de tarefas que não tiveram nenhuma atividade
-- real só porque uma tarefa vizinha mudou. Ver docs/FUNCTIONAL_OVERVIEW.md.
-- ═══════════════════════════════════════════════════════════════════════════

alter table entries add column if not exists last_activity_at timestamptz;

-- Semeia com o valor mais recente já disponível, pra linhas existentes não
-- nascerem "paradas há décadas" no primeiro carregamento do sinal.
update entries set last_activity_at = coalesce(updated_at, created_at, now())
where last_activity_at is null;
