import { supabase } from '@/lib/supabase'

// Mesmo bucket (privado) dos anexos. As imagens do documento ficam referenciadas no Markdown como
// open:file/<caminho> — um link estável. A URL assinada (que expira) só existe na hora de exibir.
const BUCKET = 'project-files'
const MAX_FILE_SIZE = 10 * 1024 * 1024
const SIGNED_URL_TTL = 60 * 60 * 24 * 7
const FILE_PREFIX = 'open:file/'

const signedCache = new Map<string, { url: string; expiresAt: number }>()

export function isOpenFileUrl(url: string): boolean {
  return url.startsWith(FILE_PREFIX)
}

export async function uploadDocFile(docId: string, file: File): Promise<string> {
  if (file.size > MAX_FILE_SIZE) throw new Error(`"${file.name}" passa de 10 MB — use um arquivo menor.`)
  const safeName = file.name.replace(/[^\w.\-]+/g, '_')
  // docs/<id do documento>/<timestamp>_<nome>
  const path = `docs/${docId}/${Date.now()}_${safeName}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
  if (error) throw new Error(error.message)
  return FILE_PREFIX + path
}

/** open:file/<caminho> → URL assinada (com cache); qualquer outra URL passa direto. */
export async function resolveDocFileUrl(url: string): Promise<string> {
  if (!isOpenFileUrl(url)) return url
  const hit = signedCache.get(url)
  if (hit && hit.expiresAt > Date.now()) return hit.url
  const path = url.slice(FILE_PREFIX.length)
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Não foi possível abrir o arquivo.')
  signedCache.set(url, { url: data.signedUrl, expiresAt: Date.now() + (SIGNED_URL_TTL - 3600) * 1000 })
  return data.signedUrl
}
