# Alertas no Discord — configuração

Quem precisa do quê:

**1. Alguém com admin no servidor do Discord (uma vez)**
1. Em https://discord.com/developers/applications → *New Application* ("Open").
2. Aba **Bot** → *Reset Token* e guarde o token (é o `DISCORD_BOT_TOKEN`). Não precisa ligar nenhum "Privileged Gateway Intent".
3. Aba **OAuth2 → URL Generator**: escopo `bot`, sem permissões. Abra a URL gerada e adicione o bot ao servidor.
4. No Discord, ative *Modo desenvolvedor* (Configurações → Avançado), clique com o botão direito no ícone do servidor → *Copiar ID do servidor* (é o `DISCORD_GUILD_ID`).

**2. Quem administra o Supabase**
```bash
supabase secrets set DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... DISCORD_CRON_SECRET=$(openssl rand -hex 24) APP_URL=https://<endereço do Open>
supabase functions deploy discord-link
supabase functions deploy discord-dispatch --no-verify-jwt
```
Depois rode a migration `20261016_discord_alerts.sql` e, uma vez, `supabase/discord_cron.sql` (com o project ref e o mesmo segredo).

**3. Cada pessoa**
No Open: menu do usuário → *Editar perfil* → *Alertas no Discord* → informe o @ e clique em Conectar. Chega uma mensagem de teste.
Se der erro de mensagem, no Discord ative *Permitir mensagens diretas de membros do servidor* nas configurações de privacidade do servidor.
