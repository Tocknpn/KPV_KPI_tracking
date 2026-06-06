/**
 * IPC Handler Registry
 *
 * Single entry point for all IPC channels.
 * Import this in main.ts — one function registers everything.
 *
 * Channel map:
 *   auth:*          -> auth.ts        (login, sessions, users, branches)
 *   entry:*         -> entries.ts     (daily entries, salesmen CRUD)
 *   supervisor:*    -> entries.ts     (supervisor CRUD, team assignments)
 *   target:*        -> targets.ts     (monthly targets)
 *   kpi:*           -> kpi.ts         (metrics, tier configs, scoring)
 *   report:*        -> reports.ts     (dashboard, monthly, executive, team)
 *   upload:*        -> upload.ts      (XLSX bulk import: daily/targets/roster)
 *   sheets:*        -> sheets.ts      (Google Sheets push/pull/config)
 *   email:*         -> email.ts       (SMTP config, scheduled reports)
 *   admin:*         -> admin.ts       (test data seed, data stats)
 */

import type { IpcMain } from 'electron'
import { registerAuthHandlers } from './auth'
import { registerEntryHandlers } from './entries'
import { registerTargetHandlers } from './targets'
import { registerKpiHandlers } from './kpi'
import { registerReportHandlers } from './reports'
import { registerUploadHandlers } from './upload'
import { registerSheetsHandlers } from './sheets'
import { registerEmailHandlers } from './email'
import { registerAdminHandlers } from './admin'

export { startEmailScheduler } from './email'
export { computeKpiScore } from './kpi'
export { requireAuth, requireAdmin } from './auth'

export function registerAllHandlers(ipcMain: IpcMain): void {
  registerAuthHandlers(ipcMain)
  registerEntryHandlers(ipcMain)
  registerTargetHandlers(ipcMain)
  registerKpiHandlers(ipcMain)
  registerReportHandlers(ipcMain)
  registerUploadHandlers(ipcMain)
  registerSheetsHandlers(ipcMain)
  registerEmailHandlers(ipcMain)
  registerAdminHandlers(ipcMain)
}
