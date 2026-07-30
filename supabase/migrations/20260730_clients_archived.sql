-- ═══════════════════════════════════════════════════════════════════════════
-- Carteira: campo "archived" pra fechar a paridade de gestão de arquivo com
-- Projetos (que já tem archived/hidden). Clientes arquivados saem da lista
-- principal e passam a aparecer só na aba Arquivados de Configurações.
-- ═══════════════════════════════════════════════════════════════════════════

alter table clients add column if not exists archived boolean not null default false;
