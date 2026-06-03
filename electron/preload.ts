import { contextBridge, ipcRenderer } from 'electron'

// Expose safe, typed IPC API to the renderer via window.api
contextBridge.exposeInMainWorld('api', {
  // ── Auth ──────────────────────────────────────────────────────────────
  login: (username: string, password: string) =>
    ipcRenderer.invoke('auth:login', username, password),
  logout: (token: string) =>
    ipcRenderer.invoke('auth:logout', token),
  getUsers: (token: string) =>
    ipcRenderer.invoke('auth:getUsers', token),
  createUser: (token: string, data: unknown) =>
    ipcRenderer.invoke('auth:createUser', token, data),
  updateUser: (token: string, id: number, data: unknown) =>
    ipcRenderer.invoke('auth:updateUser', token, id, data),
  deleteUser: (token: string, id: number) =>
    ipcRenderer.invoke('auth:deleteUser', token, id),

  // ── Branches & Salesmen ───────────────────────────────────────────────
  getBranches: (token: string) =>
    ipcRenderer.invoke('auth:getBranches', token),
  getSalesmen: (token: string, branchId?: number) =>
    ipcRenderer.invoke('entry:getSalesmen', token, branchId),
  createSalesman: (token: string, data: unknown) =>
    ipcRenderer.invoke('entry:createSalesman', token, data),
  updateSalesman: (token: string, id: number, data: unknown) =>
    ipcRenderer.invoke('entry:updateSalesman', token, id, data),

  // ── Daily Entries ─────────────────────────────────────────────────────
  getEntries: (token: string, branchId: number, date: string) =>
    ipcRenderer.invoke('entry:getEntries', token, branchId, date),
  getEntriesByMonth: (token: string, branchId: number, year: number, month: number) =>
    ipcRenderer.invoke('entry:getEntriesByMonth', token, branchId, year, month),
  saveEntry: (token: string, entry: unknown) =>
    ipcRenderer.invoke('entry:save', token, entry),
  saveBatchEntries: (token: string, entries: unknown[]) =>
    ipcRenderer.invoke('entry:saveBatch', token, entries),
  getUnsyncedCount: (token: string) =>
    ipcRenderer.invoke('entry:getUnsyncedCount', token),

  // ── Targets ───────────────────────────────────────────────────────────
  getTargets: (token: string, branchId: number, year: number, month: number) =>
    ipcRenderer.invoke('target:getTargets', token, branchId, year, month),
  saveTargets: (token: string, targets: unknown[]) =>
    ipcRenderer.invoke('target:saveTargets', token, targets),

  // ── KPI Engine ────────────────────────────────────────────────────────
  getKpiMetrics: (token: string) =>
    ipcRenderer.invoke('kpi:getMetrics', token),
  getKpiConfigs: (token: string, branchId?: number) =>
    ipcRenderer.invoke('kpi:getConfigs', token, branchId),
  getKpiTiers: (token: string, configId: number) =>
    ipcRenderer.invoke('kpi:getTiers', token, configId),
  saveKpiConfig: (token: string, config: unknown, tiers: unknown[]) =>
    ipcRenderer.invoke('kpi:saveConfig', token, config, tiers),
  deleteKpiConfig: (token: string, configId: number) =>
    ipcRenderer.invoke('kpi:deleteConfig', token, configId),
  saveKpiMetricMultiplier: (token: string, metricId: number, pointsPerUnit: number) =>
    ipcRenderer.invoke('kpi:saveMetricMultiplier', token, metricId, pointsPerUnit),
  saveBranchKpiTarget: (token: string, branchId: number, target: number) =>
    ipcRenderer.invoke('kpi:saveBranchKpiTarget', token, branchId, target),
  getMonthlyBranchTargets: (token: string, year: number, month: number) =>
    ipcRenderer.invoke('kpi:getMonthlyBranchTargets', token, year, month),
  saveMonthlyBranchTargets: (token: string, year: number, month: number, targets: Array<{ branchId: number; target: number }>) =>
    ipcRenderer.invoke('kpi:saveMonthlyBranchTargets', token, year, month, targets),
  getKpiFormula: (token: string) =>
    ipcRenderer.invoke('kpi:getFormula', token),
  saveKpiFormula: (token: string, base: number, weight: number) =>
    ipcRenderer.invoke('kpi:saveFormula', token, base, weight),
  simulateKpiScore: (token: string, metricId: number, branchId: number | null, actual: number, target: number) =>
    ipcRenderer.invoke('kpi:simulate', token, metricId, branchId, actual, target),

  // ── Reports ───────────────────────────────────────────────────────────
  getMonthlyReport: (token: string, branchIds: number[], year: number, month: number) =>
    ipcRenderer.invoke('report:monthly', token, branchIds, year, month),
  getDashboardStats: (token: string, branchIds: number[], year: number, month: number) =>
    ipcRenderer.invoke('report:dashboard', token, branchIds, year, month),
  getExecutiveReport: (token: string, year: number, month: number) =>
    ipcRenderer.invoke('report:executive', token, year, month),
  getBranchAnalytics: (token: string, year: number, month: number) =>
    ipcRenderer.invoke('report:branchAnalytics', token, year, month),

  // ── Google Sheets Sync ────────────────────────────────────────────────
  syncToCloud: (token: string) =>
    ipcRenderer.invoke('sheets:syncToCloud', token),
  pullFromCloud: (token: string) =>
    ipcRenderer.invoke('sheets:pullFromCloud', token),
  getSyncLogs: (token: string) =>
    ipcRenderer.invoke('sheets:getSyncLogs', token),
  getSheetsConfig: (token: string) =>
    ipcRenderer.invoke('sheets:getConfig', token),
  saveSheetsConfig: (token: string, config: unknown) =>
    ipcRenderer.invoke('sheets:saveConfig', token, config),

  // ── Upload ────────────────────────────────────────────────────────────
  uploadDaily: (token: string, rows: unknown[], meta: unknown) =>
    ipcRenderer.invoke('upload:daily', token, rows, meta),
  uploadTargets: (token: string, rows: unknown[], meta: unknown) =>
    ipcRenderer.invoke('upload:targets', token, rows, meta),
  getUploadLogs: (token: string, branchId?: number, uploadType?: string, limit?: number) =>
    ipcRenderer.invoke('upload:getLogs', token, branchId, uploadType, limit),
  getUploadCoverage: (token: string, year: number, month: number) =>
    ipcRenderer.invoke('upload:getCoverage', token, year, month),
  getSalesmenForTemplate: (token: string, branchId: number) =>
    ipcRenderer.invoke('upload:getSalesmenForTemplate', token, branchId),

  // ── Admin / Test Data ─────────────────────────────────────────────────
  seedTestData: (token: string) =>
    ipcRenderer.invoke('admin:seedTestData', token),
  getDataStats: (token: string) =>
    ipcRenderer.invoke('admin:dataStats', token),

  // ── Email ─────────────────────────────────────────────────────────────
  getEmailConfig: (token: string) =>
    ipcRenderer.invoke('email:getConfig', token),
  saveEmailConfig: (token: string, config: unknown) =>
    ipcRenderer.invoke('email:saveConfig', token, config),
  sendTestEmail: (token: string) =>
    ipcRenderer.invoke('email:sendTest', token),
})

export type Api = typeof import('./preload')
