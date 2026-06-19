import { IpcMain } from 'electron'
import { google } from 'googleapis'
import { getDb } from '../db/connection'
import { prepare } from '../db/query'
import { requireAuth, requireAdmin, logAudit } from './auth'
import { getServiceAuth, getSetting, pushCommission, pullCommissionConfigsFromSheet } from './sheets'
import { getRosterMapAsOf } from '../db/history'

interface CommissionConfig {
  staff_type: string
  jewelry_rate_lak: number
  bar_rate_lak: number
  qty_rate_lak: number
}

// Exact month, or the Admin Defaults sentinel row — NOT a carry-forward from whatever older
// real month happens to be the most recent. A rate set in January and never touched again must
// not silently keep pricing every later month off January's number with no signal anywhere.
function getEffectiveConfig(db: import('sql.js').Database, staffType: string, yearMonth: string): CommissionConfig | undefined {
  return prepare(db, `
    SELECT staff_type, jewelry_rate_lak, bar_rate_lak, qty_rate_lak
    FROM commission_configs
    WHERE staff_type = ? AND year_month IN (?, ?)
    ORDER BY year_month DESC LIMIT 1
  `).get(staffType, yearMonth, DEFAULTS_YM) as CommissionConfig | undefined
}

// Admin's Defaults row — sorts as the OLDEST possible year_month, so the existing "most
// recent row <= requested month" lookup above only ever picks it when no real month-specific
// (or earlier-month-carried-forward) row exists yet. No schema change needed: it's just an
// ordinary commission_configs row at a year_month no real month can ever produce.
const DEFAULTS_YM = '000000'

