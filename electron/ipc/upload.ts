import { IpcMain } from 'electron'
import { getDb } from '../db/connection'
import { prepare, transaction } from '../db/query'
import { requireAuth, requireAdmin, logAudit } from './auth'
import { pushRosterIfConfigured, syncEntriesToCloudIfConfigured } from './sheets'
import { snapshotSalesman, snapshotSupervisor, publishMonth, publishMonthFromDate, getRosterMapAsOf } from '../db/history'

export interface UploadRowResult {
  row: number
  code: string
  date?: string
  status: 'ok' | 'error'
  reason?: string
}

export interface DailyRow {
  date: string           // YYYY-MM-DD
  repCode: string        // unique company rep code
  jewelryWeightG: number
  barWeightG: number
  quantity: number
}

export interface TargetRow {
  repCode: string        // unique company rep code
  year: number
  month: number
  jewelryWeightG: number
  barWeightG: number
  quantity: number
}

export interface RosterRow {
  repCode: string
  fullName: string
  nickname: string
  branchCode: string
  supervisorName: string
  supervisorCode?: string
  staffType?: 'b2c' | 'b2b'
  pointTarget?: number
  yearMonth?: string
  effectiveDate?: string
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

  // ── Process daily upload (rep_code based matching) ────────────────────
  ipcMain.handle('upload:daily', async (_e, token: string, rows: DailyRow[], meta: UploadLogEntry) => {
    const user = requireAuth(token)
    // Admin is intentionally excluded — Sales Upload is Accountant Officer's (branch-scoped)
    // and Accountant Manager's (cross-branch) job per the role spec.
    if (!['accountant_officer', 'accountant_manager'].includes(user.role)) throw new Error('Forbidden')
    if (!rows.length) return { success: false, error: 'No rows to import.' }

    const results: UploadRowResult[] = []
    const errorRows: Array<{ row: number; data: DailyRow; reason: string }> = []
    let imported = 0
    let sumJewelry = 0, sumBar = 0, sumQty = 0

    // Reserve the upload_logs row up front so every inserted entry can be tagged with its
    // id — this is what lets an Accountant Manager later delete exactly this batch to
    // re-open it for resubmission, without touching unrelated entries.
    const logResult = prepare(db, `
      INSERT INTO upload_logs (branch_id, user_id, upload_type, filename, records_count, date_from, date_to, status)
      VALUES (?, ?, 'daily', ?, 0, ?, ?, 'success')
    `).run(meta.branchId, user.id, meta.filename, meta.dateFrom ?? null, meta.dateTo ?? null)
    const logId = Number(logResult.lastInsertRowid)

    try {
      transaction(db, () => {
        const now = new Date().toISOString()
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i]
          const salesman = prepare(db, `SELECT id, branch_id, staff_type FROM salesmen WHERE rep_code = ? AND active = 1`).get(r.repCode) as
            { id: number; branch_id: number; staff_type: string } | undefined
          if (!salesman) {
            results.push({ row: i + 1, code: r.repCode, date: r.date, status: 'error', reason: 'Rep code not found in roster' })
            errorRows.push({ row: i + 1, data: r, reason: 'Rep code not found in roster' })
            continue
          }

          // An Accountant Officer is scoped to their own branch — verify the resolved rep
          // actually belongs to it server-side, don't just trust the role check. Without
          // this, a file containing another branch's rep codes would insert fine.
          if (user.branch_id && salesman.branch_id !== user.branch_id) {
            const reason = 'Rep code belongs to a different branch — you can only upload for your own branch.'
            results.push({ row: i + 1, code: r.repCode, date: r.date, status: 'error', reason })
            errorRows.push({ row: i + 1, data: r, reason })
            continue
          }

          // Sales data is tied to KPI/commission — silently overwriting an existing record
          // would let edits slip through unreviewed. Reject instead; an Accountant Manager
          // must delete the conflicting upload batch before this rep/date can be resubmitted.
          const existing = prepare(db, `SELECT id FROM daily_entries WHERE salesman_id = ? AND entry_date = ?`).get(salesman.id, r.date) as { id: number } | undefined
          if (existing) {
            const reason = 'Existing record for this rep/date — ask an Accountant Manager to clear the conflicting upload batch before re-uploading.'
            results.push({ row: i + 1, code: r.repCode, date: r.date, status: 'error', reason })
            errorRows.push({ row: i + 1, data: r, reason })
            continue
          }

          prepare(db, `
            INSERT INTO daily_entries (salesman_id, branch_id, staff_type, entry_date, jewelry_weight_g, bar_weight_g, quantity, synced, updated_at, upload_log_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
          `).run(salesman.id, salesman.branch_id, salesman.staff_type, r.date, r.jewelryWeightG, r.barWeightG, r.quantity, now, logId)
          results.push({ row: i + 1, code: r.repCode, date: r.date, status: 'ok' })
          sumJewelry += r.jewelryWeightG; sumBar += r.barWeightG; sumQty += r.quantity
          imported++
        }
      })

      const skippedCodes = results.filter(r => r.status === 'error').map(r => r.code)
      prepare(db, `UPDATE upload_logs SET records_count = ?, notes = ? WHERE id = ?`)
        .run(imported, skippedCodes.length ? `Skipped: ${skippedCodes.slice(0,5).join(', ')}${skippedCodes.length > 5 ? '…' : ''}` : null, logId)

      logAudit(db, user.id, user.username, user.role, 'sales_upload_submitted',
        `${meta.filename}: ${imported} imported, ${skippedCodes.length} rejected`, 'upload_log', String(logId), meta.branchId)

      // Completed records are saved locally above; auto-publish them to the cloud now
      syncEntriesToCloudIfConfigured(db).catch(() => {})
      return {
        success: true, count: imported, skipped: skippedCodes.length, results, errorRows,
        summary: {
          totalRecords: rows.length, totalJewelry: sumJewelry, totalBar: sumBar, totalQty: sumQty,
          totalWeight: sumJewelry + sumBar, complete: imported, errors: errorRows.length,
        },
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      prepare(db, `UPDATE upload_logs SET status = 'error', notes = ? WHERE id = ?`).run(msg, logId)
      return { success: false, error: msg }
    }
  })

  // ── Accountant Manager: list daily upload batches awaiting/eligible for clearing ──
  ipcMain.handle('upload:getDailyBatches', async (_e, token: string, branchId?: number) => {
    const user = requireAuth(token)
    if (!['accountant_manager', 'admin'].includes(user.role)) throw new Error('Forbidden')
    let sql = `
      SELECT ul.id, ul.branch_id, b.name AS branch_name, b.code AS branch_code,
             ul.user_id, u.full_name AS uploaded_by, ul.filename, ul.records_count,
             ul.date_from, ul.date_to, ul.status, ul.notes, ul.uploaded_at,
             (SELECT COUNT(*) FROM daily_entries de WHERE de.upload_log_id = ul.id) AS active_entries
      FROM upload_logs ul
      JOIN branches b ON b.id = ul.branch_id
      JOIN users u ON u.id = ul.user_id
      WHERE ul.upload_type = 'daily'
    `
    const params: number[] = []
    if (branchId) { sql += ` AND ul.branch_id = ?`; params.push(branchId) }
    sql += ` ORDER BY ul.uploaded_at DESC LIMIT 200`
    return prepare(db, sql).all(...params)
  })

  // ── Accountant Manager: delete a daily upload batch, freeing those rep/dates for resubmission ──
  ipcMain.handle('upload:deleteDailyBatch', async (_e, token: string, uploadLogId: number) => {
    const user = requireAuth(token)
    if (!['accountant_manager', 'admin'].includes(user.role)) throw new Error('Forbidden')

    const batch = prepare(db, `SELECT id, branch_id, filename FROM upload_logs WHERE id = ? AND upload_type = 'daily'`).get(uploadLogId) as
      { id: number; branch_id: number; filename: string } | undefined
    if (!batch) return { success: false, error: 'Upload batch not found.' }

    const deleted = prepare(db, `DELETE FROM daily_entries WHERE upload_log_id = ?`).run(uploadLogId)
    logAudit(db, user.id, user.username, user.role, 'sales_upload_deleted',
      `Cleared "${batch.filename}" (${deleted.changes ?? 0} entries) — open for resubmission`, 'upload_log', String(uploadLogId), batch.branch_id)
    syncEntriesToCloudIfConfigured(db).catch(() => {})
    return { success: true, deletedEntries: deleted.changes ?? 0 }
  })

  // ── Accountant Manager: preview/delete daily entries for one branch + a specific date
  // range — independent of which upload batch they came from. A single upload often spans
  // many dates/months at once (e.g. a "fix everything since May" file), so deleting by
  // upload_log_id alone can't reopen just one bad day without also wiping every other date
  // that happened to be in the same file.
  ipcMain.handle('upload:countDailyEntriesByDate', async (_e, token: string, branchId: number, dateFrom: string, dateTo: string) => {
    const user = requireAuth(token)
    if (!['accountant_manager', 'admin'].includes(user.role)) throw new Error('Forbidden')
    const row = prepare(db, `SELECT COUNT(*) AS cnt FROM daily_entries WHERE branch_id = ? AND entry_date >= ? AND entry_date <= ?`)
      .get(branchId, dateFrom, dateTo) as { cnt: number }
    return row.cnt
  })

  ipcMain.handle('upload:deleteDailyEntriesByDate', async (_e, token: string, branchId: number, dateFrom: string, dateTo: string) => {
    const user = requireAuth(token)
    if (!['accountant_manager', 'admin'].includes(user.role)) throw new Error('Forbidden')
    const branch = prepare(db, `SELECT name FROM branches WHERE id = ?`).get(branchId) as { name: string } | undefined
    if (!branch) return { success: false, error: 'Branch not found.' }

    const deleted = prepare(db, `DELETE FROM daily_entries WHERE branch_id = ? AND entry_date >= ? AND entry_date <= ?`)
      .run(branchId, dateFrom, dateTo)
    const period = dateFrom === dateTo ? dateFrom : `${dateFrom} → ${dateTo}`
    logAudit(db, user.id, user.username, user.role, 'sales_upload_deleted',
      `Cleared ${branch.name} entries for ${period} (${deleted.changes ?? 0} entries) — open for resubmission`,
      'daily_entries', `${branchId}:${dateFrom}..${dateTo}`, branchId)
    syncEntriesToCloudIfConfigured(db).catch(() => {})
    return { success: true, deletedEntries: deleted.changes ?? 0 }
  })

  // ── Process target upload (rep_code based) ───────────────────────────
  ipcMain.handle('upload:targets', async (_e, token: string, rows: TargetRow[], meta: UploadLogEntry) => {
    const user = requireAuth(token)
    if (!rows.length) return { success: false, error: 'No rows to import.' }

    const { month, year } = meta
    if (!month || !year) return { success: false, error: 'Month and year required for target upload.' }

    const skipped: string[] = []
    let imported = 0

    try {
      transaction(db, () => {
        for (const r of rows) {
          const salesman = prepare(db, `SELECT id, branch_id FROM salesmen WHERE rep_code = ? AND active = 1`).get(r.repCode) as
            { id: number; branch_id: number } | undefined
          if (!salesman) { skipped.push(r.repCode); continue }

          prepare(db, `DELETE FROM targets WHERE salesman_id = ? AND year = ? AND month = ?`).run(salesman.id, r.year, r.month)
          prepare(db, `
            INSERT INTO targets (salesman_id, branch_id, year, month, jewelry_weight_g, bar_weight_g, quantity)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(salesman.id, salesman.branch_id, r.year, r.month, r.jewelryWeightG, r.barWeightG, r.quantity)
          imported++
        }
      })

      prepare(db, `
        INSERT INTO upload_logs (branch_id, user_id, upload_type, filename, records_count, month, year, status, notes)
        VALUES (?, ?, 'target', ?, ?, ?, ?, 'success', ?)
      `).run(meta.branchId, user.id, meta.filename, imported, month, year,
        skipped.length ? `Skipped unknown codes: ${skipped.slice(0,5).join(', ')}` : null)

      return { success: true, count: imported, skipped: skipped.length }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      prepare(db, `INSERT INTO upload_logs (branch_id, user_id, upload_type, filename, records_count, month, year, status, notes) VALUES (?, ?, 'target', ?, 0, ?, ?, 'error', ?)`).run(meta.branchId, user.id, meta.filename, month, year, msg)
      return { success: false, error: msg }
    }
  })

  // ── Roster upload: upsert salesmen by rep_code (admin + HR) ──────────
  ipcMain.handle('upload:roster', async (_e, token: string, rows: RosterRow[]) => {
    const u = requireAuth(token)
    if (!['admin', 'hr', 'hr_support'].includes(u.role)) throw new Error('Forbidden')
    if (!rows.length) return { success: false, error: 'No rows to import.' }

    let created = 0; let updated = 0; const skipped: string[] = []

    try {
      transaction(db, () => {
        for (const r of rows) {
          if (!r.repCode || !r.fullName || !r.branchCode) { skipped.push(r.repCode || '?'); continue }

          const branch = prepare(db, `SELECT id FROM branches WHERE code = ?`).get(r.branchCode) as { id: number } | undefined
          if (!branch) { skipped.push(`${r.repCode}(bad branch:${r.branchCode})`); continue }

          const staffType = r.staffType === 'b2b' ? 'b2b' : 'b2c'

          // Resolve supervisor — sup_code first (stable, unique, unlike a name), fall back
          // to name/nickname match for files that don't carry a code yet. If the roster
          // names a supervisor that doesn't exist locally yet, create it from the roster
          // row itself — supervisors were previously only ever creatable by hand via Team
          // Performance, so a roster naming a real supervisor that nobody had separately
          // set up silently dropped the link (rep saved fine, supervisor_id stayed NULL).
          let supId: number | null = null
          if (r.supervisorCode) {
            const sup = prepare(db, `SELECT id FROM supervisors WHERE sup_code = ?`).get(r.supervisorCode) as { id: number } | undefined
            supId = sup?.id ?? null
          }
          if (!supId && r.supervisorName) {
            const sup = prepare(db, `SELECT id FROM supervisors WHERE branch_id = ? AND (full_name = ? OR nickname = ?)`).get(branch.id, r.supervisorName, r.supervisorName) as { id: number } | undefined
            supId = sup?.id ?? null
          }
          if (!supId && r.supervisorName) {
            const ins = prepare(db, `INSERT INTO supervisors (full_name, nickname, branch_id, staff_type, active, sup_code) VALUES (?,?,?,?,1,?)`)
              .run(r.supervisorName, '', branch.id, staffType, r.supervisorCode ?? null)
            supId = Number(ins.lastInsertRowid)
          }

          const existing = prepare(db, `SELECT id FROM salesmen WHERE rep_code = ?`).get(r.repCode) as { id: number } | undefined
          let salesmanId: number
          if (existing) {
            prepare(db, `UPDATE salesmen SET full_name=?, nickname=?, branch_id=?, supervisor_id=?, staff_type=?, active=1 WHERE rep_code=?`)
              .run(r.fullName, r.nickname || '', branch.id, supId, staffType, r.repCode)
            salesmanId = existing.id
            updated++
          } else {
            const ins = prepare(db, `INSERT INTO salesmen (rep_code, full_name, nickname, branch_id, staff_type, position, department, active, supervisor_id) VALUES (?,?,?,?,?,'Sales Representative','Sales',1,?)`)
              .run(r.repCode, r.fullName, r.nickname || '', branch.id, staffType, supId)
            salesmanId = Number(ins.lastInsertRowid)
            created++
          }
          // KPI point target is always resolved from HR KPI Setting — roster upload no longer carries per-rep targets
          snapshotSalesman(db, salesmanId, r.effectiveDate)
          if (supId) snapshotSupervisor(db, supId, r.effectiveDate)
          if (r.effectiveDate) publishMonthFromDate(db, r.effectiveDate)
          else { const n = new Date(); publishMonth(db, n.getFullYear(), n.getMonth() + 1) }
        }
      })
      pushRosterIfConfigured(db).catch(() => {})
      logAudit(db, u.id, u.username, u.role, 'roster_bulk_upload',
        `${rows.length} rows — ${created} created, ${updated} updated${skipped.length ? `, ${skipped.length} skipped` : ''}`, 'roster_upload')
      return { success: true, created, updated, skipped: skipped.length, skippedCodes: skipped }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── Download roster template (existing salesmen pre-filled) ──────────
  ipcMain.handle('upload:getRosterTemplate', async (_e, token: string) => {
    requireAuth(token)
    return prepare(db, `
      SELECT s.rep_code, s.full_name, s.nickname, b.code AS branch_code,
        sv.full_name AS supervisor_name, sv.sup_code AS supervisor_code, s.staff_type,
        smt.point_target, smt.year_month
      FROM salesmen s
      JOIN branches b ON b.id = s.branch_id
      LEFT JOIN supervisors sv ON sv.id = s.supervisor_id
      LEFT JOIN staff_monthly_targets smt ON smt.salesman_id = s.id
        AND smt.year_month = (
          SELECT MAX(year_month) FROM staff_monthly_targets WHERE salesman_id = s.id
        )
      WHERE s.active = 1
      ORDER BY b.code, sv.full_name NULLS LAST, s.full_name
    `).all()
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
  // branchId null/undefined = all branches (Accountant Manager's export). Resolves against
  // the roster AS OF the current month, not the live salesmen table — a rep who transferred
  // branches or deactivated mid-month should reflect what was true for the month being
  // filled in, same as every other roster-aware calculation in the app.
  ipcMain.handle('upload:getSalesmenForTemplate', async (_e, token: string, branchId: number | null) => {
    requireAuth(token)
    const now = new Date()
    const rosterMap = getRosterMapAsOf(db, now.getFullYear(), now.getMonth() + 1)
    const salesmen = prepare(db, `SELECT id, rep_code, full_name, nickname FROM salesmen`).all() as
      Array<{ id: number; rep_code: string; full_name: string; nickname: string }>
    const branchRows = prepare(db, `SELECT id, code FROM branches`).all() as Array<{ id: number; code: string }>
    const branchCodeById = new Map(branchRows.map(b => [b.id, b.code]))
    const supRows = prepare(db, `SELECT id, full_name FROM supervisors`).all() as Array<{ id: number; full_name: string }>
    const supNameById = new Map(supRows.map(s => [s.id, s.full_name]))

    const rows = []
    for (const s of salesmen) {
      const roster = rosterMap.get(s.id)
      if (!roster || !roster.active) continue
      if (branchId != null && roster.branch_id !== branchId) continue
      rows.push({
        id: s.id, rep_code: s.rep_code, full_name: s.full_name, nickname: s.nickname,
        branch_id: roster.branch_id, branch_code: branchCodeById.get(roster.branch_id) ?? '',
        supervisor_id: roster.supervisor_id,
        supervisor_name: roster.supervisor_id ? (supNameById.get(roster.supervisor_id) ?? null) : null,
      })
    }
    rows.sort((a, b) => (a.supervisor_name ?? '￿').localeCompare(b.supervisor_name ?? '￿') || a.full_name.localeCompare(b.full_name))
    return rows
  })

  // ── 7-day per-rep upload status grid ────────────────────────────────
  ipcMain.handle('upload:getRepUploadStatus', async (_e, token: string, branchIds?: number[], days = 7) => {
    const user = requireAuth(token)

    // Compute last N dates in JS (SQLite recursive CTE not needed)
    const dates: string[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      dates.push(d.toISOString().slice(0, 10))
    }

    // Scope branches by role
    let scopedBranchIds = branchIds
    if (user.role === 'sales_sup') {
      const sup = prepare(db, `SELECT id, branch_id FROM supervisors WHERE user_id = ?`).get(user.id) as { id: number; branch_id: number } | undefined
      if (sup) {
        // sales_sup sees only their team members
        const teamIds = prepare(db, `SELECT id FROM salesmen WHERE supervisor_id = ? AND active = 1`).all(sup.id) as { id: number }[]
        if (!teamIds.length) return { dates, branches: [] }

        const placeholders = teamIds.map(() => '?').join(',')
        const reps = prepare(db, `
          SELECT s.id, s.rep_code, s.full_name, s.nickname, s.staff_type,
                 b.id AS branch_id, b.name AS branch_name, b.code AS branch_code,
                 sv.full_name AS supervisor_name
          FROM salesmen s
          JOIN branches b ON b.id = s.branch_id
          LEFT JOIN supervisors sv ON sv.id = s.supervisor_id
          WHERE s.id IN (${placeholders}) AND s.active = 1
          ORDER BY b.id, s.full_name
        `).all(...teamIds.map(t => t.id)) as Array<{ id: number; rep_code: string; full_name: string; nickname: string; staff_type: string; branch_id: number; branch_name: string; branch_code: string; supervisor_name: string | null }>

        return buildGrid(db, reps, dates)
      }
      return { dates, branches: [] }
    }

    // Build WHERE clause for branches
    let repSql = `
      SELECT s.id, s.rep_code, s.full_name, s.nickname, s.staff_type,
             b.id AS branch_id, b.name AS branch_name, b.code AS branch_code,
             sv.full_name AS supervisor_name
      FROM salesmen s
      JOIN branches b ON b.id = s.branch_id
      LEFT JOIN supervisors sv ON sv.id = s.supervisor_id
      WHERE s.active = 1
    `
    const repParams: number[] = []
    if (scopedBranchIds && scopedBranchIds.length > 0) {
      repSql += ` AND s.branch_id IN (${scopedBranchIds.map(() => '?').join(',')})`
      repParams.push(...scopedBranchIds)
    }
    repSql += ` ORDER BY b.id, s.full_name`

    const reps = prepare(db, repSql).all(...repParams) as Array<{ id: number; rep_code: string; full_name: string; nickname: string; staff_type: string; branch_id: number; branch_name: string; branch_code: string; supervisor_name: string | null }>
    return buildGrid(db, reps, dates)
  })
}

function buildGrid(db: ReturnType<typeof import('../db/connection').getDb>, reps: Array<{ id: number; rep_code: string; full_name: string; nickname: string; staff_type: string; branch_id: number; branch_name: string; branch_code: string; supervisor_name: string | null }>, dates: string[]) {
  if (!reps.length) return { dates, branches: [] }

  const dateFrom = dates[0]; const dateTo = dates[dates.length - 1]
  const repIds = reps.map(r => r.id)
  const entries = prepare(db, `
    SELECT salesman_id, entry_date FROM daily_entries
    WHERE salesman_id IN (${repIds.map(() => '?').join(',')})
      AND entry_date >= ? AND entry_date <= ?
  `).all(...repIds, dateFrom, dateTo) as Array<{ salesman_id: number; entry_date: string }>

  const entrySet = new Set(entries.map(e => `${e.salesman_id}:${e.entry_date}`))

  // Group by branch
  const branchMap = new Map<number, { branch_id: number; branch_name: string; branch_code: string; reps: unknown[] }>()
  for (const rep of reps) {
    if (!branchMap.has(rep.branch_id)) {
      branchMap.set(rep.branch_id, { branch_id: rep.branch_id, branch_name: rep.branch_name, branch_code: rep.branch_code, reps: [] })
    }
    branchMap.get(rep.branch_id)!.reps.push({
      id: rep.id,
      rep_code: rep.rep_code,
      full_name: rep.full_name,
      nickname: rep.nickname,
      staff_type: rep.staff_type,
      supervisor_name: rep.supervisor_name,
      days: dates.map(d => entrySet.has(`${rep.id}:${d}`)),
    })
  }

  return { dates, branches: Array.from(branchMap.values()) }
}
