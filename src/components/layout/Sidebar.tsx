import { NavLink, useNavigate, useMatch, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { Project, Incident } from '@/types'

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
      className="flex flex-col min-h-screen shrink-0"
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
      <nav style={{ padding: collapsed ? '8px 6px' : '8px 8px' }}>
        <NavLink to="/" end className={navLinkCls} title={collapsed ? 'Início' : undefined}>
          <span className="shrink-0 w-4 h-4 flex items-center justify-center"><HomeIcon /></span>
          {!collapsed && <span>Início</span>}
        </NavLink>
        <NavLink to="/wallet" className={navLinkCls} title={t('nav.walletTooltip')}>
          <span className="shrink-0 w-4 h-4 flex items-center justify-center"><WalletIcon /></span>
          {!collapsed && <span>{t('nav.wallet')}</span>}
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
        <NavLink to="/guide" className={navLinkCls} title={collapsed ? 'Guia' : undefined}>
          <span className="shrink-0 w-4 h-4 flex items-center justify-center"><GuideIcon /></span>
          {!collapsed && <span>Guia</span>}
        </NavLink>
      </nav>

      {/* Divider */}
      {shortcutKind && (
        <div style={{ height: '0.5px', background: 'var(--sidebar-border)', margin: '0 8px' }} />
      )}

      {/* Contextual shortcuts: Projetos (Portfólio) or Incidentes recentes (Sustentação) */}
      {shortcutKind && (
        <div className="flex-1 overflow-y-auto" style={{ padding: collapsed ? '8px 6px' : '8px 8px' }}>
          {!collapsed && (
            <p style={{
              color: 'var(--sidebar-text-muted)',
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              padding: '4px 8px 6px',
            }}>
              {shortcutKind === 'projects' ? t('nav.projects') : 'Incidentes'}
            </p>
          )}
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
      )}

      {!shortcutKind && <div className="flex-1" />}
    </aside>
  )
}

function HomeIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
    </svg>
  )
}

function WalletIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-5m-4 0a1 1 0 100 2 1 1 0 000-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h18" />
    </svg>
  )
}

function SupportIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.75h.007v.008H12v-.008z" />
    </svg>
  )
}

function PortfolioIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  )
}

function TasksIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}

function GuideIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
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
