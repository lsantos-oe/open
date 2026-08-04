import { NavLink, useNavigate, useMatch, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { Project, Incident } from '@/types'
import { HomeIcon, WalletIcon, ContactsIcon, SupportIcon, PortfolioIcon, TasksIcon, GuideIcon, GearIcon } from '@/components/ui/icons'

const INCIDENT_STATUS_COLOR: Record<Incident['status'], string> = {
  open: 'var(--text-tertiary)',
  in_progress: 'var(--color-info-text)',
  waiting_on_client: 'var(--color-warning-text)',
  resolved: 'var(--color-success-text)',
  closed: 'var(--text-tertiary)',
}

const PALETTE = ['#F59E0B','#10B981','#3B82F6','#8B5CF6','#EC4899','#EF4444','#06B6D4','#84CC16']

function projectColor(project: Project, index: number): string {
  if (project.color) return project.color
  return PALETTE[index % PALETTE.length]
}

export function Sidebar() {
  const { t } = useTranslation()
  const { settings, updateSettings, projects, incidents } = useAppStore()
  const navigate = useNavigate()
  const location = useLocation()
  const projectMatch = useMatch('/projects/:id')
  const activeProjectId = projectMatch?.params.id
  const incidentMatch = useMatch('/support/:id')
  const activeIncidentId = incidentMatch?.params.id
  const collapsed = settings.sidebarCollapsed ?? false

  function toggle() { updateSettings({ sidebarCollapsed: !collapsed }) }

  const sidebarW = collapsed ? 48 : 220

  const navLinkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-[var(--radius-md)] text-[13px] transition-colors mb-0.5 ` +
    (isActive
      ? 'bg-[var(--sidebar-active-bg)] text-white '
      : 'text-[var(--sidebar-text)] hover:bg-white/5 hover:text-white/80 ') +
    (collapsed ? 'justify-center px-0 py-2 w-full' : 'px-2 py-1.5')

  // Shortcuts section is contextual: projects on Portfólio/project-detail routes,
  // recent incidents on Sustentação/incident-detail routes, hidden elsewhere.
  const shortcutKind: 'projects' | 'incidents' | null =
    location.pathname.startsWith('/portfolio') || location.pathname.startsWith('/projects/')
      ? 'projects'
      : location.pathname.startsWith('/support')
        ? 'incidents'
        : null

  const recentIncidents = incidents.slice(0, 8)

  return (
    <aside
      className="flex flex-col h-screen sticky top-0 shrink-0"
      style={{
        width: sidebarW,
        minWidth: sidebarW,
        background: 'var(--sidebar-bg)',
        borderRight: '0.5px solid var(--sidebar-border)',
        transition: 'width 200ms ease',
        overflow: 'hidden',
      }}
    >
      {/* Brand + toggle */}
      <div
        className="flex items-center shrink-0 px-3"
        style={{ height: 52, borderBottom: '0.5px solid var(--sidebar-border)' }}
      >
        {!collapsed && (
          <span className="flex-1 flex items-center gap-1.5 min-w-0">
            <span className="truncate" style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.01em' }}>
              <span style={{ color: 'var(--sidebar-text-active)' }}>op</span>
              <span style={{ color: 'var(--oe-primary)' }}>en</span>
            </span>
          </span>
        )}
        <button
          onClick={toggle}
          className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-md)] hover:bg-white/10 transition-colors shrink-0"
          style={{ color: 'var(--sidebar-text)' }}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
        >
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </button>
      </div>

      {/* Main nav */}
      <nav className="shrink-0" style={{ padding: collapsed ? '8px 6px' : '8px 8px' }}>
        <NavLink to="/" end className={navLinkCls} title={collapsed ? t('nav.home') : undefined}>
          <span className="shrink-0 w-4 h-4 flex items-center justify-center"><HomeIcon /></span>
          {!collapsed && <span>{t('nav.home')}</span>}
        </NavLink>
        <NavLink to="/wallet" className={navLinkCls} title={t('nav.walletTooltip')}>
          <span className="shrink-0 w-4 h-4 flex items-center justify-center"><WalletIcon /></span>
          {!collapsed && <span>{t('nav.wallet')}</span>}
        </NavLink>
        <NavLink to="/contacts" className={navLinkCls} title={collapsed ? t('nav.contacts') : undefined}>
          <span className="shrink-0 w-4 h-4 flex items-center justify-center"><ContactsIcon /></span>
          {!collapsed && <span>{t('nav.contacts')}</span>}
        </NavLink>
        <NavLink to="/portfolio" className={navLinkCls} title={t('nav.projects')}>
          <span className="shrink-0 w-4 h-4 flex items-center justify-center"><PortfolioIcon /></span>
          {!collapsed && <span>{t('nav.portfolio')}</span>}
        </NavLink>
        <NavLink to="/support" className={navLinkCls} title={t('nav.supportTooltip')}>
          <span className="shrink-0 w-4 h-4 flex items-center justify-center"><SupportIcon /></span>
          {!collapsed && <span>{t('nav.support')}</span>}
        </NavLink>
        <NavLink to="/tasks" className={navLinkCls} title={collapsed ? t('nav.tasks') : undefined}>
          <span className="shrink-0 w-4 h-4 flex items-center justify-center"><TasksIcon /></span>
          {!collapsed && <span>{t('nav.tasks')}</span>}
        </NavLink>
        <div style={{ height: '0.5px', background: 'var(--sidebar-border)', margin: '6px 4px' }} />
        <NavLink to="/settings" className={navLinkCls} title={collapsed ? t('nav.settings') : undefined}>
          <span className="shrink-0 w-4 h-4 flex items-center justify-center"><GearIcon /></span>
          {!collapsed && <span>{t('nav.settings')}</span>}
        </NavLink>
        <NavLink to="/guide" className={navLinkCls} title={collapsed ? t('nav.guide') : undefined}>
          <span className="shrink-0 w-4 h-4 flex items-center justify-center"><GuideIcon /></span>
          {!collapsed && <span>{t('nav.guide')}</span>}
        </NavLink>
      </nav>

      {/* Divider */}
      {shortcutKind && (
        <div className="shrink-0" style={{ height: '0.5px', background: 'var(--sidebar-border)', margin: '0 8px' }} />
      )}

      {/* Contextual shortcuts: Projetos (Portfólio) or Incidentes recentes (Sustentação) */}
      {shortcutKind && (
        <div className="flex-1 flex flex-col min-h-0">
          {!collapsed && (
            <p
              className="shrink-0"
              style={{
                color: 'var(--sidebar-text-muted)',
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                padding: '10px 8px 6px',
              }}
            >
              {shortcutKind === 'projects' ? t('nav.projects') : t('nav.recentIncidents')}
            </p>
          )}
          <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: collapsed ? '8px 6px' : '0 8px 8px' }}>
          {shortcutKind === 'projects'
            ? projects.map((project, i) => {
                const color = projectColor(project, i)
                const isActive = project.id === activeProjectId
                return (
                  <button
                    key={project.id}
                    onClick={() => navigate(`/projects/${project.id}`)}
                    title={collapsed ? project.name : undefined}
                    className={`w-full flex items-center rounded-[var(--radius-md)] transition-colors mb-0.5 hover:bg-white/5 ${isActive ? 'bg-[var(--sidebar-active-bg)]' : ''} ${collapsed ? 'justify-center px-0 py-2' : 'gap-2 px-2 py-1.5'}`}
                    style={{ color: isActive ? 'white' : 'var(--sidebar-text)' }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    {!collapsed && <span className="truncate text-[12px] text-left">{project.name}</span>}
                  </button>
                )
              })
            : recentIncidents.map((incident) => {
                const isActive = incident.id === activeIncidentId
                return (
                  <button
                    key={incident.id}
                    onClick={() => navigate(`/support/${incident.id}`)}
                    title={collapsed ? incident.title : undefined}
                    className={`w-full flex items-center rounded-[var(--radius-md)] transition-colors mb-0.5 hover:bg-white/5 ${isActive ? 'bg-[var(--sidebar-active-bg)]' : ''} ${collapsed ? 'justify-center px-0 py-2' : 'gap-2 px-2 py-1.5'}`}
                    style={{ color: isActive ? 'white' : 'var(--sidebar-text)' }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: INCIDENT_STATUS_COLOR[incident.status], flexShrink: 0 }} />
                    {!collapsed && <span className="truncate text-[12px] text-left">{incident.title}</span>}
                  </button>
                )
              })}
          </div>
        </div>
      )}

      {!shortcutKind && <div className="flex-1" />}
    </aside>
  )
}

function ChevronLeftIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}
