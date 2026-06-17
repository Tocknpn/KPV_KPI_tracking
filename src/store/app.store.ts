import { create } from 'zustand'

interface AppState {
  selectedBranchId: number | null
  selectedBranchIds: number[]
  selectedYear: number
  selectedMonth: number
  unsyncedCount: number
  isSyncing: boolean
  sidebarCollapsed: boolean
  // Shared across every screen that can trigger a sync (TopBar, Roster, Settings) so the
  // "Updated Xm ago" indicator never goes stale just because the sync happened somewhere else.
  lastSyncedAt: string | null
  setSelectedBranch: (id: number | null) => void
  setSelectedBranchIds: (ids: number[]) => void
  setSelectedPeriod: (year: number, month: number) => void
  setUnsyncedCount: (n: number) => void
  setIsSyncing: (v: boolean) => void
  setSidebarCollapsed: (v: boolean) => void
  setLastSyncedAt: (v: string | null) => void
}

const now = new Date()

export const useAppStore = create<AppState>((set) => ({
  selectedBranchId: null,
  selectedBranchIds: [],
  selectedYear: now.getFullYear(),
  selectedMonth: now.getMonth() + 1,
  unsyncedCount: 0,
  isSyncing: false,
  sidebarCollapsed: false,
  lastSyncedAt: null,
  setSelectedBranch: (id) => set({ selectedBranchId: id }),
  setSelectedBranchIds: (ids) => set({ selectedBranchIds: ids }),
  setSelectedPeriod: (year, month) => set({ selectedYear: year, selectedMonth: month }),
  setUnsyncedCount: (n) => set({ unsyncedCount: n }),
  setIsSyncing: (v) => set({ isSyncing: v }),
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  setLastSyncedAt: (v) => set({ lastSyncedAt: v }),
}))
