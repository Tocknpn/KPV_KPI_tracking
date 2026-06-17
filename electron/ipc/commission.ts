import { IpcMain } from 'electron'
import { google } from 'googleapis'
import { getDb } from '../db/connection'
import { prepare } from '../db/query'
import { requireAuth, requireAdmin } from './auth'
import { getServiceAuth, getSetting, pushCommission, pullCommissionConfigsFromSheet } from './sheets'

interface CommissionConfig {
  staff_type: string
  jewelry_rate_lak: number
  bar_rate_lak: number
  qty_rate_lak: number
}

function getEffectiveConfig(db: import('sql.js').Database, staffType: string, yearMonth: string): CommissionConfig | undefined {
  return prepare(db, `
    SELECT staff_type, jewelry_rate_lak, bar_rate_lak, qty_rate_lak
    FROM commission_configs
    WHERE staff_type = ? AND year_month <= ?
    ORDER BY year_month DESC LIMIT 1
  `).get(staffType, yearMonth) as CommissionConfig | undefined
}

export function registerCommissionHandlers(ipcMain: IpcMain): void {

  // Get commission configs (all or filtered by yearMonth)
  ipcMain.handle('commission:getConfigs', async (_e, token: string, yearMonth?: string) => {
    requireAuth(token)
    const db = getDb()
    if (yearMonth) {
      return prepare(db, `SELECT * FROM commission_configs WHERE year_month = ? ORDER BY staff_type`).all(yearMonth)
    }
    return prepare(db, `SELECT * FROM commission_configs ORDER BY year_month DESC, staff_type`).all()
  })

  // Save (upsert) commission config and push to Google Sheets
  ipcMain.handle('commission:saveConfig', async (_e, token: string, data: {
    staffType: string; yearMonth: string
    jewelryRateLak: number; barRateLak: number; qtyRateLak: number
  }) => {
    requireAdmin(token)
    const db = getDb()

    prepare(db, `
      INSERT INTO commission_configs (staff_type, year_month, jewelry_rate_lak, bar_rate_lak, qty_rate_lak)
      VALUES (?,?,?,?,?)
      ON CONFLICT(staff_type, year_month) DO UPDATE SET
        jewelry_rate_lak = excluded.jewelry_rate_lak,
        bar_rate_lak     = excluded.bar_rate_lak,
        qty_rate_lak     = excluded.qty_rate_lak
    `).run(data.staffType, data.yearMonth, data.jewelryRateLak, data.barRateLak, data.qtyRateLak)

    // Push all configs to Sheets CommissionConfig tab — uses the same writer as Force Full
    // Sync (pushCommission in sheets.ts) so there's exactly one column format for this tab.
    const sheetsId = getSetting('sheets_id')
    const saPath   = getSetting('service_account_path')
    if (sheetsId && saPath) {
      try {
        const auth   = getServiceAuth(saPath)
        const sheets = google.sheets({ version: 'v4', auth })
        await pushCommission(db, sheets, sheetsId)
      } catch { /* Sheets not configured or unavailable — silently skip */ }
    }

    return { success: true }
  })

  // Pull commission configs from Google Sheets CommissionConfig tab
  ipcMain.handle('commission:pullConfigs', async (_e, token: string) => {
    requireAdmin(token)
    const sheetsId = getSetting('sheets_id')
    const saPath   = getSetting('service_account_path')
    if (!sheetsId || !saPath) return { success: false, error: 'Google Sheets not configured.' }

    try {
      const auth   = getServiceAuth(saPath)
      const sheets = google.sheets({ version: 'v4', auth })
      const db     = getDb()
      const imported = await pullCommissionConfigsFromSheet(db, sheets, sheetsId)
      return { success: true, count: imported }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  // Commission report: per-rep actuals + commission for a month (optional date range override)
  ipcMain.handle('commission:getReport', async (_e,
    token: string, branchIds: number[], year: number, month: number,
    dfFrom?: string, dfTo?: string,
  ) => {
    const user = requireAuth(token)
    const db = getDb()

    const yearMonth = `${year}${String(month).padStart(2, '0')}`
    const dateFrom  = dfFrom ?? `${year}-${String(month).padStart(2, '0')}-01`
    const dateTo    = dfTo   ?? `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`

    let effectiveBranchIds = branchIds
    let supervisorFilter: number | null = null

    if (user.role === 'sales_sup') {
      effectiveBranchIds = [user.branch_id ?? 1]
      supervisorFilter   = user.supervisor_id
    } else if (user.role === 'branch_manager') {
      effectiveBranchIds = user.branch_id ? [user.branch_id] : branchIds
    }

    const branchSql    = effectiveBranchIds.length > 0 ? `AND s.branch_id IN (${effectiveBranchIds.map(() => '?').join(',')})` : ''
    const branchParams = effectiveBranchIds
    const supSql       = supervisorFilter != null ? `AND s.supervisor_id = ?` : ''
    const supParams    = supervisorFilter != null ? [supervisorFilter] : []

    const reps = prepare(db, `
      SELECT s.id, s.full_name, s.nickname, s.staff_type, s.branch_id, s.supervisor_id,
        b.name AS branch_name, b.code AS branch_code,
        sv.full_name AS supervisor_name,
        COALESCE(SUM(de.jewelry_weight_g), 0) AS actual_jewelry,
        COALESCE(SUM(de.bar_weight_g),     0) AS actual_bar,
        COALESCE(SUM(de.quantity),          0) AS actual_qty
      FROM salesmen s
      JOIN branches b ON b.id = s.branch_id
      LEFT JOIN supervisors sv ON sv.id = s.supervisor_id
      LEFT JOIN daily_entries de ON de.salesman_id = s.id
        AND de.entry_date >= ? AND de.entry_date <= ?
      WHERE s.active = 1 ${branchSql} ${supSql}
      GROUP BY s.id ORDER BY s.branch_id, sv.full_name, s.full_name
    `).all(dateFrom, dateTo, ...branchParams, ...supParams) as Array<{
      id: number; full_name: string; nickname: string; staff_type: string; branch_id: number
      supervisor_id: number | null; branch_name: string; branch_code: string; supervisor_name: string | null
      actual_jewelry: number; actual_bar: number; actual_qty: number
    }>

    // Cache config per staff_type
    const configCache = new Map<string, CommissionConfig | null>()
    function getCfg(staffType: string): CommissionConfig | null {
      if (!configCache.has(staffType)) {
        configCache.set(staffType, getEffectiveConfig(db, staffType, yearMonth) ?? null)
      }
      return configCache.get(staffType) ?? null
    }

    // Per-rep commission
    const repRows = reps.map(r => {
      const cfg = getCfg(r.staff_type)
      const commission = cfg
        ? r.actual_jewelry * cfg.jewelry_rate_lak + r.actual_bar * cfg.bar_rate_lak + r.actual_qty * cfg.qty_rate_lak
        : 0
      return { ...r, commission_lak: commission, rate_applied: cfg }
    })

    // Supervisor commission share — read from commission_configs (staff_type='supervisor') for the month
    const supCfg = getEffectiveConfig(db, 'supervisor', yearMonth)
    const supPct = supCfg ? supCfg.jewelry_rate_lak / 100 : 0.30

    const supCommission = new Map<number, number>()
    for (const r of repRows) {
      if (r.supervisor_id) {
        supCommission.set(r.supervisor_id, (supCommission.get(r.supervisor_id) ?? 0) + r.commission_lak)
      }
    }

    const supervisors = prepare(db, `
      SELECT sv.id, sv.full_name, sv.nickname, sv.staff_type, sv.branch_id,
        b.name AS branch_name, b.code AS branch_code
      FROM supervisors sv
      JOIN branches b ON b.id = sv.branch_id
      WHERE sv.active = 1
        ${effectiveBranchIds.length > 0 ? `AND sv.branch_id IN (${effectiveBranchIds.map(() => '?').join(',')})` : ''}
      ORDER BY sv.branch_id, sv.full_name
    `).all(...effectiveBranchIds) as Array<{
      id: number; full_name: string; nickname: string; staff_type: string; branch_id: number; branch_name: string; branch_code: string
    }>

    const supRows = supervisors.map(s => ({
      ...s,
      team_commission_lak: supCommission.get(s.id) ?? 0,
      supervisor_commission_lak: (supCommission.get(s.id) ?? 0) * supPct,
      sup_pct: supPct * 100,
    }))

    return { reps: repRows, supervisors: supRows, yearMonth, dateFrom, dateTo }
  })
}
