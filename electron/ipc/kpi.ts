import { IpcMain } from 'electron'
import { getDb } from '../db/connection'
import { prepare, transaction } from '../db/query'
import { requireAuth, requireAdmin } from './auth'
import type { Database } from 'sql.js'

export function computeKpiScore(
  db: Database,
  metricId: number,
  branchId: number,
  actual: number,
  target: number,
  date: string = new Date().toISOString().split('T')[0]
): { score: number; pct: number; tierId: number | null } {
  const pct = target > 0 ? (actual / target) * 100 : 0

  // Fetch metric to check scoring mode
  const metric = prepare(db, `SELECT points_per_unit FROM kpi_metrics WHERE id = ?`).get(metricId) as
    | { points_per_unit: number }
    | undefined

  // Jewelry / Bar: direct weight × multiplier (no target percentage needed)
  if (metric && metric.points_per_unit > 0) {
    return { score: actual * metric.points_per_unit, pct, tierId: null }
  }

  // Quantity: find tier by absolute qty threshold; score is the multiplier
  // Branch-specific config wins over global (NULL branch_id)
  const config = prepare(db, `
    SELECT id FROM kpi_tier_configs
    WHERE metric_id = ?
      AND (branch_id = ? OR branch_id IS NULL)
      AND is_active = 1
      AND effective_from <= ?
      AND (effective_to IS NULL OR effective_to >= ?)
    ORDER BY CASE WHEN branch_id IS NULL THEN 1 ELSE 0 END
    LIMIT 1
  `).get(metricId, branchId, date, date) as { id: number } | undefined

  if (!config) return { score: 0, pct, tierId: null }

  const tiers = prepare(db, `
    SELECT id, threshold_pct, score FROM kpi_tiers
    WHERE config_id = ? ORDER BY threshold_pct DESC
  `).all(config.id) as { id: number; threshold_pct: number; score: number }[]

  for (const tier of tiers) {
    if (actual >= tier.threshold_pct) {
      return { score: actual * tier.score, pct, tierId: tier.id }
    }
  }
  return { score: 0, pct, tierId: null }
}

