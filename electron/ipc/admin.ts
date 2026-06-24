import { IpcMain } from 'electron'
import { getDb } from '../db/connection'
import { seedTestData } from '../db/seed'
import { prepare } from '../db/query'
import { requireAdmin } from './auth'

export function registerAdminHandlers(ipcMain: IpcMain): void {
  /** Wipe all salesmen/entries/targets then seed fresh test data for all 4 branches. */
  ipcMain.handle('admin:seedTestData', async (_e, token: string) => {
    requireAdmin(token)
    const db = getDb()
    try {
      // Clear existing transactional data only (keep users, branches, kpi config).
      // roster_monthly/staff_monthly_targets must go before salesmen — both have an FK
      // to it and PRAGMA foreign_keys=ON means deleting salesmen first throws.
      prepare(db, `DELETE FROM daily_entries`).run()
      prepare(db, `DELETE FROM entry_deletions`).run()
      prepare(db, `DELETE FROM roster_deletions`).run()
      prepare(db, `DELETE FROM targets`).run()
      prepare(db, `DELETE FROM roster_monthly`).run()
      prepare(db, `DELETE FROM staff_monthly_targets`).run()
      prepare(db, `DELETE FROM salesmen`).run()
      seedTestData(db)
      return { success: true, message: '108 reps + 12 supervisors loaded — 3 teams (Alpha/Beta/Gamma) × 9 reps × 4 branches. All entries on day 1 of current month.' }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  /** Return salesman + entry count per branch for quick sanity check. */
  ipcMain.handle('admin:dataStats', async (_e, token: string) => {
    requireAdmin(token)
    const db = getDb()
    return {
      salesmen: prepare(db, `SELECT branch_id, COUNT(*) as count FROM salesmen WHERE active=1 GROUP BY branch_id`).all(),
      entries:  prepare(db, `SELECT branch_id, COUNT(*) as count FROM daily_entries GROUP BY branch_id`).all(),
      targets:  prepare(db, `SELECT branch_id, COUNT(*) as count FROM targets GROUP BY branch_id`).all(),
    }
  })
}
