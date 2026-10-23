---
description: Cria um projeto de implantação/expansão no Open (cliente, líder, template, fases e tarefas) com prévia antes de gravar
argument-hint: <cliente, tipo, líder, data de início e o que mais souber>
---

Novo projeto: $ARGUMENTS

1. Identifique o cliente (`find_client`; se não existir, proponha criar), o líder (`find_user`, por e-mail), o tipo
   (NovaConta ou NovoProjeto) e a data de início. Pergunte o que faltar.
2. Veja os templates (`list_templates`) e sugira o mais adequado; sem template, monte fases e tarefas com durações (dias
   úteis) e dependências a partir do que a pessoa descrever.
3. Rode `create_project` em prévia e mostre: fases, tarefas, responsáveis, datas calculadas e go-live previsto.
4. Só depois de um "sim" explícito, grave (`dryRun: false`) e devolva o link do projeto.
