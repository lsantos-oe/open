import { useMemo } from 'react'
import { Link, useLocation, useParams, matchPath } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { useRetroStore } from '@/stores/useRetroStore'
import { useResolvedId } from '@/hooks/useRouteEntityId'

interface Crumb { label: string; to?: string }

/** Onde você está: área › item. Cada parte que não é a atual leva de volta. */
export function Breadcrumb() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const clients = useAppStore((s) => s.clients)
  const groups = useAppStore((s) => s.clientGroups)
  const projects = useAppStore((s) => s.projects)
  const incidents = useAppStore((s) => s.incidents)
  const retros = useRetroStore((s) => s.retros)
  // A URL pode trazer o uuid ou o código curto (C26000123): aqui vale o uuid.
  const rawId = (['/wallet/groups/:id', '/wallet/:id', '/projects/:id', '/support/:id', '/retros/:id']
    .map((p) => matchPath(p, pathname)?.params.id).find(Boolean))
  const { id: resolvedId } = useResolvedId(rawId)

  const crumbs = useMemo<Crumb[]>(() => {
    const id = (pattern: string) => (matchPath(pattern, pathname) ? resolvedId : undefined)
    let m: string | undefined
    if (pathname === '/') return [{ label: t('nav.home') }]
    if (pathname === '/wallet') return [{ label: t('nav.wallet') }]
    if ((m = id('/wallet/groups/:id'))) return [{ label: t('nav.wallet'), to: '/wallet' }, { label: 'Grupos', to: '/wallet?tab=groups' }, { label: groups.find((g) => g.id === m)?.name ?? '…' }]
    if ((m = id('/wallet/:id'))) return [{ label: t('nav.wallet'), to: '/wallet' }, { label: clients.find((c) => c.id === m)?.name ?? '…' }]
    if (pathname === '/portfolio') return [{ label: t('nav.portfolio') }]
    if ((m = id('/projects/:id'))) return [{ label: t('nav.portfolio'), to: '/portfolio' }, { label: projects.find((p) => p.id === m)?.name ?? '…' }]
    if (pathname === '/support') return [{ label: t('nav.support') }]
    if ((m = id('/support/:id'))) return [{ label: t('nav.support'), to: '/support' }, { label: incidents.find((i) => i.id === m)?.title ?? '…' }]
    if (pathname === '/tasks') return [{ label: t('nav.tasks') }]
    if (pathname === '/contacts') return [{ label: t('nav.contacts') }]
    if (pathname === '/retros') return [{ label: t('nav.retros') }]
    if ((m = id('/retros/:id'))) return [{ label: t('nav.retros'), to: '/retros' }, { label: retros.find((r) => r.id === m)?.title ?? '…' }]
    if (pathname === '/settings') return [{ label: t('nav.settings') }]
    if (pathname === '/settings/assistant') return [{ label: t('nav.settings'), to: '/settings' }, { label: 'Memória do assistente' }]
    if (pathname.startsWith('/settings/templates')) return [{ label: t('nav.settings'), to: '/settings' }, { label: 'Template' }]
    if (pathname === '/guide') return [{ label: t('nav.guide') }]
    if (pathname === '/import') return [{ label: 'Importação' }]
    if (pathname === '/users') return [{ label: 'Usuários' }]
    return []
  }, [pathname, t, clients, groups, projects, incidents, retros, resolvedId])

  if (crumbs.length === 0) return null
  return (
    <nav aria-label="Onde você está" className="flex items-center gap-1.5 min-w-0 text-[13px] shrink">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1
        return (
          <span key={i} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && <span style={{ color: 'var(--text-disabled)' }} aria-hidden="true">›</span>}
            {c.to && !last
              ? <Link to={c.to} className="shrink-0 hover:underline" style={{ color: 'var(--text-tertiary)' }}>{c.label}</Link>
              : <span className="truncate" style={{ color: last ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: last ? 600 : 400, maxWidth: 260 }} aria-current={last ? 'page' : undefined}>{c.label}</span>}
          </span>
        )
      })}
    </nav>
  )
}
