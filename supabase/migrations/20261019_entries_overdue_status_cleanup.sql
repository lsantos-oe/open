-- ═══════════════════════════════════════════════════════════════════════════
-- Limpeza: "Atrasado" deixa de ser uma etapa gravada.
--
-- Atraso não é uma etapa — uma tarefa pode estar atrasada em Backlog, To Do, Em andamento… — e é calculado pela data
-- (prazo passou e a tarefa não está concluída). Versões antigas do app trocavam o status por 'overdue' quando o prazo
-- passava e, com isso, perdiam a etapa real (e o card sumia do kanban). O app novo não grava mais 'overdue'.
--
-- Aqui reconstruímos a etapa dessas linhas como a etapa automática faria: fim real → concluída; já começou → em
-- andamento; senão Backlog. O atraso continua aparecendo, agora pelo sinal. Não mexe em updated_at nem em
-- last_activity_at (não reinicia o sinal "parado") e não dispara avisos do Discord.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_has_discord_trg boolean := exists (
    select 1 from pg_trigger where tgname = 'discord_enqueue_entry_events_trg' and tgrelid = 'public.entries'::regclass
  );
begin
  if v_has_discord_trg then
    alter table entries disable trigger discord_enqueue_entry_events_trg;
  end if;

  update entries
     set status = case
       when actual_end is not null then 'done'
       when (case when type = 'task' then planned_start else planned_date end) <= v_today then 'in_progress'
       else 'pending'
     end
   where status = 'overdue';

  if v_has_discord_trg then
    alter table entries enable trigger discord_enqueue_entry_events_trg;
  end if;
end $$;
