# Assistente de IA no Discord (`/open`)

Comandos:
- **`/open mensagem:<texto>`** — pergunta ou pedido ao assistente (insights, consultas, criar/alterar coisas). Ações de escrita mostram os botões **Confirmar** e **Cancelar**; só quem pediu pode decidir. A resposta aparece onde o comando foi usado (canal ou mensagem direta com o bot).
- **`/open-novo`** — começa uma conversa nova (a conversa do Discord também recomeça sozinha após 24h sem uso).

Quem usa precisa ter conectado o Discord no perfil do Open (Editar perfil → Alertas no Discord → Conectar). O assistente age como aquela pessoa: mesmos dados, mesma autoria no histórico, mesmos avisos.

## Como colocar no ar

**Supabase (você)**
1. Rode a migration `supabase/migrations/20261023_discord_ai.sql` no SQL editor.
2. No Developer Portal do Discord (aba **General Information**), copie a **Public Key** e guarde como secret:
   ```bash
   supabase secrets set DISCORD_PUBLIC_KEY=<chave pública>
   ```
   (`APP_URL`, o token do bot e o segredo do agendamento já foram configurados para os alertas.)
3. Publique a função. Na pasta do projeto:
   ```bash
   npm run deploy:discord-ai
   ```
   Esse comando empacota o código do assistente (`server/discordAi/` + `src/ai/`) e publica. **Rode de novo sempre que o assistente mudar** (ferramentas, prompt, regras).
4. No Developer Portal → **General Information** → **Interactions Endpoint URL**, cole
   `https://fgzxmcvvahoasisgoqjr.supabase.co/functions/v1/discord-ai` e salve. O Discord testa o endereço na hora; se recusar, confira o passo 2 e 3.
5. Registre os comandos (uma vez; o token vai só no seu terminal):
   ```bash
   DISCORD_BOT_TOKEN=<token do bot> DISCORD_APP_ID=1562553214333620334 node scripts/discord-register-commands.mjs
   ```

**Administrador do servidor do Discord**
6. Reautorizar o aplicativo com o escopo de comandos (o link anterior só tinha `bot`). Pode ser sem nenhuma permissão:
   `https://discord.com/oauth2/authorize?client_id=1562553214333620334&scope=bot%20applications.commands`
7. Se quiser limitar onde o `/open` aparece, em Configurações do servidor → Integrações → Open dá para restringir por canal e por cargo.

## Como funciona (resumo)
O Discord chama a função a cada comando e clique. Ela confere a assinatura, responde "pensando…" em menos de 3 segundos e, em segundo plano, carrega o assistente (o mesmo código do painel do Open), gera uma sessão da pessoa, carrega os dados do Open, roda a conversa e edita a mensagem com a resposta. Uma ação de escrita fica guardada em `discord_ai_pending` até o clique (vale 1 hora).

## Pontos de atenção
- Cada pedido carrega os dados do Open (como o app faz ao abrir) — a primeira resposta costuma levar alguns segundos.
- A conversa do Discord fica no histórico do assistente (título "Discord: …").
- Anexos (imagens, PDFs) não chegam pelo Discord: para extrair tarefas de um e-mail, cole o texto.
- Retros continuam fora do alcance do assistente, como no painel.
