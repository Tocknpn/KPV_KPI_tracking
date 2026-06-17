import { IpcMain } from 'electron'
import { getDb } from '../db/connection'
import { prepare } from '../db/query'
import { requireAdmin } from './auth'
import { pushRosterIfConfigured } from './sheets'
import { snapshotSalesman } from '../db/history'

export function registerRosterHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('roster:getAll', async (_e, token: string) => {
    requireAdmin(token)
    const db = getDb()
    return prepare(db, `
      SELECT s.id, s.rep_code, s.full_name, s.nickname,
             s.branch_id, b.name AS branch_name, b.code AS branch_code,
             s.supervisor_id, sup.full_name AS supervisor_name,
             s.staff_type, s.active
      FROM salesmen s
      JOIN branches b ON b.id = s.branch_id
      LEFT JOIN supervisors sup ON sup.id = s.supervisor_id
      ORDER BY s.active DESC, b.code, s.full_name
    `).all()
  })

  ipcMain.handle('roster:saveRep', async (_e, token: string, data: {
    id?: number
    repCode: string; fullName: string; nickname: string
    branchId: number; supervisorId: number | null
    staffType: string; active?: number
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

    // KPI point target is always resolved from HR KPI Setting — roster no longer stores per-rep targets
    snapshotSalesman(db, salesmanId)
    pushRosterIfConfigured(db).catch(() => {})
    return { success: true, id: salesmanId }
  })

  ipcMain.handle('roster:deactivate', async (_e, token: string, id: number) => {
    requireAdmin(token)
    const db = getDb()
    prepare(db, `UPDATE salesmen SET active=0 WHERE id=?`).run(id)
    snapshotSalesman(db, id)
    pushRosterIfConfigured(db).catch(() => {})
    return { success: true }
  })

  ipcMain.handle('roster:reactivate', async (_e, token: string, id: number) => {
    requireAdmin(token)
    const db = getDb()
    prepare(db, `UPDATE salesmen SET active=1 WHERE id=?`).run(id)
    snapshotSalesman(db, id)
    pushRosterIfConfigured(db).catch(() => {})
    return { success: true }
  })
}
