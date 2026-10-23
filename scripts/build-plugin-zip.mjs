// Empacota o plugin do Claude (claude-plugin/) em public/downloads/open-plugin.zip, para o time baixar pelo Guia do
// Open sem abrir o repositório. Roda antes do build do app (npm run build) — o arquivo gerado não é versionado.
// O zip tem o conteúdo da pasta NA RAIZ (.claude-plugin/plugin.json, skills/, commands/…), que é o formato do upload
// de plugin do Claude.
import JSZip from 'jszip'
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'claude-plugin')
const out = path.join(root, 'public/downloads/open-plugin.zip')

async function walk(dir, base = '') {
  const files = []
  for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name === '.DS_Store') continue
    const rel = base ? `${base}/${e.name}` : e.name
    if (e.isDirectory()) files.push(...(await walk(path.join(dir, e.name), rel)))
    else files.push(rel)
  }
  return files
}

const zip = new JSZip()
const fixedDate = new Date('2026-01-01T00:00:00Z')   // mesmo conteúdo = mesmo arquivo (sem mudar a cada build)
const files = await walk(src)
if (!files.includes('.claude-plugin/plugin.json')) throw new Error('claude-plugin/.claude-plugin/plugin.json não encontrado')
for (const f of files) zip.file(f, await readFile(path.join(src, f)), { date: fixedDate, createFolders: false })

await mkdir(path.dirname(out), { recursive: true })
await writeFile(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }))
console.log(`plugin: ${path.relative(root, out)} (${files.length} arquivos)`)
