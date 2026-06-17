import { IpcMain } from 'electron'
import type { Database } from 'sql.js'
import { getDb } from '../db/connection'
import { prepare } from '../db/query'
import { requireAuth } from './auth'
import { pushRosterIfConfigured } from './sheets'
import { snapshotSalesman, isMonthPublished, publishMonth } from '../db/history'

function requireRosterManager(token: string) {
  const u = requireAuth(token)
  if (!['admin', 'hr'].includes(u.role)) throw new Error('Forbidden')
  return u
}

function nowYearMonth(): { year: number; month: number } {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

// A month with no explicit roster activity shows EMPTY — no roster = no one to map
// daily entries/KPI to. published=false means "nothing uploaded/confirmed for this month yet".
function getRosterSnapshot(db: Database, year: number, month: number) {
  if (!isMonthPublished(db, year, month)) return { published: false, rows: [] }

  const daysInMonth = new Date(year, month, 0).getDate()
  const cutoff = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')} 23:59:59`
  const rows = prepare(db, `
    SELECT s.id, s.rep_code, s.full_name, s.nickname,
      resolved.branch_id, b.name AS branch_name, b.code AS branch_code,
      resolved.supervisor_id, sup.full_name AS supervisor_name,
      resolved.staff_type, resolved.active
    FROM salesmen s
    JOIN (
      SELECT s2.id,
        COALESCE((SELECT h.branch_id FROM salesman_history h WHERE h.salesman_id=s2.id AND h.changed_at<=? ORDER BY h.changed_at DESC LIMIT 1), s2.branch_id) AS branch_id,
        COALESCE((SELECT h.staff_type FROM salesman_history h WHERE h.salesman_id=s2.id AND h.changed_at<=? ORDER BY h.changed_at DESC LIMIT 1), s2.staff_type) AS staff_type,
        COALESCE((SELECT h.supervisor_id FROM salesman_history h WHERE h.salesman_id=s2.id AND h.changed_at<=? ORDER BY h.changed_at DESC LIMIT 1), s2.supervisor_id) AS supervisor_id,
        COALESCE((SELECT h.active FROM salesman_history h WHERE h.salesman_id=s2.id AND h.changed_at<=? ORDER BY h.changed_at DESC LIMIT 1), s2.active) AS active
      FROM salesmen s2
      WHERE s2.created_at <= ?
    ) resolved ON resolved.id = s.id
    JOIN branches b ON b.id = resolved.branch_id
    LEFT JOIN supervisors sup ON sup.id = resolved.supervisor_id
    ORDER BY resolved.active DESC, b.code, s.full_name
  `).all(cutoff, cutoff, cutoff, cutoff, cutoff)
  return { published: true, rows }
}

export function registerRosterHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('roster:getAll', async (_e, token: string) => {
    requireRosterManager(token)
    const { year, month } = nowYearMonth()
    return getRosterSnapshot(getDb(), year, month)
  })

  // Roster reconstructed AS OF a given month — empty + published:false if that month
  // never had an upload/edit/confirm. Any month (past, current, or staged-ahead future)
  // can be mutated; Effective_Date on upload controls which month a change belongs to.
  ipcMain.handle('roster:getAllAsOf', async (_e, token: string, year: number, month: number) => {
    requireRosterManager(token)
    return getRosterSnapshot(getDb(), year, month)
  })

  // Explicit "nothing changed, same roster as before" confirmation for a month —
  // publishes the month without touching any rep data.
  ipcMain.handle('roster:publishMonth', async (_e, token: string, year: number, month: number) => {
    requireRosterManager(token)
    const db = getDb()
    publishMonth(db, year, month)
    return { success: true }
  })

  ipcMain.handle('roster:saveRep', async (_e, token: string, data: {
    id?: number
    repCode: string; fullName: string; nickname: string
    branchId: number; supervisorId: number | null
    staffType: string; active?: number
  }) => {
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
    snapshotSalesman(db, salesmanId)
    const { year, month } = nowYearMonth()
    publishMonth(db, year, month)
    pushRosterIfConfigured(db).catch(() => {})
    return { success: true, id: salesmanId }
  })

  ipcMain.handle('roster:deactivate', async (_e, token: string, id: number) => {
    requireRosterManager(token)
    const db = getDb()
    prepare(db, `UPDATE salesmen SET active=0 WHERE id=?`).run(id)
    snapshotSalesman(db, id)
    const { year, month } = nowYearMonth()
    publishMonth(db, year, month)
    pushRosterIfConfigured(db).catch(() => {})
    return { success: true }
  })

  ipcMain.handle('roster:reactivate', async (_e, token: string, id: number) => {
    requireRosterManager(token)
    const db = getDb()
    prepare(db, `UPDATE salesmen SET active=1 WHERE id=?`).run(id)
    snapshotSalesman(db, id)
    const { year, month } = nowYearMonth()
    publishMonth(db, year, month)
    pushRosterIfConfigured(db).catch(() => {})
    return { success: true }
  })
}
