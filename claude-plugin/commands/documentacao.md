---
description: Lista, cria e edita a documentação de um projeto, cliente ou grupo no Open (links, textos e arquivos; público e etiquetas)
argument-hint: <projeto, cliente ou grupo> [técnica|executiva] [etiqueta] | adicionar link/texto/arquivo | editar/remover um item
---

Pedido: $ARGUMENTS

**Consultar (padrão)**

1. Descubra o escopo: projeto (`find_project`), cliente (`find_client`) ou grupo (`find_client_group`). Se houver
   mais de um resultado, pergunte qual é.
2. Use `list_documentation` com `projectId`, `clientId` ou `groupId`. Se a pessoa pediu documentação técnica ou
   executiva, passe `audience: Technical` ou `Executive` (traz também os itens marcados para os dois públicos); se
   citou uma etiqueta, passe `tag`.
3. Responda agrupando por projeto/cliente de origem, com título, tipo (link, arquivo, texto), público, etiquetas, o código
   curto (D26000123) e o link do app. Para textos que a pessoa queira ler, chame de novo com `includeBody: true` e
   resuma. Para baixar um arquivo, use `get_documentation_file_link` (link temporário e privado).

**Adicionar, editar ou remover (só se a pessoa pedir)**

4. Escopo de gravação: **um projeto ou um cliente** (nunca um grupo — itens de grupo vivem no cliente ou no projeto).
   Pergunte onde o item deve ficar se não estiver claro.
5. Pergunte (ou proponha e confirme) **para quem é** — técnico, executivo ou os dois — e as **etiquetas** (até 12).
6. Ferramentas: `create_documentation_link` (http/https), `create_documentation_text` (Markdown, até 200 KB),
   `create_documentation_file` (até 25 MB: `ContentBase64` + `FileName` até ~8 MB, ou `SourceUrl` https público),
   `update_documentation_item` (título, link, texto, público, etiquetas) e `delete_documentation_item`.
7. Edição de texto **substitui tudo**: leia o texto atual (`includeBody: true`), altere e reenvie completo. Itens de
   tarefa (`Source: Task`) só mudam público e etiquetas.
8. Todas simulam primeiro: mostre a prévia e só grave com `dryRun=false` depois da confirmação. Remover arquivo ou
   texto é definitivo: confirme o título com a pessoa. Ao terminar, mostre o item com código e link do app.
