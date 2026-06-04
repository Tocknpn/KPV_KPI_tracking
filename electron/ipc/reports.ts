import { IpcMain } from 'electron'
import { getDb } from '../db/connection'
import { prepare } from '../db/query'
import { requireAuth } from './auth'
import { computeKpiScore } from './kpi'

function buildBranchFilter(ids: number[]): { sql: string; params: number[] } {
  if (ids.length === 0) return { sql: '', params: [] }
  return {
    sql: `AND branch_id IN (${ids.map(() => '?').join(',')})`,
    params: ids,
  }
}

function buildSalesmenBranchFilter(ids: number[]): { sql: string; params: number[] } {
  if (ids.length === 0) return { sql: '', params: [] }
  return {
    sql: `AND s.branch_id IN (${ids.map(() => '?').join(',')})`,
    params: ids,
  }
}

function getBranchPointTarget(db: import('sql.js').Database, branchId: number, year: number, month: number): number {
  const monthly = prepare(db, `
    SELECT kpi_point_target FROM branch_kpi_monthly_targets WHERE branch_id=? AND year=? AND month=?
  `).get(branchId, year, month) as { kpi_point_target: number } | undefined
  if (monthly) return monthly.kpi_point_target
  const branch = prepare(db, `SELECT kpi_point_target FROM branches WHERE id = ?`).get(branchId) as { kpi_point_target: number } | undefined
  return branch?.kpi_point_target ?? 0
}

