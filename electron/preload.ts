import { contextBridge, ipcRenderer } from 'electron'

// Expose safe, typed IPC API to the renderer via window.api
contextBridge.exposeInMainWorld('api', {
  // ── Auth ──────────────────────────────────────────────────────────────
  login: (username: string, password: string) =>
    ipcRenderer.invoke('auth:login', username, password),
  isSheetsConfigured: () =>
    ipcRenderer.invoke('sheets:isConfigured'),
  bootstrapConnect: (sheetsId: string, serviceAccountPath: string) =>
    ipcRenderer.invoke('sheets:bootstrapConnect', sheetsId, serviceAccountPath),
  browseFileBootstrap: () =>
    ipcRenderer.invoke('sheets:browseFileBootstrap'),
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
  permanentlyDeleteUser: (token: string, id: number) =>
    ipcRenderer.invoke('auth:permanentlyDeleteUser', token, id),

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
  getBranchMetricRates: (token: string, branchId: number, year: number, month: number) =>
    ipcRenderer.invoke('kpi:getBranchMetricRates', token, branchId, year, month),
  saveBranchMetricRates: (token: string, branchId: number, year: number, month: number, rates: { jewelry: { b2c: number; b2b: number }; bar: { b2c: number; b2b: number } }) =>
    ipcRenderer.invoke('kpi:saveBranchMetricRates', token, branchId, year, month, rates),
  getBranchQtyTiers: (token: string, branchId: number, year: number, month: number, staffType: 'b2c' | 'b2b') =>
    ipcRenderer.invoke('kpi:getBranchQtyTiers', token, branchId, year, month, staffType),
  saveBranchQtyTiers: (token: string, branchId: number, year: number, month: number, tiers: Array<{ thresholdPct: number; score: number }>, staffType: 'b2c' | 'b2b') =>
    ipcRenderer.invoke('kpi:saveBranchQtyTiers', token, branchId, year, month, tiers, staffType),
  saveBranchKpiTarget: (token: string, branchId: number, target: number) =>
    ipcRenderer.invoke('kpi:saveBranchKpiTarget', token, branchId, target),
  saveBranchTargetDefaults: (token: string, branchId: number, targetB2c: number, targetB2b: number) =>
    ipcRenderer.invoke('kpi:saveBranchTargetDefaults', token, branchId, targetB2c, targetB2b),
  getMonthlyBranchTargets: (token: string, year: number, month: number) =>
    ipcRenderer.invoke('kpi:getMonthlyBranchTargets', token, year, month),
  saveMonthlyBranchTargets: (token: string, year: number, month: number, targets: Array<{ branchId: number; target: number; targetB2c?: number | null; targetB2b?: number | null }>) =>
    ipcRenderer.invoke('kpi:saveMonthlyBranchTargets', token, year, month, targets),
  getKpiFormula: (token: string) =>
    ipcRenderer.invoke('kpi:getFormula', token),
  saveKpiFormula: (token: string, base: number, weight: number) =>
    ipcRenderer.invoke('kpi:saveFormula', token, base, weight),
  simulateKpiScore: (token: string, metricId: number, branchId: number | null, actual: number, target: number, staffType?: string) =>
    ipcRenderer.invoke('kpi:simulate', token, metricId, branchId, actual, target, staffType),
  getSupKpiPct: (token: string) =>
    ipcRenderer.invoke('kpi:getSupKpiPct', token),
  saveSupKpiPct: (token: string, pct: number) =>
    ipcRenderer.invoke('kpi:saveSupKpiPct', token, pct),
  isMonthSubmitted: (token: string, year: number, month: number) =>
    ipcRenderer.invoke('kpi:isMonthSubmitted', token, year, month),
  markMonthSubmitted: (token: string, year: number, month: number) =>
    ipcRenderer.invoke('kpi:markMonthSubmitted', token, year, month),
  getDefaultMetricRates: (token: string, branchId: number) =>
    ipcRenderer.invoke('kpi:getDefaultMetricRates', token, branchId),
  saveDefaultMetricRates: (token: string, branchId: number, rates: { jewelry: { b2c: number; b2b: number }; bar: { b2c: number; b2b: number } }) =>
    ipcRenderer.invoke('kpi:saveDefaultMetricRates', token, branchId, rates),
  getDefaultQtyTiers: (token: string, branchId: number, staffType: 'b2c' | 'b2b') =>
    ipcRenderer.invoke('kpi:getDefaultQtyTiers', token, branchId, staffType),
  saveDefaultQtyTiers: (token: string, branchId: number, tiers: Array<{ thresholdPct: number; score: number }>, staffType: 'b2c' | 'b2b') =>
    ipcRenderer.invoke('kpi:saveDefaultQtyTiers', token, branchId, tiers, staffType),

  // ── Supervisors ────────────────────────────────────────────────────────
  getSupervisors: (token: string, branchId?: number) =>
    ipcRenderer.invoke('supervisor:getAll', token, branchId),
  saveSupervisor: (token: string, data: unknown) =>
    ipcRenderer.invoke('supervisor:save', token, data),
  deleteSupervisor: (token: string, id: number) =>
    ipcRenderer.invoke('supervisor:delete', token, id),
  assignSalesmen: (token: string, supervisorId: number, salesmanIds: number[]) =>
    ipcRenderer.invoke('supervisor:assignSalesmen', token, supervisorId, salesmanIds),
  getSalesmenForBranch: (token: string, branchId: number) =>
    ipcRenderer.invoke('supervisor:getSalesmenForBranch', token, branchId),

  // ── Reports ───────────────────────────────────────────────────────────
  getMonthlyReport: (token: string, branchIds: number[], year: number, month: number, dateFrom: string, dateTo: string, supervisorId?: number) =>
    ipcRenderer.invoke('report:monthly', token, branchIds, year, month, dateFrom, dateTo, supervisorId),
  getDailyTracking: (token: string, branchIds: number[], year: number, month: number) =>
    ipcRenderer.invoke('report:dailyTracking', token, branchIds, year, month),
  getDashboardStats: (token: string, branchIds: number[], year: number, month: number, dateFrom: string, dateTo: string) =>
    ipcRenderer.invoke('report:dashboard', token, branchIds, year, month, dateFrom, dateTo),
  getExecutiveReport: (token: string, year: number, month: number, dateFrom: string, dateTo: string) =>
    ipcRenderer.invoke('report:executive', token, year, month, dateFrom, dateTo),
  getBranchAnalytics: (token: string, year: number, month: number, dateFrom: string, dateTo: string) =>
    ipcRenderer.invoke('report:branchAnalytics', token, year, month, dateFrom, dateTo),
  getRepHistory: (token: string, salesmanId: number, numMonths?: number) =>
    ipcRenderer.invoke('report:repHistory', token, salesmanId, numMonths),
  getRepDailyEntries: (token: string, salesmanId: number, year: number, month: number) =>
    ipcRenderer.invoke('report:repDailyEntries', token, salesmanId, year, month),
  getSupHistory: (token: string, supId: number, numMonths?: number) =>
    ipcRenderer.invoke('report:supHistory', token, supId, numMonths),
  getTeamPerformance: (token: string, branchIds: number[], year: number, month: number, dateFrom: string, dateTo: string) =>
    ipcRenderer.invoke('report:teamPerformance', token, branchIds, year, month, dateFrom, dateTo),

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
  testSheetsConnection: (token: string) =>
    ipcRenderer.invoke('sheets:testConnection', token),
  browseSheetsFile: (token: string) =>
    ipcRenderer.invoke('sheets:browseFile', token),

  // ── Upload ────────────────────────────────────────────────────────────
  uploadDaily: (token: string, rows: unknown[], meta: unknown) =>
    ipcRenderer.invoke('upload:daily', token, rows, meta),
  uploadTargets: (token: string, rows: unknown[], meta: unknown) =>
    ipcRenderer.invoke('upload:targets', token, rows, meta),
  getUploadLogs: (token: string, branchId?: number, uploadType?: string, limit?: number) =>
    ipcRenderer.invoke('upload:getLogs', token, branchId, uploadType, limit),
  getUploadCoverage: (token: string, year: number, month: number) =>
    ipcRenderer.invoke('upload:getCoverage', token, year, month),
  getDailyUploadBatches: (token: string, branchId?: number) =>
    ipcRenderer.invoke('upload:getDailyBatches', token, branchId),
  deleteDailyUploadBatch: (token: string, uploadLogId: number) =>
    ipcRenderer.invoke('upload:deleteDailyBatch', token, uploadLogId),
  getSalesmenForTemplate: (token: string, branchId: number | null) =>
    ipcRenderer.invoke('upload:getSalesmenForTemplate', token, branchId),
  uploadRoster: (token: string, rows: unknown[]) =>
    ipcRenderer.invoke('upload:roster', token, rows),
  getRosterTemplate: (token: string) =>
    ipcRenderer.invoke('upload:getRosterTemplate', token),

  // ── Commission ────────────────────────────────────────────────────────
  getCommissionConfigs: (token: string, yearMonth?: string) =>
    ipcRenderer.invoke('commission:getConfigs', token, yearMonth),
  saveCommissionConfig: (token: string, data: unknown) =>
    ipcRenderer.invoke('commission:saveConfig', token, data),
  pullCommissionConfigs: (token: string) =>
    ipcRenderer.invoke('commission:pullConfigs', token),
  getCommissionDefaults: (token: string) =>
    ipcRenderer.invoke('commission:getDefaults', token),
  saveCommissionDefaults: (token: string, data: { b2c: { jewelry: number; bar: number; qty: number }; b2b: { jewelry: number; bar: number; qty: number }; supB2cPct: number; supB2bPct: number }) =>
    ipcRenderer.invoke('commission:saveDefaults', token, data),
  getCommissionReport: (token: string, branchIds: number[], year: number, month: number, dateFrom?: string, dateTo?: string) =>
    ipcRenderer.invoke('commission:getReport', token, branchIds, year, month, dateFrom, dateTo),

  // ── Roster CRUD ───────────────────────────────────────────────────────
  getRosterAll: (token: string) =>
    ipcRenderer.invoke('roster:getAll', token),
  getRosterAllAsOf: (token: string, year: number, month: number) =>
    ipcRenderer.invoke('roster:getAllAsOf', token, year, month),
  getRosterSupervisorsAsOf: (token: string, year: number, month: number) =>
    ipcRenderer.invoke('roster:getSupervisorsAsOf', token, year, month),
  saveRosterRep: (token: string, data: unknown, year?: number, month?: number) =>
    ipcRenderer.invoke('roster:saveRep', token, data, year, month),
  deactivateRosterRep: (token: string, id: number, year?: number, month?: number) =>
    ipcRenderer.invoke('roster:deactivate', token, id, year, month),
  reactivateRosterRep: (token: string, id: number, year?: number, month?: number) =>
    ipcRenderer.invoke('roster:reactivate', token, id, year, month),

  // Force full sync to Sheets (all entries + all config tabs)
  forceSyncAll: (token: string) =>
    ipcRenderer.invoke('sheets:forceSyncAll', token),

  // ── Sales Report ──────────────────────────────────────────────────────
  getSalesReport: (token: string, branchIds: number[], year: number, month: number, dateFrom: string, dateTo: string, staffType?: string) =>
    ipcRenderer.invoke('sales:getReport', token, branchIds, year, month, dateFrom, dateTo, staffType),
  getSalesTrendDetail: (token: string, branchIds: number[], dateFrom: string, dateTo: string, staffType?: string) =>
    ipcRenderer.invoke('sales:getTrendDetail', token, branchIds, dateFrom, dateTo, staffType),

  // ── Permissions ───────────────────────────────────────────────────────
  getMyPermissions: (token: string) =>
    ipcRenderer.invoke('auth:getPermissions', token),
  getUserPermissions: (token: string, userId: number) =>
    ipcRenderer.invoke('auth:getUserPermissions', token, userId),
  saveUserPermissions: (token: string, userId: number, allStates: Array<{ menu_key: string; enabled: boolean }>) =>
    ipcRenderer.invoke('auth:saveUserPermissions', token, userId, allStates),

  // ── Audit Log ─────────────────────────────────────────────────────────
  getAuditLogs: (token: string, filters: { dateFrom?: string; dateTo?: string; username?: string; eventType?: string; limit?: number; offset?: number }) =>
    ipcRenderer.invoke('audit:getLogs', token, filters),
  getRepUploadStatus: (token: string, branchIds?: number[], days?: number) =>
    ipcRenderer.invoke('upload:getRepUploadStatus', token, branchIds, days),

  // ── Startup lifecycle ─────────────────────────────────────────────────
  checkAppReady: () => ipcRenderer.invoke('app:isReady') as Promise<boolean>,
  onAppReady: (cb: () => void) => ipcRenderer.once('app:ready', cb),
  onAppInitError: (cb: (message: string) => void) => ipcRenderer.once('app:init-error', (_e, message: string) => cb(message)),
  onStartupSyncResult: (cb: (r: { configured: boolean; success: boolean; error?: string }) => void) =>
    ipcRenderer.once('sheets:startupSyncResult', (_e, r) => cb(r)),

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
