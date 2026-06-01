import { IpcMain } from 'electron'
import { getDb } from '../db/connection'
import { prepare, transaction } from '../db/query'
import { requireAuth } from './auth'

export function registerTargetHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('target:getTargets', async (_e, token: string, branchId: number, year: number, month: number) => {
    requireAuth(token)
    return prepare(getDb(), `
      SELECT
        s.id AS salesman_id, s.full_name, s.nickname, s.position,
        COALESCE(t.id, 0)                    AS target_id,
        COALESCE(t.jewelry_weight_g, 0)      AS jewelry_weight_g,
        COALESCE(t.bar_weight_g, 0)          AS bar_weight_g,
        COALESCE(t.quantity, 0)              AS quantity
      FROM salesmen s
      LEFT JOIN targets t ON t.salesman_id = s.id AND t.year = ? AND t.month = ?
      WHERE s.branch_id = ? AND s.active = 1
      ORDER BY s.full_name
    `).all(year, month, branchId)
  })

  ipcMain.handle('target:saveTargets', async (_e, token: string, targets: Array<{
    salesmanId: number; branchId: number; year: number; month: number;
    jewelryWeightG: number; barWeightG: number; quantity: number
  }>) => {
    requireAuth(token)
    const db = getDb()
    transaction(db, () => {
      for (const t of targets) {
        prepare(db, `DELETE FROM targets WHERE salesman_id = ? AND year = ? AND month = ?`).run(t.salesmanId, t.year, t.month)
        prepare(db, `INSERT INTO targets (salesman_id, branch_id, year, month, jewelry_weight_g, bar_weight_g, quantity) VALUES (?,?,?,?,?,?,?)`)
          .run(t.salesmanId, t.branchId, t.year, t.month, t.jewelryWeightG, t.barWeightG, t.quantity)
      }
    })
    return { success: true, count: targets.length }
  })
}
