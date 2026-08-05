import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/useAuthStore'
import { useCommandPaletteStore } from '@/stores/useCommandPaletteStore'
import { NotificationBell } from './NotificationBell'
import { EditProfileModal } from './EditProfileModal'
import { PlusIcon, TasksIcon, SupportIcon, PortfolioIcon, ContactsIcon, WalletIcon } from '@/components/ui/icons'

const QUICK_CREATE = [
  { to: '/tasks', label: 'Nova tarefa', Icon: TasksIcon },
  { to: '/support', label: 'Novo incidente', Icon: SupportIcon },
  { to: '/portfolio', label: 'Novo projeto', Icon: PortfolioIcon },
  { to: '/contacts', label: 'Novo contato', Icon: ContactsIcon },
  { to: '/wallet', label: 'Novo cliente', Icon: WalletIcon },
]

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'U'
}

export function Topbar() {
  const navigate = useNavigate()
  const { user, profile, signOut } = useAuthStore()
  const toggleCommandPalette = useCommandPaletteStore((s) => s.toggle)
  const [showMenu, setShowMenu] = useState(false)
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [showQuickCreate, setShowQuickCreate] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const quickCreateRef = useRef<HTMLDivElement>(null)

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

  function goCreate(to: string) {
    setShowQuickCreate(false)
    navigate(`${to}?new=1`)
  }

  return (
    <>
      <div
        className="flex items-center shrink-0 px-5 gap-2.5"
        style={{ height: 48, background: 'var(--surface-card)', borderBottom: '0.5px solid var(--border-default)' }}
      >
        <button
          onClick={toggleCommandPalette}
          className="flex items-center gap-2 transition-colors"
          style={{
            width: 260, background: 'var(--surface-subtle)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)', padding: '6px 10px', color: 'var(--text-tertiary)',
          }}
        >
          <span className="shrink-0 w-3.5 h-3.5 flex items-center justify-center"><SearchIcon /></span>
          <span className="flex-1 text-left text-[12.5px]">Buscar...</span>
          <span
            className="shrink-0 text-[10.5px]"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 4, padding: '1px 5px', color: 'var(--text-disabled)' }}
          >
            ⌘K
          </span>
        </button>

        <div className="flex-1" />

        <div ref={quickCreateRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowQuickCreate((v) => !v)}
            title="Criar novo"
            className="flex items-center justify-center transition-colors"
            style={{
              width: 28, height: 28, borderRadius: 'var(--radius-md)',
              background: showQuickCreate ? 'var(--oe-primary)' : 'var(--surface-subtle)',
              color: showQuickCreate ? 'white' : 'var(--text-secondary)',
              border: '1px solid var(--border-default)',
            }}
          >
            <PlusIcon className="w-4 h-4" />
          </button>

          {showQuickCreate && (
            <div style={{
              position: 'absolute', top: 34, right: 0, minWidth: 190,
              background: 'var(--surface-card)', border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', zIndex: 100, overflow: 'hidden', padding: 4,
            }}>
              {QUICK_CREATE.map(({ to, label, Icon }) => (
                <button
                  key={to}
                  onClick={() => goCreate(to)}
                  className="w-full text-left flex items-center gap-2.5 rounded-[var(--radius-md)]"
                  style={{ padding: '7px 8px', fontSize: 12.5, color: 'var(--text-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-subtle)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span className="shrink-0" style={{ color: 'var(--text-tertiary)' }}><Icon className="w-4 h-4" /></span>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <NotificationBell />

        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowMenu((v) => !v)}
            className="flex items-center gap-1.5 rounded-[var(--radius-pill)] transition-colors"
            style={{ padding: '3px 8px 3px 3px', background: 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-subtle)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <span style={{
                background: 'var(--oe-primary)', borderRadius: '50%', color: 'white', fontSize: 10, fontWeight: 600,
                width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{initials}</span>
            )}
            <ChevronDownIcon />
          </button>

          {showMenu && (
            <div style={{
              position: 'absolute', top: 38, right: 0, minWidth: 220,
              background: 'var(--surface-card)', border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', zIndex: 100, overflow: 'hidden',
            }}>
              <div style={{ padding: '10px 12px', borderBottom: '0.5px solid var(--border-default)' }}>
                <p className="truncate" style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{displayName}</p>
                <p className="truncate" style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 1 }}>{user?.email}</p>
              </div>
              <button
                onClick={() => { setShowMenu(false); setShowEditProfile(true) }}
                className="w-full text-left flex items-center gap-2"
                style={{ padding: '8px 12px', fontSize: 12.5, color: 'var(--text-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-subtle)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                Editar perfil
              </button>
              <button
                onClick={() => { setShowMenu(false); signOut() }}
                className="w-full text-left flex items-center gap-2"
                style={{ padding: '8px 12px', fontSize: 12.5, color: 'var(--color-danger-text)', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-subtle)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                Sair
              </button>
            </div>
          )}
        </div>
      </div>

      <EditProfileModal open={showEditProfile} onClose={() => setShowEditProfile(false)} />
    </>
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
