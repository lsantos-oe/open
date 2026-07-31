import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { Toaster } from '@/components/ui/Toaster'
import { CommandPalette } from './CommandPalette'
import { ChatLauncher } from '@/components/ai/ChatLauncher'

export function Layout() {
  return (
    <div className="flex min-h-screen bg-[var(--surface-page)]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <Toaster />
      <CommandPalette />
      <ChatLauncher />
    </div>
  )
}