export function registerKpiHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('kpi:getMetrics', async (_e, token: string) => {
    requireAuth(token)
    return prepare(getDb(), `SELECT * FROM kpi_metrics WHERE active = 1 ORDER BY display_order`).all()
  })

  ipcMain.handle('kpi:getConfigs', async (_e, token: string, branchId?: number) => {
    requireAuth(token)
    const db = getDb()
    if (branchId != null) {
      return prepare(db, `
        SELECT c.*, m.name AS metric_name, m.unit, b.name AS branch_name
        FROM kpi_tier_configs c
        JOIN kpi_metrics m ON m.id = c.metric_id
        LEFT JOIN branches b ON b.id = c.branch_id
        WHERE (c.branch_id = ? OR c.branch_id IS NULL)
        ORDER BY c.metric_id, CASE WHEN c.branch_id IS NULL THEN 1 ELSE 0 END
      `).all(branchId)
    }
    return prepare(db, `
      SELECT c.*, m.name AS metric_name, m.unit, b.name AS branch_name
      FROM kpi_tier_configs c
      JOIN kpi_metrics m ON m.id = c.metric_id
      LEFT JOIN branches b ON b.id = c.branch_id
      ORDER BY c.metric_id, c.branch_id
    `).all()
  })

  ipcMain.handle('kpi:getTiers', async (_e, token: string, configId: number) => {
    requireAuth(token)
    return prepare(getDb(), `SELECT * FROM kpi_tiers WHERE config_id = ? ORDER BY tier_order`).all(configId)
  })

  ipcMain.handle('kpi:saveConfig', async (_e, token: string,
    config: { id?: number; metricId: number; branchId: number | null; label: string; effectiveFrom: string; effectiveTo: string | null; isActive: number },
    tiers: Array<{ thresholdPct: number; score: number; tierOrder: number }>
  ) => {
    requireAdmin(token)
    const db = getDb()
    let configId: number
    transaction(db, () => {
      if (config.id) {
        prepare(db, `UPDATE kpi_tier_configs SET metric_id=?,branch_id=?,label=?,effective_from=?,effective_to=?,is_active=? WHERE id=?`)
          .run(config.metricId, config.branchId, config.label, config.effectiveFrom, config.effectiveTo, config.isActive, config.id)
        configId = config.id
        prepare(db, `DELETE FROM kpi_tiers WHERE config_id = ?`).run(configId)
      } else {
        const result = prepare(db, `INSERT INTO kpi_tier_configs (metric_id,branch_id,label,effective_from,effective_to,is_active) VALUES (?,?,?,?,?,?)`)
          .run(config.metricId, config.branchId, config.label, config.effectiveFrom, config.effectiveTo, config.isActive)
        configId = result.lastInsertRowid
      }
      tiers.forEach((t, i) => {
        prepare(db, `INSERT INTO kpi_tiers (config_id, threshold_pct, score, tier_order) VALUES (?,?,?,?)`)
          .run(configId, t.thresholdPct, t.score, i + 1)
      })
    })
    return { success: true, id: configId! }
  })

  ipcMain.handle('kpi:deleteConfig', async (_e, token: string, configId: number) => {
    requireAdmin(token)
    const db = getDb()
    transaction(db, () => {
      prepare(db, `DELETE FROM kpi_tiers WHERE config_id = ?`).run(configId)
      prepare(db, `DELETE FROM kpi_tier_configs WHERE id = ?`).run(configId)
    })
    return { success: true }
  })

  ipcMain.handle('kpi:saveMetricMultiplier', async (_e, token: string, metricId: number, pointsPerUnit: number) => {
    requireAdmin(token)
    prepare(getDb(), `UPDATE kpi_metrics SET points_per_unit = ? WHERE id = ?`).run(pointsPerUnit, metricId)
    return { success: true }
  })

  ipcMain.handle('kpi:saveBranchKpiTarget', async (_e, token: string, branchId: number, target: number) => {
    requireAdmin(token)
    prepare(getDb(), `UPDATE branches SET kpi_point_target = ? WHERE id = ?`).run(target, branchId)
    return { success: true }
  })

  ipcMain.handle('kpi:getMonthlyBranchTargets', async (_e, token: string, year: number, month: number) => {
    requireAuth(token)
    const db = getDb()
    const branches = prepare(db, `SELECT id, name, code, kpi_point_target FROM branches ORDER BY id`).all() as Array<{
      id: number; name: string; code: string; kpi_point_target: number
    }>
    return branches.map(b => {
      const monthly = prepare(db, `
        SELECT kpi_point_target FROM branch_kpi_monthly_targets WHERE branch_id=? AND year=? AND month=?
      `).get(b.id, year, month) as { kpi_point_target: number } | undefined
      return {
        ...b,
        monthly_target: monthly?.kpi_point_target ?? null,
        effective_target: monthly?.kpi_point_target ?? b.kpi_point_target,
      }
    })
  })

  ipcMain.handle('kpi:saveMonthlyBranchTargets', async (_e, token: string, year: number, month: number,
    targets: Array<{ branchId: number; target: number }>
  ) => {
    requireAdmin(token)
    const db = getDb()
    transaction(db, () => {
      for (const { branchId, target } of targets) {
        prepare(db, `
          INSERT OR REPLACE INTO branch_kpi_monthly_targets (branch_id, year, month, kpi_point_target)
          VALUES (?,?,?,?)
        `).run(branchId, year, month, target)
      }
    })
    return { success: true }
  })

  ipcMain.handle('kpi:getFormula', async (_e, token: string) => {
    requireAuth(token)
    const db = getDb()
    const baseRow   = prepare(db, `SELECT value FROM app_settings WHERE key='kpi_total_base'`).get()   as { value: string } | undefined
    const weightRow = prepare(db, `SELECT value FROM app_settings WHERE key='kpi_total_weight'`).get() as { value: string } | undefined
    return {
      base:   parseFloat(baseRow?.value   ?? '8000'),
      weight: parseFloat(weightRow?.value ?? '50'),
    }
  })

  ipcMain.handle('kpi:saveFormula', async (_e, token: string, base: number, weight: number) => {
    requireAdmin(token)
    const db = getDb()
    prepare(db, `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('kpi_total_base', ?)`  ).run(String(base))
    prepare(db, `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('kpi_total_weight', ?)`).run(String(weight))
    return { success: true }
  })

  ipcMain.handle('kpi:simulate', async (_e, token: string, metricId: number, branchId: number | null, actual: number, target: number) => {
    requireAuth(token)
    const today = new Date().toISOString().split('T')[0]
    return computeKpiScore(getDb(), metricId, branchId ?? 0, actual, target, today)
  })

  ipcMain.handle('kpi:getSupKpiPct', async (_e, token: string) => {
    requireAuth(token)
    const row = prepare(getDb(), `SELECT value FROM app_settings WHERE key='sup_kpi_pct'`).get() as { value: string } | undefined
    return { pct: parseFloat(row?.value ?? '30') }
  })

  ipcMain.handle('kpi:saveSupKpiPct', async (_e, token: string, pct: number) => {
    requireAdmin(token)
    prepare(getDb(), `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('sup_kpi_pct', ?)`).run(String(pct))
    return { success: true }
  })
}
