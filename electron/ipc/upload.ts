import { IpcMain } from 'electron'
import { getDb } from '../db/connection'
import { prepare, transaction } from '../db/query'
import { requireAuth } from './auth'

export interface DailyRow {
  date: string           // YYYY-MM-DD
  salesmanId: number
  branchId: number
  jewelryWeightG: number
  barWeightG: number
  quantity: number
}

export interface TargetRow {
  salesmanId: number
  branchId: number
  year: number
  month: number
  jewelryWeightG: number
  barWeightG: number
  quantity: number
}

export interface UploadLogEntry {
  branchId: number
  uploadType: 'target' | 'daily'
  filename: string
  recordsCount: number
  dateFrom?: string
  dateTo?: string
  month?: number
  year?: number
  notes?: string
}

export function registerUploadHandlers(ipcMain: IpcMain): void {
  const db = getDb()

  // ── Process daily CSV upload ──────────────────────────────────────────
  ipcMain.handle('upload:daily', async (_e, token: string, rows: DailyRow[], meta: UploadLogEntry) => {
    const user = requireAuth(token)
    if (!rows.length) return { success: false, error: 'No rows to import.' }

    try {
      transaction(db, () => {
        const now = new Date().toISOString()
        for (const r of rows) {
          // DELETE + INSERT = latest upload always wins per (salesman, date)
          prepare(db, `DELETE FROM daily_entries WHERE salesman_id = ? AND entry_date = ?`).run(r.salesmanId, r.date)
          prepare(db, `
            INSERT INTO daily_entries (salesman_id, branch_id, entry_date, jewelry_weight_g, bar_weight_g, quantity, synced, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?)
          `).run(r.salesmanId, r.branchId, r.date, r.jewelryWeightG, r.barWeightG, r.quantity, now)
        }
      })

      // Log the upload
      prepare(db, `
        INSERT INTO upload_logs (branch_id, user_id, upload_type, filename, records_count, date_from, date_to, status, notes)
        VALUES (?, ?, 'daily', ?, ?, ?, ?, 'success', ?)
      `).run(meta.branchId, user.id, meta.filename, rows.length, meta.dateFrom ?? null, meta.dateTo ?? null, meta.notes ?? null)

      return { success: true, count: rows.length }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      prepare(db, `
        INSERT INTO upload_logs (branch_id, user_id, upload_type, filename, records_count, status, notes)
        VALUES (?, ?, 'daily', ?, 0, 'error', ?)
      `).run(meta.branchId, user.id, meta.filename, msg)
      return { success: false, error: msg }
    }
  })

  // ── Process target CSV upload ─────────────────────────────────────────
  ipcMain.handle('upload:targets', async (_e, token: string, rows: TargetRow[], meta: UploadLogEntry) => {
    const user = requireAuth(token)
    if (!rows.length) return { success: false, error: 'No rows to import.' }

    const { month, year } = meta
    if (!month || !year) return { success: false, error: 'Month and year required for target upload.' }

    try {
      transaction(db, () => {
        for (const r of rows) {
          // Latest upload wins: replace existing target for same salesman+month
          prepare(db, `DELETE FROM targets WHERE salesman_id = ? AND year = ? AND month = ?`).run(r.salesmanId, r.year, r.month)
          prepare(db, `
            INSERT INTO targets (salesman_id, branch_id, year, month, jewelry_weight_g, bar_weight_g, quantity)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(r.salesmanId, r.branchId, r.year, r.month, r.jewelryWeightG, r.barWeightG, r.quantity)
        }
      })

      prepare(db, `
        INSERT INTO upload_logs (branch_id, user_id, upload_type, filename, records_count, month, year, status, notes)
        VALUES (?, ?, 'target', ?, ?, ?, ?, 'success', ?)
      `).run(meta.branchId, user.id, meta.filename, rows.length, month, year, meta.notes ?? null)

      return { success: true, count: rows.length }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      prepare(db, `
        INSERT INTO upload_logs (branch_id, user_id, upload_type, filename, records_count, month, year, status, notes)
        VALUES (?, ?, 'target', ?, 0, ?, ?, 'error', ?)
      `).run(meta.branchId, user.id, meta.filename, month, year, msg)
      return { success: false, error: msg }
    }
  })

  // ── Get upload history (with filters) ────────────────────────────────
  ipcMain.handle('upload:getLogs', async (_e, token: string, branchId?: number, uploadType?: string, limit = 50) => {
    requireAuth(token)
    let sql = `
      SELECT ul.*, b.name AS branch_name, b.code AS branch_code, u.full_name AS uploaded_by
      FROM upload_logs ul
      JOIN branches b ON b.id = ul.branch_id
      JOIN users u ON u.id = ul.user_id
    `
    const params: (string | number)[] = []
    const conditions: string[] = []
    if (branchId) { conditions.push('ul.branch_id = ?'); params.push(branchId) }
    if (uploadType) { conditions.push('ul.upload_type = ?'); params.push(uploadType) }
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`
    sql += ` ORDER BY ul.uploaded_at DESC LIMIT ?`
    params.push(limit)
    return prepare(db, sql).all(...(params as Parameters<typeof prepare>[1][]))
  })

  // ── Coverage matrix: which branches uploaded what for this month ──────
  ipcMain.handle('upload:getCoverage', async (_e, token: string, year: number, month: number) => {
    requireAuth(token)

    // Branches that have uploaded targets for this month
    const targetUploads = prepare(db, `
      SELECT branch_id, MAX(uploaded_at) AS last_upload, SUM(records_count) AS total_records
      FROM upload_logs
      WHERE upload_type = 'target' AND year = ? AND month = ? AND status = 'success'
      GROUP BY branch_id
    `).all(year, month) as Array<{ branch_id: number; last_upload: string; total_records: number }>

    // Per-branch daily entry coverage (how many distinct dates have entries this month)
    const dailyCoverage = prepare(db, `
      SELECT
        de.branch_id,
        COUNT(DISTINCT de.entry_date) AS days_with_entries,
        MAX(de.updated_at) AS last_entry,
        (SELECT MAX(ul.uploaded_at)
         FROM upload_logs ul
         WHERE ul.branch_id = de.branch_id AND ul.upload_type = 'daily'
           AND CAST(strftime('%Y', ul.date_from) AS INTEGER) = ?
           AND CAST(strftime('%m', ul.date_from) AS INTEGER) = ?
           AND ul.status = 'success'
        ) AS last_daily_upload
      FROM daily_entries de
      WHERE CAST(strftime('%Y', de.entry_date) AS INTEGER) = ?
        AND CAST(strftime('%m', de.entry_date) AS INTEGER) = ?
      GROUP BY de.branch_id
    `).all(year, month, year, month) as Array<{
      branch_id: number; days_with_entries: number; last_entry: string; last_daily_upload: string | null
    }>

    // All branches
    const branches = prepare(db, `SELECT * FROM branches ORDER BY id`).all() as Array<{ id: number; name: string; code: string }>

    const daysInMonth = new Date(year, month, 0).getDate()

    return branches.map(b => {
      const target = targetUploads.find(t => t.branch_id === b.id)
      const daily  = dailyCoverage.find(d => d.branch_id === b.id)
      return {
        branch_id:       b.id,
        branch_name:     b.name,
        branch_code:     b.code,
        target_uploaded: !!target,
        target_last_upload: target?.last_upload ?? null,
        target_records:  target?.total_records ?? 0,
        days_with_entries: daily?.days_with_entries ?? 0,
        days_in_month:   daysInMonth,
        last_entry:      daily?.last_entry ?? null,
        last_daily_upload: daily?.last_daily_upload ?? null,
      }
    })
  })

  // ── Get salesmen list for template generation (with supervisor info) ──
  ipcMain.handle('upload:getSalesmenForTemplate', async (_e, token: string, branchId: number) => {
    requireAuth(token)
    return prepare(db, `
      SELECT s.id, s.full_name, s.nickname, s.branch_id, b.code AS branch_code,
             sv.id   AS supervisor_id,
             sv.full_name AS supervisor_name
      FROM salesmen s
      JOIN branches b ON b.id = s.branch_id
      LEFT JOIN supervisors sv ON sv.id = s.supervisor_id
      WHERE s.branch_id = ? AND s.active = 1
      ORDER BY sv.full_name NULLS LAST, s.full_name
    `).all(branchId)
  })
}
