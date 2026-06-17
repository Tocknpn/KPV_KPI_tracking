import { IpcMain } from 'electron'
import { getDb } from '../db/connection'
import { prepare, transaction } from '../db/query'
import { requireAuth } from './auth'
import { syncEntriesToCloudIfConfigured, pushSupervisorsIfConfigured, pushRosterIfConfigured } from './sheets'
import { snapshotSalesman } from '../db/history'

export function registerEntryHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('entry:getSalesmen', async (_e, token: string, branchId?: number) => {
    const user = requireAuth(token)
    const db = getDb()

    // Supervisor: see only their assigned team
    if (user.role === 'supervisor' && user.supervisor_id) {
      return prepare(db, `
        SELECT s.*, b.name AS branch_name, sv.full_name AS supervisor_name FROM salesmen s
        JOIN branches b ON b.id = s.branch_id
        LEFT JOIN supervisors sv ON sv.id = s.supervisor_id
        WHERE s.supervisor_id = ? AND s.active = 1 ORDER BY s.full_name
      `).all(user.supervisor_id)
    }

    const effectiveBranchId = (user.role === 'supervisor' || user.role === 'branch_manager')
      ? user.branch_id
      : (branchId ?? null)

    if (effectiveBranchId) {
      return prepare(db, `
        SELECT s.*, b.name AS branch_name, sv.full_name AS supervisor_name FROM salesmen s
        JOIN branches b ON b.id = s.branch_id
        LEFT JOIN supervisors sv ON sv.id = s.supervisor_id
        WHERE s.branch_id = ? AND s.active = 1 ORDER BY sv.full_name, s.full_name
      `).all(effectiveBranchId)
    }
    return prepare(db, `
      SELECT s.*, b.name AS branch_name, sv.full_name AS supervisor_name FROM salesmen s
      JOIN branches b ON b.id = s.branch_id
      LEFT JOIN supervisors sv ON sv.id = s.supervisor_id
      WHERE s.active = 1 ORDER BY b.id, sv.full_name, s.full_name
    `).all()
  })

  ipcMain.handle('entry:createSalesman', async (_e, token: string, data: {
    fullName: string; nickname: string; branchId: number; position: string; department: string
  }) => {
    requireAuth(token)
    const db = getDb()
    const result = prepare(db, `INSERT INTO salesmen (full_name, nickname, branch_id, position, department) VALUES (?,?,?,?,?)`)
      .run(data.fullName, data.nickname, data.branchId, data.position, data.department)
    snapshotSalesman(db, Number(result.lastInsertRowid))
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
    snapshotSalesman(db, id)
    return { success: true }
  })

  ipcMain.handle('entry:getEntries', async (_e, token: string, branchId: number, date: string) => {
    const user = requireAuth(token)
    const db = getDb()

    // Supervisor: show only their assigned team members
    if (user.role === 'supervisor' && user.supervisor_id) {
      return prepare(db, `
        SELECT
          de.id, s.id AS salesman_id, de.entry_date,
          COALESCE(de.jewelry_weight_g, 0) AS jewelry_weight_g,
          COALESCE(de.bar_weight_g, 0)     AS bar_weight_g,
          COALESCE(de.quantity, 0)         AS quantity,
          COALESCE(de.synced, 0)           AS synced,
          s.full_name AS salesman_name, s.nickname, s.position,
          sv.full_name AS supervisor_name
        FROM salesmen s
        LEFT JOIN daily_entries de ON de.salesman_id = s.id AND de.entry_date = ?
        LEFT JOIN supervisors sv ON sv.id = s.supervisor_id
        WHERE s.supervisor_id = ? AND s.active = 1
        ORDER BY s.full_name
      `).all(date, user.supervisor_id)
    }

    return prepare(db, `
      SELECT
        de.id, s.id AS salesman_id, de.entry_date,
        COALESCE(de.jewelry_weight_g, 0) AS jewelry_weight_g,
        COALESCE(de.bar_weight_g, 0)     AS bar_weight_g,
        COALESCE(de.quantity, 0)         AS quantity,
        COALESCE(de.synced, 0)           AS synced,
        s.full_name AS salesman_name, s.nickname, s.position,
        sv.full_name AS supervisor_name
      FROM salesmen s
      LEFT JOIN daily_entries de ON de.salesman_id = s.id AND de.entry_date = ?
      LEFT JOIN supervisors sv ON sv.id = s.supervisor_id
      WHERE s.branch_id = ? AND s.active = 1
      ORDER BY sv.full_name, s.full_name
    `).all(date, branchId)
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
    // Stamp staff_type as it is RIGHT NOW — this entry's score must always use this,
    // even if the rep's type/branch changes later (transfers must not rewrite history)
    const sm = prepare(db, `SELECT staff_type FROM salesmen WHERE id = ?`).get(entry.salesmanId) as { staff_type: string } | undefined
    prepare(db, `DELETE FROM daily_entries WHERE salesman_id = ? AND entry_date = ?`).run(entry.salesmanId, entry.date)
    prepare(db, `INSERT INTO daily_entries (salesman_id, branch_id, staff_type, entry_date, jewelry_weight_g, bar_weight_g, quantity, synced, updated_at) VALUES (?,?,?,?,?,?,?,0,?)`)
      .run(entry.salesmanId, entry.branchId, sm?.staff_type ?? 'b2c', entry.date, entry.jewelryWeightG, entry.barWeightG, entry.quantity, now)
    syncEntriesToCloudIfConfigured(db).catch(() => {})
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
        const sm = prepare(db, `SELECT staff_type FROM salesmen WHERE id = ?`).get(e.salesmanId) as { staff_type: string } | undefined
        prepare(db, `DELETE FROM daily_entries WHERE salesman_id = ? AND entry_date = ?`).run(e.salesmanId, e.date)
        prepare(db, `INSERT INTO daily_entries (salesman_id, branch_id, staff_type, entry_date, jewelry_weight_g, bar_weight_g, quantity, synced, updated_at) VALUES (?,?,?,?,?,?,?,0,?)`)
          .run(e.salesmanId, e.branchId, sm?.staff_type ?? 'b2c', e.date, e.jewelryWeightG, e.barWeightG, e.quantity, now)
      }
    })
    syncEntriesToCloudIfConfigured(db).catch(() => {})
    return { success: true, count: entries.length }
  })

  ipcMain.handle('entry:getUnsyncedCount', async (_e, token: string) => {
    requireAuth(token)
    const row = prepare(getDb(), `SELECT COUNT(*) as count FROM daily_entries WHERE synced = 0`).get() as { count: number }
    return row?.count ?? 0
  })

  // ── Supervisor CRUD ───────────────────────────────────────────────────────

  ipcMain.handle('supervisor:getAll', async (_e, token: string, branchId?: number) => {
    requireAuth(token)
    const db = getDb()
    if (branchId) {
      return prepare(db, `
        SELECT sv.*, b.name AS branch_name,
          (SELECT COUNT(*) FROM salesmen s WHERE s.supervisor_id = sv.id AND s.active = 1) AS rep_count
        FROM supervisors sv
        JOIN branches b ON b.id = sv.branch_id
        WHERE sv.branch_id = ? ORDER BY sv.full_name
      `).all(branchId)
    }
    return prepare(db, `
      SELECT sv.*, b.name AS branch_name,
        (SELECT COUNT(*) FROM salesmen s WHERE s.supervisor_id = sv.id AND s.active = 1) AS rep_count
      FROM supervisors sv
      JOIN branches b ON b.id = sv.branch_id
      ORDER BY sv.branch_id, sv.full_name
    `).all()
  })

  ipcMain.handle('supervisor:save', async (_e, token: string, data: {
    id?: number; fullName: string; nickname: string; branchId: number; active?: number
  }) => {
    requireAuth(token)
    const db = getDb()
    if (data.id) {
      prepare(db, `UPDATE supervisors SET full_name=?,nickname=?,branch_id=?,active=? WHERE id=?`)
        .run(data.fullName, data.nickname, data.branchId, data.active ?? 1, data.id)
      pushSupervisorsIfConfigured(db).catch(() => {})
      return { success: true, id: data.id }
    }
    const r = prepare(db, `INSERT INTO supervisors (full_name, nickname, branch_id) VALUES (?,?,?)`)
      .run(data.fullName, data.nickname, data.branchId)
    pushSupervisorsIfConfigured(db).catch(() => {})
    return { success: true, id: r.lastInsertRowid }
  })

  ipcMain.handle('supervisor:delete', async (_e, token: string, id: number) => {
    requireAuth(token)
    const db = getDb()
    // Unlink reps before deactivating
    const affected = prepare(db, `SELECT id FROM salesmen WHERE supervisor_id = ?`).all(id) as Array<{ id: number }>
    prepare(db, `UPDATE salesmen SET supervisor_id = NULL WHERE supervisor_id = ?`).run(id)
    affected.forEach(r => snapshotSalesman(db, r.id))
    prepare(db, `UPDATE supervisors SET active = 0 WHERE id = ?`).run(id)
    pushSupervisorsIfConfigured(db).catch(() => {})
    return { success: true }
  })

  ipcMain.handle('supervisor:assignSalesmen', async (_e, token: string, supervisorId: number, salesmanIds: number[]) => {
    requireAuth(token)
    const db = getDb()
    transaction(db, () => {
      // Clear existing assignments for this supervisor
      const previouslyAssigned = prepare(db, `SELECT id FROM salesmen WHERE supervisor_id = ?`).all(supervisorId) as Array<{ id: number }>
      prepare(db, `UPDATE salesmen SET supervisor_id = NULL WHERE supervisor_id = ?`).run(supervisorId)
      previouslyAssigned.forEach(r => snapshotSalesman(db, r.id))
      // Assign new list
      for (const sid of salesmanIds) {
        prepare(db, `UPDATE salesmen SET supervisor_id = ? WHERE id = ?`).run(supervisorId, sid)
        snapshotSalesman(db, sid)
      }
    })
    pushRosterIfConfigured(db).catch(() => {})
    return { success: true }
  })

  ipcMain.handle('supervisor:getSalesmenForBranch', async (_e, token: string, branchId: number) => {
    requireAuth(token)
    return prepare(getDb(), `
      SELECT s.id, s.full_name, s.nickname, s.position, s.supervisor_id,
        sv.full_name AS supervisor_name
      FROM salesmen s
      LEFT JOIN supervisors sv ON sv.id = s.supervisor_id
      WHERE s.branch_id = ? AND s.active = 1
      ORDER BY s.full_name
    `).all(branchId)
  })
}
