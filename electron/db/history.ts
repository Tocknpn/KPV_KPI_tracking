import type { Database } from 'sql.js'
import { prepare } from './query'

function ym(year: number, month: number): string {
  return `${year}${String(month).padStart(2, '0')}`
}

// The nearest month <= target that actually has rows — this is the carry-forward read:
// a month nobody touched simply reads as whatever the last edited month said, with zero
// extra storage and zero "confirm this month" step required.
export function resolveYm(db: Database, year: number, month: number): string | null {
  const target = ym(year, month)
  const row = prepare(db, `SELECT MAX(year_month) AS ym FROM roster_monthly WHERE year_month <= ?`).get(target) as { ym: string | null } | undefined
  return row?.ym ?? null
}

// Materializes a full row-set for (year, month) if it doesn't already have one, by copying
// the nearest prior month's rows forward. Only called on actual writes (saveRep/deactivate/
// upload) — reads use resolveYm directly and never write, so viewing a report never
// triggers a disk persist.
function ensureMonthMaterialized(db: Database, year: number, month: number): string {
  const target = ym(year, month)
  const exists = prepare(db, `SELECT 1 FROM roster_monthly WHERE year_month = ? LIMIT 1`).get(target)
  if (exists) return target
  const priorBefore = prepare(db, `SELECT MAX(year_month) AS ym FROM roster_monthly WHERE year_month < ?`).get(target) as { ym: string | null } | undefined
  const sourceYm = priorBefore?.ym
  if (sourceYm) {
    const rows = prepare(db, `SELECT salesman_id, branch_id, supervisor_id, staff_type, active FROM roster_monthly WHERE year_month = ?`).all(sourceYm) as
      Array<{ salesman_id: number; branch_id: number; supervisor_id: number | null; staff_type: string; active: number }>
    for (const r of rows) {
      prepare(db, `
        INSERT INTO roster_monthly (salesman_id, year_month, branch_id, supervisor_id, staff_type, active)
        VALUES (?,?,?,?,?,?)
      `).run(r.salesman_id, target, r.branch_id, r.supervisor_id, r.staff_type, r.active)
    }
  }
  return target
}

// Snapshot a rep's current branch/type/supervisor/active state into roster_monthly for the
// given month (or "now" if no effectiveDate). Call after any write to the salesmen table.
// effectiveDate (YYYY-MM-DD) lets HR backdate/future-date a change — e.g. uploading on
// Jun 25 a transfer that should only count from Jul 1.
export function snapshotSalesman(db: Database, salesmanId: number, effectiveDate?: string): void {
  const row = prepare(db, `SELECT branch_id, staff_type, supervisor_id, active FROM salesmen WHERE id = ?`).get(salesmanId) as
    { branch_id: number; staff_type: string; supervisor_id: number | null; active: number } | undefined
  if (!row) return

  let year: number, month: number
  if (effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    year = parseInt(effectiveDate.slice(0, 4), 10)
    month = parseInt(effectiveDate.slice(5, 7), 10)
  } else {
    const now = new Date()
    year = now.getFullYear(); month = now.getMonth() + 1
  }

  const targetYm = ensureMonthMaterialized(db, year, month)
  prepare(db, `
    INSERT INTO roster_monthly (salesman_id, year_month, branch_id, supervisor_id, staff_type, active)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(salesman_id, year_month) DO UPDATE SET
      branch_id = excluded.branch_id, supervisor_id = excluded.supervisor_id,
      staff_type = excluded.staff_type, active = excluded.active
  `).run(salesmanId, targetYm, row.branch_id, row.supervisor_id, row.staff_type, row.active)
}