// Supervisor share is per staff_type now (B2C team share can differ from B2B). Falls back to
// the old single 'supervisor' key for months saved before this split, so historical commission
// reports don't silently change. Final fallback is 30%, same as the pre-existing default.
function getEffectiveSupPct(db: import('sql.js').Database, staffType: 'b2c' | 'b2b', yearMonth: string): number {
  const typed = getEffectiveConfig(db, `supervisor_${staffType}`, yearMonth)
  if (typed) return typed.jewelry_rate_lak / 100
  const legacy = getEffectiveConfig(db, 'supervisor', yearMonth)
  return legacy ? legacy.jewelry_rate_lak / 100 : 0.30
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
    const u = requireAuth(token)
    if (!['admin','hr'].includes(u.role)) throw new Error('Forbidden')
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

    logAudit(db, u.id, u.username, u.role, 'commission_config_update',
      `${data.staffType} ${data.yearMonth} — J:${data.jewelryRateLak} B:${data.barRateLak} Q:${data.qtyRateLak}`, 'commission_config', data.yearMonth)
    return { success: true }
  })

  // Commission Rate Defaults — Admin-only, not month-scoped. Reuses the existing
  // commission_configs table via the DEFAULTS_YM sentinel (see getEffectiveConfig above),
  // so any month that's never had its own explicit rate automatically inherits these.
  ipcMain.handle('commission:getDefaults', async (_e, token: string) => {
    requireAuth(token)
    const db = getDb()
    const get = (staffType: string) => prepare(db, `
      SELECT jewelry_rate_lak, bar_rate_lak, qty_rate_lak FROM commission_configs WHERE staff_type=? AND year_month=?
    `).get(staffType, DEFAULTS_YM) as { jewelry_rate_lak: number; bar_rate_lak: number; qty_rate_lak: number } | undefined
    const b2c = get('b2c'); const b2b = get('b2b')
    const supB2c = get('supervisor_b2c'); const supB2b = get('supervisor_b2b')
    return {
      b2c: { jewelry: b2c?.jewelry_rate_lak ?? 0, bar: b2c?.bar_rate_lak ?? 0, qty: b2c?.qty_rate_lak ?? 0 },
      b2b: { jewelry: b2b?.jewelry_rate_lak ?? 0, bar: b2b?.bar_rate_lak ?? 0, qty: b2b?.qty_rate_lak ?? 0 },
      supB2cPct: supB2c?.jewelry_rate_lak ?? 30,
      supB2bPct: supB2b?.jewelry_rate_lak ?? 30,
    }
  })

  ipcMain.handle('commission:saveDefaults', async (_e, token: string, data: {
    b2c: { jewelry: number; bar: number; qty: number }
    b2b: { jewelry: number; bar: number; qty: number }
    supB2cPct: number; supB2bPct: number
  }) => {
    const u = requireAdmin(token)
    const db = getDb()
    const upsert = (staffType: string, jewelry: number, bar: number, qty: number) => {
      prepare(db, `
        INSERT INTO commission_configs (staff_type, year_month, jewelry_rate_lak, bar_rate_lak, qty_rate_lak)
        VALUES (?,?,?,?,?)
        ON CONFLICT(staff_type, year_month) DO UPDATE SET
          jewelry_rate_lak = excluded.jewelry_rate_lak,
          bar_rate_lak     = excluded.bar_rate_lak,
          qty_rate_lak     = excluded.qty_rate_lak
      `).run(staffType, DEFAULTS_YM, jewelry, bar, qty)
    }
    upsert('b2c', data.b2c.jewelry, data.b2c.bar, data.b2c.qty)
    upsert('b2b', data.b2b.jewelry, data.b2b.bar, data.b2b.qty)
    upsert('supervisor_b2c', data.supB2cPct, 0, 0)
    upsert('supervisor_b2b', data.supB2bPct, 0, 0)

    const sheetsId = getSetting('sheets_id')
    const saPath   = getSetting('service_account_path')
    if (sheetsId && saPath) {
      try {
        const auth   = getServiceAuth(saPath)
        const sheets = google.sheets({ version: 'v4', auth })
        await pushCommission(db, sheets, sheetsId)
      } catch { /* Sheets not configured or unavailable — silently skip */ }
    }
    logAudit(db, u.id, u.username, u.role, 'commission_defaults_update',
      `B2C J:${data.b2c.jewelry} B:${data.b2c.bar} Q:${data.b2c.qty} · B2B J:${data.b2b.jewelry} B:${data.b2b.bar} Q:${data.b2b.qty} · Sup ${data.supB2cPct}%/${data.supB2bPct}%`,
      'commission_config')
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
    } else if (user.role === 'branch_manager' || user.role === 'accountant_officer') {
      effectiveBranchIds = user.branch_id ? [user.branch_id] : branchIds
    }

    // Who counts as "on the team" and which staff_type/branch rate applies must reflect
    // what was true AS OF this month — not today's roster — so a transfer or B2C/B2B
    // change after the fact never changes a past month's commission payout.
    const rosterMap = getRosterMapAsOf(db, year, month)
    const branchById = new Map((prepare(db, `SELECT id, name, code FROM branches`).all() as Array<{ id: number; name: string; code: string }>).map(b => [b.id, b]))
    const supNameById = new Map((prepare(db, `SELECT id, full_name FROM supervisors`).all() as Array<{ id: number; full_name: string }>).map(s => [s.id, s.full_name]))
    const identityById = new Map((prepare(db, `SELECT id, full_name, nickname FROM salesmen`).all() as Array<{ id: number; full_name: string; nickname: string }>).map(s => [s.id, s]))

    const matchedSalesmanIds = [...rosterMap.entries()]
      .filter(([, v]) => v.active === 1)
      .filter(([, v]) => effectiveBranchIds.length === 0 || effectiveBranchIds.includes(v.branch_id))
      .filter(([, v]) => supervisorFilter == null || v.supervisor_id === supervisorFilter)
      .map(([salesmanId]) => salesmanId)

    // One batched query for every matched rep's actuals instead of one query per rep —
    // sql.js is synchronous/single-threaded, so a 100+ rep N+1 loop here blocked the whole
    // Electron main process (including window message handling) long enough for Windows to
    // flag the app as "Not Responding."
    const actualsById = new Map<number, { j: number; b: number; q: number }>()
    if (matchedSalesmanIds.length > 0) {
      const placeholders = matchedSalesmanIds.map(() => '?').join(',')
      const actualRows = prepare(db, `
        SELECT salesman_id,
          COALESCE(SUM(jewelry_weight_g),0) AS j, COALESCE(SUM(bar_weight_g),0) AS b, COALESCE(SUM(quantity),0) AS q
        FROM daily_entries
        WHERE salesman_id IN (${placeholders}) AND entry_date >= ? AND entry_date <= ?
        GROUP BY salesman_id
      `).all(...matchedSalesmanIds, dateFrom, dateTo) as Array<{ salesman_id: number; j: number; b: number; q: number }>
      for (const r of actualRows) actualsById.set(r.salesman_id, { j: r.j, b: r.b, q: r.q })
    }

    const reps = matchedSalesmanIds.map(salesmanId => {
      const v = rosterMap.get(salesmanId)!
      const idn = identityById.get(salesmanId)
      const branch = branchById.get(v.branch_id)
      const act = actualsById.get(salesmanId) ?? { j: 0, b: 0, q: 0 }
      return {
        id: salesmanId, full_name: idn?.full_name ?? '—', nickname: idn?.nickname ?? '',
        staff_type: v.staff_type, branch_id: v.branch_id, supervisor_id: v.supervisor_id,
        branch_name: branch?.name ?? '', branch_code: branch?.code ?? '',
        supervisor_name: v.supervisor_id ? (supNameById.get(v.supervisor_id) ?? null) : null,
        actual_jewelry: act.j, actual_bar: act.b, actual_qty: act.q,
      }
    })
      .sort((a, b) => (a.branch_id - b.branch_id) || a.full_name.localeCompare(b.full_name))

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

    const supRows = supervisors.map(s => {
      const pct = getEffectiveSupPct(db, s.staff_type === 'b2b' ? 'b2b' : 'b2c', yearMonth)
      return {
        ...s,
        team_commission_lak: supCommission.get(s.id) ?? 0,
        supervisor_commission_lak: (supCommission.get(s.id) ?? 0) * pct,
        sup_pct: pct * 100,
      }
    })

    return { reps: repRows, supervisors: supRows, yearMonth, dateFrom, dateTo }
  })
}
