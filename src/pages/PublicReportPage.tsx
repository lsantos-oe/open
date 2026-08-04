import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabaseUrl } from '@/lib/supabase'

/** Public, unauthenticated route (/report/:projectId/:fileId) for status
 *  report links. Deliberately does NOT navigate the browser straight to the
 *  Supabase Storage URL — it fetches the HTML via JS and renders it in an
 *  iframe instead, so the page always renders regardless of how Storage
 *  serves the file's Content-Type/Content-Disposition for direct requests,
 *  and the link itself stays on our own domain, permanently. */
export default function PublicReportPage() {
  const { projectId, fileId } = useParams<{ projectId: string; fileId: string }>()
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId || !fileId) {
      setError('Link inválido.')
      return
    }
    let cancelled = false
    const url = `${supabaseUrl}/storage/v1/object/public/status-reports/${projectId}/${fileId}.html`
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status))
        return res.text()
      })
      .then((text) => { if (!cancelled) setHtml(text) })
      .catch(() => { if (!cancelled) setError('Este link não existe mais ou foi removido.') })
    return () => { cancelled = true }
  }, [projectId, fileId])

  if (error) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, Inter, Segoe UI, sans-serif',
        color: '#5A5347', background: '#FBFAF8', fontSize: 14,
      }}>
        <p>{error}</p>
      </div>
    )
  }

  if (!html) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, Inter, Segoe UI, sans-serif',
        color: '#8A8177', background: '#FBFAF8', fontSize: 14,
      }}>
        <p>Carregando relatório…</p>
      </div>
    )
  }

  return (
    <iframe
      srcDoc={html}
      title="Status Report"
      style={{ border: 'none', width: '100vw', height: '100vh', display: 'block' }}
      sandbox="allow-same-origin"
    />
  )
}
