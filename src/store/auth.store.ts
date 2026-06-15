import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser, Branch } from '../types'

interface AuthState {
  token: string | null
  user: AuthUser | null
  branches: Branch[]
  permissions: string[]
  setSession: (token: string, user: AuthUser, permissions: string[]) => void
  setPermissions: (permissions: string[]) => void
  clearSession: () => void
  setBranches: (branches: Branch[]) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      branches: [],
      permissions: [],
      setSession: (token, user, permissions) => set({ token, user, permissions }),
      setPermissions: (permissions) => set({ permissions }),
      clearSession: () => set({ token: null, user: null, permissions: [] }),
      setBranches: (branches) => set({ branches }),
    }),
    {
      name: 'salestrack-auth',
      partialize: (s) => ({ token: s.token, user: s.user, permissions: s.permissions }),
    }
  )
)
