---
description: Visão compilada de um grupo de clientes no Open — e criar ou ajustar grupos (membros, contatos, nome)
argument-hint: <nome do grupo, ou de um cliente do grupo> | criar <nome> com <clientes> | adicionar/tirar <cliente ou contato>
---

Grupo: $ARGUMENTS

**Consultar (padrão)**

1. Ache o grupo (`find_client_group`). Se a pessoa deu o nome de um cliente, use `find_client` e depois
   `list_client_groups` com `clientId` para descobrir em que grupo ele está (se não estiver em nenhum, diga). Se houver
   mais de um resultado, pergunte qual é.
2. Use `get_client_group` e responda em blocos: clientes do grupo (status, país), contatos (separe os "diretos no grupo",
   que valem para todos os clientes, dos contatos de cada cliente), projetos (status, progresso, atrasos), incidentes
   abertos e um resumo da documentação (total e quantos técnicos/executivos). Avise se o grupo tem menos de 2 clientes.
3. Mostre o código curto de cada item e o link do app.

**Criar ou ajustar (só se a pessoa pedir)**

4. Desambigue clientes e contatos antes de gravar (`find_client`, `find_contact`; mais de um resultado = pergunte).
5. Ferramentas: `create_client_group` (nome único, 2 ou mais clientes, contatos diretos opcionais), `update_client_group`
   (renomear), `add_group_client` / `remove_group_client`, `add_group_contact` / `remove_group_contact` e
   `delete_client_group` (desfaz o grupo; clientes e contatos continuam existindo).
6. As ferramentas simulam primeiro: mostre a prévia ("Estou prestes a …") e só chame de novo com `dryRun=false` depois
   que a pessoa confirmar. Lembre que contato direto vale para **todos** os clientes do grupo e que um cliente só pode
   estar em um grupo (se o banco recusar, mostre a mensagem e pergunte o que fazer). Ao terminar, mostre o grupo
   atualizado com o código e o link.
