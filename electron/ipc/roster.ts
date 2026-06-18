import { IpcMain } from 'electron'
import { getDb } from '../db/connection'
import { prepare, transaction } from '../db/query'
import { requireAuth } from './auth'
import { pushRosterIfConfigured } from './sheets'
import { snapshotSalesman, snapshotSupervisor, getRosterSnapshotAsOf } from '../db/history'

function requireRosterManager(token: string) {
  const u = requireAuth(token)
  if (!['admin', 'hr'].includes(u.role)) throw new Error('Forbidden')
  return u
}

// Top Manager (view-only) and HR Support (upload-only, but still needs to see the current
// roster to do that) both have the 'roster' menu key per ROLE_DEFAULTS without full CRUD —
// reads use this, writes (saveRep/deactivate/reactivate) stay on requireRosterManager above.
function requireRosterViewer(token: string) {
  const u = requireAuth(token)
  if (!['admin', 'hr', 'top_manager', 'hr_support'].includes(u.role)) throw new Error('Forbidden')
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
    requireRosterViewer(token)
    const { year, month } = nowYearMonth()
    return getRosterSnapshotAsOf(getDb(), year, month)
  })

  // Roster reconstructed AS OF a given month — empty + published:false only if no month,
  // past or present, has ever had any roster data. Otherwise carries forward from the
  // nearest earlier edited month automatically — no "confirm no changes" step needed.
  ipcMain.handle('roster:getAllAsOf', async (_e, token: string, year: number, month: number) => {
    requireRosterViewer(token)
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
    let salesmanId!: number

    // First edit of a new month triggers ensureMonthMaterialized's copy-forward of every
    // rep into that month — without a transaction, each of those inserts does a full
    // database export+disk-write (see db/query.ts's persistDb()), which can lock up the
    // whole app for a company-sized roster. transaction() defers all of that to one write.
    transaction(db, () => {
      let prevSupervisorId: number | null = null
      if (data.id) {
        const prev = prepare(db, `SELECT supervisor_id FROM salesmen WHERE id=?`).get(data.id) as { supervisor_id: number | null } | undefined
        prevSupervisorId = prev?.supervisor_id ?? null
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
      const effDate = effectiveDateFor(y, m)
      snapshotSalesman(db, salesmanId, effDate)
      // Refresh the Supervisor Roster snapshot too — any rep add/edit/transfer can change a
      // supervisor's team composition for this month, not just bulk roster uploads. A
      // transfer affects two supervisors (the team that lost the rep, the one that gained
      // them) — snapshot both, not just the new one.
      if (data.supervisorId) snapshotSupervisor(db, data.supervisorId, effDate)
      if (prevSupervisorId && prevSupervisorId !== data.supervisorId) snapshotSupervisor(db, prevSupervisorId, effDate)
    })
    pushRosterIfConfigured(db).catch(() => {})
    return { success: true, id: salesmanId }
  })

  ipcMain.handle('roster:deactivate', async (_e, token: string, id: number, year?: number, month?: number) => {
    requireRosterManager(token)
    const db = getDb()
    transaction(db, () => {
      const rep = prepare(db, `SELECT supervisor_id FROM salesmen WHERE id=?`).get(id) as { supervisor_id: number | null } | undefined
      prepare(db, `UPDATE salesmen SET active=0 WHERE id=?`).run(id)
      const { year: y, month: m } = year && month ? { year, month } : nowYearMonth()
      const effDate = effectiveDateFor(y, m)
      snapshotSalesman(db, id, effDate)
      if (rep?.supervisor_id) snapshotSupervisor(db, rep.supervisor_id, effDate)
    })
    pushRosterIfConfigured(db).catch(() => {})
    return { success: true }
  })

  ipcMain.handle('roster:reactivate', async (_e, token: string, id: number, year?: number, month?: number) => {
    requireRosterManager(token)
    const db = getDb()
    transaction(db, () => {
      prepare(db, `UPDATE salesmen SET active=1 WHERE id=?`).run(id)
      const rep = prepare(db, `SELECT supervisor_id FROM salesmen WHERE id=?`).get(id) as { supervisor_id: number | null } | undefined
      const { year: y, month: m } = year && month ? { year, month } : nowYearMonth()
      const effDate = effectiveDateFor(y, m)
      snapshotSalesman(db, id, effDate)
      if (rep?.supervisor_id) snapshotSupervisor(db, rep.supervisor_id, effDate)
    })
    pushRosterIfConfigured(db).catch(() => {})
    return { success: true }
  })
}
