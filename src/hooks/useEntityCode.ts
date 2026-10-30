import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { CodeTable } from '@/utils/codes'

// Código curto de uma coisa já carregada no app (o app guarda só o uuid): busca uma vez e guarda.
const cache = new Map<string, string>()
const inflight = new Map<string, Promise<string | undefined>>()

function load(table: CodeTable, id: string): Promise<string | undefined> {
  const key = `${table}:${id}`
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit)
  let p = inflight.get(key)
  if (!p) {
    p = (async () => {
      const { data } = await supabase.from(table).select('code').eq('id', id).maybeSingle()
      const code = (data as { code?: string | null } | null)?.code ?? undefined
      if (code) cache.set(key, code)
      return code
    })().finally(() => inflight.delete(key))
    inflight.set(key, p)
  }
  return p
}

export function useEntityCode(table: CodeTable, id: string | undefined): string | undefined {
  const [code, setCode] = useState<string | undefined>(id ? cache.get(`${table}:${id}`) : undefined)
  useEffect(() => {
    if (!id) { setCode(undefined); return }
    let alive = true
    setCode(cache.get(`${table}:${id}`))
    void load(table, id).then((c) => { if (alive) setCode(c) }).catch(() => undefined)
    return () => { alive = false }
  }, [table, id])
  return code
}
