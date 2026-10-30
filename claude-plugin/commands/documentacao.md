---
description: Lista a documentação de um projeto, cliente ou grupo de clientes no Open, filtrando por público e etiqueta
argument-hint: <projeto, cliente ou grupo> [técnica|executiva] [etiqueta]
---

Pedido: $ARGUMENTS

1. Descubra o escopo: projeto (`find_project`), cliente (`find_client`) ou grupo (`find_client_group`). Se houver mais
   de um resultado, pergunte qual é.
2. Use `list_documentation` com `projectId`, `clientId` ou `groupId`. Se a pessoa pediu documentação técnica ou
   executiva, passe `audience: Technical` ou `Executive` (traz também os itens marcados para os dois públicos); se
   citou uma etiqueta, passe `tag`.
3. Responda agrupando por projeto/cliente de origem, com título, tipo (link, arquivo, texto), público, etiquetas, o código
   curto (D26000123) e o link do app. Para textos que a pessoa queira ler, chame de novo com `includeBody: true` e resuma.
   Arquivos não são baixados pelo conector: aponte o link do app. Não grave nada.
