# Plugin do Open para o Claude

Conecta o Claude ao [Open](https://openploo.vercel.app): consultar e cadastrar projetos, tarefas, incidentes e clientes
conversando. Tudo é feito **como você** — com as suas permissões e o seu nome no histórico do app. Não há chave dentro do
plugin: cada pessoa faz o próprio login.

## Instalar

1. Baixe o plugin em **https://openploo.vercel.app/downloads/open-plugin.zip** (ou compacte esta pasta, `claude-plugin`, em `.zip`).
   No Claude: **Plugins → Adicionar → Fazer upload de plugin** e escolha o arquivo, sem descompactar
   (ou instale pela lista de plugins, se ele já tiver sido compartilhado com você).
2. Abra o plugin → aba **Conectores** → **open** → **Vincular**.
3. Entre com a sua conta Google do Open e clique em **Permitir**.
4. Abra uma sessão nova e teste: *"quem sou eu no Open?"*.

No Claude Code (terminal ou VS Code) o login aparece na primeira vez que o Open for usado, ou rode `/mcp` → **open** →
**Authenticate**.

**Onde funciona:** Claude Code (terminal, VS Code e a aba **Code** do app). No **chat**, o conector só funciona se a
organização permitir conectores personalizados (na Ploomes, um proprietário da organização precisa liberar).

Para desconectar: **https://openploo.vercel.app/api/minha-chave** → **Desconectar apps**.

## O que vem no plugin

- **Conector do Open** (`/api/mcp`) — cerca de 60 ferramentas de leitura e escrita.
- **Skill `open`** — o Claude sabe quando e como usar o Open.
- **Comandos:**

| Comando | O que faz |
|---|---|
| `/open:minha-semana` | suas tarefas atrasadas, vencendo e paradas |
| `/open:status-projeto <projeto>` | status report pronto para o cliente |
| `/open:cliente <cliente>` | visão 360: projetos, incidentes, tarefas, contatos |
| `/open:preparar-reuniao <cliente>` | pauta da reunião com pendências e riscos |
| `/open:registrar-reuniao <projeto + anotações>` | ata no diário + pontos em aberto, tarefas e riscos |
| `/open:cadastrar-demanda <texto>` | cadastra o que estiver num e-mail, ata ou planilha |
| `/open:novo-projeto <dados>` | projeto com template, fases, tarefas e datas |
| `/open:triagem-incidente <problema>` | registra o incidente com prioridade, impacto e owner |
| `/open:encerrar <projeto ou incidente>` | conclui e trata as tarefas que ficaram abertas |
| `/open:revisar-atrasos [foco]` | atrasos por projeto e por pessoa |
| `/open:carga-time [foco]` | carga de trabalho por pessoa, com sugestões |

## Segurança

- Cada pessoa usa o próprio login; o acesso é o dela no Open.
- O acesso expira e se renova sozinho; quem for desativado no Open perde o acesso na hora.
- Antes de gravar, o Claude mostra a prévia e pede confirmação.

Documentação da API: https://openploo.vercel.app/api/docs
