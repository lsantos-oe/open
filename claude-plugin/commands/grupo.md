---
description: Visão compilada de um grupo de clientes no Open — clientes membros, contatos, projetos, incidentes e documentação
argument-hint: <nome do grupo, ou de um cliente que faça parte dele>
---

Grupo: $ARGUMENTS

1. Ache o grupo (`find_client_group`). Se a pessoa deu o nome de um cliente, use `find_client` e depois
   `list_client_groups` com `clientId` para descobrir em que grupo ele está (se não estiver em nenhum, diga). Se houver
   mais de um resultado, pergunte qual é.
2. Use `get_client_group` e responda em blocos: clientes do grupo (status, país), contatos (separe os "diretos no grupo",
   que valem para todos os clientes, dos contatos de cada cliente), projetos (status, progresso, atrasos), incidentes
   abertos e um resumo da documentação (total e quantos técnicos/executivos). Avise se o grupo tem menos de 2 clientes.
3. Mostre o código curto de cada item e o link do app. Não grave nada (grupos são somente leitura pelo conector).
