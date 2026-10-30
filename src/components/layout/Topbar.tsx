import { useState, useEffect, useRef, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/useAuthStore'
import { useCommandPaletteStore } from '@/stores/useCommandPaletteStore'
import { NotificationBell } from './NotificationBell'
import { ThemePref, setThemePref, useThemePref } from '@/utils/theme'
import { EditProfileModal } from './EditProfileModal'
import { PlusIcon, TasksIcon, SupportIcon, PortfolioIcon, ContactsIcon, WalletIcon } from '@/components/ui/icons'

const QUICK_CREATE = [
  { to: '/tasks', label: 'Nova tarefa', Icon: TasksIcon },
  { to: '/support', label: 'Novo incidente', Icon: SupportIcon },
  { to: '/portfolio', label: 'Novo projeto', Icon: PortfolioIcon },
  { to: '/contacts', label: 'Novo contato', Icon: ContactsIcon },
  { to: '/wallet', label: 'Novo cliente', Icon: WalletIcon },
]

const IMPORT_OPTIONS = [
  { entity: 'clientes', label: 'Clientes', Icon: WalletIcon },
  { entity: 'projetos', label: 'Projetos', Icon: PortfolioIcon },
  { entity: 'incidentes', label: 'Incidentes', Icon: SupportIcon },
  { entity: 'tarefas', label: 'Tarefas', Icon: TasksIcon },
] as const

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'U'
}

