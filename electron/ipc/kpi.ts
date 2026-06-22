import { IpcMain } from 'electron'
import { getDb } from '../db/connection'
import { prepare, transaction } from '../db/query'
import { requireAuth, requireAdmin, logAudit } from './auth'
import {
  pushMonthlyTargetsIfConfigured, pushKpiRatesIfConfigured, pushQtyTiersIfConfigured,
  pushBranchesIfConfigured, pushKpiSubmissionsIfConfigured,
} from './sheets'
import type { Database } from 'better-sqlite3'

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
  const ym = date.slice(0, 4) + date.slice(5, 7) // YYYY-MM-DD -> YYYYMM

  // Staff-type-specific rate takes priority over metric default (jewelry/bar). Most specific
  // wins: branch+month > branch+standing(no month) > global+standing. A rate set for a
  // specific month never changes how earlier months scored — that's the whole point of
  // year_month existing here instead of one eternal value.
  if (staffType) {
    const typeRate = prepare(db, `
      SELECT points_per_unit FROM kpi_metric_type_rates
      WHERE metric_id = ? AND staff_type = ?
        AND (branch_id = ? OR branch_id IS NULL)
        AND (year_month = ? OR year_month IS NULL)
      ORDER BY
        CASE WHEN branch_id   IS NULL THEN 1 ELSE 0 END,
        CASE WHEN year_month  IS NULL THEN 1 ELSE 0 END
      LIMIT 1
    `).get(metricId, staffType, branchId, ym) as { points_per_unit: number } | undefined
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

  // Quantity: tier lookup — staff_type-specific config wins over NULL, branch-specific wins
  // over global, and a config bounded to a specific month wins over an open-ended "standing"
  // config covering everything — same reasoning as the rate lookup above.
  const config = prepare(db, `
    SELECT id FROM kpi_tier_configs
    WHERE metric_id = ?
      AND (branch_id = ? OR branch_id IS NULL)
      AND (staff_type = ? OR staff_type IS NULL)
      AND is_active = 1
      AND effective_from <= ?
      AND (effective_to IS NULL OR effective_to >= ?)
    ORDER BY
      CASE WHEN branch_id    IS NULL THEN 1 ELSE 0 END,
      CASE WHEN staff_type   IS NULL THEN 1 ELSE 0 END,
      CASE WHEN effective_to IS NULL THEN 1 ELSE 0 END,
      effective_from DESC
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
    pushQtyTiersIfConfigured(db).catch(() => {})
    logAudit(db, u.id, u.username, u.role, config.id ? 'kpi_config_update' : 'kpi_config_create', config.label, 'kpi_tier_config', String(configId!))
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
    logAudit(db, u.id, u.username, u.role, 'kpi_config_delete', undefined, 'kpi_tier_config', String(configId))
    return { success: true }
  })

  ipcMain.handle('kpi:saveMetricMultiplier', async (_e, token: string, metricId: number, pointsPerUnit: number) => {
    const u = requireAuth(token)
    if (!['admin','hr'].includes(u.role)) throw new Error('Forbidden')
    const db = getDb()
    prepare(db, `UPDATE kpi_metrics SET points_per_unit = ? WHERE id = ?`).run(pointsPerUnit, metricId)
    logAudit(db, u.id, u.username, u.role, 'kpi_metric_multiplier_update', `metric ${metricId} → ${pointsPerUnit}`, 'kpi_metric', String(metricId))
    return { success: true }
  })

  // Jewelry/Bar B2C+B2B rates resolved for one branch AS OF a specific month — same priority
  // as computeKpiScore (branch+month > branch+standing > global+standing), so what HR sees
  // here always matches what actually scored that month.
  ipcMain.handle('kpi:getBranchMetricRates', async (_e, token: string, branchId: number, year: number, month: number) => {
    requireAuth(token)
    const db = getDb()
    const ym = `${year}${String(month).padStart(2, '0')}`
    const rows = prepare(db, `
      SELECT metric_id, staff_type, branch_id, year_month, points_per_unit FROM kpi_metric_type_rates
      WHERE metric_id IN (1,2)
        AND (branch_id = ? OR branch_id IS NULL)
        AND (year_month = ? OR year_month IS NULL)
    `).all(branchId, ym) as Array<{ metric_id: number; staff_type: string; branch_id: number | null; year_month: string | null; points_per_unit: number }>

    const result: Record<'jewelry' | 'bar', Record<'b2c' | 'b2b', number>> = {
      jewelry: { b2c: 0, b2b: 0 }, bar: { b2c: 0, b2b: 0 },
    }
    // specificity score: branch+month=3, branch+standing=2, global+month=1, global+standing=0
    const bestScore: Record<string, number> = {}
    for (const r of rows) {
      const metric = r.metric_id === 1 ? 'jewelry' : 'bar'
      const type = r.staff_type as 'b2c' | 'b2b'
      const key = `${metric}-${type}`
      const score = (r.branch_id !== null ? 2 : 0) + (r.year_month !== null ? 1 : 0)
      if ((bestScore[key] ?? -1) < score) { bestScore[key] = score; result[metric][type] = r.points_per_unit }
    }
    return result
  })

  ipcMain.handle('kpi:saveBranchMetricRates', async (_e, token: string, branchId: number, year: number, month: number, rates: {
    jewelry: { b2c: number; b2b: number }; bar: { b2c: number; b2b: number }
  }) => {
    const u = requireAuth(token)
    if (!['admin','hr'].includes(u.role)) throw new Error('Forbidden')
    const db = getDb()
    const ym = `${year}${String(month).padStart(2, '0')}`
    transaction(db, () => {
      const writes: Array<[number, 'b2c' | 'b2b', number]> = [
        [1, 'b2c', rates.jewelry.b2c], [1, 'b2b', rates.jewelry.b2b],
        [2, 'b2c', rates.bar.b2c],     [2, 'b2b', rates.bar.b2b],
      ]
      for (const [metricId, staffType, pointsPerUnit] of writes) {
        // Only replaces THIS month's row — past/future months' rates are untouched
        prepare(db, `DELETE FROM kpi_metric_type_rates WHERE metric_id=? AND branch_id=? AND staff_type=? AND year_month=?`).run(metricId, branchId, staffType, ym)
        prepare(db, `INSERT INTO kpi_metric_type_rates (metric_id, branch_id, staff_type, year_month, points_per_unit) VALUES (?,?,?,?,?)`).run(metricId, branchId, staffType, ym, pointsPerUnit)
      }
    })
    pushKpiRatesIfConfigured(db).catch(() => {})
    logAudit(db, u.id, u.username, u.role, 'kpi_branch_rates_update',
      `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month-1]} ${year} — J:${rates.jewelry.b2c}/${rates.jewelry.b2b} B:${rates.bar.b2c}/${rates.bar.b2b}`,
      'branch', String(branchId), branchId)
    return { success: true }
  })

  // Qty tier config active for a branch+type AS OF a specific month — mirrors the same
  // date-range AND staff_type priority computeKpiScore uses, so this always shows what
  // actually scored that month. Falls back to an old type-less (staff_type IS NULL) config
  // from before this split existed, so a branch that's never had B2C/B2B tiers set
  // separately still shows its previous shared tiers as the starting point for both.
  ipcMain.handle('kpi:getBranchQtyTiers', async (_e, token: string, branchId: number, year: number, month: number, staffType: 'b2c' | 'b2b') => {
    requireAuth(token)
    const db = getDb()
    const probeDate = `${year}-${String(month).padStart(2, '0')}-15`
    const config = prepare(db, `
      SELECT id, label, effective_from, effective_to FROM kpi_tier_configs
      WHERE metric_id = 3 AND (branch_id = ? OR branch_id IS NULL) AND (staff_type = ? OR staff_type IS NULL) AND is_active = 1
        AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
      ORDER BY
        CASE WHEN branch_id    IS NULL THEN 1 ELSE 0 END,
        CASE WHEN staff_type   IS NULL THEN 1 ELSE 0 END,
        CASE WHEN effective_to IS NULL THEN 1 ELSE 0 END,
        effective_from DESC
      LIMIT 1
    `).get(branchId, staffType, probeDate, probeDate) as { id: number; label: string; effective_from: string; effective_to: string | null } | undefined
    if (!config) return { configId: null, tiers: [], label: null }
    const tiers = prepare(db, `SELECT id, threshold_pct, score FROM kpi_tiers WHERE config_id = ? ORDER BY threshold_pct DESC`).all(config.id)
    return { configId: config.id, tiers, label: config.label }
  })

  ipcMain.handle('kpi:saveBranchQtyTiers', async (_e, token: string, branchId: number, year: number, month: number,
    tiers: Array<{ thresholdPct: number; score: number }>, staffType: 'b2c' | 'b2b'
  ) => {
    const u = requireAuth(token)
    if (!['admin','hr'].includes(u.role)) throw new Error('Forbidden')
    const db = getDb()
    const branch = prepare(db, `SELECT code FROM branches WHERE id = ?`).get(branchId) as { code: string } | undefined
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const monthEnd   = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
    const monthLabel = `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month - 1]} ${year}`
    let configId: number
    transaction(db, () => {
      // Exact match on this month's bounds + staff_type — editing the same month/type again
      // updates in place; a different month or type always gets its own config.
      const existing = prepare(db, `
        SELECT id FROM kpi_tier_configs
        WHERE metric_id = 3 AND branch_id = ? AND staff_type = ? AND effective_from = ? AND effective_to = ?
      `).get(branchId, staffType, monthStart, monthEnd) as { id: number } | undefined
      if (existing) {
        configId = existing.id
        prepare(db, `DELETE FROM kpi_tiers WHERE config_id = ?`).run(configId)
      } else {
        const result = prepare(db, `
          INSERT INTO kpi_tier_configs (metric_id, branch_id, staff_type, label, effective_from, effective_to, is_active)
          VALUES (3, ?, ?, ?, ?, ?, 1)
        `).run(branchId, staffType, `${branch?.code ?? 'Branch'} ${staffType.toUpperCase()} Qty Tiers — ${monthLabel}`, monthStart, monthEnd)
        configId = result.lastInsertRowid as number
      }
      tiers.sort((a, b) => b.thresholdPct - a.thresholdPct).forEach((t, i) => {
        prepare(db, `INSERT INTO kpi_tiers (config_id, threshold_pct, score, tier_order) VALUES (?,?,?,?)`)
          .run(configId, t.thresholdPct, t.score, i + 1)
      })
    })
    pushQtyTiersIfConfigured(db).catch(() => {})
    logAudit(db, u.id, u.username, u.role, 'kpi_branch_qty_tiers_update',
      `branch ${branchId} ${staffType} — ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month-1]} ${year}`, 'branch', String(branchId), branchId)
    return { success: true, configId: configId! }
  })

  ipcMain.handle('kpi:saveBranchKpiTarget', async (_e, token: string, branchId: number, target: number) => {
    const u = requireAdmin(token)
    const db = getDb()
    prepare(db, `UPDATE branches SET kpi_point_target = ? WHERE id = ?`).run(target, branchId)
    pushBranchesIfConfigured(db).catch(() => {})
    logAudit(db, u.id, u.username, u.role, 'kpi_branch_target_update', `target → ${target}`, 'branch', String(branchId), branchId)
    return { success: true }
  })

  // Branch Point Target Defaults — B2C and B2B required, replacing the single combined
  // number. kpi_point_target stays in sync as their average, purely for the legacy
  // "pts/person" cosmetic display — getBranchPointTarget's real scoring path uses the
  // type-specific columns directly, never this average.
  ipcMain.handle('kpi:saveBranchTargetDefaults', async (_e, token: string, branchId: number, targetB2c: number, targetB2b: number) => {
    const u = requireAdmin(token)
    const db = getDb()
    prepare(db, `UPDATE branches SET target_b2c_default=?, target_b2b_default=?, kpi_point_target=? WHERE id=?`)
      .run(targetB2c, targetB2b, Math.round((targetB2c + targetB2b) / 2), branchId)
    pushBranchesIfConfigured(db).catch(() => {})
    logAudit(db, u.id, u.username, u.role, 'kpi_branch_target_defaults_update', `B2C ${targetB2c} / B2B ${targetB2b}`, 'branch', String(branchId), branchId)
    return { success: true }
  })

  ipcMain.handle('kpi:getMonthlyBranchTargets', async (_e, token: string, year: number, month: number) => {
    requireAuth(token)
    const db = getDb()
    const branches = prepare(db, `SELECT id, name, code, kpi_point_target, target_b2c_default, target_b2b_default FROM branches ORDER BY id`).all() as Array<{
      id: number; name: string; code: string; kpi_point_target: number; target_b2c_default: number | null; target_b2b_default: number | null
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
    logAudit(db, u.id, u.username, u.role, 'kpi_monthly_branch_targets_update',
      `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month-1]} ${year} — ${targets.length} branch(es)`, 'branch_kpi_monthly_targets')
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
    const u = requireAdmin(token)
    const db = getDb()
    prepare(db, `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('kpi_total_base', ?)`  ).run(String(base))
    prepare(db, `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('kpi_total_weight', ?)`).run(String(weight))
    logAudit(db, u.id, u.username, u.role, 'kpi_formula_update', `base ${base}, weight ${weight}`, 'app_settings')
    return { success: true }
  })

  ipcMain.handle('kpi:simulate', async (_e, token: string, metricId: number, branchId: number | null, actual: number, target: number, staffType?: string) => {
    requireAuth(token)
    const today = new Date().toISOString().split('T')[0]
    return computeKpiScore(getDb(), metricId, branchId ?? 0, actual, target, today, staffType)
  })

  ipcMain.handle('kpi:getSupKpiPct', async (_e, token: string) => {
    requireAuth(token)
    const row = prepare(getDb(), `SELECT value FROM app_settings WHERE key='sup_kpi_pct'`).get() as { value: string } | undefined
    return { pct: parseFloat(row?.value ?? '30') }
  })

  ipcMain.handle('kpi:saveSupKpiPct', async (_e, token: string, pct: number) => {
    const u = requireAdmin(token)
    const db = getDb()
    prepare(db, `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('sup_kpi_pct', ?)`).run(String(pct))
    logAudit(db, u.id, u.username, u.role, 'kpi_sup_pct_update', `${pct}%`, 'app_settings')
    return { success: true }
  })

  // ── Monthly submission tracking ─────────────────────────────────────────
  // Soft-warn workflow: a month with no submission still scores fine (computeKpiScore's
  // existing fallback chain keeps working untouched) — this is purely a visibility signal
  // so HR/Admin see a banner reminding them to confirm the month, even if nothing changed.
  ipcMain.handle('kpi:isMonthSubmitted', async (_e, token: string, year: number, month: number) => {
    requireAuth(token)
    const ym = `${year}${String(month).padStart(2, '0')}`
    const row = prepare(getDb(), `SELECT 1 FROM kpi_monthly_submissions WHERE year_month = ?`).get(ym)
    return { submitted: !!row }
  })

  ipcMain.handle('kpi:markMonthSubmitted', async (_e, token: string, year: number, month: number) => {
    const u = requireAuth(token)
    if (!['admin', 'hr'].includes(u.role)) throw new Error('Forbidden')
    const db = getDb()
    const ym = `${year}${String(month).padStart(2, '0')}`
    prepare(db, `INSERT OR REPLACE INTO kpi_monthly_submissions (year_month, submitted_by, submitted_at) VALUES (?, ?, datetime('now'))`)
      .run(ym, u.username)
    pushKpiSubmissionsIfConfigured(db).catch(() => {})
    logAudit(db, u.id, u.username, u.role, 'kpi_month_confirmed', ym, 'kpi_monthly_submissions', ym)
    return { success: true }
  })

  // ── Admin-maintained defaults ────────────────────────────────────────────
  // "Defaults" is just the existing standing rows every rate/tier lookup already falls back
  // to (year_month IS NULL for rates, effective_to IS NULL for tiers) — there was previously
  // no UI path to edit them directly, only month-scoped values. This exposes that path so
  // Admin can maintain one canonical default set, and HR can pull it into a new month via
  // "Use Defaults" without retyping every box by hand.
  ipcMain.handle('kpi:getDefaultMetricRates', async (_e, token: string, branchId: number) => {
    requireAuth(token)
    const db = getDb()
    const rows = prepare(db, `
      SELECT metric_id, staff_type, points_per_unit FROM kpi_metric_type_rates
      WHERE metric_id IN (1,2) AND year_month IS NULL AND (branch_id = ? OR branch_id IS NULL)
      ORDER BY CASE WHEN branch_id IS NULL THEN 1 ELSE 0 END
    `).all(branchId) as Array<{ metric_id: number; staff_type: string; points_per_unit: number }>
    const result: Record<'jewelry' | 'bar', Record<'b2c' | 'b2b', number>> = {
      jewelry: { b2c: 0, b2b: 0 }, bar: { b2c: 0, b2b: 0 },
    }
    for (const r of rows) {
      const metric = r.metric_id === 1 ? 'jewelry' : 'bar'
      const type = r.staff_type as 'b2c' | 'b2b'
      if (result[metric][type] === 0) result[metric][type] = r.points_per_unit // branch-specific row already came first
    }
    return result
  })

  ipcMain.handle('kpi:saveDefaultMetricRates', async (_e, token: string, branchId: number, rates: {
    jewelry: { b2c: number; b2b: number }; bar: { b2c: number; b2b: number }
  }) => {
    const u = requireAdmin(token)
    const db = getDb()
    transaction(db, () => {
      const writes: Array<[number, 'b2c' | 'b2b', number]> = [
        [1, 'b2c', rates.jewelry.b2c], [1, 'b2b', rates.jewelry.b2b],
        [2, 'b2c', rates.bar.b2c],     [2, 'b2b', rates.bar.b2b],
      ]
      for (const [metricId, staffType, pointsPerUnit] of writes) {
        prepare(db, `DELETE FROM kpi_metric_type_rates WHERE metric_id=? AND branch_id=? AND staff_type=? AND year_month IS NULL`).run(metricId, branchId, staffType)
        prepare(db, `INSERT INTO kpi_metric_type_rates (metric_id, branch_id, staff_type, year_month, points_per_unit) VALUES (?,?,?,NULL,?)`).run(metricId, branchId, staffType, pointsPerUnit)
      }
    })
    pushKpiRatesIfConfigured(db).catch(() => {})
    logAudit(db, u.id, u.username, u.role, 'kpi_default_rates_update',
      `J:${rates.jewelry.b2c}/${rates.jewelry.b2b} B:${rates.bar.b2c}/${rates.bar.b2b}`, 'branch', String(branchId), branchId)
    return { success: true }
  })

  ipcMain.handle('kpi:getDefaultQtyTiers', async (_e, token: string, branchId: number, staffType: 'b2c' | 'b2b') => {
    requireAuth(token)
    const db = getDb()
    const config = prepare(db, `
      SELECT id, label FROM kpi_tier_configs
      WHERE metric_id = 3 AND (branch_id = ? OR branch_id IS NULL) AND (staff_type = ? OR staff_type IS NULL) AND is_active = 1 AND effective_to IS NULL
      ORDER BY CASE WHEN branch_id IS NULL THEN 1 ELSE 0 END, CASE WHEN staff_type IS NULL THEN 1 ELSE 0 END
      LIMIT 1
    `).get(branchId, staffType) as { id: number; label: string } | undefined
    if (!config) return { configId: null, tiers: [], label: null }
    const tiers = prepare(db, `SELECT id, threshold_pct, score FROM kpi_tiers WHERE config_id = ? ORDER BY threshold_pct DESC`).all(config.id)
    return { configId: config.id, tiers, label: config.label }
  })

  ipcMain.handle('kpi:saveDefaultQtyTiers', async (_e, token: string, branchId: number,
    tiers: Array<{ thresholdPct: number; score: number }>, staffType: 'b2c' | 'b2b'
  ) => {
    const u = requireAdmin(token)
    const db = getDb()
    const branch = prepare(db, `SELECT code FROM branches WHERE id = ?`).get(branchId) as { code: string } | undefined
    let configId: number
    transaction(db, () => {
      const existing = prepare(db, `
        SELECT id FROM kpi_tier_configs WHERE metric_id = 3 AND branch_id = ? AND staff_type = ? AND effective_to IS NULL
      `).get(branchId, staffType) as { id: number } | undefined
      if (existing) {
        configId = existing.id
        prepare(db, `DELETE FROM kpi_tiers WHERE config_id = ?`).run(configId)
      } else {
        const result = prepare(db, `
          INSERT INTO kpi_tier_configs (metric_id, branch_id, staff_type, label, effective_from, effective_to, is_active)
          VALUES (3, ?, ?, ?, '2000-01-01', NULL, 1)
        `).run(branchId, staffType, `${branch?.code ?? 'Branch'} ${staffType.toUpperCase()} Qty Tiers — Default`)
        configId = result.lastInsertRowid as number
      }
      tiers.sort((a, b) => b.thresholdPct - a.thresholdPct).forEach((t, i) => {
        prepare(db, `INSERT INTO kpi_tiers (config_id, threshold_pct, score, tier_order) VALUES (?,?,?,?)`)
          .run(configId, t.thresholdPct, t.score, i + 1)
      })
    })
    pushQtyTiersIfConfigured(db).catch(() => {})
    logAudit(db, u.id, u.username, u.role, 'kpi_default_qty_tiers_update', `branch ${branchId} ${staffType}`, 'branch', String(branchId), branchId)
    return { success: true, configId: configId! }
  })
}