export function registerReportHandlers(ipcMain: IpcMain): void {

  // branchIds=[]=all, dateFrom/dateTo filter entries, year/month used for target lookup
  ipcMain.handle('report:dashboard', async (_e,
    token: string, branchIds: number[], year: number, month: number,
    dateFrom: string, dateTo: string,
  ) => {
    const user = requireAuth(token)
    const effectiveBranchIds: number[] = user.role === 'supervisor' ? [user.branch_id ?? 1] : branchIds
    const db = getDb()

    const daysInMonth = new Date(year, month, 0).getDate()
    const dayOfMonth  = new Date(dateTo + 'T00:00:00').getDate()

    const { sql: bSql, params: bParams } = buildBranchFilter(effectiveBranchIds)

    const mtd = prepare(db, `
      SELECT COALESCE(SUM(jewelry_weight_g),0) AS total_jewelry,
             COALESCE(SUM(bar_weight_g),0)     AS total_bar,
             COALESCE(SUM(quantity),0)          AS total_qty
      FROM daily_entries
      WHERE 1=1 ${bSql} AND entry_date >= ? AND entry_date <= ?
    `).get(...bParams, dateFrom, dateTo) as { total_jewelry: number; total_bar: number; total_qty: number }

    const kpiBranchId = effectiveBranchIds.length === 1 ? effectiveBranchIds[0] : 0

    const kpiScoreJewelry = computeKpiScore(db, 1, kpiBranchId, mtd?.total_jewelry ?? 0, 0, dateTo).score
    const kpiScoreBar     = computeKpiScore(db, 2, kpiBranchId, mtd?.total_bar     ?? 0, 0, dateTo).score
    const kpiScoreQty     = computeKpiScore(db, 3, kpiBranchId, mtd?.total_qty     ?? 0, 0, dateTo).score
    const kpiTotalScore   = kpiScoreJewelry + kpiScoreBar + kpiScoreQty

    const { sql: sBranchSqlT, params: sBranchParamsT } = buildSalesmenBranchFilter(effectiveBranchIds)
    const salesmenRows = prepare(db, `
      SELECT s.branch_id FROM salesmen s WHERE s.active = 1 ${sBranchSqlT}
    `).all(...sBranchParamsT) as Array<{ branch_id: number }>
    const kpiPointTarget = salesmenRows.reduce((sum, r) => sum + getBranchPointTarget(db, r.branch_id, year, month), 0)
    const kpiPct = kpiPointTarget > 0 ? (kpiTotalScore / kpiPointTarget) * 100 : 0

    const { sql: sBranchSql, params: sBranchParams } = buildSalesmenBranchFilter(effectiveBranchIds)
    const rawPerformers = prepare(db, `
      SELECT s.id, s.full_name, s.nickname, s.position, s.branch_id,
        COALESCE(SUM(de.jewelry_weight_g),0) AS total_jewelry,
        COALESCE(SUM(de.bar_weight_g),0)     AS total_bar,
        COALESCE(SUM(de.quantity),0)         AS total_qty
      FROM salesmen s
      LEFT JOIN daily_entries de ON de.salesman_id=s.id
        AND de.entry_date >= ? AND de.entry_date <= ?
      WHERE s.active=1 ${sBranchSql}
      GROUP BY s.id
      ORDER BY (COALESCE(SUM(de.jewelry_weight_g),0)+COALESCE(SUM(de.bar_weight_g),0)) DESC
      LIMIT 10
    `).all(dateFrom, dateTo, ...sBranchParams) as Array<{
      id: number; full_name: string; nickname: string; position: string; branch_id: number
      total_jewelry: number; total_bar: number; total_qty: number
    }>

    const topPerformers = rawPerformers.map(p => {
      const js = computeKpiScore(db, 1, p.branch_id, p.total_jewelry, 0, dateTo).score
      const bs = computeKpiScore(db, 2, p.branch_id, p.total_bar,     0, dateTo).score
      const qs = computeKpiScore(db, 3, p.branch_id, p.total_qty,     0, dateTo).score
      const totalScore   = js + bs + qs
      const branchTarget = getBranchPointTarget(db, p.branch_id, year, month)
      const pct          = branchTarget > 0 ? (totalScore / branchTarget) * 100 : 0
      return { ...p, kpi_total_score: totalScore, kpi_pct: pct }
    })

    return {
      mtd: mtd ?? { total_jewelry: 0, total_bar: 0, total_qty: 0 },
      daysInMonth, dayOfMonth,
      kpiScoreJewelry, kpiScoreBar, kpiScoreQty, kpiTotalScore, kpiPointTarget, kpiPct,
      topPerformers,
    }
  })

  // branchIds=[]=all
  ipcMain.handle('report:monthly', async (_e,
    token: string, branchIds: number[], year: number, month: number,
    dateFrom: string, dateTo: string,
  ) => {
    const user = requireAuth(token)
    const effectiveBranchIds: number[] = user.role === 'supervisor' ? [user.branch_id ?? branchIds[0]] : branchIds
    const db = getDb()
    const daysInMonth  = new Date(year, month, 0).getDate()
    const dayOfMonth   = new Date(dateTo + 'T00:00:00').getDate()
    const daysRemaining = Math.max(daysInMonth - dayOfMonth, 0)

    const branchTargetMap = new Map<number, number>()
    const { sql: sBranchSql, params: sBranchParams } = buildSalesmenBranchFilter(effectiveBranchIds)

    const rows = prepare(db, `
      SELECT s.id, s.full_name, s.nickname, s.position, s.branch_id,
        b.name AS branch_name,
        COALESCE(SUM(de.jewelry_weight_g),0) AS actual_jewelry,
        COALESCE(SUM(de.bar_weight_g),0)     AS actual_bar,
        COALESCE(SUM(de.quantity),0)         AS actual_qty
      FROM salesmen s
      LEFT JOIN branches b ON b.id = s.branch_id
      LEFT JOIN daily_entries de ON de.salesman_id=s.id
        AND de.entry_date >= ? AND de.entry_date <= ?
      WHERE s.active=1 ${sBranchSql}
      GROUP BY s.id ORDER BY s.branch_id, s.full_name
    `).all(dateFrom, dateTo, ...sBranchParams) as Array<{
      id: number; full_name: string; nickname: string; position: string
      branch_id: number; branch_name: string
      actual_jewelry: number; actual_bar: number; actual_qty: number
    }>

    const enriched = rows.map(r => {
      const js = computeKpiScore(db, 1, r.branch_id, r.actual_jewelry, 0, dateTo).score
      const bs = computeKpiScore(db, 2, r.branch_id, r.actual_bar,     0, dateTo).score
      const qs = computeKpiScore(db, 3, r.branch_id, r.actual_qty,     0, dateTo).score
      const totalRaw = js + bs + qs
      if (!branchTargetMap.has(r.branch_id))
        branchTargetMap.set(r.branch_id, getBranchPointTarget(db, r.branch_id, year, month))
      const branchTarget = branchTargetMap.get(r.branch_id) ?? 0
      const kpiPct    = branchTarget > 0 ? (totalRaw / branchTarget) * 100 : 0
      const eomKpiPct = dayOfMonth > 0 ? (kpiPct / dayOfMonth) * daysInMonth : 0
      return {
        ...r,
        kpiPointTarget: branchTarget,
        kpiScore: { jewelry: js, bar: bs, qty: qs, total: totalRaw, pct: kpiPct },
        eomKpiPct,
      }
    })
    return { rows: enriched, daysInMonth, dayOfMonth, daysRemaining }
  })

  ipcMain.handle('report:executive', async (_e,
    token: string, year: number, month: number,
    dateFrom: string, dateTo: string,
  ) => {
    requireAuth(token)
    const db = getDb()

    const branches = prepare(db, `SELECT id, name, code FROM branches ORDER BY id`).all() as Array<{
      id: number; name: string; code: string
    }>

    return branches.map(b => {
      const actuals = prepare(db, `
        SELECT COALESCE(SUM(jewelry_weight_g),0) AS actual_jewelry,
               COALESCE(SUM(bar_weight_g),0)     AS actual_bar,
               COALESCE(SUM(quantity),0)          AS actual_qty
        FROM daily_entries
        WHERE branch_id=? AND entry_date >= ? AND entry_date <= ?
      `).get(b.id, dateFrom, dateTo) as { actual_jewelry: number; actual_bar: number; actual_qty: number }

      const js = computeKpiScore(db, 1, b.id, actuals.actual_jewelry, 0, dateTo).score
      const bs = computeKpiScore(db, 2, b.id, actuals.actual_bar,     0, dateTo).score
      const qs = computeKpiScore(db, 3, b.id, actuals.actual_qty,     0, dateTo).score
      const kpiTotalScore = js + bs + qs

      const personRow      = prepare(db, `SELECT COUNT(*) as cnt FROM salesmen WHERE branch_id=? AND active=1`).get(b.id) as { cnt: number }
      const personCount    = personRow.cnt
      const perPersonTarget = getBranchPointTarget(db, b.id, year, month)
      const kpiPointTarget  = personCount * perPersonTarget
      const kpiPct          = kpiPointTarget > 0 ? (kpiTotalScore / kpiPointTarget) * 100 : 0

      return {
        branch_id: b.id, branch_name: b.name, code: b.code,
        actual_jewelry: actuals.actual_jewelry,
        actual_bar: actuals.actual_bar,
        actual_qty: actuals.actual_qty,
        kpi_score_jewelry: js, kpi_score_bar: bs, kpi_score_qty: qs,
        kpi_total_score: kpiTotalScore, kpi_point_target: kpiPointTarget,
        per_person_target: perPersonTarget, kpi_pct: kpiPct, person_count: personCount,
      }
    })
  })

  ipcMain.handle('report:teamPerformance', async (_e,
    token: string, branchIds: number[], year: number, month: number,
    dateFrom: string, dateTo: string,
  ) => {
    requireAuth(token)
    const db = getDb()

    const pctRow = prepare(db, `SELECT value FROM app_settings WHERE key='sup_kpi_pct'`).get() as { value: string } | undefined
    const supKpiPct = parseFloat(pctRow?.value ?? '30')

    const { sql: bSql, params: bParams } = buildSalesmenBranchFilter(branchIds)
    const supervisors = prepare(db, `
      SELECT sv.id, sv.full_name, sv.nickname, sv.branch_id, b.name AS branch_name
      FROM supervisors sv
      JOIN branches b ON b.id = sv.branch_id
      WHERE sv.active = 1 ${branchIds.length > 0 ? `AND sv.branch_id IN (${branchIds.map(() => '?').join(',')})` : ''}
      ORDER BY sv.branch_id, sv.full_name
    `).all(...bParams) as Array<{ id: number; full_name: string; nickname: string; branch_id: number; branch_name: string }>

    return supervisors.map(sup => {
      const reps = prepare(db, `
        SELECT s.id, s.branch_id,
          COALESCE(SUM(de.jewelry_weight_g), 0) AS total_jewelry,
          COALESCE(SUM(de.bar_weight_g),     0) AS total_bar,
          COALESCE(SUM(de.quantity),          0) AS total_qty
        FROM salesmen s
        LEFT JOIN daily_entries de ON de.salesman_id = s.id
          AND de.entry_date >= ? AND de.entry_date <= ?
        WHERE s.supervisor_id = ? AND s.active = 1
        GROUP BY s.id
      `).all(dateFrom, dateTo, sup.id) as Array<{
        id: number; branch_id: number; total_jewelry: number; total_bar: number; total_qty: number
      }>

      let teamScore = 0
      for (const r of reps) {
        const js = computeKpiScore(db, 1, r.branch_id, r.total_jewelry, 0, dateTo).score
        const bs = computeKpiScore(db, 2, r.branch_id, r.total_bar,     0, dateTo).score
        const qs = computeKpiScore(db, 3, r.branch_id, r.total_qty,     0, dateTo).score
        teamScore += js + bs + qs
      }

      const supScore      = teamScore * supKpiPct / 100
      const branchTarget  = getBranchPointTarget(db, sup.branch_id, year, month)
      const teamKpiPct    = branchTarget > 0 ? (teamScore / branchTarget) * 100 : 0
      const supKpiPctAch  = branchTarget > 0 ? (supScore  / branchTarget) * 100 : 0

      return {
        id: sup.id,
        full_name: sup.full_name,
        nickname:  sup.nickname,
        branch_id: sup.branch_id,
        branch_name: sup.branch_name,
        rep_count:        reps.length,
        team_total_score: teamScore,
        team_kpi_pct:     teamKpiPct,
        sup_kpi_pct:      supKpiPct,
        sup_score:        supScore,
        sup_kpi_pct_ach:  supKpiPctAch,
        branch_target:    branchTarget,
      }
    })
  })

  ipcMain.handle('report:branchAnalytics', async (_e,
    token: string, year: number, month: number,
    dateFrom: string, dateTo: string,
  ) => {
    requireAuth(token)
    const db = getDb()
    const dailyTotals = prepare(db, `
      SELECT entry_date,
        COALESCE(SUM(jewelry_weight_g),0) AS jewelry,
        COALESCE(SUM(bar_weight_g),0)     AS bar,
        COALESCE(SUM(quantity),0)         AS qty
      FROM daily_entries
      WHERE entry_date >= ? AND entry_date <= ?
      GROUP BY entry_date ORDER BY entry_date
    `).all(dateFrom, dateTo)
    const branchContrib = prepare(db, `
      SELECT b.id, b.name, b.code,
        COALESCE(SUM(de.jewelry_weight_g+de.bar_weight_g),0) AS total_weight,
        COALESCE(SUM(de.quantity),0) AS total_qty
      FROM branches b
      LEFT JOIN daily_entries de ON de.branch_id=b.id
        AND de.entry_date >= ? AND de.entry_date <= ?
      GROUP BY b.id ORDER BY total_weight DESC
    `).all(dateFrom, dateTo)
    return { dailyTotals, branchContrib }
  })
}
