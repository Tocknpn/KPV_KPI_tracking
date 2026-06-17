import { IpcMain } from 'electron'
import { getDb } from '../db/connection'
import { prepare } from '../db/query'
import { requireAuth } from './auth'
import { pushRosterIfConfigured } from './sheets'
import { snapshotSalesman, getRosterSnapshotAsOf } from '../db/history'

function requireRosterManager(token: string) {
  const u = requireAuth(token)
  if (!['admin', 'hr'].includes(u.role)) throw new Error('Forbidden')
  return u
}

function nowYearMonth(): { year: number; month: number } {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

function effectiveDateFor(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export function registerRosterHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('roster:getAll', async (_e, token: string) => {
    requireRosterManager(token)
    const { year, month } = nowYearMonth()
    return getRosterSnapshotAsOf(getDb(), year, month)
  })

  // Roster reconstructed AS OF a given month — empty + published:false only if no month,
  // past or present, has ever had any roster data. Otherwise carries forward from the
  // nearest earlier edited month automatically — no "confirm no changes" step needed.
  ipcMain.handle('roster:getAllAsOf', async (_e, token: string, year: number, month: number) => {
    requireRosterManager(token)
    return getRosterSnapshotAsOf(getDb(), year, month)
  })

  ipcMain.handle('roster:saveRep', async (_e, token: string, data: {
    id?: number
    repCode: string; fullName: string; nickname: string
    branchId: number; supervisorId: number | null
    staffType: string; active?: number
  }, year?: number, month?: number) => {
    requireRosterManager(token)
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
    const { year: y, month: m } = year && month ? { year, month } : nowYearMonth()
    snapshotSalesman(db, salesmanId, effectiveDateFor(y, m))
    pushRosterIfConfigured(db).catch(() => {})
    return { success: true, id: salesmanId }
  })

  ipcMain.handle('roster:deactivate', async (_e, token: string, id: number, year?: number, month?: number) => {
    requireRosterManager(token)
    const db = getDb()
    prepare(db, `UPDATE salesmen SET active=0 WHERE id=?`).run(id)
    const { year: y, month: m } = year && month ? { year, month } : nowYearMonth()
    snapshotSalesman(db, id, effectiveDateFor(y, m))
    pushRosterIfConfigured(db).catch(() => {})
    return { success: true }
  })

  ipcMain.handle('roster:reactivate', async (_e, token: string, id: number, year?: number, month?: number) => {
    requireRosterManager(token)
    const db = getDb()
    prepare(db, `UPDATE salesmen SET active=1 WHERE id=?`).run(id)
    const { year: y, month: m } = year && month ? { year, month } : nowYearMonth()
    snapshotSalesman(db, id, effectiveDateFor(y, m))
    pushRosterIfConfigured(db).catch(() => {})
    return { success: true }
  })
}