// Supervisor equivalent of ensureMonthMaterialized — same carry-forward shape, separate
// table since supervisor_roster_monthly tracks a different entity than roster_monthly.
function ensureSupMonthMaterialized(db: Database, year: number, month: number): string {
  const target = ym(year, month)
  const exists = prepare(db, `SELECT 1 FROM supervisor_roster_monthly WHERE year_month = ? LIMIT 1`).get(target)
  if (exists) return target
  const priorBefore = prepare(db, `SELECT MAX(year_month) AS ym FROM supervisor_roster_monthly WHERE year_month < ?`).get(target) as { ym: string | null } | undefined
  const sourceYm = priorBefore?.ym
  if (sourceYm) {
    const rows = prepare(db, `SELECT supervisor_id, branch_id, staff_type, active FROM supervisor_roster_monthly WHERE year_month = ?`).all(sourceYm) as
      Array<{ supervisor_id: number; branch_id: number; staff_type: string; active: number }>
    for (const r of rows) {
      prepare(db, `
        INSERT INTO supervisor_roster_monthly (supervisor_id, year_month, branch_id, staff_type, active)
        VALUES (?,?,?,?,?)
      `).run(r.supervisor_id, target, r.branch_id, r.staff_type, r.active)
    }
  }
  return target
}

// Snapshot a supervisor's current branch/type/active state into supervisor_roster_monthly —
// same idea as snapshotSalesman, called after the roster upload creates/links a supervisor.
// Pure history/record-keeping: report:teamPerformance derives headcount straight from
// roster_monthly, not from this table, so this never affects any existing calculation.
export function snapshotSupervisor(db: Database, supervisorId: number, effectiveDate?: string): void {
  const row = prepare(db, `SELECT branch_id, staff_type, active FROM supervisors WHERE id = ?`).get(supervisorId) as
    { branch_id: number; staff_type: string; active: number } | undefined
  if (!row) return

  let year: number, month: number
  if (effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    year = parseInt(effectiveDate.slice(0, 4), 10)
    month = parseInt(effectiveDate.slice(5, 7), 10)
  } else {
    const now = new Date()
    year = now.getFullYear(); month = now.getMonth() + 1
  }

  const targetYm = ensureSupMonthMaterialized(db, year, month)
  prepare(db, `
    INSERT INTO supervisor_roster_monthly (supervisor_id, year_month, branch_id, staff_type, active)
    VALUES (?,?,?,?,?)
    ON CONFLICT(supervisor_id, year_month) DO UPDATE SET
      branch_id = excluded.branch_id, staff_type = excluded.staff_type, active = excluded.active
  `).run(supervisorId, targetYm, row.branch_id, row.staff_type, row.active)
}

// Gate: a month "has a roster" if it or any earlier month has rows — i.e. it'll resolve to
// something via carry-forward. Only a month with literally nothing before it is empty.
export function isMonthPublished(db: Database, year: number, month: number): boolean {
  return resolveYm(db, year, month) !== null
}

// Explicit "lock in this month" action — forces materialization even with zero edits.
// Mostly useful to pin a month's roster before making a string of edits to an even earlier
// month (so those earlier edits can't accidentally ripple forward via carry-forward).
export function publishMonth(db: Database, year: number, month: number): void {
  ensureMonthMaterialized(db, year, month)
}

// dateStr is YYYY-MM-DD — used when a roster change carries an explicit Effective_Date
export function publishMonthFromDate(db: Database, dateStr: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return
  publishMonth(db, parseInt(dateStr.slice(0, 4), 10), parseInt(dateStr.slice(5, 7), 10))
}

// Active headcount for a branch AS OF a given month — resolves to the nearest published
// month <= target and counts directly, no per-field reconstruction needed.
export function getHeadcountAsOf(db: Database, branchId: number, year: number, month: number, staffType?: string): number {
  const resolved = resolveYm(db, year, month)
  if (!resolved) return 0
  const row = prepare(db, `
    SELECT COUNT(*) AS cnt FROM roster_monthly
    WHERE year_month = ? AND branch_id = ? AND active = 1 ${staffType ? 'AND staff_type = ?' : ''}
  `).get(...(staffType ? [resolved, branchId, staffType] : [resolved, branchId])) as { cnt: number }
  return row.cnt
}

