import { IpcMain } from 'electron'
import { getDb } from '../db/connection'
import { prepare, transaction } from '../db/query'
import { requireAuth, requireAdmin } from './auth'
import { pushAllConfigIfConfigured, pushMonthlyTargetsIfConfigured } from './sheets'
import type { Database } from 'sql.js'

export function computeKpiScore(
  db: Database,
  metricId: number,
  branchId: number,
  actual: number,
  target: number,
  date: string = new Date().toISOString().split('T')[0],
  staffType?: string
): { score: number; pct: number; tierId: number | null } {
  const pct = target > 0 ? (actual / target) * 100 : 0

  // Staff-type-specific rate takes priority over metric default (jewelry/bar) —
  // a branch-specific row wins over the global (branch_id IS NULL) row for that type.
  if (staffType) {
    const typeRate = prepare(db, `
      SELECT points_per_unit FROM kpi_metric_type_rates
      WHERE metric_id = ? AND staff_type = ? AND (branch_id = ? OR branch_id IS NULL)
      ORDER BY CASE WHEN branch_id IS NULL THEN 1 ELSE 0 END
      LIMIT 1
    `).get(metricId, staffType, branchId) as { points_per_unit: number } | undefined
    if (typeRate && typeRate.points_per_unit > 0) {
      return { score: actual * typeRate.points_per_unit, pct, tierId: null }
    }
  }

  // Fetch metric default multiplier
  const metric = prepare(db, `SELECT points_per_unit FROM kpi_metrics WHERE id = ?`).get(metricId) as
    | { points_per_unit: number }
    | undefined

  // Jewelry / Bar: direct weight × multiplier
  if (metric && metric.points_per_unit > 0) {
    return { score: actual * metric.points_per_unit, pct, tierId: null }
  }

  // Quantity: tier lookup — staff_type-specific config wins over NULL, branch-specific wins over global
  const config = prepare(db, `
    SELECT id FROM kpi_tier_configs
    WHERE metric_id = ?
      AND (branch_id = ? OR branch_id IS NULL)
      AND (staff_type = ? OR staff_type IS NULL)
      AND is_active = 1
      AND effective_from <= ?
      AND (effective_to IS NULL OR effective_to >= ?)
    ORDER BY
      CASE WHEN branch_id  IS NULL THEN 1 ELSE 0 END,
      CASE WHEN staff_type IS NULL THEN 1 ELSE 0 END
    LIMIT 1
  `).get(metricId, branchId, staffType ?? null, date, date) as { id: number } | undefined

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
    const u = requireAuth(token)
    if (!['admin','hr'].includes(u.role)) throw new Error('Forbidden')
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
    pushAllConfigIfConfigured(db).catch(() => {})
    return { success: true, id: configId! }
  })

  ipcMain.handle('kpi:deleteConfig', async (_e, token: string, configId: number) => {
    const u = requireAuth(token)
    if (!['admin','hr'].includes(u.role)) throw new Error('Forbidden')
    const db = getDb()
    transaction(db, () => {
      prepare(db, `DELETE FROM kpi_tiers WHERE config_id = ?`).run(configId)
      prepare(db, `DELETE FROM kpi_tier_configs WHERE id = ?`).run(configId)
    })
    return { success: true }
  })

  ipcMain.handle('kpi:saveMetricMultiplier', async (_e, token: string, metricId: number, pointsPerUnit: number) => {
    const u = requireAuth(token)
    if (!['admin','hr'].includes(u.role)) throw new Error('Forbidden')
    prepare(getDb(), `UPDATE kpi_metrics SET points_per_unit = ? WHERE id = ?`).run(pointsPerUnit, metricId)
    return { success: true }
  })

  // Jewelry/Bar B2C+B2B rates resolved for one branch — branch override merged over global fallback
  ipcMain.handle('kpi:getBranchMetricRates', async (_e, token: string, branchId: number) => {
    requireAuth(token)
    const db = getDb()
    const rows = prepare(db, `
      SELECT metric_id, staff_type, branch_id, points_per_unit FROM kpi_metric_type_rates
      WHERE metric_id IN (1,2) AND (branch_id = ? OR branch_id IS NULL)
    `).all(branchId) as Array<{ metric_id: number; staff_type: string; branch_id: number | null; points_per_unit: number }>

    const result: Record<'jewelry' | 'bar', Record<'b2c' | 'b2b', number>> = {
      jewelry: { b2c: 0, b2b: 0 }, bar: { b2c: 0, b2b: 0 },
    }
    for (const r of rows) {
      const metric = r.metric_id === 1 ? 'jewelry' : 'bar'
      const type = r.staff_type as 'b2c' | 'b2b'
      // Prefer branch-specific row; only use global if no branch-specific row seen yet
      if (r.branch_id !== null || result[metric][type] === 0) result[metric][type] = r.points_per_unit
    }
    return result
  })

  ipcMain.handle('kpi:saveBranchMetricRates', async (_e, token: string, branchId: number, rates: {
    jewelry: { b2c: number; b2b: number }; bar: { b2c: number; b2b: number }
  }) => {
    const u = requireAuth(token)
    if (!['admin','hr'].includes(u.role)) throw new Error('Forbidden')
    const db = getDb()
    transaction(db, () => {
      const writes: Array<[number, 'b2c' | 'b2b', number]> = [
        [1, 'b2c', rates.jewelry.b2c], [1, 'b2b', rates.jewelry.b2b],
        [2, 'b2c', rates.bar.b2c],     [2, 'b2b', rates.bar.b2b],
      ]
      for (const [metricId, staffType, pointsPerUnit] of writes) {
        prepare(db, `DELETE FROM kpi_metric_type_rates WHERE metric_id=? AND branch_id=? AND staff_type=?`).run(metricId, branchId, staffType)
        prepare(db, `INSERT INTO kpi_metric_type_rates (metric_id, branch_id, staff_type, points_per_unit) VALUES (?,?,?,?)`).run(metricId, branchId, staffType, pointsPerUnit)
      }
    })
    pushAllConfigIfConfigured(db).catch(() => {})
    return { success: true }
  })

  // Find-or-create the single qty tier config for a branch — no profile picker, one config per branch
  ipcMain.handle('kpi:getBranchQtyTiers', async (_e, token: string, branchId: number) => {
    requireAuth(token)
    const db = getDb()
    const config = prepare(db, `
      SELECT id, label FROM kpi_tier_configs WHERE metric_id = 3 AND branch_id = ? AND is_active = 1 LIMIT 1
    `).get(branchId) as { id: number; label: string } | undefined
    if (!config) return { configId: null, tiers: [] }
    const tiers = prepare(db, `SELECT id, threshold_pct, score FROM kpi_tiers WHERE config_id = ? ORDER BY threshold_pct DESC`).all(config.id)
    return { configId: config.id, tiers }
  })

  ipcMain.handle('kpi:saveBranchQtyTiers', async (_e, token: string, branchId: number,
    tiers: Array<{ thresholdPct: number; score: number }>
  ) => {
    const u = requireAuth(token)
    if (!['admin','hr'].includes(u.role)) throw new Error('Forbidden')
    const db = getDb()
    const branch = prepare(db, `SELECT code FROM branches WHERE id = ?`).get(branchId) as { code: string } | undefined
    let configId: number
    transaction(db, () => {
      const existing = prepare(db, `SELECT id FROM kpi_tier_configs WHERE metric_id = 3 AND branch_id = ? AND is_active = 1 LIMIT 1`).get(branchId) as { id: number } | undefined
      if (existing) {
        configId = existing.id
        prepare(db, `DELETE FROM kpi_tiers WHERE config_id = ?`).run(configId)
      } else {
        const result = prepare(db, `
          INSERT INTO kpi_tier_configs (metric_id, branch_id, label, effective_from, effective_to, is_active)
          VALUES (3, ?, ?, '2000-01-01', NULL, 1)
        `).run(branchId, `${branch?.code ?? 'Branch'} Qty Tiers`)
        configId = result.lastInsertRowid as number
      }
      tiers.sort((a, b) => b.thresholdPct - a.thresholdPct).forEach((t, i) => {
        prepare(db, `INSERT INTO kpi_tiers (config_id, threshold_pct, score, tier_order) VALUES (?,?,?,?)`)
          .run(configId, t.thresholdPct, t.score, i + 1)
      })
    })
    pushAllConfigIfConfigured(db).catch(() => {})
    return { success: true, configId: configId! }
  })

  ipcMain.handle('kpi:saveBranchKpiTarget', async (_e, token: string, branchId: number, target: number) => {
    requireAdmin(token)
    const db = getDb()
    prepare(db, `UPDATE branches SET kpi_point_target = ? WHERE id = ?`).run(target, branchId)
    pushAllConfigIfConfigured(db).catch(() => {})
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
        SELECT kpi_point_target, target_b2c, target_b2b FROM branch_kpi_monthly_targets WHERE branch_id=? AND year=? AND month=?
      `).get(b.id, year, month) as { kpi_point_target: number; target_b2c: number | null; target_b2b: number | null } | undefined
      return {
        ...b,
        monthly_target:   monthly?.kpi_point_target ?? null,
        effective_target: monthly?.kpi_point_target ?? b.kpi_point_target,
        target_b2c:       monthly?.target_b2c ?? null,
        target_b2b:       monthly?.target_b2b ?? null,
      }
    })
  })

  ipcMain.handle('kpi:saveMonthlyBranchTargets', async (_e, token: string, year: number, month: number,
    targets: Array<{ branchId: number; target: number; targetB2c?: number | null; targetB2b?: number | null }>
  ) => {
    const u = requireAuth(token)
    if (!['admin','hr'].includes(u.role)) throw new Error('Forbidden')
    const db = getDb()
    transaction(db, () => {
      for (const { branchId, target, targetB2c, targetB2b } of targets) {
        prepare(db, `
          INSERT INTO branch_kpi_monthly_targets (branch_id, year, month, kpi_point_target, target_b2c, target_b2b)
          VALUES (?,?,?,?,?,?)
          ON CONFLICT(branch_id, year, month) DO UPDATE SET
            kpi_point_target=excluded.kpi_point_target,
            target_b2c=excluded.target_b2c,
            target_b2b=excluded.target_b2b
        `).run(branchId, year, month, target, targetB2c ?? null, targetB2b ?? null)
      }
    })
    pushMonthlyTargetsIfConfigured(db).catch(() => {})
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
    pushAllConfigIfConfigured(db).catch(() => {})
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
    const db = getDb()
    prepare(db, `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('sup_kpi_pct', ?)`).run(String(pct))
    pushAllConfigIfConfigured(db).catch(() => {})
    return { success: true }
  })
}
