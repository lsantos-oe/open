import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { codeToId, useEntityCode } from '@/hooks/useEntityCode'
import { CodeTable, isCode, normalizeCode } from '@/utils/codes'

/** Resolve um código curto (C26000123) no uuid. Lembra o que já resolveu. */
export function useResolvedId(param: string | undefined): { id: string | undefined; pending: boolean } {
  const code = param && isCode(param) ? normalizeCode(param) : undefined
  const [, bump] = useState(0)
  useEffect(() => {
    if (!code || codeToId.has(code)) return
    let alive = true
    void supabase.rpc('resolve_code', { p_code: code }).then(({ data }) => {
      const id = (data as { id?: string } | null)?.id
      if (id) codeToId.set(code, id)
      if (alive) bump((n) => n + 1)
    })
    return () => { alive = false }
  }, [code])
  if (!code) return { id: param, pending: false }
  const id = codeToId.get(code)
  return { id, pending: !id }
}

/**
 * Id da página aberta, aceitando o uuid ou o código curto na URL. Com o uuid, troca o endereço pelo código
 * (sem criar entrada no histórico), então a barra mostra sempre o ID que aparece na tela.
 */
export function useRouteEntityId(table: CodeTable): { id: string | undefined; pending: boolean } {
  const { id: param } = useParams<{ id: string }>()
  const { pathname, search, hash } = useLocation()
  const navigate = useNavigate()
  const resolved = useResolvedId(param)
  const code = useEntityCode(table, resolved.id)

  useEffect(() => {
    if (!param || !code || param === code) return
    if (isCode(param)) return   // já está em código (mesmo que em minúsculas)
    const idx = pathname.lastIndexOf(param)
    if (idx < 0) return
    navigate(pathname.slice(0, idx) + code + pathname.slice(idx + param.length) + search + hash, { replace: true })
  }, [param, code, pathname, search, hash, navigate])

  return resolved
}
