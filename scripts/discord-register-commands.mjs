// Registra (ou atualiza) os comandos do assistente no Discord. Rode UMA vez, e de novo se mudar algo aqui:
//   DISCORD_BOT_TOKEN=... DISCORD_APP_ID=... node scripts/discord-register-commands.mjs
// O token do bot e o ID do aplicativo ficam só no seu terminal.
const token = process.env.DISCORD_BOT_TOKEN
const appId = process.env.DISCORD_APP_ID
if (!token || !appId) {
  console.error('Defina DISCORD_BOT_TOKEN e DISCORD_APP_ID.')
  process.exit(1)
}

const commands = [
  {
    name: 'open',
    type: 1,
    description: 'Pergunte ou peça algo ao assistente do Open',
    // 0 = servidor, 1 = mensagem direta com o bot, 2 = conversa privada; vale também fora do servidor onde o bot foi instalado
    contexts: [0, 1, 2],
    integration_types: [0],
    options: [
      { type: 3, name: 'mensagem', description: 'O que você quer saber ou fazer', required: true, max_length: 1500 },
    ],
  },
  {
    name: 'open-novo',
    type: 1,
    description: 'Começa uma conversa nova com o assistente do Open',
    contexts: [0, 1, 2],
    integration_types: [0],
  },
]

const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
  method: 'PUT',
  headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(commands),
})
const body = await res.json().catch(() => ({}))
if (!res.ok) {
  console.error('Falhou:', res.status, JSON.stringify(body))
  process.exit(1)
}
console.log('Comandos registrados:', body.map((c) => `/${c.name}`).join(', '))
