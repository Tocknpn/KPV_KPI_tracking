import { IpcMain } from 'electron'
import { getDb } from '../db/connection'
import { prepare, transaction } from '../db/query'
import { requireAuth, logAudit } from './auth'
import { pushRosterIfConfigured } from './sheets'
import { snapshotSalesman, snapshotSupervisor, getRosterExactMonth, getSupervisorRosterExactMonth } from '../db/history'
import { getBranchPointTarget, getIndividualPointTarget } from './reports'
import type { Database } from 'sql.js'

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

// Attach each rep's monthly KPI point target — individual override (staff_monthly_targets)
// if HR set one, else the branch+staffType target from KPI Settings. Lets HR eyeball on the
// Roster screen itself whether everyone has a sane target, without hopping to KPI Report.
function attachRepTargets(
  db: Database, snapshot: { published: boolean; rows: Record<string, unknown>[] }, year: number, month: number,
) {
  const yearMonth = `${year}${String(month).padStart(2, '0')}`
  const rows = snapshot.rows.map(r => ({
    ...r,
    point_target: getIndividualPointTarget(db, r.id as number, yearMonth) ?? getBranchPointTarget(db, r.branch_id as number, year, month, r.staff_type as string),
  }))
  return { ...snapshot, rows }
}

// Supervisors have no individual override table — their monthly target is always the same
// branch+staffType figure their team is held to (matches report:teamPerformance's math).
function attachSupTargets(
  db: Database, snapshot: { published: boolean; rows: Record<string, unknown>[] }, year: number, month: number,
) {
  const rows = snapshot.rows.map(r => ({
    ...r,
    point_target: getBranchPointTarget(db, r.branch_id as number, year, month, r.staff_type as string),
  }))
  return { ...snapshot, rows }
}

export function registerRosterHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('roster:getAll', async (_e, token: string) => {
    requireRosterViewer(token)
    const { year, month } = nowYearMonth()
    const db = getDb()
    return attachRepTargets(db, getRosterExactMonth(db, year, month), year, month)
  })

  // Roster for the EXACT month requested — no carry-forward. published:false means HR
  // hasn't uploaded/edited anything for this specific month, even if an earlier month has
  // data. (KPI/report calculations elsewhere still carry forward via getRosterMapAsOf —
  // this only changes what HR sees on the Roster management screen itself.)
  ipcMain.handle('roster:getAllAsOf', async (_e, token: string, year: number, month: number) => {
    requireRosterViewer(token)
    const db = getDb()
    return attachRepTargets(db, getRosterExactMonth(db, year, month), year, month)
  })

  // Supervisor side of the same screen — exact month, with each supervisor's monthly point
  // target and live headcount for that month, so HR can check both reps and supervisors are
  // accounted for in one place.
  ipcMain.handle('roster:getSupervisorsAsOf', async (_e, token: string, year: number, month: number) => {
    requireRosterViewer(token)
    const db = getDb()
    return attachSupTargets(db, getSupervisorRosterExactMonth(db, year, month), year, month)
  })

  ipcMain.handle('roster:saveRep', async (_e, token: string, data: {
    id?: number
    repCode: string; fullName: string; nickname: string
    branchId: number; supervisorId: number | null
    staffType: string; active?: number
  }, year?: number, month?: number) => {
    const user = requireRosterManager(token)
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
    logAudit(db, user.id, user.username, user.role, data.id ? 'roster_rep_update' : 'roster_rep_create',
      `${data.repCode} — ${data.fullName} (${data.staffType}, branch ${data.branchId})`, 'salesman', String(salesmanId), data.branchId)
    return { success: true, id: salesmanId }
  })

  ipcMain.handle('roster:deactivate', async (_e, token: string, id: number, year?: number, month?: number) => {
    const user = requireRosterManager(token)
    const db = getDb()
    let repLabel = String(id)
    transaction(db, () => {
      const rep = prepare(db, `SELECT supervisor_id, rep_code, full_name FROM salesmen WHERE id=?`).get(id) as { supervisor_id: number | null; rep_code: string | null; full_name: string } | undefined
      if (rep) repLabel = `${rep.rep_code ?? id} — ${rep.full_name}`
      prepare(db, `UPDATE salesmen SET active=0 WHERE id=?`).run(id)
      const { year: y, month: m } = year && month ? { year, month } : nowYearMonth()
      const effDate = effectiveDateFor(y, m)
      snapshotSalesman(db, id, effDate)
      if (rep?.supervisor_id) snapshotSupervisor(db, rep.supervisor_id, effDate)
    })
    pushRosterIfConfigured(db).catch(() => {})
    logAudit(db, user.id, user.username, user.role, 'roster_rep_deactivate', repLabel, 'salesman', String(id))
    return { success: true }
  })

  ipcMain.handle('roster:reactivate', async (_e, token: string, id: number, year?: number, month?: number) => {
    const user = requireRosterManager(token)
    const db = getDb()
    let repLabel = String(id)
    transaction(db, () => {
      prepare(db, `UPDATE salesmen SET active=1 WHERE id=?`).run(id)
      const rep = prepare(db, `SELECT supervisor_id, rep_code, full_name FROM salesmen WHERE id=?`).get(id) as { supervisor_id: number | null; rep_code: string | null; full_name: string } | undefined
      if (rep) repLabel = `${rep.rep_code ?? id} — ${rep.full_name}`
      const { year: y, month: m } = year && month ? { year, month } : nowYearMonth()
      const effDate = effectiveDateFor(y, m)
      snapshotSalesman(db, id, effDate)
      if (rep?.supervisor_id) snapshotSupervisor(db, rep.supervisor_id, effDate)
    })
    pushRosterIfConfigured(db).catch(() => {})
    logAudit(db, user.id, user.username, user.role, 'roster_rep_reactivate', repLabel, 'salesman', String(id))
    return { success: true }
  })
}