export function Topbar() {
  const navigate = useNavigate()
  const { user, profile, signOut } = useAuthStore()
  const toggleCommandPalette = useCommandPaletteStore((s) => s.toggle)
  const themePref = useThemePref()
  const [showMenu, setShowMenu] = useState(false)
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [showQuickCreate, setShowQuickCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const quickCreateRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLDivElement>(null)

  const displayName = profile?.name ?? user?.email ?? 'Usuário'
  const avatarUrl = profile?.avatar_url ?? null
  const initials = getInitials(displayName)

  useEffect(() => {
    if (!showMenu) return
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  useEffect(() => {
    if (!showQuickCreate) return
    function handler(e: MouseEvent) {
      if (quickCreateRef.current && !quickCreateRef.current.contains(e.target as Node)) setShowQuickCreate(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showQuickCreate])

  useEffect(() => {
    if (!showImport) return
    function handler(e: MouseEvent) {
      if (importRef.current && !importRef.current.contains(e.target as Node)) setShowImport(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showImport])

  function goImport(entity: string) {
    setShowImport(false)
    navigate(`/import?entity=${entity}`)
  }

  function goCreate(to: string) {
    setShowQuickCreate(false)
    navigate(`${to}?new=1`)
  }

  const item = 'w-full text-left flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-[13px] transition-colors hover:bg-[var(--surface-subtle)]'
  const popover: React.CSSProperties = {
    position: 'absolute', top: 40, right: 0, background: 'var(--surface-card)', borderRadius: 'var(--radius-xl)',
    boxShadow: 'var(--shadow-lg)', zIndex: 100, padding: 6,
  }
  const circle = (active: boolean): React.CSSProperties => ({
    width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: active ? 'var(--text-primary)' : 'var(--surface-subtle)', color: active ? 'var(--surface-page)' : 'var(--text-secondary)',
  })
  const themeIcons: Record<ThemePref, ReactNode> = {
    auto: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>,
    light: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></svg>,
    dark: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" /></svg>,
  }

  return (
    <>
      <div className="flex items-center shrink-0 px-6 gap-2" style={{ height: 56, background: 'var(--surface-page)' }}>
        <button
          onClick={toggleCommandPalette}
          className="flex items-center gap-2.5 transition-colors hover:opacity-90 flex-1"
          style={{ maxWidth: 420, height: 36, background: 'var(--surface-subtle)', borderRadius: 'var(--radius-pill)', padding: '0 8px 0 14px', color: 'var(--text-tertiary)' }}
          aria-label="Buscar (Cmd+K)"
        >
          <span className="shrink-0 w-3.5 h-3.5 flex items-center justify-center"><SearchIcon /></span>
          <span className="flex-1 min-w-0 text-left text-[13px] truncate">Buscar projetos, clientes, tarefas ou um ID…</span>
          <span className="shrink-0 text-[11.5px] px-2 h-5 inline-flex items-center rounded-full" style={{ background: 'var(--surface-card)', color: 'var(--text-tertiary)' }}>⌘K</span>
        </button>

        <div className="flex-1" />

        {/* Criar e importar */}
        <div ref={quickCreateRef} style={{ position: 'relative' }}>
          <button
            onClick={() => { setShowQuickCreate((v) => !v); setShowImport(false) }}
            title="Criar novo"
            aria-label="Criar novo" aria-expanded={showQuickCreate}
            className="flex items-center justify-center transition-colors hover:opacity-90"
            style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--oe-primary)', color: 'white' }}
          >
            <PlusIcon className="w-4 h-4" />
          </button>

          {showQuickCreate && (
            <div style={{ ...popover, minWidth: 230 }}>
              {QUICK_CREATE.map(({ to, label, Icon }) => (
                <button key={to} onClick={() => goCreate(to)} className={item} style={{ color: 'var(--text-primary)' }}>
                  <span className="shrink-0" style={{ color: 'var(--text-tertiary)' }}><Icon className="w-4 h-4" /></span>
                  {label}
                </button>
              ))}
              <div style={{ height: 1, background: 'var(--border-soft)', margin: '6px 4px' }} />
              <button onClick={() => setShowImport((v) => !v)} aria-expanded={showImport} className={item} style={{ color: 'var(--text-primary)' }}>
                <span className="shrink-0" style={{ color: 'var(--text-tertiary)' }}><UploadIcon /></span>
                <span className="flex-1">Importar do Excel</span>
                <span style={{ color: 'var(--text-tertiary)', display: 'inline-block', transform: showImport ? 'rotate(90deg)' : undefined, transition: 'transform .12s' }}>›</span>
              </button>
              {showImport && (
                <div className="pl-3">
                  {IMPORT_OPTIONS.map(({ entity, label }) => (
                    <button key={entity} onClick={() => { setShowQuickCreate(false); goImport(entity) }} className={item} style={{ color: 'var(--text-secondary)' }}>{label}</button>
                  ))}
                  <button onClick={() => { setShowQuickCreate(false); goImport('tudo') }} className={item} style={{ color: 'var(--text-secondary)' }}>Tudo em um arquivo</button>
                  <p className="px-2.5 pb-1.5 text-[11.5px]" style={{ color: 'var(--text-tertiary)' }}>Baixe o modelo em Excel e envie a planilha preenchida.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <NotificationBell />

        {/* Perfil */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button onClick={() => setShowMenu((v) => !v)} className="flex items-center justify-center transition-opacity hover:opacity-90" aria-label="Menu do perfil" aria-expanded={showMenu} style={{ width: 32, height: 32, borderRadius: '50%' }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-subtle)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials}</span>
            )}
          </button>

          {showMenu && (
            <div style={{ ...popover, minWidth: 250 }}>
              <div className="px-2.5 pt-2 pb-2.5">
                <p className="truncate text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{displayName}</p>
                <p className="truncate text-[11.5px]" style={{ color: 'var(--text-tertiary)' }}>{user?.email}</p>
              </div>
              <div className="px-2.5 pb-2">
                <p className="text-[11.5px] mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Aparência</p>
                <div className="flex gap-0.5 p-0.5 rounded-full" style={{ background: 'var(--surface-subtle)' }} role="radiogroup" aria-label="Aparência">
                  {(['auto', 'light', 'dark'] as ThemePref[]).map((v) => (
                    <button
                      key={v} role="radio" aria-checked={themePref === v} onClick={() => setThemePref(v)}
                      title={v === 'auto' ? 'Automático' : v === 'light' ? 'Claro' : 'Escuro'}
                      className="flex-1 h-7 flex items-center justify-center rounded-full transition-colors"
                      style={{ background: themePref === v ? 'var(--surface-card)' : 'transparent', color: themePref === v ? 'var(--text-primary)' : 'var(--text-tertiary)', boxShadow: themePref === v ? 'var(--shadow-sm)' : undefined }}
                    >
                      {themeIcons[v]}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ height: 1, background: 'var(--border-soft)', margin: '2px 4px 4px' }} />
              <button onClick={() => { setShowMenu(false); setShowEditProfile(true) }} className={item} style={{ color: 'var(--text-primary)' }}>Editar perfil</button>
              <button onClick={() => { setShowMenu(false); signOut() }} className={item} style={{ color: 'var(--color-danger-text)' }}>Sair</button>
            </div>
          )}
        </div>
      </div>

      <EditProfileModal open={showEditProfile} onClose={() => setShowEditProfile(false)} />
    </>
  )
}

function UploadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12l-4 4m4-4l4 4" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m0 0a7.5 7.5 0 10-10.6-10.6 7.5 7.5 0 0010.6 10.6z" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  )
}
