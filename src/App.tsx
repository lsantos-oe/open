import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { useAuthStore } from '@/stores/useAuthStore'
import { useAppStore } from '@/store/useAppStore'
import { supabase } from '@/lib/supabase'
import ProjectsPage from '@/pages/ProjectsPage'
import ProjectDetailPage from '@/pages/ProjectDetailPage'
import SettingsPage from '@/pages/SettingsPage'
import TemplateEditorPage from '@/pages/TemplateEditorPage'
import TasksPage from '@/pages/TasksPage'
import ClientsPage from '@/pages/ClientsPage'
import ClientDetailPage from '@/pages/ClientDetailPage'
import LoginPage from '@/pages/LoginPage'
import AuthCallback from '@/pages/AuthCallback'

export default function App() {
  useEffect(() => {
    // 1. Explicit session check on mount — reliable, doesn't wait for onAuthStateChange
    useAuthStore.getState().initialize().then(() => {
      const user = useAuthStore.getState().user
      if (user) {
        useAppStore.getState().loadProjects()
        useAppStore.getState().loadSettings()
        useAppStore.getState().loadTeamDirectory()
        useAppStore.getState().loadClients()
      }
    })

    // 2. Watch for subsequent auth events (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Skip INITIAL_SESSION — already handled by initialize() above
      if (event === 'INITIAL_SESSION') return

      if (session?.user) {
        useAuthStore.getState().loadProfile().then(() => {
          useAppStore.getState().loadProjects()
          useAppStore.getState().loadSettings()
          useAppStore.getState().loadTeamDirectory()
        })
      } else {
        useAuthStore.setState({ user: null, profile: null, loading: false })
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/wallet" element={<ClientsPage />} />
          <Route path="/wallet/:id" element={<ClientDetailPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/templates/:templateId" element={<TemplateEditorPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
