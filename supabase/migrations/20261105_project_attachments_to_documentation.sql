-- ═══════════════════════════════════════════════════════════════════════════
-- Anexos do projeto → Documentação.
--
-- A aba "Anexos" da Visão geral do projeto saiu: arquivos de projeto agora vivem na aba Documentação. Os arquivos
-- que já estavam em "Anexos" viram itens de documentação do tipo arquivo (mesmo arquivo no Storage, nada é copiado
-- nem apagado), para público "técnico e executivo" e sem etiquetas — dá para reclassificar na aba.
-- As linhas antigas de `attachments` ficam como estão (não aparecem mais no app). Pode rodar de novo sem duplicar.
-- ═══════════════════════════════════════════════════════════════════════════

insert into documentation_items (project_id, kind, title, storage_path, file_name, file_size, audience, tags, created_by, created_at)
select a.entity_id,
       'file',
       left(coalesce(nullif(btrim(a.name), ''), 'arquivo'), 200),
       a.storage_path,
       coalesce(nullif(btrim(a.name), ''), 'arquivo'),
       a.size,
       'both',
       '{}',
       a.uploaded_by,
       coalesce(a.created_at, now())
  from attachments a
  join projects p on p.id = a.entity_id
 where a.entity_type = 'project'
   and not exists (select 1 from documentation_items d where d.storage_path = a.storage_path);
