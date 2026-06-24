import { IpcMain } from 'electron'
import { getDb } from '../db/connection'
import { prepare, transaction } from '../db/query'
import { requireAuth, logAudit } from './auth'
import { pushRosterIfConfigured, healLocalRosterBeforePush } from './sheets'
import { snapshotSalesman, snapshotSupervisor, getRosterExactMonth, getSupervisorRosterExactMonth } from '../db/history'
import { getBranchPointTarget, getIndividualPointTarget } from './reports'
import type { Database } from 'better-sqlite3'

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

// Supervisor target = per-person target × number of active reps on their team for that month
// (matches report:teamPerformance's math: perPersonTarget * reps.length).
function attachSupTargets(
  db: Database, snapshot: { published: boolean; rows: Record<string, unknown>[] }, year: number, month: number,
) {
  const rows = snapshot.rows.map(r => {
    const perPersonTarget = getBranchPointTarget(db, r.branch_id as number, year, month, r.staff_type as string)
    // rep_count is already calculated by getSupervisorRosterExactMonth from roster_monthly
    const repCount = (r.rep_count as number) ?? 0
    return {
      ...r,
      point_target: perPersonTarget * repCount,
    }
  })
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
    {
      const { year: y, month: m } = year && month ? { year, month } : nowYearMonth()
      const yearMonth = `${y}${String(m).padStart(2, '0')}`
      healLocalRosterBeforePush(db, [{ yearMonth, repCode: data.repCode }])
        .then(() => pushRosterIfConfigured(db)).catch(() => {})
    }
    logAudit(db, user.id, user.username, user.role, data.id ? 'roster_rep_update' : 'roster_rep_create',
      `${data.repCode} — ${data.fullName} (${data.staffType}, branch ${data.branchId})`, 'salesman', String(salesmanId), data.branchId)
    return { success: true, id: salesmanId }
  })

  ipcMain.handle('roster:deactivate', async (_e, token: string, id: number, year?: number, month?: number) => {
    const user = requireRosterManager(token)
    const db = getDb()
    let repLabel = String(id)
    let touchedRepCode: string | null = null
    transaction(db, () => {
      const rep = prepare(db, `SELECT supervisor_id, rep_code, full_name FROM salesmen WHERE id=?`).get(id) as { supervisor_id: number | null; rep_code: string | null; full_name: string } | undefined
      if (rep) { repLabel = `${rep.rep_code ?? id} — ${rep.full_name}`; touchedRepCode = rep.rep_code }
      prepare(db, `UPDATE salesmen SET active=0 WHERE id=?`).run(id)
      const { year: y, month: m } = year && month ? { year, month } : nowYearMonth()
      const effDate = effectiveDateFor(y, m)
      snapshotSalesman(db, id, effDate)
      if (rep?.supervisor_id) snapshotSupervisor(db, rep.supervisor_id, effDate)
    })
    {
      const { year: y, month: m } = year && month ? { year, month } : nowYearMonth()
      const yearMonth = `${y}${String(m).padStart(2, '0')}`
      const keys = touchedRepCode ? [{ yearMonth, repCode: touchedRepCode }] : []
      healLocalRosterBeforePush(db, keys).then(() => pushRosterIfConfigured(db)).catch(() => {})
    }
    logAudit(db, user.id, user.username, user.role, 'roster_rep_deactivate', repLabel, 'salesman', String(id))
    return { success: true }
  })

  ipcMain.handle('roster:reactivate', async (_e, token: string, id: number, year?: number, month?: number) => {
    const user = requireRosterManager(token)
    const db = getDb()
    let repLabel = String(id)
    let touchedRepCode: string | null = null
    transaction(db, () => {
      prepare(db, `UPDATE salesmen SET active=1 WHERE id=?`).run(id)
      const rep = prepare(db, `SELECT supervisor_id, rep_code, full_name FROM salesmen WHERE id=?`).get(id) as { supervisor_id: number | null; rep_code: string | null; full_name: string } | undefined
      if (rep) { repLabel = `${rep.rep_code ?? id} — ${rep.full_name}`; touchedRepCode = rep.rep_code }
      const { year: y, month: m } = year && month ? { year, month } : nowYearMonth()
      const effDate = effectiveDateFor(y, m)
      snapshotSalesman(db, id, effDate)
      if (rep?.supervisor_id) snapshotSupervisor(db, rep.supervisor_id, effDate)
    })
    {
      const { year: y, month: m } = year && month ? { year, month } : nowYearMonth()
      const yearMonth = `${y}${String(m).padStart(2, '0')}`
      const keys = touchedRepCode ? [{ yearMonth, repCode: touchedRepCode }] : []
      healLocalRosterBeforePush(db, keys).then(() => pushRosterIfConfigured(db)).catch(() => {})
    }
    logAudit(db, user.id, user.username, user.role, 'roster_rep_reactivate', repLabel, 'salesman', String(id))
    return { success: true }
  })

  // True hard delete — deactivate above only flips active=0. Same reasoning as
  // auth:permanentlyDeleteUser: salesmen.id is a NOT NULL FK on daily_entries with no
  // cascade, so a rep with any uploaded entries can't be hard-deleted without destroying
  // that history — refuse and point at Deactivate instead. roster_monthly rows (pure
  // history, no entries reference them) are cleared as part of the delete since they'd
  // otherwise dangle on a salesman_id that no longer exists.
  ipcMain.handle('roster:permanentlyDelete', async (_e, token: string, id: number) => {
    const user = requireRosterManager(token)
    const db = getDb()
    const rep = prepare(db, `SELECT rep_code, full_name FROM salesmen WHERE id=?`).get(id) as { rep_code: string | null; full_name: string } | undefined
    if (!rep) return { success: false, error: 'Rep not found.' }

    const entries = prepare(db, `SELECT COUNT(*) AS n FROM daily_entries WHERE salesman_id = ?`).get(id) as { n: number }
    if (entries.n > 0) {
      return { success: false, error: `Cannot permanently delete — this rep has ${entries.n} uploaded entr${entries.n === 1 ? 'y' : 'ies'} on record. Deactivate instead to keep that history intact.` }
    }

    const repLabel = `${rep.rep_code ?? id} — ${rep.full_name}`
    transaction(db, () => {
      prepare(db, `DELETE FROM roster_monthly WHERE salesman_id = ?`).run(id)
      // A rep with zero current daily_entries can still have entry_deletions tombstones from
      // an earlier batch-delete (those rows still reference salesman_id) — clear them too or
      // the salesmen delete below throws FOREIGN KEY constraint failed.
      prepare(db, `DELETE FROM entry_deletions WHERE salesman_id = ?`).run(id)
      prepare(db, `DELETE FROM salesmen WHERE id = ?`).run(id)
    })
    // deletedRepCodes (not touchedKeys) — merge must skip resurrecting this rep from the
    // Sheet entirely, not just for one month, since every month's row for them is now gone.
    healLocalRosterBeforePush(db, [], rep.rep_code ? [rep.rep_code] : [])
      .then(() => pushRosterIfConfigured(db)).catch(() => {})
    logAudit(db, user.id, user.username, user.role, 'roster_rep_delete', repLabel, 'salesman', String(id))
    return { success: true }
  })
}
