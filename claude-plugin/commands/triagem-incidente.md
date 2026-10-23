---
description: Registra ou tria um incidente de sustentação no Open (prioridade, impacto, owner, cliente e próximos passos)
argument-hint: <descrição do problema, cliente e quem reportou>
---

Incidente: $ARGUMENTS

1. Procure incidentes abertos parecidos do mesmo cliente (`list_incidents`, `search`) para não duplicar; se achar,
   mostre e pergunte se é o mesmo.
2. Proponha prioridade e impacto (Low/Medium/High) com uma justificativa de uma linha, o owner (por e-mail) e os
   clientes/projetos afetados.
3. Rode `create_incident` em prévia, com a descrição organizada (sintoma, desde quando, impacto, evidências).
4. Depois da confirmação, grave, adicione stakeholders se a pessoa indicar (`add_incident_stakeholder`) e sugira as
   primeiras tarefas do incidente.
