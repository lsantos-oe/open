// Empacota o assistente de IA (server/discordAi/runtime.ts + o código do app que ele usa) em UM arquivo para a função
// do Supabase discord-ai. Rode antes de publicar a função e sempre que o código do assistente (src/ai, src/store…) mudar:
//   npm run deploy:discord-ai
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'supabase/functions/discord-ai/runtime.mjs')

await build({
  entryPoints: [path.join(root, 'server/discordAi/runtime.ts')],
  bundle: true,
  format: 'esm',
  // O runtime das funções do Supabase (Deno) tem fetch, WebSocket e crypto como o navegador: usar a versão "browser" das
  // bibliotecas evita depender de módulos do Node.
  platform: 'browser',
  target: 'es2022',
  outfile: out,
  alias: {
    '@/lib/supabase': path.join(root, 'server/discordAi/supabaseShim.ts'),
    '@': path.join(root, 'src'),
  },
  // exceljs só é carregado sob demanda pela importação por planilha, que o assistente não usa.
  external: ['exceljs'],
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'none',
  logLevel: 'warning',
  // chaves duplicadas nos arquivos de idioma já existem no app e são inofensivas
  logOverride: { 'duplicate-object-key': 'silent' },
})

console.log(`discord-ai: ${path.relative(root, out)} gerado`)
