import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import i18n from '@/i18n'
import { Layout } from '@/components/layout/Layout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { useAuthStore } from '@/stores/useAuthStore'
import { useAppStore } from '@/store/useAppStore'
import { useAiStore } from '@/stores/useAiStore'
import { supabase } from '@/lib/supabase'
import DashboardPage from '@/pages/DashboardPage'
import ProjectsPage from '@/pages/ProjectsPage'
import ProjectDetailPage from '@/pages/ProjectDetailPage'
import SettingsPage from '@/pages/SettingsPage'
import TemplateEditorPage from '@/pages/TemplateEditorPage'
import TasksPage from '@/pages/TasksPage'
import ClientsPage from '@/pages/ClientsPage'
import ClientDetailPage from '@/pages/ClientDetailPage'
import ContactsPage from '@/pages/ContactsPage'
import IncidentsPage from '@/pages/IncidentsPage'
import IncidentDetailPage from '@/pages/IncidentDetailPage'
import UsersPage from '@/pages/UsersPage'
import GuidePage from '@/pages/GuidePage'
import LoginPage from '@/pages/LoginPage'
import AuthCallback from '@/pages/AuthCallback'
import PublicReportPage from '@/pages/PublicReportPage'

export default function App() {
  const defaultLanguage = useAppStore((s) => s.settings.defaultLanguage)

  useEffect(() => {
    if (defaultLanguage && defaultLanguage !== i18n.language) i18n.changeLanguage(defaultLanguage)
  }, [defaultLanguage])

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined

    // 1. Explicit session check on mount — reliable, doesn't wait for onAuthStateChange.
    useAuthStore.getState().initialize().then(() => {
      const user = useAuthStore.getState().user
      if (user) {
        useAppStore.getState().loadProjects()
        useAppStore.getState().loadSettings()
        useAppStore.getState().loadTeamDirectory()
        useAppStore.getState().loadInvitedUsers()
        useAppStore.getState().loadNotifications()
        useAppStore.getState().loadClients()
        useAppStore.getState().loadIncidents()
        useAppStore.getState().loadContacts()
        useAppStore.getState().loadStandaloneTasks()
        useAiStore.getState().loadHasKey()
      }

      if (cancelled) return

      // 2. Watch for subsequent auth events (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED).
      // Registered only after the initial getSession() above has fully resolved —
      // subscribing earlier lets a SIGNED_IN event fired mid-exchange (e.g. the
      // OAuth callback landing here) race that same call for gotrue-js's session lock.
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
          useAuthStore.getState().loadProfile().then(() => {
            useAppStore.getState().loadProjects()
            useAppStore.getState().loadSettings()
            useAppStore.getState().loadTeamDirectory()
            useAppStore.getState().loadInvitedUsers()
            useAppStore.getState().loadNotifications()
          })
        } else {
          useAuthStore.setState({ user: null, profile: null, loading: false })
        }
      })
      unsubscribe = () => subscription.unsubscribe()
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/report/:projectId/:fileId" element={<PublicReportPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/portfolio" element={<ProjectsPage />} />
          <Route path="/wallet" element={<ClientsPage />} />
          <Route path="/wallet/:id" element={<ClientDetailPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/support" element={<IncidentsPage />} />
          <Route path="/support/:id" element={<IncidentDetailPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/settings/templates/:templateId" element={<TemplateEditorPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
