// Injected at build time from package.json version
declare const __APP_VERSION__: string

// Type-safe window.api — mirrors the contextBridge in electron/preload.ts
interface Window {
  api: {
    // Auth
    login(username: string, password: string): Promise<{ success: boolean; token: string; user: import('./types').AuthUser; error?: string }>
    logout(token: string): Promise<{ success: boolean }>
    getUsers(token: string): Promise<unknown[]>
    createUser(token: string, data: unknown): Promise<{ success: boolean; id?: number; error?: string }>
    updateUser(token: string, id: number, data: unknown): Promise<{ success: boolean }>
    deleteUser(token: string, id: number): Promise<{ success: boolean }>

    // Org
    getBranches(token: string): Promise<import('./types').Branch[]>
    getSalesmen(token: string, branchId?: number): Promise<import('./types').Salesman[]>
    createSalesman(token: string, data: unknown): Promise<{ success: boolean; id?: number }>
    updateSalesman(token: string, id: number, data: unknown): Promise<{ success: boolean }>

    // Entries
    getEntries(token: string, branchId: number, date: string): Promise<import('./types').DailyEntry[]>
    getEntriesByMonth(token: string, branchId: number, year: number, month: number): Promise<import('./types').DailyEntry[]>
    saveEntry(token: string, entry: unknown): Promise<{ success: boolean }>
    saveBatchEntries(token: string, entries: unknown[]): Promise<{ success: boolean; count: number }>
    getUnsyncedCount(token: string): Promise<number>

    // Targets
    getTargets(token: string, branchId: number, year: number, month: number): Promise<import('./types').Target[]>
    saveTargets(token: string, targets: unknown[]): Promise<{ success: boolean; count: number }>

    // KPI
    getKpiMetrics(token: string): Promise<import('./types').KpiMetric[]>
    getKpiConfigs(token: string, branchId?: number): Promise<import('./types').KpiTierConfig[]>
    getKpiTiers(token: string, configId: number): Promise<import('./types').KpiTier[]>
    saveKpiConfig(token: string, config: unknown, tiers: unknown[]): Promise<{ success: boolean; id: number }>
    deleteKpiConfig(token: string, configId: number): Promise<{ success: boolean }>
    saveKpiMetricMultiplier(token: string, metricId: number, pointsPerUnit: number): Promise<{ success: boolean }>
    simulateKpiScore(token: string, metricId: number, branchId: number | null, actual: number, target: number): Promise<{ score: number; pct: number; tierId: number | null }>

    // Reports
    getDashboardStats(token: string, branchIds: number[], year: number, month: number): Promise<import('./types').DashboardStats>
    getMonthlyReport(token: string, branchIds: number[], year: number, month: number): Promise<{ rows: import('./types').MonthlyReportRow[]; daysInMonth: number; dayOfMonth: number; daysRemaining: number }>
    getExecutiveReport(token: string, year: number, month: number): Promise<import('./types').ExecutiveBranchRow[]>
    getBranchAnalytics(token: string, year: number, month: number): Promise<{ dailyTotals: unknown[]; branchContrib: unknown[] }>

    // Sheets
    syncToCloud(token: string): Promise<{ success: boolean; count?: number; message?: string; error?: string }>
    pullFromCloud(token: string): Promise<{ success: boolean; count?: number; error?: string }>
    getSyncLogs(token: string): Promise<import('./types').SyncLog[]>
    getSheetsConfig(token: string): Promise<{ sheetsId: string; serviceAccountPath: string; lastSyncedAt: string }>
    saveSheetsConfig(token: string, config: { sheetsId: string; serviceAccountPath: string }): Promise<{ success: boolean }>

    // Upload
    uploadDaily(token: string, rows: unknown[], meta: unknown): Promise<{ success: boolean; count?: number; error?: string }>
    uploadTargets(token: string, rows: unknown[], meta: unknown): Promise<{ success: boolean; count?: number; error?: string }>
    getUploadLogs(token: string, branchId?: number, uploadType?: string, limit?: number): Promise<unknown[]>
    getUploadCoverage(token: string, year: number, month: number): Promise<unknown[]>
    getSalesmenForTemplate(token: string, branchId: number): Promise<unknown[]>

    // Admin
    seedTestData(token: string): Promise<{ success: boolean; message?: string; error?: string }>
    getDataStats(token: string): Promise<{ salesmen: unknown[]; entries: unknown[]; targets: unknown[] }>

    // Email
    getEmailConfig(token: string): Promise<import('./types').EmailConfig>
    saveEmailConfig(token: string, config: unknown): Promise<{ success: boolean }>
    sendTestEmail(token: string): Promise<{ success: boolean; error?: string }>
  }
}