// Per-salesman roster facts AS OF a given month — who was active, on which team, as of
// that month. Used to answer "who's on this team for this past month" without drifting
// when a rep later transfers/deactivates (see report:teamPerformance, commission:getReport).
export function getRosterMapAsOf(db: Database, year: number, month: number): Map<number, { branch_id: number; supervisor_id: number | null; staff_type: string; active: number }> {
  const map = new Map<number, { branch_id: number; supervisor_id: number | null; staff_type: string; active: number }>()
  const resolved = resolveYm(db, year, month)
  if (!resolved) return map
  const rows = prepare(db, `SELECT salesman_id, branch_id, supervisor_id, staff_type, active FROM roster_monthly WHERE year_month = ?`).all(resolved) as
    Array<{ salesman_id: number; branch_id: number; supervisor_id: number | null; staff_type: string; active: number }>
  for (const r of rows) map.set(r.salesman_id, { branch_id: r.branch_id, supervisor_id: r.supervisor_id, staff_type: r.staff_type, active: r.active })
  return map
}

// Roster for the EXACT month requested — no carry-forward. Used by the Roster screen so
// HR sees plainly "nothing uploaded for this month yet" instead of silently being shown an
// earlier month's data relabeled as this one. Reports/KPI calculations still use the
// carry-forward versions above (getRosterMapAsOf, getHeadcountAsOf) — this only changes
// what HR sees when reviewing/managing the roster, not how anything gets scored.
export function getRosterExactMonth(db: Database, year: number, month: number) {
  const target = ym(year, month)
  const rows = prepare(db, `
    SELECT s.id, s.rep_code, s.full_name, s.nickname,
      rm.branch_id, b.name AS branch_name, b.code AS branch_code,
      rm.supervisor_id, sup.full_name AS supervisor_name,
      rm.staff_type, rm.active
    FROM roster_monthly rm
    JOIN salesmen s ON s.id = rm.salesman_id
    JOIN branches b ON b.id = rm.branch_id
    LEFT JOIN supervisors sup ON sup.id = rm.supervisor_id
    WHERE rm.year_month = ?
    ORDER BY rm.active DESC, b.code, s.full_name
  `).all(target)
  return { published: rows.length > 0, rows }
}

// Supervisor roster for the EXACT month requested — no carry-forward, same rule as
// getRosterExactMonth above. rep_count is also pinned to that exact month's roster_monthly
// rows, not today's live team, so it matches whatever the Roster screen's Reps tab shows.
export function getSupervisorRosterExactMonth(db: Database, year: number, month: number) {
  const target = ym(year, month)
  const rows = prepare(db, `
    SELECT sup.id, sup.sup_code, sup.full_name, sup.nickname,
      srm.branch_id, b.name AS branch_name, b.code AS branch_code,
      srm.staff_type, srm.active,
      (SELECT COUNT(*) FROM roster_monthly rm WHERE rm.supervisor_id = sup.id AND rm.year_month = ? AND rm.active = 1) AS rep_count
    FROM supervisor_roster_monthly srm
    JOIN supervisors sup ON sup.id = srm.supervisor_id
    JOIN branches b ON b.id = srm.branch_id
    WHERE srm.year_month = ?
    ORDER BY srm.active DESC, b.code, sup.full_name
  `).all(target, target)
  return { published: rows.length > 0, rows }
}

// Full roster snapshot AS OF a given month — used by report:teamPerformance and similar
// calculations that need a sensible value even for a month HR forgot to re-upload.
// published=false means there is no month, past or present, with any roster data at all.
export function getRosterSnapshotAsOf(db: Database, year: number, month: number) {
  const resolved = resolveYm(db, year, month)
  if (!resolved) return { published: false, rows: [] as unknown[] }
  const rows = prepare(db, `
    SELECT s.id, s.rep_code, s.full_name, s.nickname,
      rm.branch_id, b.name AS branch_name, b.code AS branch_code,
      rm.supervisor_id, sup.full_name AS supervisor_name,
      rm.staff_type, rm.active
    FROM roster_monthly rm
    JOIN salesmen s ON s.id = rm.salesman_id
    JOIN branches b ON b.id = rm.branch_id
    LEFT JOIN supervisors sup ON sup.id = rm.supervisor_id
    WHERE rm.year_month = ?
    ORDER BY rm.active DESC, b.code, s.full_name
  `).all(resolved)
  return { published: true, rows }
}
