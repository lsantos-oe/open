import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'
import { useSmartPosition } from '@/hooks/useSmartPosition'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Props {
  collapsed: boolean
}

export function NotificationBell({ collapsed }: Props) {
  const { notifications, markNotificationRead, markAllNotificationsRead } = useAppStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const { triggerRef, popoverRef, position } = useSmartPosition(open)

  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        popoverRef.current && !(popoverRef.current as HTMLElement).contains(e.target as Node) &&
        triggerRef.current && !(triggerRef.current as HTMLElement).contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function activate(id: string, link: string | null) {
    markNotificationRead(id)
    setOpen(false)
    if (link) navigate(link)
  }

  return (
    <>
      <button
        ref={triggerRef as any}
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center gap-2 rounded-[var(--radius-md)] text-[13px] transition-colors mb-0.5 text-[var(--sidebar-text)] hover:bg-white/5 hover:text-white/80 w-full"
        style={{ padding: collapsed ? '8px 0' : '6px 8px', justifyContent: collapsed ? 'center' : 'flex-start' }}
        title={collapsed ? 'Notificações' : undefined}
      >
        <span className="shrink-0 w-4 h-4 flex items-center justify-center relative">
          <BellIcon />
          {unreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 rounded-[var(--radius-pill)] flex items-center justify-center text-white"
              style={{ width: 13, height: 13, fontSize: 8, fontWeight: 700, background: 'var(--oe-primary)' }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </span>
        {!collapsed && <span className="flex-1 text-left">Notificações</span>}
      </button>

      {open && createPortal(
        <div
          ref={popoverRef as any}
          className="w-80 max-h-96 overflow-y-auto"
          style={{
            position: 'fixed', ...position, zIndex: 1000,
            background: 'var(--surface-card)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '0.5px solid var(--border-default)' }}>
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Notificações</span>
            {unreadCount > 0 && (
              <button onClick={() => markAllNotificationsRead()} className="text-xs" style={{ color: 'var(--oe-primary)' }}>
                Marcar todas como lidas
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="text-sm px-3 py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>Nenhuma notificação ainda.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => activate(n.id, n.link)}
                className="w-full text-left px-3 py-2.5 text-sm"
                style={{ borderBottom: '0.5px solid var(--border-default)', background: n.read ? 'transparent' : 'var(--oe-primary-light)' }}
              >
                <p style={{ color: 'var(--text-primary)' }}>{n.message}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                </p>
              </button>
            ))
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

function BellIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  )
}
