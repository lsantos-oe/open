import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useEntryOpenerStore } from '@/stores/useEntryOpenerStore'
import { isCode, normalizeCode, ResolvedCode, routeForResolved } from '@/utils/codes'

/** /r/<código>: abre o que o código curto aponta (cliente, projeto, incidente, tarefa, grupo, documentação…). */
export default function ResolveCodePage() {
  const { code: raw = '' } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [state, setState] = useState<'loading' | 'missing'>('loading')

  useEffect(() => {
    const code = normalizeCode(raw)
    if (!isCode(code)) { setState('missing'); return }
    let alive = true
    void (async () => {
      const { data, error } = await supabase.rpc('resolve_code', { p_code: code })
      if (!alive) return
      const r = data as ResolvedCode | null
      if (error || !r) { setState('missing'); return }
      const { path, openEntryId } = routeForResolved(r, code)
      navigate(path, { replace: true })
      if (openEntryId) setTimeout(() => useEntryOpenerStore.getState().open(openEntryId), 50)
    })()
    return () => { alive = false }
  }, [raw, navigate])

  return (
    <div className="p-10 max-w-xl">
      {state === 'loading'
        ? <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Abrindo {normalizeCode(raw)}…</p>
        : (
          <>
            <h1 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Código não encontrado</h1>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Não há nada com o código <span className="font-mono">{normalizeCode(raw)}</span> — ele pode ter sido apagado ou digitado errado. O formato é uma letra, o ano (2 dígitos) e 6 dígitos, como C26000123.
            </p>
            <Link to="/" className="text-sm" style={{ color: 'var(--oe-primary)' }}>Voltar ao início</Link>
          </>
        )}
    </div>
  )
}
