---
description: Registra a ata de uma reunião no diário do projeto e transforma os combinados em pontos em aberto e tarefas
argument-hint: <projeto e as anotações/transcrição da reunião>
---

Reunião: $ARGUMENTS

1. Ache o projeto (`find_project`); confirme qual é.
2. Organize a ata: participantes, decisões, pendências (com responsável e prazo) e riscos citados.
3. Mostre a prévia do que será gravado: a ata (`create_meeting_log`), os pontos em aberto (`create_open_point`), as
   tarefas (`create_task`, com fase e executor por e-mail) e os riscos (`create_risk`). Pergunte o que faltar.
4. Depois da confirmação, grave tudo e devolva os links.
