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

// Active headcount for a branch AS OF the end of a given month — uses the most recent
// snapshot at or before that month, not today's roster. New joiners after that month are
// excluded via created_at (a real, immutable fact already on the salesmen row).
export function getHeadcountAsOf(db: Database, branchId: number, year: number, month: number): number {
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
          (SELECT h.active FROM salesman_history h WHERE h.salesman_id = s.id AND h.changed_at <= ? ORDER BY h.changed_at DESC LIMIT 1),
          s.active
        ) AS active
      FROM salesmen s
      WHERE s.created_at <= ?
    ) WHERE branch_id = ? AND active = 1
  `).get(cutoff, cutoff, cutoff, branchId) as { cnt: number }
  return row.cnt
}
