import { IpcMain, dialog } from 'electron'
import { google } from 'googleapis'
import { readFileSync, existsSync } from 'fs'
import { getDb } from '../db/connection'
import { prepare } from '../db/query'
import { requireAuth } from './auth'
import type { Database } from 'sql.js'

// ── Tab name registry ─────────────────────────────────────────────────────────
const TABS = {
  ENTRIES:         'Entries',
  SETTINGS:        'Settings',
  BRANCHES:        'Branches',
  KPI_RATES:       'KPIRates',
  QTY_TIERS:       'QtyTiers',
  ROSTER:          'Roster',
  COMMISSION:      'CommissionConfig',
  USERS:           'Users',
  SUPERVISORS:     'Supervisors',
  MONTHLY_TARGETS: 'MonthlyBranchTargets',
} as const

const SHEET_HEADERS = ['Date', 'Branch', 'Rep Code', 'Salesman Name', 'Jewelry (Baht)', 'Bar (Baht)', 'Qty']

// ── Auth helpers ──────────────────────────────────────────────────────────────
export function getServiceAuth(serviceAccountPath: string) {
  if (!existsSync(serviceAccountPath)) throw new Error(`Service account file not found: ${serviceAccountPath}`)
  const key = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))
  return new google.auth.GoogleAuth({ credentials: key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
}

export function getSetting(key: string): string {
  const row = prepare(getDb(), `SELECT value FROM app_settings WHERE key = ?`).get(key) as { value: string } | undefined
  return row?.value ?? ''
}

// ── Tab write helper: create if missing, clear, rewrite ───────────────────────
async function writeTab(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  tabName: string,
  headers: string[],
  rows: (string | number | null)[][]
): Promise<void> {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
  }).catch(() => { /* tab already exists */ })
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${tabName}!A:Z` })
  await sheets.spreadsheets.values.update({
    spreadsheetId, range: `${tabName}!A1`, valueInputOption: 'USER_ENTERED',
    requestBody: { values: [headers, ...rows] },
  })
}

// ── Individual push functions ─────────────────────────────────────────────────

async function pushSettings(db: Database, sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<void> {
  const appRows = (prepare(db, `SELECT key, value FROM app_settings WHERE key IN ('sup_kpi_pct','kpi_total_base','kpi_total_weight') ORDER BY key`).all() as Array<{ key: string; value: string }>)
    .map(r => [r.key, r.value])
  const metricRows = (prepare(db, `SELECT id, points_per_unit FROM kpi_metrics WHERE id IN (1, 2, 3)`).all() as Array<{ id: number; points_per_unit: number }>)
    .map(r => {
      const key = r.id === 1 ? 'jewelry_pts_per_unit' : r.id === 2 ? 'bar_pts_per_unit' : 'qty_pts_per_unit'
      return [key, String(r.points_per_unit)]
    })
  await writeTab(sheets, spreadsheetId, TABS.SETTINGS, ['key', 'value'], [...appRows, ...metricRows])
}

async function pushBranches(db: Database, sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<void> {
  const rows = (prepare(db, `SELECT code, name, kpi_point_target FROM branches ORDER BY id`).all() as Array<{ code: string; name: string; kpi_point_target: number }>)
    .map(r => [r.code, r.name, r.kpi_point_target])
  await writeTab(sheets, spreadsheetId, TABS.BRANCHES, ['code', 'name', 'kpi_point_target'], rows)
}

async function pushKpiRates(db: Database, sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<void> {
  const rows = (prepare(db, `SELECT metric_id, staff_type, points_per_unit FROM kpi_metric_type_rates ORDER BY metric_id, staff_type`).all() as Array<{ metric_id: number; staff_type: string; points_per_unit: number }>)
    .map(r => [r.metric_id, r.staff_type, r.points_per_unit])
  await writeTab(sheets, spreadsheetId, TABS.KPI_RATES, ['metric_id', 'staff_type', 'points_per_unit'], rows)
}

async function pushQtyTiers(db: Database, sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<void> {
  const rows = (prepare(db, `
    SELECT COALESCE(b.code, 'Global') AS branch_code, t.threshold_pct, t.score, t.tier_order
    FROM kpi_tiers t
    JOIN kpi_tier_configs c ON c.id = t.config_id
    LEFT JOIN branches b ON b.id = c.branch_id
    WHERE c.metric_id = 3 AND c.is_active = 1
    ORDER BY COALESCE(b.code, 'Global'), t.tier_order
  `).all() as Array<{ branch_code: string; threshold_pct: number; score: number; tier_order: number }>)
    .map(r => [r.branch_code, r.threshold_pct, r.score, r.tier_order])
  await writeTab(sheets, spreadsheetId, TABS.QTY_TIERS, ['branch_code', 'threshold', 'multiplier', 'tier_order'], rows)
}

async function pushRoster(db: Database, sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<void> {
  const rows = (prepare(db, `
    SELECT s.rep_code, s.full_name, s.nickname, b.code AS branch_code,
           sup.full_name AS supervisor_name, s.staff_type,
           smt.year_month, smt.point_target
    FROM salesmen s
    JOIN branches b ON b.id = s.branch_id
    LEFT JOIN supervisors sup ON sup.id = s.supervisor_id
    LEFT JOIN staff_monthly_targets smt ON smt.salesman_id = s.id
      AND smt.year_month = (
        SELECT MAX(year_month) FROM staff_monthly_targets WHERE salesman_id = s.id
      )
    WHERE s.active = 1
    ORDER BY b.code, s.rep_code
  `).all() as Array<{ rep_code: string; full_name: string; nickname: string | null; branch_code: string; supervisor_name: string | null; staff_type: string; year_month: string | null; point_target: number | null }>)
    .map(r => [r.rep_code, r.full_name, r.nickname ?? '', r.branch_code, r.supervisor_name ?? '', r.staff_type, r.year_month ?? '', r.point_target ?? ''])
  await writeTab(sheets, spreadsheetId, TABS.ROSTER, ['rep_code', 'full_name', 'nickname', 'branch_code', 'supervisor_name', 'staff_type', 'year_month', 'point_target'], rows)
}

async function pushCommission(db: Database, sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<void> {
  const rows = (prepare(db, `SELECT staff_type, year_month, jewelry_rate_lak, bar_rate_lak, qty_rate_lak FROM commission_configs ORDER BY year_month, staff_type`).all() as Array<{ staff_type: string; year_month: string; jewelry_rate_lak: number; bar_rate_lak: number; qty_rate_lak: number }>)
    .map(r => [r.staff_type, r.year_month, r.jewelry_rate_lak, r.bar_rate_lak, r.qty_rate_lak])
  await writeTab(sheets, spreadsheetId, TABS.COMMISSION, ['Staff_Type', 'Year_Month', 'Jewelry_Rate_LAK', 'Bar_Rate_LAK', 'Qty_Rate_LAK'], rows)
}

async function pushUsers(db: Database, sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<void> {
  // NOTE: password_hash is bcrypt — one-way hash, safe to store in Sheets.
  // Required for multi-device login sync: new device pulls Sheets and gets all user accounts.
  const rows = (prepare(db, `
    SELECT u.username, u.full_name, u.role, b.code AS branch_code,
           sv.full_name AS supervisor_name, u.active, u.password_hash
    FROM users u
    LEFT JOIN branches b ON b.id = u.branch_id
    LEFT JOIN supervisors sv ON sv.id = u.supervisor_id
    ORDER BY u.role, u.username
  `).all() as Array<{ username: string; full_name: string; role: string; branch_code: string | null; supervisor_name: string | null; active: number; password_hash: string }>)
    .map(r => [r.username, r.full_name, r.role, r.branch_code ?? '', r.supervisor_name ?? '', r.active, r.password_hash])
  await writeTab(sheets, spreadsheetId, TABS.USERS, ['username', 'full_name', 'role', 'branch_code', 'supervisor_name', 'active', 'password_hash'], rows)
}

async function pushSupervisors(db: Database, sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<void> {
  const rows = (prepare(db, `
    SELECT sv.full_name, sv.nickname, b.code AS branch_code, sv.staff_type, sv.active
    FROM supervisors sv
    JOIN branches b ON b.id = sv.branch_id
    ORDER BY b.code, sv.full_name
  `).all() as Array<{ full_name: string; nickname: string; branch_code: string; staff_type: string; active: number }>)
    .map(r => [r.full_name, r.nickname, r.branch_code, r.staff_type, r.active])
  await writeTab(sheets, spreadsheetId, TABS.SUPERVISORS, ['full_name', 'nickname', 'branch_code', 'staff_type', 'active'], rows)
}

async function pushMonthlyBranchTargets(db: Database, sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<void> {
  const rows = (prepare(db, `
    SELECT b.code AS branch_code, t.year, t.month, t.kpi_point_target
    FROM branch_kpi_monthly_targets t
    JOIN branches b ON b.id = t.branch_id
    ORDER BY t.year, t.month, b.code
  `).all() as Array<{ branch_code: string; year: number; month: number; kpi_point_target: number }>)
    .map(r => [r.branch_code, r.year, r.month, r.kpi_point_target])
  await writeTab(sheets, spreadsheetId, TABS.MONTHLY_TARGETS, ['branch_code', 'year', 'month', 'kpi_point_target'], rows)
}

// ── Push all unsynced daily entries — exported for use in entries.ts, upload.ts ─
export async function syncEntriesToCloudIfConfigured(db: Database): Promise<void> {
  const sheetsId = getSetting('sheets_id')
  const saPath   = getSetting('service_account_path')
  if (!sheetsId || !saPath) return
  try {
    const auth   = getServiceAuth(saPath)
    const sheets = google.sheets({ version: 'v4', auth })

    const unsynced = prepare(db, `
      SELECT de.*, s.rep_code, s.full_name, b.code AS branch_code
      FROM daily_entries de JOIN salesmen s ON s.id=de.salesman_id JOIN branches b ON b.id=de.branch_id
      WHERE de.synced=0 ORDER BY de.entry_date, de.branch_id
    `).all() as Array<{ id: number; rep_code: string | null; full_name: string; branch_code: string; entry_date: string; jewelry_weight_g: number; bar_weight_g: number; quantity: number }>

    if (!unsynced.length) return

    const headerCheck = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'Entries!A1' }).catch(() => null)
    if (!headerCheck?.data?.values?.[0]?.[0]) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId: sheetsId, requestBody: { requests: [{ addSheet: { properties: { title: TABS.ENTRIES } } }] } }).catch(() => {})
      await sheets.spreadsheets.values.update({ spreadsheetId: sheetsId, range: 'Entries!A1', valueInputOption: 'USER_ENTERED', requestBody: { values: [SHEET_HEADERS] } })
    }
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetsId, range: 'Entries!A:G', valueInputOption: 'USER_ENTERED',
      requestBody: { values: unsynced.map(e => [e.entry_date, e.branch_code, e.rep_code ?? '', e.full_name, e.jewelry_weight_g, e.bar_weight_g, e.quantity]) },
    })
    const now = new Date().toISOString()
    unsynced.forEach(e => prepare(db, `UPDATE daily_entries SET synced=1 WHERE id=?`).run(e.id))
    prepare(db, `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('last_synced_at', ?)`).run(now)
    prepare(db, `INSERT INTO sync_logs (direction, records_count, status) VALUES ('push', ?, 'success')`).run(unsynced.length)
  } catch { /* Sheets unavailable — silently skip */ }
}

// ── Push only the Roster tab — exported for roster.ts ────────────────────────
export async function pushRosterIfConfigured(db: Database): Promise<void> {
  const sheetsId = getSetting('sheets_id')
  const saPath   = getSetting('service_account_path')
  if (!sheetsId || !saPath) return
  try {
    const auth   = getServiceAuth(saPath)
    const sheets = google.sheets({ version: 'v4', auth })
    await pushRoster(db, sheets, sheetsId)
  } catch { /* Sheets unavailable — silently skip */ }
}

// ── Push only the Users tab — exported for auth.ts ───────────────────────────
export async function pushUsersIfConfigured(db: Database): Promise<void> {
  const sheetsId = getSetting('sheets_id')
  const saPath   = getSetting('service_account_path')
  if (!sheetsId || !saPath) return
  try {
    const auth   = getServiceAuth(saPath)
    const sheets = google.sheets({ version: 'v4', auth })
    await pushUsers(db, sheets, sheetsId)
  } catch { /* Sheets unavailable — silently skip */ }
}

// ── Push only the Supervisors tab — exported for entries.ts ─────────────────
export async function pushSupervisorsIfConfigured(db: Database): Promise<void> {
  const sheetsId = getSetting('sheets_id')
  const saPath   = getSetting('service_account_path')
  if (!sheetsId || !saPath) return
  try {
    const auth   = getServiceAuth(saPath)
    const sheets = google.sheets({ version: 'v4', auth })
    await pushSupervisors(db, sheets, sheetsId)
  } catch { /* Sheets unavailable — silently skip */ }
}

// ── Push only the MonthlyBranchTargets tab — exported for kpi.ts ────────────
export async function pushMonthlyTargetsIfConfigured(db: Database): Promise<void> {
  const sheetsId = getSetting('sheets_id')
  const saPath   = getSetting('service_account_path')
  if (!sheetsId || !saPath) return
  try {
    const auth   = getServiceAuth(saPath)
    const sheets = google.sheets({ version: 'v4', auth })
    await pushMonthlyBranchTargets(db, sheets, sheetsId)
  } catch { /* Sheets unavailable — silently skip */ }
}

// ── Push all config tabs — exported for use in kpi.ts, upload.ts ──────────────
export async function pushAllConfigIfConfigured(db: Database): Promise<void> {
  const sheetsId = getSetting('sheets_id')
  const saPath   = getSetting('service_account_path')
  if (!sheetsId || !saPath) return
  try {
    const auth   = getServiceAuth(saPath)
    const sheets = google.sheets({ version: 'v4', auth })
    await Promise.all([
      pushSettings(db, sheets, sheetsId),
      pushBranches(db, sheets, sheetsId),
      pushKpiRates(db, sheets, sheetsId),
      pushQtyTiers(db, sheets, sheetsId),
      pushRoster(db, sheets, sheetsId),
      pushCommission(db, sheets, sheetsId),
      pushUsers(db, sheets, sheetsId),
      pushSupervisors(db, sheets, sheetsId),
      pushMonthlyBranchTargets(db, sheets, sheetsId),
    ])
  } catch { /* Sheets unavailable — silently skip */ }
}

// ── Pull all config + entries from Sheets (standalone, callable from main.ts) ─
export async function pullAllFromCloud(sheetsId: string, saPath: string): Promise<{
  success: boolean
  counts: { entries: number; configs: number; settings: number; branches: number; kpiRates: number; roster: number; qtyTiers: number }
  error?: string
}> {
  const counts = { entries: 0, configs: 0, settings: 0, branches: 0, kpiRates: 0, roster: 0, qtyTiers: 0, users: 0, supervisors: 0, monthlyTargets: 0 }
  try {
    const auth   = getServiceAuth(saPath)
    const sheets = google.sheets({ version: 'v4', auth })
    const db     = getDb()
    const now    = new Date().toISOString()

    // Keys NOT overwritten from Sheets (device-local only)
    const SKIP_KEYS = new Set(['sheets_id', 'service_account_path', 'last_synced_at'])

    // ── Settings ───────────────────────────────────────────────────────
    const settRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'Settings!A:B' }).catch(() => null)
    if (settRes) {
      const all = settRes.data.values ?? []
      const data = all.length > 0 && String(all[0][0]).toLowerCase() === 'key' ? all.slice(1) : all
      for (const row of data) {
        const [key, value] = row as string[]
        if (!key || SKIP_KEYS.has(key)) continue
        prepare(db, `INSERT OR REPLACE INTO app_settings (key, value) VALUES (?,?)`).run(key, value ?? '')
        counts.settings++
      }
    }

    // ── Branches ──────────────────────────────────────────────────────
    const brRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'Branches!A:C' }).catch(() => null)
    if (brRes) {
      const all = brRes.data.values ?? []
      const data = all.length > 0 && String(all[0][0]).toLowerCase() === 'code' ? all.slice(1) : all
      for (const row of data) {
        const [code, , targetStr] = row as string[]
        if (!code) continue
        const target = parseFloat(targetStr)
        if (isNaN(target)) continue
        prepare(db, `UPDATE branches SET kpi_point_target = ? WHERE code = ?`).run(target, code)
        counts.branches++
      }
    }

    // ── KPI Rates ─────────────────────────────────────────────────────
    const rateRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'KPIRates!A:C' }).catch(() => null)
    if (rateRes) {
      const all = rateRes.data.values ?? []
      const data = all.length > 0 && String(all[0][0]).toLowerCase() === 'metric_id' ? all.slice(1) : all
      for (const row of data) {
        const [metricIdStr, staffType, ppuStr] = row as string[]
        const metricId = parseInt(metricIdStr)
        const ppu = parseFloat(ppuStr)
        if (!metricId || !staffType || isNaN(ppu)) continue
        prepare(db, `
          INSERT INTO kpi_metric_type_rates (metric_id, staff_type, points_per_unit) VALUES (?,?,?)
          ON CONFLICT(metric_id, staff_type) DO UPDATE SET points_per_unit = excluded.points_per_unit
        `).run(metricId, staffType, ppu)
        counts.kpiRates++
      }
    }

    // ── Qty Tiers (update multiplier only — does not add/remove tiers) ─
    const tierRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'QtyTiers!A:D' }).catch(() => null)
    if (tierRes) {
      const all = tierRes.data.values ?? []
      const data = all.length > 0 && String(all[0][0]).toLowerCase() === 'branch_code' ? all.slice(1) : all
      for (const row of data) {
        const [branchCode, thresholdStr, multiplierStr] = row as string[]
        const threshold  = parseFloat(thresholdStr)
        const multiplier = parseFloat(multiplierStr)
        if (isNaN(threshold) || isNaN(multiplier)) continue
        const branchRow = branchCode && branchCode !== 'Global'
          ? prepare(db, `SELECT id FROM branches WHERE code = ?`).get(branchCode) as { id: number } | undefined
          : undefined
        const configRow = prepare(db, `
          SELECT c.id FROM kpi_tier_configs c
          WHERE c.metric_id = 3 AND c.is_active = 1
            AND (c.branch_id = ? OR c.branch_id IS NULL)
          ORDER BY CASE WHEN c.branch_id IS NULL THEN 1 ELSE 0 END
          LIMIT 1
        `).get(branchRow?.id ?? null) as { id: number } | undefined
        if (!configRow) continue
        prepare(db, `UPDATE kpi_tiers SET score = ? WHERE config_id = ? AND threshold_pct = ?`).run(multiplier, configRow.id, threshold)
        counts.qtyTiers++
      }
    }

    // ── Supervisors (must run before Roster so supervisor links resolve) ─
    const supRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'Supervisors!A:E' }).catch(() => null)
    if (supRes) {
      const all = supRes.data.values ?? []
      const data = all.length > 0 && String(all[0][0]).toLowerCase() === 'full_name' ? all.slice(1) : all
      for (const row of data) {
        const [fullName, nickname, branchCode, staffTypeRaw, activeStr] = row as string[]
        if (!fullName || !branchCode) continue
        const branch = prepare(db, `SELECT id FROM branches WHERE code = ?`).get(branchCode) as { id: number } | undefined
        if (!branch) continue
        const staffType = staffTypeRaw === 'b2b' ? 'b2b' : 'b2c'
        const active = activeStr === '0' ? 0 : 1
        const existing = prepare(db, `SELECT id FROM supervisors WHERE full_name = ? AND branch_id = ?`).get(fullName, branch.id) as { id: number } | undefined
        if (existing) {
          prepare(db, `UPDATE supervisors SET nickname=?, staff_type=?, active=? WHERE id=?`).run(nickname ?? '', staffType, active, existing.id)
        } else {
          prepare(db, `INSERT INTO supervisors (full_name, nickname, branch_id, staff_type, active) VALUES (?,?,?,?,?)`).run(fullName, nickname ?? '', branch.id, staffType, active)
        }
        counts.supervisors++
      }
    }

    // ── Roster ─────────────────────────────────────────────────────────
    const rosterRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'Roster!A:H' }).catch(() => null)
    if (rosterRes) {
      const all = rosterRes.data.values ?? []
      const data = all.length > 0 && String(all[0][0]).toLowerCase() === 'rep_code' ? all.slice(1) : all
      for (const row of data) {
        const [repCode, fullName, nickname, branchCode, supervisorName, staffTypeRaw, yearMonth, ptStr] = row as string[]
        if (!repCode || !fullName || !branchCode) continue
        const branch = prepare(db, `SELECT id FROM branches WHERE code = ?`).get(branchCode) as { id: number } | undefined
        if (!branch) continue
        let supId: number | null = null
        if (supervisorName) {
          const sup = prepare(db, `SELECT id FROM supervisors WHERE branch_id = ? AND (full_name = ? OR nickname = ?)`).get(branch.id, supervisorName, supervisorName) as { id: number } | undefined
          supId = sup?.id ?? null
        }
        const staffType = staffTypeRaw === 'b2b' ? 'b2b' : 'b2c'
        const existing = prepare(db, `SELECT id FROM salesmen WHERE rep_code = ?`).get(repCode) as { id: number } | undefined
        let salesmanId: number
        if (existing) {
          prepare(db, `UPDATE salesmen SET full_name=?, nickname=?, branch_id=?, supervisor_id=?, staff_type=?, active=1 WHERE rep_code=?`).run(fullName, nickname ?? '', branch.id, supId, staffType, repCode)
          salesmanId = existing.id
        } else {
          const ins = prepare(db, `INSERT INTO salesmen (rep_code, full_name, nickname, branch_id, staff_type, position, department, active, supervisor_id) VALUES (?,?,?,?,?,'Sales Representative','Sales',1,?)`).run(repCode, fullName, nickname ?? '', branch.id, staffType, supId)
          salesmanId = Number(ins.lastInsertRowid)
        }
        const pointTarget = parseFloat(ptStr)
        if (!isNaN(pointTarget) && yearMonth && /^\d{6}$/.test(yearMonth)) {
          prepare(db, `INSERT INTO staff_monthly_targets (salesman_id, year_month, point_target) VALUES (?,?,?) ON CONFLICT(salesman_id, year_month) DO UPDATE SET point_target = excluded.point_target`).run(salesmanId, yearMonth, pointTarget)
        }
        counts.roster++
      }
    }

    // ── Daily Entries ─────────────────────────────────────────────────
    const entryRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'Entries!A:G' }).catch(() => ({ data: { values: [] } }))
    const allEntries = entryRes.data.values ?? []
    const firstIsHeader = allEntries[0] && !String(allEntries[0][0]).match(/^\d{4}-\d{2}-\d{2}$/)
    const entryRows = firstIsHeader ? allEntries.slice(1) : allEntries
    for (const row of entryRows) {
      const [entryDate, , repCode, , jewelryStr, barStr, qtyStr] = row as string[]
      if (!entryDate || !repCode) continue
      const sm = prepare(db, `SELECT id, branch_id FROM salesmen WHERE rep_code = ? AND active = 1`).get(repCode) as { id: number; branch_id: number } | undefined
      if (!sm) continue
      prepare(db, `DELETE FROM daily_entries WHERE salesman_id = ? AND entry_date = ?`).run(sm.id, entryDate)
      prepare(db, `INSERT INTO daily_entries (salesman_id, branch_id, entry_date, jewelry_weight_g, bar_weight_g, quantity, synced, updated_at) VALUES (?,?,?,?,?,?,1,?)`).run(sm.id, sm.branch_id, entryDate, parseFloat(jewelryStr) || 0, parseFloat(barStr) || 0, parseInt(qtyStr) || 0, now)
      counts.entries++
    }

    // ── Commission Configs ─────────────────────────────────────────────
    const cfgRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'CommissionConfig!A:E' }).catch(() => null)
    if (cfgRes) {
      const all = cfgRes.data.values ?? []
      const data = all.length > 0 && String(all[0][0]).toLowerCase().includes('type') ? all.slice(1) : all
      for (const row of data) {
        const [staffType, yearMonth, jRate, bRate, qRate] = row as string[]
        if (!staffType || !yearMonth) continue
        prepare(db, `
          INSERT INTO commission_configs (staff_type, year_month, jewelry_rate_lak, bar_rate_lak, qty_rate_lak) VALUES (?,?,?,?,?)
          ON CONFLICT(staff_type, year_month) DO UPDATE SET jewelry_rate_lak=excluded.jewelry_rate_lak, bar_rate_lak=excluded.bar_rate_lak, qty_rate_lak=excluded.qty_rate_lak
        `).run(staffType, yearMonth, parseFloat(jRate) || 0, parseFloat(bRate) || 0, parseFloat(qRate) || 0)
        counts.configs++
      }
    }

    // ── Users ──────────────────────────────────────────────────────────
    // password_hash is bcrypt — syncing enables multi-device login without
    // manually recreating accounts on every new install.
    const usersRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'Users!A:G' }).catch(() => null)
    if (usersRes) {
      const all = usersRes.data.values ?? []
      const data = all.length > 0 && String(all[0][0]).toLowerCase() === 'username' ? all.slice(1) : all
      for (const row of data) {
        const [username, fullName, role, branchCode, supervisorName, activeStr, passwordHash] = row as string[]
        if (!username || !role || !passwordHash) continue
        const branch = branchCode ? prepare(db, `SELECT id FROM branches WHERE code = ?`).get(branchCode) as { id: number } | undefined : undefined
        let supId: number | null = null
        if (supervisorName && branch) {
          const sup = prepare(db, `SELECT id FROM supervisors WHERE branch_id = ? AND (full_name = ? OR nickname = ?)`).get(branch.id, supervisorName, supervisorName) as { id: number } | undefined
          supId = sup?.id ?? null
        }
        const active = activeStr === '0' ? 0 : 1
        const existing = prepare(db, `SELECT id FROM users WHERE username = ?`).get(username) as { id: number } | undefined
        if (existing) {
          prepare(db, `UPDATE users SET full_name=?, role=?, branch_id=?, supervisor_id=?, active=?, password_hash=? WHERE username=?`)
            .run(fullName ?? '', role, branch?.id ?? null, supId, active, passwordHash, username)
        } else {
          prepare(db, `INSERT INTO users (username, password_hash, full_name, role, branch_id, supervisor_id, active) VALUES (?,?,?,?,?,?,?)`)
            .run(username, passwordHash, fullName ?? '', role, branch?.id ?? null, supId, active)
        }
        counts.users++
      }
    }

    // ── Monthly Branch Targets ─────────────────────────────────────────
    const mbtRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'MonthlyBranchTargets!A:D' }).catch(() => null)
    if (mbtRes) {
      const all = mbtRes.data.values ?? []
      const data = all.length > 0 && String(all[0][0]).toLowerCase() === 'branch_code' ? all.slice(1) : all
      for (const row of data) {
        const [branchCode, yearStr, monthStr, targetStr] = row as string[]
        if (!branchCode) continue
        const branch = prepare(db, `SELECT id FROM branches WHERE code = ?`).get(branchCode) as { id: number } | undefined
        if (!branch) continue
        const year   = parseInt(yearStr)
        const month  = parseInt(monthStr)
        const target = parseFloat(targetStr)
        if (isNaN(year) || isNaN(month) || isNaN(target)) continue
        prepare(db, `
          INSERT OR REPLACE INTO branch_kpi_monthly_targets (branch_id, year, month, kpi_point_target)
          VALUES (?,?,?,?)
        `).run(branch.id, year, month, target)
        counts.monthlyTargets++
      }
    }

    prepare(db, `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('last_synced_at', ?)`).run(now)
    prepare(db, `INSERT INTO sync_logs (direction, records_count, status) VALUES ('pull', ?, 'success')`).run(counts.entries)

    return { success: true, counts }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    try { prepare(getDb(), `INSERT INTO sync_logs (direction, records_count, status, error_message) VALUES ('pull', 0, 'error', ?)`).run(msg) } catch { /* ignore */ }
    return { success: false, counts, error: msg }
  }
}

// ── IPC handlers ──────────────────────────────────────────────────────────────
export function registerSheetsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('sheets:getConfig', async (_e, token: string) => {
    requireAuth(token)
    return { sheetsId: getSetting('sheets_id'), serviceAccountPath: getSetting('service_account_path'), lastSyncedAt: getSetting('last_synced_at') }
  })

  ipcMain.handle('sheets:saveConfig', async (_e, token: string, config: { sheetsId: string; serviceAccountPath: string }) => {
    requireAuth(token)
    const db = getDb()
    prepare(db, `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('sheets_id', ?)`).run(config.sheetsId)
    prepare(db, `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('service_account_path', ?)`).run(config.serviceAccountPath)
    return { success: true }
  })

  ipcMain.handle('sheets:getSyncLogs', async (_e, token: string) => {
    requireAuth(token)
    return prepare(getDb(), `SELECT * FROM sync_logs ORDER BY synced_at DESC LIMIT 20`).all()
  })

  ipcMain.handle('sheets:testConnection', async (_e, token: string) => {
    requireAuth(token)
    const sheetsId = getSetting('sheets_id')
    const saPath   = getSetting('service_account_path')
    if (!sheetsId)  return { success: false, error: 'No Spreadsheet ID configured.' }
    if (!saPath)    return { success: false, error: 'No Service Account JSON path configured.' }
    if (!existsSync(saPath)) return { success: false, error: `File not found: ${saPath}` }
    try {
      const auth   = getServiceAuth(saPath)
      const sheets = google.sheets({ version: 'v4', auth })
      const res    = await sheets.spreadsheets.get({ spreadsheetId: sheetsId, fields: 'properties.title,sheets.properties.title' })
      const title      = res.data.properties?.title ?? 'Unknown'
      const sheetNames = (res.data.sheets ?? []).map(s => s.properties?.title ?? '')
      return { success: true, title, sheetNames }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('sheets:browseFile', async (_e, token: string) => {
    requireAuth(token)
    const result = await dialog.showOpenDialog({
      title: 'Select Service Account JSON',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  ipcMain.handle('sheets:syncToCloud', async (_e, token: string) => {
    requireAuth(token)
    const sheetsId = getSetting('sheets_id')
    const saPath   = getSetting('service_account_path')
    if (!sheetsId || !saPath) return { success: false, error: 'Google Sheets not configured. Go to Settings.' }

    try {
      const auth = getServiceAuth(saPath)
      const sheets = google.sheets({ version: 'v4', auth })
      const db = getDb()

      const unsynced = prepare(db, `
        SELECT de.*, s.rep_code, s.full_name, b.code AS branch_code
        FROM daily_entries de JOIN salesmen s ON s.id=de.salesman_id JOIN branches b ON b.id=de.branch_id
        WHERE de.synced=0 ORDER BY de.entry_date, de.branch_id
      `).all() as Array<{ id: number; rep_code: string | null; full_name: string; branch_code: string; entry_date: string; jewelry_weight_g: number; bar_weight_g: number; quantity: number }>

      if (unsynced.length === 0) return { success: true, count: 0, message: 'Nothing to sync.' }

      const headerCheck = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'Entries!A1' }).catch(() => null)
      const hasHeader = headerCheck?.data?.values?.[0]?.[0]
      if (!hasHeader) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetsId,
          requestBody: { requests: [{ addSheet: { properties: { title: TABS.ENTRIES } } }] },
        }).catch(() => {})
        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetsId, range: 'Entries!A1', valueInputOption: 'USER_ENTERED',
          requestBody: { values: [SHEET_HEADERS] },
        })
      }

      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetsId, range: 'Entries!A:G', valueInputOption: 'USER_ENTERED',
        requestBody: { values: unsynced.map(e => [e.entry_date, e.branch_code, e.rep_code ?? '', e.full_name, e.jewelry_weight_g, e.bar_weight_g, e.quantity]) },
      })

      unsynced.forEach(e => prepare(db, `UPDATE daily_entries SET synced=1 WHERE id=?`).run(e.id))
      const now = new Date().toISOString()
      prepare(db, `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('last_synced_at', ?)`).run(now)
      prepare(db, `INSERT INTO sync_logs (direction, records_count, status) VALUES ('push', ?, 'success')`).run(unsynced.length)

      return { success: true, count: unsynced.length }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      prepare(getDb(), `INSERT INTO sync_logs (direction, records_count, status, error_message) VALUES ('push', 0, 'error', ?)`).run(msg)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('sheets:pullFromCloud', async (_e, token: string) => {
    requireAuth(token)
    const sheetsId = getSetting('sheets_id')
    const saPath   = getSetting('service_account_path')
    if (!sheetsId || !saPath) return { success: false, error: 'Google Sheets not configured.' }

    const result = await pullAllFromCloud(sheetsId, saPath)
    if (result.success) {
      const c = result.counts
      return {
        success: true,
        count: c.entries,
        configsImported: c.configs,
        message: `Pulled: ${c.entries} entries · ${c.roster} roster · ${c.users} users · ${c.supervisors} supervisors · ${c.monthlyTargets} monthly targets · ${c.settings} settings · ${c.branches} branches · ${c.kpiRates} KPI rates · ${c.qtyTiers} tier updates · ${c.configs} commission configs`,
      }
    }
    return { success: false, error: result.error }
  })

  // Push all config tabs (Settings, Branches, KPIRates, QtyTiers, Roster, CommissionConfig)
  ipcMain.handle('sheets:pushConfig', async (_e, token: string) => {
    requireAuth(token)
    const db = getDb()
    try {
      await pushAllConfigIfConfigured(db)
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  // Force full sync: reset all entries + clear Entries tab + push everything
  ipcMain.handle('sheets:forceSyncAll', async (_e, token: string) => {
    requireAuth(token)
    const sheetsId = getSetting('sheets_id')
    const saPath   = getSetting('service_account_path')
    if (!sheetsId || !saPath) return { success: false, error: 'Google Sheets not configured. Go to Settings.' }

    try {
      const db     = getDb()
      const auth   = getServiceAuth(saPath)
      const sheets = google.sheets({ version: 'v4', auth })

      // Mark ALL entries as unsynced so syncEntriesToCloudIfConfigured re-pushes all
      prepare(db, `UPDATE daily_entries SET synced=0`).run()

      // Clear the Entries tab so we get a clean rewrite (not duplicates)
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetsId,
        requestBody: { requests: [{ addSheet: { properties: { title: TABS.ENTRIES } } }] },
      }).catch(() => {})
      await sheets.spreadsheets.values.clear({ spreadsheetId: sheetsId, range: 'Entries!A:Z' })

      // Re-push all entries + all config tabs
      await syncEntriesToCloudIfConfigured(db)
      await pushAllConfigIfConfigured(db)

      const { n } = prepare(db, `SELECT COUNT(*) AS n FROM daily_entries`).get() as { n: number }
      return { success: true, count: n }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      prepare(getDb(), `INSERT INTO sync_logs (direction, records_count, status, error_message) VALUES ('push', 0, 'error', ?)`).run(msg)
      return { success: false, error: msg }
    }
  })
}
