import { IpcMain, dialog } from 'electron'
import { google } from 'googleapis'
import bcrypt from 'bcryptjs'
import { readFileSync, existsSync } from 'fs'
import { getDb } from '../db/connection'
import { prepare, transaction } from '../db/query'
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
  SUPERVISOR_ROSTER: 'SupervisorRoster',
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
// No Settings tab push — its only ever-used key (sup_kpi_pct) has no UI writing it, and
// kpi_total_base/kpi_total_weight/global kpi_metrics defaults are permanently frozen
// leftovers from before rates became branch+type scoped. User deleted the Settings tab
// deliberately; nothing recreates it now.

async function pushBranches(db: Database, sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<void> {
  const rows = (prepare(db, `SELECT code, name, kpi_point_target, target_b2c_default, target_b2b_default FROM branches ORDER BY id`).all() as Array<{
    code: string; name: string; kpi_point_target: number; target_b2c_default: number | null; target_b2b_default: number | null
  }>)
    .map(r => [r.code, r.name, r.kpi_point_target, r.target_b2c_default ?? r.kpi_point_target, r.target_b2b_default ?? r.kpi_point_target])
  await writeTab(sheets, spreadsheetId, TABS.BRANCHES, ['code', 'name', 'kpi_point_target', 'target_b2c_default', 'target_b2b_default'], rows)
}

const METRIC_NAMES: Record<number, string> = { 1: 'Jewelry', 2: 'Bar', 3: 'Qty' }

async function pushKpiRates(db: Database, sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<void> {
  // year_month NULL = "standing rate" (applies to any month with no specific override below it)
  const rows = (prepare(db, `
    SELECT t.metric_id, t.staff_type, t.points_per_unit, t.year_month, COALESCE(b.code, 'Global') AS branch_code
    FROM kpi_metric_type_rates t
    LEFT JOIN branches b ON b.id = t.branch_id
    ORDER BY t.metric_id, branch_code, t.staff_type, t.year_month
  `).all() as Array<{ metric_id: number; staff_type: string; points_per_unit: number; year_month: string | null; branch_code: string }>)
    .map(r => [METRIC_NAMES[r.metric_id] ?? r.metric_id, r.branch_code, r.staff_type.toUpperCase(), r.year_month ? readableYearMonth(r.year_month) : 'Standing (all months)', r.points_per_unit])
  await writeTab(sheets, spreadsheetId, TABS.KPI_RATES, ['Metric', 'Branch', 'Staff Type', 'Applies To', 'Points per Unit'], rows)
}

async function pushQtyTiers(db: Database, sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<void> {
  // A config bounded to one month (effective_to set) only governs that month; effective_to
  // NULL = "standing config" used as the fallback for any month with no specific override.
  // staff_type IS NULL = a pre-split config shared by both types (kept for old data); a
  // real config always has b2c or b2b now, shown as "ALL" only for that legacy NULL case.
  const rows = (prepare(db, `
    SELECT COALESCE(b.code, 'Global') AS branch_code, c.staff_type, c.effective_from, c.effective_to, t.threshold_pct, t.score, t.tier_order
    FROM kpi_tiers t
    JOIN kpi_tier_configs c ON c.id = t.config_id
    LEFT JOIN branches b ON b.id = c.branch_id
    WHERE c.metric_id = 3 AND c.is_active = 1
    ORDER BY COALESCE(b.code, 'Global'), c.staff_type, c.effective_from, t.tier_order
  `).all() as Array<{ branch_code: string; staff_type: string | null; effective_from: string; effective_to: string | null; threshold_pct: number; score: number; tier_order: number }>)
    .map(r => [r.branch_code, r.staff_type ? r.staff_type.toUpperCase() : 'ALL', r.effective_to ? `${r.effective_from} → ${r.effective_to}` : 'Standing (all months)', `≥ ${r.threshold_pct} pcs`, `× ${r.score}`, r.tier_order])
  await writeTab(sheets, spreadsheetId, TABS.QTY_TIERS, ['Branch', 'Staff Type', 'Applies To', 'If Qty Is', 'Score Multiplier', 'Tier Order'], rows)
}

// One row per rep per month it actually changed — reps with no change in a given month
// simply have no row for it; the app resolves "roster as of month X" to the nearest
// earlier month with rows. Replaces the old Roster + RosterHistory + RosterMonths 3-tab
// design with a single sheet a human can filter by Month and read directly.
async function pushRoster(db: Database, sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<void> {
  const rows = (prepare(db, `
    SELECT rm.year_month, s.rep_code, s.full_name, s.nickname, b.code AS branch_code,
           sup.full_name AS supervisor_name, rm.staff_type, rm.active, sup.sup_code
    FROM roster_monthly rm
    JOIN salesmen s ON s.id = rm.salesman_id
    JOIN branches b ON b.id = rm.branch_id
    LEFT JOIN supervisors sup ON sup.id = rm.supervisor_id
    ORDER BY rm.year_month, b.code, s.rep_code
  `).all() as Array<{ year_month: string; rep_code: string; full_name: string; nickname: string | null; branch_code: string; supervisor_name: string | null; staff_type: string; active: number; sup_code: string | null }>)
    .map(r => [readableYearMonth(r.year_month), r.rep_code, r.full_name, r.nickname ?? '', r.branch_code, r.supervisor_name ?? '', r.staff_type, r.active, r.sup_code ?? ''])
  await writeTab(sheets, spreadsheetId, TABS.ROSTER,
    ['Month', 'rep_code', 'full_name', 'nickname', 'branch_code', 'supervisor_name', 'staff_type', 'active', 'supervisor_code'], rows)
}

// Supervisor equivalent of pushRoster — same "one row per supervisor per month that
// changed" shape, pure history (report:teamPerformance derives headcount from roster_monthly
// directly, never reads this tab), auto-populated by the rep roster upload, never by hand.
async function pushSupervisorRoster(db: Database, sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<void> {
  const rows = (prepare(db, `
    SELECT srm.year_month, sup.sup_code, sup.full_name, sup.nickname, b.code AS branch_code, srm.staff_type, srm.active
    FROM supervisor_roster_monthly srm
    JOIN supervisors sup ON sup.id = srm.supervisor_id
    JOIN branches b ON b.id = srm.branch_id
    ORDER BY srm.year_month, b.code, sup.full_name
  `).all() as Array<{ year_month: string; sup_code: string | null; full_name: string; nickname: string | null; branch_code: string; staff_type: string; active: number }>)
    .map(r => [readableYearMonth(r.year_month), r.sup_code ?? '', r.full_name, r.nickname ?? '', r.branch_code, r.staff_type, r.active])
  await writeTab(sheets, spreadsheetId, TABS.SUPERVISOR_ROSTER,
    ['Month', 'sup_code', 'full_name', 'nickname', 'branch_code', 'staff_type', 'active'], rows)
}

// Single source of truth for reading the Roster tab back into the DB — column order must
// stay in lockstep with pushRoster above (same lesson as CommissionConfig's earlier bug).
export async function pullRosterFromSheet(db: Database, sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<number> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Roster!A:I' })
  const allRows = res.data.values ?? []
  const dataRows = allRows.length > 0 && String(allRows[0][0]).toLowerCase().includes('month') ? allRows.slice(1) : allRows

  let imported = 0
  const latestBySalesman = new Map<number, { branch_id: number; supervisor_id: number | null; staff_type: string; active: number; year_month: string }>()

  for (const row of dataRows as string[][]) {
    const [monthLabel, repCode, fullName, nickname, branchCode, supervisorName, staffTypeRaw, activeStr, supervisorCode] = row
    const yearMonth = parseReadableYearMonth(monthLabel)
    if (!yearMonth || !repCode || !fullName || !branchCode) continue
    const branch = prepare(db, `SELECT id FROM branches WHERE code = ?`).get(branchCode) as { id: number } | undefined
    if (!branch) continue
    // sup_code first (stable), fall back to name+branch match for rows without one
    let supId: number | null = null
    if (supervisorCode?.trim()) {
      const sup = prepare(db, `SELECT id FROM supervisors WHERE sup_code = ?`).get(supervisorCode.trim()) as { id: number } | undefined
      supId = sup?.id ?? null
    }
    if (!supId && supervisorName) {
      const sup = prepare(db, `SELECT id FROM supervisors WHERE branch_id = ? AND (full_name = ? OR nickname = ?)`).get(branch.id, supervisorName, supervisorName) as { id: number } | undefined
      supId = sup?.id ?? null
    }
    const staffType = staffTypeRaw === 'b2b' ? 'b2b' : 'b2c'
    const active = activeStr === '0' ? 0 : 1

    const existing = prepare(db, `SELECT id FROM salesmen WHERE rep_code = ?`).get(repCode) as { id: number } | undefined
    let salesmanId: number
    if (existing) {
      salesmanId = existing.id
    } else {
      const ins = prepare(db, `INSERT INTO salesmen (rep_code, full_name, nickname, branch_id, staff_type, position, department, active, supervisor_id) VALUES (?,?,?,?,?,'Sales Representative','Sales',1,?)`)
        .run(repCode, fullName, nickname ?? '', branch.id, staffType, supId)
      salesmanId = Number(ins.lastInsertRowid)
    }
    // Identity fields can drift between Roster rows of different months (name fix etc.) — keep current
    prepare(db, `UPDATE salesmen SET full_name=?, nickname=? WHERE id=?`).run(fullName, nickname ?? '', salesmanId)

    prepare(db, `
      INSERT INTO roster_monthly (salesman_id, year_month, branch_id, supervisor_id, staff_type, active) VALUES (?,?,?,?,?,?)
      ON CONFLICT(salesman_id, year_month) DO UPDATE SET branch_id=excluded.branch_id, supervisor_id=excluded.supervisor_id, staff_type=excluded.staff_type, active=excluded.active
    `).run(salesmanId, yearMonth, branch.id, supId, staffType, active)
    imported++

    const prevLatest = latestBySalesman.get(salesmanId)
    if (!prevLatest || yearMonth > prevLatest.year_month) {
      latestBySalesman.set(salesmanId, { branch_id: branch.id, supervisor_id: supId, staff_type: staffType, active, year_month: yearMonth })
    }
  }

  // salesmen.branch_id/staff_type/supervisor_id/active is the "live now" cache used
  // everywhere outside month-aware roster views (daily upload matching, team listings) —
  // keep it pointed at each rep's latest imported month.
  for (const [salesmanId, latest] of latestBySalesman) {
    prepare(db, `UPDATE salesmen SET branch_id=?, supervisor_id=?, staff_type=?, active=? WHERE id=?`)
      .run(latest.branch_id, latest.supervisor_id, latest.staff_type, latest.active, salesmanId)
  }

  return imported
}

// Pull-back for SupervisorRoster — column order must stay in lockstep with
// pushSupervisorRoster. Does not create supervisors (Roster pull/upload already owns that);
// a sup_code/name with no match is skipped, since this tab is pure history of supervisors
// the rep roster already created.
export async function pullSupervisorRosterFromSheet(db: Database, sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<number> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'SupervisorRoster!A:G' }).catch(() => null)
  if (!res) return 0
  const allRows = res.data.values ?? []
  const dataRows = allRows.length > 0 && String(allRows[0][0]).toLowerCase().includes('month') ? allRows.slice(1) : allRows

  let imported = 0
  for (const row of dataRows as string[][]) {
    const [monthLabel, supCode, fullName, , branchCode, staffTypeRaw, activeStr] = row
    const yearMonth = parseReadableYearMonth(monthLabel)
    if (!yearMonth || !branchCode) continue
    const branch = prepare(db, `SELECT id FROM branches WHERE code = ?`).get(branchCode) as { id: number } | undefined
    if (!branch) continue

    let supId: number | null = null
    if (supCode?.trim()) {
      const sup = prepare(db, `SELECT id FROM supervisors WHERE sup_code = ?`).get(supCode.trim()) as { id: number } | undefined
      supId = sup?.id ?? null
    }
    if (!supId && fullName) {
      const sup = prepare(db, `SELECT id FROM supervisors WHERE branch_id = ? AND full_name = ?`).get(branch.id, fullName) as { id: number } | undefined
      supId = sup?.id ?? null
    }
    if (!supId) continue

    const staffType = staffTypeRaw === 'b2b' ? 'b2b' : 'b2c'
    const active = activeStr === '0' ? 0 : 1
    prepare(db, `
      INSERT INTO supervisor_roster_monthly (supervisor_id, year_month, branch_id, staff_type, active) VALUES (?,?,?,?,?)
      ON CONFLICT(supervisor_id, year_month) DO UPDATE SET branch_id=excluded.branch_id, staff_type=excluded.staff_type, active=excluded.active
    `).run(supId, yearMonth, branch.id, staffType, active)
    imported++
  }
  return imported
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function readableYearMonth(yearMonth: string): string {
  const y = yearMonth.slice(0, 4); const m = parseInt(yearMonth.slice(4), 10)
  return m >= 1 && m <= 12 ? `${MONTH_NAMES[m - 1]} ${y}` : yearMonth
}
// Reverse of readableYearMonth — "May 2026" -> "202605". Returns null if unparseable
// (e.g. it's actually a header cell, not a data row).
function parseReadableYearMonth(label: string): string | null {
  const m = /^([A-Za-z]{3})\s+(\d{4})$/.exec((label ?? '').trim())
  if (!m) return null
  const idx = MONTH_NAMES.findIndex(n => n.toLowerCase() === m[1].toLowerCase())
  if (idx === -1) return null
  return `${m[2]}${String(idx + 1).padStart(2, '0')}`
}

const COMMISSION_DEFAULTS_YM = '000000'
function commissionMonthLabel(yearMonth: string): string {
  return yearMonth === COMMISSION_DEFAULTS_YM ? 'Standing (all months)' : readableYearMonth(yearMonth)
}

export async function pushCommission(db: Database, sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<void> {
  const rows = (prepare(db, `SELECT staff_type, year_month, jewelry_rate_lak, bar_rate_lak, qty_rate_lak FROM commission_configs ORDER BY year_month, staff_type`).all() as Array<{ staff_type: string; year_month: string; jewelry_rate_lak: number; bar_rate_lak: number; qty_rate_lak: number }>)
    .map(r => r.staff_type === 'supervisor' || r.staff_type === 'supervisor_b2c' || r.staff_type === 'supervisor_b2b'
      ? [commissionMonthLabel(r.year_month), r.staff_type === 'supervisor' ? 'Supervisor' : `Supervisor ${r.staff_type.slice(-3).toUpperCase()}`, `${r.jewelry_rate_lak}% of team commission`, '', '']
      : [commissionMonthLabel(r.year_month), r.staff_type.toUpperCase(), r.jewelry_rate_lak, r.bar_rate_lak, r.qty_rate_lak])
  await writeTab(sheets, spreadsheetId, TABS.COMMISSION, ['Month', 'Staff Type', 'Jewelry Rate (₭/Baht)', 'Bar Rate (₭/Baht)', 'Qty Rate (₭/pc)'], rows)
}

// Single source of truth for reading the CommissionConfig tab back into the DB — must stay
// in lockstep with pushCommission's column order (Month, Staff Type, ...), since a mismatch
// here silently swaps columns and even inserts the header row as garbage data (this exact
// bug previously existed in two separate places: here and in commission.ts's own pull handler).
export async function pullCommissionConfigsFromSheet(db: Database, sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<number> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'CommissionConfig!A:E' })
  const allRows = res.data.values ?? []
  const dataRows = allRows.length > 0 && String(allRows[0][0]).toLowerCase().includes('month') ? allRows.slice(1) : allRows

  let imported = 0
  for (const row of dataRows as string[][]) {
    const [monthLabel, staffTypeLabel, jRate, bRate, qRate] = row
    const yearMonth = (monthLabel ?? '').toLowerCase().startsWith('standing') ? COMMISSION_DEFAULTS_YM : parseReadableYearMonth(monthLabel)
    if (!yearMonth || !staffTypeLabel) continue
    // "Supervisor B2C" / "Supervisor B2B" -> 'supervisor_b2c' / 'supervisor_b2b'; bare
    // "Supervisor" (pre-split rows) stays 'supervisor' so old months keep their own history.
    const staffType = staffTypeLabel.toLowerCase().startsWith('supervisor')
      ? staffTypeLabel.toLowerCase().replace(/\s+/g, '_')
      : staffTypeLabel.toLowerCase()
    // parseFloat tolerates the Supervisor row's "50% of team commission" string fine — it
    // just reads the leading number and stops at the first non-numeric character.
    prepare(db, `
      INSERT INTO commission_configs (staff_type, year_month, jewelry_rate_lak, bar_rate_lak, qty_rate_lak) VALUES (?,?,?,?,?)
      ON CONFLICT(staff_type, year_month) DO UPDATE SET jewelry_rate_lak=excluded.jewelry_rate_lak, bar_rate_lak=excluded.bar_rate_lak, qty_rate_lak=excluded.qty_rate_lak
    `).run(staffType, yearMonth, parseFloat(jRate) || 0, parseFloat(bRate) || 0, parseFloat(qRate) || 0)
    imported++
  }
  return imported
}

async function pushUsers(db: Database, sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<void> {
  // Pushes the real plaintext password (explicit user decision, not the default) so admin
  // can read it straight off this tab instead of resetting it. Restrict sharing on this
  // sheet — anyone with view access now sees every account's real password.
  const rows = (prepare(db, `
    SELECT u.username, u.full_name, u.role, b.code AS branch_code,
           sv.full_name AS supervisor_name, u.active, u.password_plain
    FROM users u
    LEFT JOIN branches b ON b.id = u.branch_id
    LEFT JOIN supervisors sv ON sv.id = u.supervisor_id
    ORDER BY u.role, u.username
  `).all() as Array<{ username: string; full_name: string; role: string; branch_code: string | null; supervisor_name: string | null; active: number; password_plain: string | null }>)
    .map(r => [r.username, r.full_name, r.role, r.branch_code ?? '', r.supervisor_name ?? '', r.active, r.password_plain ?? ''])
  await writeTab(sheets, spreadsheetId, TABS.USERS, ['username', 'full_name', 'role', 'branch_code', 'supervisor_name', 'active', 'password'], rows)
}

async function pushSupervisors(db: Database, sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<void> {
  const rows = (prepare(db, `
    SELECT sv.full_name, sv.nickname, b.code AS branch_code, sv.staff_type, sv.active, sv.sup_code
    FROM supervisors sv
    JOIN branches b ON b.id = sv.branch_id
    ORDER BY b.code, sv.full_name
  `).all() as Array<{ full_name: string; nickname: string; branch_code: string; staff_type: string; active: number; sup_code: string | null }>)
    .map(r => [r.full_name, r.nickname, r.branch_code, r.staff_type, r.active, r.sup_code ?? ''])
  await writeTab(sheets, spreadsheetId, TABS.SUPERVISORS, ['full_name', 'nickname', 'branch_code', 'staff_type', 'active', 'sup_code'], rows)
}

async function pushMonthlyBranchTargets(db: Database, sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<void> {
  const rows = (prepare(db, `
    SELECT b.code AS branch_code, t.year, t.month, t.kpi_point_target, t.target_b2c, t.target_b2b
    FROM branch_kpi_monthly_targets t
    JOIN branches b ON b.id = t.branch_id
    ORDER BY t.year, t.month, b.code
  `).all() as Array<{ branch_code: string; year: number; month: number; kpi_point_target: number; target_b2c: number | null; target_b2b: number | null }>)
    .map(r => [r.branch_code, `${MONTH_NAMES[r.month - 1]} ${r.year}`, r.kpi_point_target, r.target_b2c || '', r.target_b2b || ''])
  await writeTab(sheets, spreadsheetId, TABS.MONTHLY_TARGETS, ['Branch', 'Month', 'Target (pts/person)', 'B2C Target Override', 'B2B Target Override'], rows)
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
    // Roster upload writes both reps and the supervisors it auto-creates/links from them —
    // push both tabs together so SupervisorRoster never lags a step behind Roster.
    await Promise.all([
      pushRoster(db, sheets, sheetsId),
      pushSupervisorRoster(db, sheets, sheetsId),
    ])
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

// ── Push only the KPIRates tab — exported for kpi.ts ─────────────────────────
export async function pushKpiRatesIfConfigured(db: Database): Promise<void> {
  const sheetsId = getSetting('sheets_id')
  const saPath   = getSetting('service_account_path')
  if (!sheetsId || !saPath) return
  try {
    const auth   = getServiceAuth(saPath)
    const sheets = google.sheets({ version: 'v4', auth })
    await pushKpiRates(db, sheets, sheetsId)
  } catch { /* Sheets unavailable — silently skip */ }
}

// ── Push only the QtyTiers tab — exported for kpi.ts ─────────────────────────
export async function pushQtyTiersIfConfigured(db: Database): Promise<void> {
  const sheetsId = getSetting('sheets_id')
  const saPath   = getSetting('service_account_path')
  if (!sheetsId || !saPath) return
  try {
    const auth   = getServiceAuth(saPath)
    const sheets = google.sheets({ version: 'v4', auth })
    await pushQtyTiers(db, sheets, sheetsId)
  } catch { /* Sheets unavailable — silently skip */ }
}

// ── Push only the Branches tab — exported for kpi.ts ─────────────────────────
export async function pushBranchesIfConfigured(db: Database): Promise<void> {
  const sheetsId = getSetting('sheets_id')
  const saPath   = getSetting('service_account_path')
  if (!sheetsId || !saPath) return
  try {
    const auth   = getServiceAuth(saPath)
    const sheets = google.sheets({ version: 'v4', auth })
    await pushBranches(db, sheets, sheetsId)
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
      pushBranches(db, sheets, sheetsId),
      pushKpiRates(db, sheets, sheetsId),
      pushQtyTiers(db, sheets, sheetsId),
      pushRoster(db, sheets, sheetsId),
      pushSupervisorRoster(db, sheets, sheetsId),
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
  counts: { entries: number; configs: number; settings: number; branches: number; kpiRates: number; roster: number; qtyTiers: number; users: number; supervisors: number; monthlyTargets: number }
  error?: string
}> {
  const counts = { entries: 0, configs: 0, settings: 0, branches: 0, kpiRates: 0, roster: 0, supervisorRoster: 0, qtyTiers: 0, users: 0, supervisors: 0, monthlyTargets: 0 }
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
    const brRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'Branches!A:E' }).catch(() => null)
    if (brRes) {
      const all = brRes.data.values ?? []
      const data = all.length > 0 && String(all[0][0]).toLowerCase() === 'code' ? all.slice(1) : all
      for (const row of data) {
        const [code, , targetStr, b2cStr, b2bStr] = row as string[]
        if (!code) continue
        const target = parseFloat(targetStr)
        if (isNaN(target)) continue
        // B2C/B2B default columns are new — older Sheets (or a manually-trimmed row) may not
        // have them yet, so fall back to the combined target rather than writing NaN/null.
        const b2c = parseFloat(b2cStr); const b2b = parseFloat(b2bStr)
        prepare(db, `UPDATE branches SET kpi_point_target=?, target_b2c_default=?, target_b2b_default=? WHERE code=?`)
          .run(target, isNaN(b2c) ? target : b2c, isNaN(b2b) ? target : b2b, code)
        counts.branches++
      }
    }

    // ── KPI Rates ─────────────────────────────────────────────────────
    // Must mirror pushKpiRates's actual columns: Metric name (not metric_id), Branch
    // code/"Global", Staff Type, Applies To ("Standing (all months)" or "Mon YYYY"),
    // Points per Unit. The old version here read raw metric_id/points in the wrong
    // columns entirely and silently matched zero rows on every pull — never caught
    // because a no-op pull looks identical to a successful one with no changes.
    const rateRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'KPIRates!A:E' }).catch(() => null)
    if (rateRes) {
      const all = rateRes.data.values ?? []
      const data = all.length > 0 && String(all[0][0]).toLowerCase() === 'metric' ? all.slice(1) : all
      const METRIC_IDS: Record<string, number> = { jewelry: 1, bar: 2, qty: 3 }
      for (const row of data) {
        const [metricName, branchCode, staffTypeLabel, appliesTo, ppuStr] = row as string[]
        const metricId = METRIC_IDS[(metricName ?? '').toLowerCase()]
        const ppu = parseFloat(ppuStr)
        if (!metricId || !staffTypeLabel || isNaN(ppu)) continue
        const staffType = staffTypeLabel.toLowerCase()
        const branchRow = branchCode && branchCode !== 'Global'
          ? prepare(db, `SELECT id FROM branches WHERE code = ?`).get(branchCode) as { id: number } | undefined
          : undefined
        const branchId = branchRow?.id ?? null
        const yearMonth = (appliesTo ?? '').toLowerCase().startsWith('standing') ? null : parseReadableYearMonth(appliesTo)
        // No reliable unique constraint to upsert against here (the partial index predates
        // year_month) — delete-then-insert per row, same pattern saveBranchMetricRates uses.
        prepare(db, `
          DELETE FROM kpi_metric_type_rates
          WHERE metric_id=? AND staff_type=? AND (branch_id=? OR (branch_id IS NULL AND ? IS NULL)) AND (year_month=? OR (year_month IS NULL AND ? IS NULL))
        `).run(metricId, staffType, branchId, branchId, yearMonth, yearMonth)
        prepare(db, `INSERT INTO kpi_metric_type_rates (metric_id, branch_id, staff_type, year_month, points_per_unit) VALUES (?,?,?,?,?)`)
          .run(metricId, branchId, staffType, yearMonth, ppu)
        counts.kpiRates++
      }
    }

    // ── Qty Tiers ────────────────────────────────────────────────────
    // Must mirror pushQtyTiers's actual columns: Branch, Applies To, "If Qty Is" (text like
    // "≥ 900 pcs"), "Score Multiplier" (text like "× 5"), Tier Order. The old version here
    // read these as plain numbers in the wrong column positions and silently matched
    // nothing on every pull — same class of bug as KPI Rates above.
    const tierRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'QtyTiers!A:F' }).catch(() => null)
    if (tierRes) {
      const all = tierRes.data.values ?? []
      const data = all.length > 0 && String(all[0][0]).toLowerCase() === 'branch' ? all.slice(1) : all
      // Group rows by (branch, staffType, appliesTo) so each distinct config gets its tiers
      // replaced as one set, rather than one UPDATE per tier guessing at an existing config.
      const groups = new Map<string, { branchCode: string; staffType: string | null; appliesTo: string; tiers: Array<{ threshold: number; score: number; order: number }> }>()
      for (const row of data) {
        const [branchCode, staffTypeLabel, appliesTo, qtyLabel, multLabel, orderStr] = row as string[]
        const threshold = parseFloat((qtyLabel ?? '').replace(/[^0-9.]/g, ''))
        const score     = parseFloat((multLabel ?? '').replace(/[^0-9.]/g, ''))
        const order      = parseInt(orderStr) || 0
        if (!branchCode || isNaN(threshold) || isNaN(score)) continue
        const staffType = (staffTypeLabel ?? '').toUpperCase() === 'ALL' ? null : (staffTypeLabel ?? '').toLowerCase() || null
        const key = `${branchCode}::${staffType}::${appliesTo}`
        if (!groups.has(key)) groups.set(key, { branchCode, staffType, appliesTo, tiers: [] })
        groups.get(key)!.tiers.push({ threshold, score, order })
      }
      for (const { branchCode, staffType, appliesTo, tiers } of groups.values()) {
        const branchRow = branchCode !== 'Global'
          ? prepare(db, `SELECT id FROM branches WHERE code = ?`).get(branchCode) as { id: number } | undefined
          : undefined
        const branchId = branchRow?.id ?? null
        const isStanding = (appliesTo ?? '').toLowerCase().startsWith('standing')
        const range = isStanding ? null : /^(\d{4}-\d{2}-\d{2})\s*→\s*(\d{4}-\d{2}-\d{2})$/.exec(appliesTo ?? '')
        if (!isStanding && !range) continue // not "Standing" and not a parseable date range — skip rather than guess
        const effectiveFrom = isStanding ? '2000-01-01' : range![1]
        const effectiveTo   = isStanding ? null : range![2]
        let configRow = prepare(db, `
          SELECT id FROM kpi_tier_configs
          WHERE metric_id=3 AND (branch_id=? OR (branch_id IS NULL AND ? IS NULL)) AND (staff_type=? OR (staff_type IS NULL AND ? IS NULL))
            AND effective_from=? AND (effective_to=? OR (effective_to IS NULL AND ? IS NULL))
        `).get(branchId, branchId, staffType, staffType, effectiveFrom, effectiveTo, effectiveTo) as { id: number } | undefined
        let configId: number
        if (configRow) {
          configId = configRow.id
          prepare(db, `DELETE FROM kpi_tiers WHERE config_id = ?`).run(configId)
        } else {
          const label = `${branchCode} ${staffType ? staffType.toUpperCase() + ' ' : ''}Qty Tiers — ${isStanding ? 'Default' : appliesTo}`
          const result = prepare(db, `
            INSERT INTO kpi_tier_configs (metric_id, branch_id, staff_type, label, effective_from, effective_to, is_active) VALUES (3,?,?,?,?,?,1)
          `).run(branchId, staffType, label, effectiveFrom, effectiveTo)
          configId = result.lastInsertRowid as number
        }
        tiers.sort((a, b) => b.threshold - a.threshold).forEach((t, i) => {
          prepare(db, `INSERT INTO kpi_tiers (config_id, threshold_pct, score, tier_order) VALUES (?,?,?,?)`)
            .run(configId, t.threshold, t.score, t.order || i + 1)
          counts.qtyTiers++
        })
      }
    }

    // ── Supervisors (must run before Roster so supervisor links resolve) ─
    const supRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'Supervisors!A:F' }).catch(() => null)
    if (supRes) {
      const all = supRes.data.values ?? []
      const data = all.length > 0 && String(all[0][0]).toLowerCase() === 'full_name' ? all.slice(1) : all
      for (const row of data) {
        const [fullName, nickname, branchCode, staffTypeRaw, activeStr, supCodeRaw] = row as string[]
        if (!fullName || !branchCode) continue
        const branch = prepare(db, `SELECT id FROM branches WHERE code = ?`).get(branchCode) as { id: number } | undefined
        if (!branch) continue
        const staffType = staffTypeRaw === 'b2b' ? 'b2b' : 'b2c'
        const active = activeStr === '0' ? 0 : 1
        const supCode = supCodeRaw?.trim() || null
        // sup_code first (stable across renames), fall back to name+branch match
        const existing = (supCode ? prepare(db, `SELECT id FROM supervisors WHERE sup_code = ?`).get(supCode) as { id: number } | undefined : undefined)
          ?? prepare(db, `SELECT id FROM supervisors WHERE full_name = ? AND branch_id = ?`).get(fullName, branch.id) as { id: number } | undefined
        if (existing) {
          prepare(db, `UPDATE supervisors SET nickname=?, staff_type=?, active=?, sup_code=? WHERE id=?`).run(nickname ?? '', staffType, active, supCode, existing.id)
        } else {
          prepare(db, `INSERT INTO supervisors (full_name, nickname, branch_id, staff_type, active, sup_code) VALUES (?,?,?,?,?,?)`).run(fullName, nickname ?? '', branch.id, staffType, active, supCode)
        }
        counts.supervisors++
      }
    }

    // ── Roster ─────────────────────────────────────────────────────────
    counts.roster += await pullRosterFromSheet(db, sheets, sheetsId).catch(() => 0)
    counts.supervisorRoster += await pullSupervisorRosterFromSheet(db, sheets, sheetsId).catch(() => 0)

    // ── Daily Entries ─────────────────────────────────────────────────
    const entryRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'Entries!A:G' }).catch(() => ({ data: { values: [] } }))
    const allEntries = entryRes.data.values ?? []
    const firstIsHeader = allEntries[0] && !String(allEntries[0][0]).match(/^\d{4}-\d{2}-\d{2}$/)
    const entryRows = firstIsHeader ? allEntries.slice(1) : allEntries
    for (const row of entryRows) {
      const [entryDate, , repCode, , jewelryStr, barStr, qtyStr] = row as string[]
      if (!entryDate || !repCode) continue
      const sm = prepare(db, `SELECT id, branch_id, staff_type FROM salesmen WHERE rep_code = ? AND active = 1`).get(repCode) as { id: number; branch_id: number; staff_type: string } | undefined
      if (!sm) continue
      prepare(db, `DELETE FROM daily_entries WHERE salesman_id = ? AND entry_date = ?`).run(sm.id, entryDate)
      prepare(db, `INSERT INTO daily_entries (salesman_id, branch_id, staff_type, entry_date, jewelry_weight_g, bar_weight_g, quantity, synced, updated_at) VALUES (?,?,?,?,?,?,?,1,?)`).run(sm.id, sm.branch_id, sm.staff_type, entryDate, parseFloat(jewelryStr) || 0, parseFloat(barStr) || 0, parseInt(qtyStr) || 0, now)
      counts.entries++
    }

    // ── Commission Configs ─────────────────────────────────────────────
    counts.configs += await pullCommissionConfigsFromSheet(db, sheets, sheetsId).catch(() => 0)

    // ── Users ──────────────────────────────────────────────────────────
    // The sheet now carries the real plaintext password (explicit user decision) — re-hash
    // it on the way in so login still checks a bcrypt hash, not the plaintext directly.
    const usersRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'Users!A:G' }).catch(() => null)
    if (usersRes) {
      const all = usersRes.data.values ?? []
      const data = all.length > 0 && String(all[0][0]).toLowerCase() === 'username' ? all.slice(1) : all
      for (const row of data) {
        const [username, fullName, role, branchCode, supervisorName, activeStr, passwordPlain] = row as string[]
        if (!username || !role || !passwordPlain) continue
        const branch = branchCode ? prepare(db, `SELECT id FROM branches WHERE code = ?`).get(branchCode) as { id: number } | undefined : undefined
        let supId: number | null = null
        if (supervisorName && branch) {
          const sup = prepare(db, `SELECT id FROM supervisors WHERE branch_id = ? AND (full_name = ? OR nickname = ?)`).get(branch.id, supervisorName, supervisorName) as { id: number } | undefined
          supId = sup?.id ?? null
        }
        const active = activeStr === '0' ? 0 : 1
        const existing = prepare(db, `SELECT id, password_plain FROM users WHERE username = ?`).get(username) as { id: number; password_plain: string | null } | undefined
        if (existing) {
          // Only re-hash if the plaintext actually changed — avoids a needless rehash (and a
          // pointless write) on every pull when nothing about this user's password moved.
          if (existing.password_plain !== passwordPlain) {
            prepare(db, `UPDATE users SET password_hash=?, password_plain=? WHERE username=?`).run(bcrypt.hashSync(passwordPlain, 10), passwordPlain, username)
          }
          prepare(db, `UPDATE users SET full_name=?, role=?, branch_id=?, supervisor_id=?, active=? WHERE username=?`)
            .run(fullName ?? '', role, branch?.id ?? null, supId, active, username)
        } else {
          prepare(db, `INSERT INTO users (username, password_hash, password_plain, full_name, role, branch_id, supervisor_id, active) VALUES (?,?,?,?,?,?,?,?)`)
            .run(username, bcrypt.hashSync(passwordPlain, 10), passwordPlain, fullName ?? '', role, branch?.id ?? null, supId, active)
        }
        counts.users++
      }
    }

    // ── Monthly Branch Targets ───────────────────────────────────────
    // Must mirror pushMonthlyTargets's actual columns: Branch code, one readable "Mon YYYY"
    // Month string (not separate year/month columns), Target, B2C Override, B2B Override.
    // The old version expected a 'branch_code' header (actual is 'Branch'), split Month into
    // two non-existent year/month columns, and never read range E (B2C/B2B at all) — every
    // field here was wrong, so this pull has likely never once written a real row.
    const mbtRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'MonthlyBranchTargets!A:E' }).catch(() => null)
    if (mbtRes) {
      const all = mbtRes.data.values ?? []
      const data = all.length > 0 && String(all[0][0]).toLowerCase() === 'branch' ? all.slice(1) : all
      for (const row of data) {
        const [branchCode, monthLabel, targetStr, b2cStr, b2bStr] = row as string[]
        if (!branchCode) continue
        const branch = prepare(db, `SELECT id FROM branches WHERE code = ?`).get(branchCode) as { id: number } | undefined
        if (!branch) continue
        const yearMonth = parseReadableYearMonth(monthLabel)
        const target = parseFloat(targetStr)
        if (!yearMonth || isNaN(target)) continue
        const year  = parseInt(yearMonth.slice(0, 4))
        const month = parseInt(yearMonth.slice(4))
        const b2c = parseFloat(b2cStr); const b2b = parseFloat(b2bStr)
        prepare(db, `
          INSERT INTO branch_kpi_monthly_targets (branch_id, year, month, kpi_point_target, target_b2c, target_b2b)
          VALUES (?,?,?,?,?,?)
          ON CONFLICT(branch_id, year, month) DO UPDATE SET
            kpi_point_target = excluded.kpi_point_target,
            target_b2c        = excluded.target_b2c,
            target_b2b        = excluded.target_b2b
        `).run(branch.id, year, month, target, isNaN(b2c) ? target : b2c, isNaN(b2b) ? target : b2b)
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

  // ── Pre-login database connect/switch — no token, intentionally ───────────
  // Lets the Login screen connect a brand-new device to Sheets for the first time, AND
  // lets ANY device switch to a different spreadsheet entirely (e.g. Test database vs
  // Production database) without needing to log in first — by design, since switching
  // databases is exactly the moment there's no guarantee a real account from the NEW
  // database has ever existed on this device yet.
  //
  // No super-admin backdoor account exists to "always get in" across databases — deliberately
  // skipped as too risky (one fixed credential valid on every install, including production,
  // forever). Use the per-device seeded admin/admin1234 instead if truly locked out.

  ipcMain.handle('sheets:isConfigured', async () => {
    return !!(getSetting('sheets_id') && getSetting('service_account_path'))
  })

  ipcMain.handle('sheets:browseFileBootstrap', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Service Account JSON',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  ipcMain.handle('sheets:bootstrapConnect', async (_e, sheetsId: string, serviceAccountPath: string) => {
    if (!sheetsId) return { success: false, error: 'Spreadsheet ID required.' }
    if (!serviceAccountPath) return { success: false, error: 'Service account JSON path required.' }
    if (!existsSync(serviceAccountPath)) return { success: false, error: `File not found: ${serviceAccountPath}` }

    try {
      const auth   = getServiceAuth(serviceAccountPath)
      const sheets = google.sheets({ version: 'v4', auth })
      await sheets.spreadsheets.get({ spreadsheetId: sheetsId, fields: 'properties.title' }) // throws if unreachable/unshared

      // Wipe this device's local data before pulling — pullAllFromCloud only upserts rows
      // that exist in the new sheet, it never deletes. Without this, any local seed/test
      // data (or a prior database's rep_code/username that doesn't exist in the new one)
      // lingers forever, silently mixing two datasets in one local file. The seeded admin
      // account survives this (re-seeded if missing) so the device can never end up with
      // zero way to log in.
      // Runs unconditionally, not just "if already configured" — seedDatabase() always
      // seeds test accounts/rates/tiers on a brand-new install too, so a fresh reinstall
      // has just as much to wipe as a database switch on an already-running device.
      const db = getDb()
      transaction(db, () => {
        prepare(db, `DELETE FROM daily_entries`).run()
        prepare(db, `DELETE FROM targets`).run()
        prepare(db, `DELETE FROM staff_monthly_targets`).run()
        prepare(db, `DELETE FROM commission_configs`).run()
        prepare(db, `DELETE FROM roster_monthly`).run()
        prepare(db, `DELETE FROM supervisor_roster_monthly`).run()
        prepare(db, `DELETE FROM upload_logs`).run()
        prepare(db, `DELETE FROM audit_logs`).run()
        prepare(db, `DELETE FROM sessions`).run()
        prepare(db, `DELETE FROM user_permissions`).run()
        prepare(db, `DELETE FROM salesmen`).run()
        prepare(db, `DELETE FROM supervisors`).run()
        prepare(db, `DELETE FROM users WHERE username != 'admin'`).run()
        prepare(db, `DELETE FROM kpi_monthly_submissions`).run()
        prepare(db, `DELETE FROM branch_kpi_monthly_targets`).run()
        prepare(db, `DELETE FROM kpi_metric_type_rates`).run()
        prepare(db, `DELETE FROM kpi_tiers`).run()
        prepare(db, `DELETE FROM kpi_tier_configs`).run()
        prepare(db, `UPDATE branches SET kpi_point_target=0, target_b2c_default=0, target_b2b_default=0`).run()
      })

      // Persist sheets_id/service_account_path only AFTER a successful pull — otherwise a
      // pull failure (network drop mid-sync, bad tab, etc.) leaves the device marked
      // "configured" with no real data ever having arrived, with the prior database's local
      // data already wiped and nothing to show for it.
      const result = await pullAllFromCloud(sheetsId, serviceAccountPath)
      if (!result.success) return { success: false, error: result.error ?? 'Connected, but the initial sync failed.' }

      prepare(db, `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('sheets_id', ?)`).run(sheetsId)
      prepare(db, `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('service_account_path', ?)`).run(serviceAccountPath)

      const c = result.counts
      return { success: true, message: `Connected — synced ${c.users} users, ${c.roster} roster rows, ${c.entries} entries.` }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
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
