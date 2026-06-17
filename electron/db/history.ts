import type { Database } from 'sql.js'
import { prepare } from './query'

// Snapshot a rep's current branch/type/supervisor/active state into salesman_history.
// Call this immediately after any write to the salesmen table, so headcount-as-of-any-month
// can be reconstructed later even if the rep transfers, is deactivated, or is removed.
// effectiveDate (YYYY-MM-DD) lets HR backdate/future-date a change — e.g. uploading on
// Jun 25 a transfer that should only count from Jul 1. Omit it for "effective right now".
export function snapshotSalesman(db: Database, salesmanId: number, effectiveDate?: string): void {
  const row = prepare(db, `SELECT branch_id, staff_type, supervisor_id, active FROM salesmen WHERE id = ?`).get(salesmanId) as
    { branch_id: number; staff_type: string; supervisor_id: number | null; active: number } | undefined
  if (!row) return
  if (effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    prepare(db, `
      INSERT INTO salesman_history (salesman_id, branch_id, staff_type, supervisor_id, active, changed_at)
      VALUES (?,?,?,?,?,?)
    `).run(salesmanId, row.branch_id, row.staff_type, row.supervisor_id, row.active, effectiveDate)
  } else {
    prepare(db, `
      INSERT INTO salesman_history (salesman_id, branch_id, staff_type, supervisor_id, active)
      VALUES (?,?,?,?,?)
    `).run(salesmanId, row.branch_id, row.staff_type, row.supervisor_id, row.active)
  }
}

// Gate: a month must have an explicit roster action (upload, manual edit, or a plain
// "Confirm Roster" click) recorded before its roster counts as anything but empty.
// No roster = no one to map daily entries/KPI to for that month.
export function isMonthPublished(db: Database, year: number, month: number): boolean {
  const ym = `${year}${String(month).padStart(2, '0')}`
  return !!prepare(db, `SELECT 1 FROM roster_months WHERE year_month = ?`).get(ym)
}

export function publishMonth(db: Database, year: number, month: number): void {
  const ym = `${year}${String(month).padStart(2, '0')}`
  prepare(db, `INSERT OR IGNORE INTO roster_months (year_month) VALUES (?)`).run(ym)
}

// dateStr is YYYY-MM-DD — used when a roster change carries an explicit Effective_Date
export function publishMonthFromDate(db: Database, dateStr: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return
  prepare(db, `INSERT OR IGNORE INTO roster_months (year_month) VALUES (?)`).run(dateStr.slice(0, 4) + dateStr.slice(5, 7))
}

// Active headcount for a branch AS OF the end of a given month — uses the most recent
// snapshot at or before that month, not today's roster. New joiners after that month are
// excluded via created_at (a real, immutable fact already on the salesmen row).
// staffType, if given, counts only reps of that type as of that month (for B2C/B2B target splits).
// Returns 0 if the month was never published — no roster = no target, by design.
export function getHeadcountAsOf(db: Database, branchId: number, year: number, month: number, staffType?: string): number {
  if (!isMonthPublished(db, year, month)) return 0
  const daysInMonth = new Date(year, month, 0).getDate()
  // Space separator (not 'T') — matches SQLite's own datetime('now') format used as the
  // changed_at default, so string comparison sorts correctly down to the second.
  const cutoff = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')} 23:59:59`
  const row = prepare(db, `
    SELECT COUNT(*) AS cnt FROM (
      SELECT s.id,
        COALESCE(
          (SELECT h.branch_id FROM salesman_history h WHERE h.salesman_id = s.id AND h.changed_at <= ? ORDER BY h.changed_at DESC LIMIT 1),
          s.branch_id
        ) AS branch_id,
        COALESCE(
          (SELECT h.staff_type FROM salesman_history h WHERE h.salesman_id = s.id AND h.changed_at <= ? ORDER BY h.changed_at DESC LIMIT 1),
          s.staff_type
        ) AS staff_type,
        COALESCE(
          (SELECT h.active FROM salesman_history h WHERE h.salesman_id = s.id AND h.changed_at <= ? ORDER BY h.changed_at DESC LIMIT 1),
          s.active
        ) AS active
      FROM salesmen s
      WHERE s.created_at <= ?
    ) WHERE branch_id = ? AND active = 1 ${staffType ? 'AND staff_type = ?' : ''}
  `).get(...(staffType ? [cutoff, cutoff, cutoff, cutoff, branchId, staffType] : [cutoff, cutoff, cutoff, cutoff, branchId])) as { cnt: number }
  return row.cnt
}
