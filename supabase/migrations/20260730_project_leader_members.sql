-- ═══════════════════════════════════════════════════════════════════════════
-- Líder (antigo "PM") e Dev Lead passam a referenciar um usuário real
-- (profiles), em vez de só um texto livre. Mantém pm/dev_lead como espelho
-- de nome pra exibição/legado, igual ao padrão já usado em entries.responsible.
-- ═══════════════════════════════════════════════════════════════════════════

alter table projects add column if not exists pm_member_id uuid references profiles(id);
alter table projects add column if not exists dev_lead_member_id uuid references profiles(id);
