import { IpcMain } from 'electron'
import { getDb } from '../db/connection'
import { prepare } from '../db/query'
import { requireAdmin } from './auth'
import { pushRosterIfConfigured } from './sheets'

export function registerRosterHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('roster:getAll', async (_e, token: string, yearMonth?: string) => {
    requireAdmin(token)
    const db = getDb()
    if (yearMonth) {
      return prepare(db, `
        SELECT s.id, s.rep_code, s.full_name, s.nickname,
               s.branch_id, b.name AS branch_name, b.code AS branch_code,
               s.supervisor_id, sup.full_name AS supervisor_name,
               s.staff_type, s.active,
               smt.year_month, smt.point_target
        FROM salesmen s
        JOIN branches b ON b.id = s.branch_id
        LEFT JOIN supervisors sup ON sup.id = s.supervisor_id
        LEFT JOIN staff_monthly_targets smt ON smt.salesman_id = s.id AND smt.year_month = ?
        ORDER BY s.active DESC, b.code, s.full_name
      `).all(yearMonth)
    }
    return prepare(db, `
      SELECT s.id, s.rep_code, s.full_name, s.nickname,
             s.branch_id, b.name AS branch_name, b.code AS branch_code,
             s.supervisor_id, sup.full_name AS supervisor_name,
             s.staff_type, s.active,
             smt.year_month, smt.point_target
      FROM salesmen s
      JOIN branches b ON b.id = s.branch_id
      LEFT JOIN supervisors sup ON sup.id = s.supervisor_id
      LEFT JOIN staff_monthly_targets smt ON smt.salesman_id = s.id
        AND smt.year_month = (
          SELECT MAX(year_month) FROM staff_monthly_targets WHERE salesman_id = s.id
        )
      ORDER BY s.active DESC, b.code, s.full_name
    `).all()
  })

  ipcMain.handle('roster:getAvailableMonths', async (_e, token: string) => {
    requireAdmin(token)
    return prepare(getDb(), `
      SELECT DISTINCT year_month FROM staff_monthly_targets ORDER BY year_month DESC
    `).all()
  })

  ipcMain.handle('roster:saveRep', async (_e, token: string, data: {
    id?: number
    repCode: string; fullName: string; nickname: string
    branchId: number; supervisorId: number | null
    staffType: string; active?: number
    yearMonth?: string; pointTarget?: number
  }) => {
    requireAdmin(token)
    const db = getDb()
    let salesmanId: number

    if (data.id) {
      prepare(db, `
        UPDATE salesmen
        SET rep_code=?, full_name=?, nickname=?, branch_id=?, supervisor_id=?, staff_type=?, active=?
        WHERE id=?
      `).run(data.repCode, data.fullName, data.nickname ?? '', data.branchId, data.supervisorId, data.staffType, data.active ?? 1, data.id)
      salesmanId = data.id
    } else {
      const ins = prepare(db, `
        INSERT INTO salesmen (rep_code, full_name, nickname, branch_id, supervisor_id, staff_type, position, department, active)
        VALUES (?,?,?,?,?,?,'Sales Representative','Sales',1)
      `).run(data.repCode, data.fullName, data.nickname ?? '', data.branchId, data.supervisorId, data.staffType)
      salesmanId = Number(ins.lastInsertRowid)
    }

    if (data.yearMonth && data.pointTarget !== undefined && data.pointTarget !== null) {
      prepare(db, `
        INSERT INTO staff_monthly_targets (salesman_id, year_month, point_target)
        VALUES (?,?,?)
        ON CONFLICT(salesman_id, year_month) DO UPDATE SET point_target = excluded.point_target
      `).run(salesmanId, data.yearMonth, data.pointTarget)
    }

    pushRosterIfConfigured(db).catch(() => {})
    return { success: true, id: salesmanId }
  })

  ipcMain.handle('roster:deactivate', async (_e, token: string, id: number) => {
    requireAdmin(token)
    const db = getDb()
    prepare(db, `UPDATE salesmen SET active=0 WHERE id=?`).run(id)
    pushRosterIfConfigured(db).catch(() => {})
    return { success: true }
  })

  ipcMain.handle('roster:reactivate', async (_e, token: string, id: number) => {
    requireAdmin(token)
    const db = getDb()
    prepare(db, `UPDATE salesmen SET active=1 WHERE id=?`).run(id)
    pushRosterIfConfigured(db).catch(() => {})
    return { success: true }
  })
}
