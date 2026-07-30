import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { DbProfile } from '@/types/database'

interface AuthState {
  user: User | null
  profile: DbProfile | null
  loading: boolean
  setUser: (user: User | null) => void
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  initialize: () => Promise<void>
  loadProfile: () => Promise<void>
  updateOwnProfile: (patch: { name?: string; avatar_url?: string }) => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,

  setUser: (user) => set({ user, profile: user ? get().profile : null }),

  signInWithGoogle: async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/auth/callback' },
    })
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null })
  },

  // Primary auth check — call this on app mount before onAuthStateChange
  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        set({ user: session.user, loading: false })
        // Load profile in background — don't block the auth gate
        supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
          .then(({ data }) => set({ profile: data as DbProfile | null }))
      } else {
        set({ user: null, profile: null, loading: false })
      }
    } catch {
      set({ user: null, profile: null, loading: false })
    }
  },

  updateOwnProfile: async (patch) => {
    const user = get().user
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', user.id)
      .select('*')
      .single()
    if (data) set({ profile: data as DbProfile })
  },

  // Full profile load (used after sign-in events)
  loadProfile: async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { set({ user: null, profile: null, loading: false }); return }
      set({ user, loading: false })
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      set({ profile: profile as DbProfile | null })
    } catch {
      set({ loading: false })
    }
  },
}))
