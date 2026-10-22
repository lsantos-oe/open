---
description: Conclui um projeto ou resolve/fecha um incidente no Open, tratando as tarefas que ficaram abertas (como o app faz)
argument-hint: <projeto ou incidente>
---

Encerrar: $ARGUMENTS

1. Ache o projeto (`find_project`) ou incidente (`find_incident`); confirme qual é.
2. Liste as tarefas ainda abertas (`list_open_tasks`) e pergunte: concluir todas, só algumas ou nenhuma.
3. Mostre a prévia: novo status (projeto → Done; incidente → Resolved ou Closed) e as tarefas que serão concluídas
   (Fim real = hoje).
4. Depois da confirmação, grave (`update_project` / `set_incident_status` e `complete_open_tasks`) e devolva os links.
