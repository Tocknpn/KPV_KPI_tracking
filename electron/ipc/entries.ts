import { IpcMain } from 'electron'
import { getDb } from '../db/connection'
import { prepare, transaction } from '../db/query'
import { requireAuth } from './auth'

export function registerEntryHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('entry:getSalesmen', async (_e, token: string, branchId?: number) => {
    const user = requireAuth(token)
    const db = getDb()
    const effectiveBranchId = user.role === 'supervisor' ? user.branch_id : (branchId ?? null)
    if (effectiveBranchId) {
      return prepare(db, `
        SELECT s.*, b.name AS branch_name FROM salesmen s
        JOIN branches b ON b.id = s.branch_id
        WHERE s.branch_id = ? AND s.active = 1 ORDER BY s.full_name
      `).all(effectiveBranchId)
    }
    return prepare(db, `
      SELECT s.*, b.name AS branch_name FROM salesmen s
      JOIN branches b ON b.id = s.branch_id
      WHERE s.active = 1 ORDER BY b.id, s.full_name
    `).all()
  })

  ipcMain.handle('entry:createSalesman', async (_e, token: string, data: {
    fullName: string; nickname: string; branchId: number; position: string; department: string
  }) => {
    requireAuth(token)
    const result = prepare(getDb(), `INSERT INTO salesmen (full_name, nickname, branch_id, position, department) VALUES (?,?,?,?,?)`)
      .run(data.fullName, data.nickname, data.branchId, data.position, data.department)
    return { success: true, id: result.lastInsertRowid }
  })

  ipcMain.handle('entry:updateSalesman', async (_e, token: string, id: number, data: {
    fullName?: string; nickname?: string; branchId?: number; position?: string; department?: string; active?: number
  }) => {
    requireAuth(token)
    const db = getDb()
    const fields = Object.entries({ full_name: data.fullName, nickname: data.nickname, branch_id: data.branchId, position: data.position, department: data.department, active: data.active }).filter(([, v]) => v !== undefined)
    if (!fields.length) return { success: true }
    fields.forEach(([col, val]) => prepare(db, `UPDATE salesmen SET ${col} = ? WHERE id = ?`).run(val as string | number, id))
    return { success: true }
  })

  ipcMain.handle('entry:getEntries', async (_e, token: string, branchId: number, date: string) => {
    requireAuth(token)
    const year = new Date(date).getFullYear()
    const month = new Date(date).getMonth() + 1
    return prepare(getDb(), `
      SELECT
        de.id, de.salesman_id, de.entry_date,
        COALESCE(de.jewelry_weight_g, 0) AS jewelry_weight_g,
        COALESCE(de.bar_weight_g, 0)     AS bar_weight_g,
        COALESCE(de.quantity, 0)         AS quantity,
        COALESCE(de.synced, 0)           AS synced,
        s.full_name AS salesman_name, s.nickname, s.position,
        COALESCE(t.jewelry_weight_g, 0) AS target_jewelry,
        COALESCE(t.bar_weight_g, 0)     AS target_bar,
        COALESCE(t.quantity, 0)         AS target_qty
      FROM salesmen s
      LEFT JOIN daily_entries de ON de.salesman_id = s.id AND de.entry_date = ?
      LEFT JOIN targets t ON t.salesman_id = s.id AND t.year = ? AND t.month = ?
      WHERE s.branch_id = ? AND s.active = 1
      ORDER BY s.full_name
    `).all(date, year, month, branchId)
  })

  ipcMain.handle('entry:getEntriesByMonth', async (_e, token: string, branchId: number, year: number, month: number) => {
    requireAuth(token)
    return prepare(getDb(), `
      SELECT de.*, s.full_name AS salesman_name
      FROM daily_entries de JOIN salesmen s ON s.id = de.salesman_id
      WHERE de.branch_id = ?
        AND CAST(strftime('%Y', de.entry_date) AS INTEGER) = ?
        AND CAST(strftime('%m', de.entry_date) AS INTEGER) = ?
      ORDER BY de.entry_date, s.full_name
    `).all(branchId, year, month)
  })

  ipcMain.handle('entry:save', async (_e, token: string, entry: {
    salesmanId: number; branchId: number; date: string;
    jewelryWeightG: number; barWeightG: number; quantity: number
  }) => {
    requireAuth(token)
    const db = getDb()
    const now = new Date().toISOString()
    // Use INSERT OR REPLACE (sql.js supports this)
    prepare(db, `DELETE FROM daily_entries WHERE salesman_id = ? AND entry_date = ?`).run(entry.salesmanId, entry.date)
    prepare(db, `INSERT INTO daily_entries (salesman_id, branch_id, entry_date, jewelry_weight_g, bar_weight_g, quantity, synced, updated_at) VALUES (?,?,?,?,?,?,0,?)`)
      .run(entry.salesmanId, entry.branchId, entry.date, entry.jewelryWeightG, entry.barWeightG, entry.quantity, now)
    return { success: true }
  })

  ipcMain.handle('entry:saveBatch', async (_e, token: string, entries: Array<{
    salesmanId: number; branchId: number; date: string;
    jewelryWeightG: number; barWeightG: number; quantity: number
  }>) => {
    requireAuth(token)
    const db = getDb()
    const now = new Date().toISOString()
    transaction(db, () => {
      for (const e of entries) {
        prepare(db, `DELETE FROM daily_entries WHERE salesman_id = ? AND entry_date = ?`).run(e.salesmanId, e.date)
        prepare(db, `INSERT INTO daily_entries (salesman_id, branch_id, entry_date, jewelry_weight_g, bar_weight_g, quantity, synced, updated_at) VALUES (?,?,?,?,?,?,0,?)`)
          .run(e.salesmanId, e.branchId, e.date, e.jewelryWeightG, e.barWeightG, e.quantity, now)
      }
    })
    return { success: true, count: entries.length }
  })

  ipcMain.handle('entry:getUnsyncedCount', async (_e, token: string) => {
    requireAuth(token)
    const row = prepare(getDb(), `SELECT COUNT(*) as count FROM daily_entries WHERE synced = 0`).get() as { count: number }
    return row?.count ?? 0
  })
}
