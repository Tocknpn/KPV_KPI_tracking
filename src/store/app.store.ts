import { create } from 'zustand'

interface AppState {
  selectedBranchId: number | null
  selectedYear: number
  selectedMonth: number
  unsyncedCount: number
  isSyncing: boolean
  setSelectedBranch: (id: number | null) => void
  setSelectedPeriod: (year: number, month: number) => void
  setUnsyncedCount: (n: number) => void
  setIsSyncing: (v: boolean) => void
}

const now = new Date()

export const useAppStore = create<AppState>((set) => ({
  selectedBranchId: null,
  selectedYear: now.getFullYear(),
  selectedMonth: now.getMonth() + 1,
  unsyncedCount: 0,
  isSyncing: false,
  setSelectedBranch: (id) => set({ selectedBranchId: id }),
  setSelectedPeriod: (year, month) => set({ selectedYear: year, selectedMonth: month }),
  setUnsyncedCount: (n) => set({ unsyncedCount: n }),
  setIsSyncing: (v) => set({ isSyncing: v }),
}))
