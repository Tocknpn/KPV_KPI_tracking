import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser, Branch } from '../types'

interface AuthState {
  token: string | null
  user: AuthUser | null
  branches: Branch[]
  setSession: (token: string, user: AuthUser) => void
  clearSession: () => void
  setBranches: (branches: Branch[]) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      branches: [],
      setSession: (token, user) => set({ token, user }),
      clearSession: () => set({ token: null, user: null }),
      setBranches: (branches) => set({ branches }),
    }),
    {
      name: 'salestrack-auth',
      partialize: (s) => ({ token: s.token, user: s.user }),
    }
  )
)
