-- ═══════════════════════════════════════════════════════════════════════════
-- Carteira: status de kanban (Pré-venda / Implantação / Sustentação e Novos
-- Projetos) e um campo Owner (múltiplo, separado do CS atual) — quem responde
-- pela implantação ou sustentação do cliente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table clients add column if not exists status text not null default 'sustentacao_novos_projetos';
alter table clients add column if not exists owners jsonb;

do $$ begin
  alter table clients add constraint clients_status_check
    check (status in ('pre_venda', 'implantacao', 'sustentacao_novos_projetos'));
exception when duplicate_object then null; end $$;
