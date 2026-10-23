---
description: Cadastra no Open o que estiver no texto (e-mail, ata, planilha) — clientes, projetos, incidentes e tarefas
argument-hint: <cole aqui o texto da demanda>
---

Demanda:

$ARGUMENTS

1. Extraia do texto os clientes, projetos (com fases e tarefas), incidentes e tarefas avulsas.
2. Pessoas sempre por e-mail (`find_user`); se faltar responsável, prazo ou cliente, pergunte antes de seguir.
3. Rode `intake_preview` e mostre o plano: o que será criado, o que será reaproveitado e o que está ambíguo.
4. Resolva os ambíguos com a pessoa. Só depois de um "sim" explícito, rode `intake_commit` com o mesmo conteúdo.
5. Termine com os links do que foi criado.
