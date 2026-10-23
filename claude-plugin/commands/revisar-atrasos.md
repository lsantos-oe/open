---
description: Revisa os atrasos do portfólio no Open — por projeto e por pessoa
argument-hint: [pessoa, cliente ou projeto (opcional)]
---

Foco (opcional): $ARGUMENTS

1. `list_projects` com os projetos em andamento atrasados (IsDelayed) e `list_tasks` com as tarefas atrasadas
   (IsOverdue), filtrando pelo foco se ele foi informado. Projetos em Backlog ficam de fora, como no app.
2. Agrupe por projeto: desvio em dias úteis, tarefas atrasadas, responsável e se está no caminho crítico.
3. Mostre também a carga por pessoa (`workload_by_person`) para quem tiver mais atrasos.
4. Sugira ações (replanejar, cobrar cliente, redistribuir). Não grave nada sem pedir confirmação.
