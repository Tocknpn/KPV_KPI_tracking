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

function getIndividualPointTarget(db: import('sql.js').Database, salesmanId: number, yearMonth: string): number | null {
  const row = prepare(db, `
    SELECT point_target FROM staff_monthly_targets WHERE salesman_id = ? AND year_month = ?
  `).get(salesmanId, yearMonth) as { point_target: number } | undefined
  return row?.point_target ?? null
}

export function registerReportHandlers(ipcMain: IpcMain): void {

  // branchIds=[]=all, dateFrom/dateTo filter entries, year/month used for target lookup
  ipcMain.handle('report:dashboard', async (_e,
    token: string, branchIds: number[], year: number, month: number,
    dateFrom: string, dateTo: string,
  ) => {
    const user = requireAuth(token)
    let effectiveBranchIds: number[]
    if (user.role === 'supervisor' || user.role === 'branch_manager') {
      effectiveBranchIds = [user.branch_id ?? 1]
    } else {
      effectiveBranchIds = branchIds
    }
    const db = getDb()

    const daysInMonth = new Date(year, month, 0).getDate()
    const dayOfMonth  = new Date(dateTo + 'T00:00:00').getDate()

    const { sql: bSql, params: bParams } = buildBranchFilter(effectiveBranchIds)
    const { sql: sBranchSql, params: sBranchParams } = buildSalesmenBranchFilter(effectiveBranchIds)

    // Raw MTD totals for display (jewelry/bar/qty widgets)
    const mtd = prepare(db, `
      SELECT COALESCE(SUM(jewelry_weight_g),0) AS total_jewelry,
             COALESCE(SUM(bar_weight_g),0)     AS total_bar,
             COALESCE(SUM(quantity),0)          AS total_qty
      FROM daily_entries
      WHERE 1=1 ${bSql} AND entry_date >= ? AND entry_date <= ?
    `).get(...bParams, dateFrom, dateTo) as { total_jewelry: number; total_bar: number; total_qty: number }

    // Per-rep scores with staff_type so qty tiers and B2B/B2C rates apply correctly
    const repRows = prepare(db, `
      SELECT s.branch_id, s.staff_type,
        COALESCE(SUM(de.jewelry_weight_g),0) AS j,
        COALESCE(SUM(de.bar_weight_g),0)     AS b,
        COALESCE(SUM(de.quantity),0)          AS q
      FROM salesmen s
      LEFT JOIN daily_entries de ON de.salesman_id = s.id
        AND de.entry_date >= ? AND de.entry_date <= ?
      WHERE s.active = 1 ${sBranchSql}
      GROUP BY s.id
    `).all(dateFrom, dateTo, ...sBranchParams) as Array<{ branch_id: number; staff_type: string; j: number; b: number; q: number }>

    let kpiScoreJewelry = 0, kpiScoreBar = 0, kpiScoreQty = 0, kpiPointTarget = 0
    for (const r of repRows) {
      kpiScoreJewelry += computeKpiScore(db, 1, r.branch_id, r.j, 0, dateTo, r.staff_type).score
      kpiScoreBar     += computeKpiScore(db, 2, r.branch_id, r.b, 0, dateTo, r.staff_type).score
      kpiScoreQty     += computeKpiScore(db, 3, r.branch_id, r.q, 0, dateTo, r.staff_type).score
      kpiPointTarget  += getBranchPointTarget(db, r.branch_id, year, month)
    }
    const kpiTotalScore = kpiScoreJewelry + kpiScoreBar + kpiScoreQty
    const kpiPct = kpiPointTarget > 0 ? (kpiTotalScore / kpiPointTarget) * 100 : 0

    const rawPerformers = prepare(db, `
      SELECT s.id, s.full_name, s.nickname, s.position, s.branch_id, s.staff_type,
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
      id: number; full_name: string; nickname: string; position: string; branch_id: number; staff_type: string
      total_jewelry: number; total_bar: number; total_qty: number
    }>

    const topPerformers = rawPerformers.map(p => {
      const js = computeKpiScore(db, 1, p.branch_id, p.total_jewelry, 0, dateTo, p.staff_type).score
      const bs = computeKpiScore(db, 2, p.branch_id, p.total_bar,     0, dateTo, p.staff_type).score
      const qs = computeKpiScore(db, 3, p.branch_id, p.total_qty,     0, dateTo, p.staff_type).score
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

  // branchIds=[]=all, supervisorId=null=all (for branch_manager/executive filter)
  ipcMain.handle('report:monthly', async (_e,
    token: string, branchIds: number[], year: number, month: number,
    dateFrom: string, dateTo: string, supervisorId?: number,
  ) => {
    const user = requireAuth(token)
    let effectiveBranchIds: number[]
    let effectiveSupervisorId: number | null = supervisorId ?? null

    if (user.role === 'supervisor') {
      effectiveBranchIds = [user.branch_id ?? branchIds[0] ?? 1]
      effectiveSupervisorId = user.supervisor_id
    } else if (user.role === 'branch_manager') {
      effectiveBranchIds = user.branch_id ? [user.branch_id] : branchIds
    } else {
      effectiveBranchIds = branchIds
    }

    const db = getDb()
    const daysInMonth  = new Date(year, month, 0).getDate()
    const dayOfMonth   = new Date(dateTo + 'T00:00:00').getDate()
    const daysRemaining = Math.max(daysInMonth - dayOfMonth, 0)

    const branchTargetMap = new Map<number, number>()
    const { sql: sBranchSql, params: sBranchParams } = buildSalesmenBranchFilter(effectiveBranchIds)
    const supSql    = effectiveSupervisorId ? `AND s.supervisor_id = ?` : ''
    const supParams = effectiveSupervisorId ? [effectiveSupervisorId] : []

    const yearMonth = `${year}${String(month).padStart(2, '0')}`

    const rows = prepare(db, `
      SELECT s.id, s.rep_code, s.full_name, s.nickname, s.position, s.branch_id, s.staff_type,
        b.name AS branch_name,
        sv.full_name AS supervisor_name,
        COALESCE(SUM(de.jewelry_weight_g),0) AS actual_jewelry,
        COALESCE(SUM(de.bar_weight_g),0)     AS actual_bar,
        COALESCE(SUM(de.quantity),0)         AS actual_qty
      FROM salesmen s
      LEFT JOIN branches b ON b.id = s.branch_id
      LEFT JOIN supervisors sv ON sv.id = s.supervisor_id
      LEFT JOIN daily_entries de ON de.salesman_id=s.id
        AND de.entry_date >= ? AND de.entry_date <= ?
      WHERE s.active=1 ${sBranchSql} ${supSql}
      GROUP BY s.id ORDER BY s.branch_id, sv.full_name, s.full_name
    `).all(dateFrom, dateTo, ...sBranchParams, ...supParams) as Array<{
      id: number; rep_code: string | null; full_name: string; nickname: string; position: string
      branch_id: number; branch_name: string; supervisor_name: string | null; staff_type: string
      actual_jewelry: number; actual_bar: number; actual_qty: number
    }>

    const enriched = rows.map(r => {
      const js = computeKpiScore(db, 1, r.branch_id, r.actual_jewelry, 0, dateTo, r.staff_type).score
      const bs = computeKpiScore(db, 2, r.branch_id, r.actual_bar,     0, dateTo, r.staff_type).score
      const qs = computeKpiScore(db, 3, r.branch_id, r.actual_qty,     0, dateTo, r.staff_type).score
      const totalRaw = js + bs + qs
      if (!branchTargetMap.has(r.branch_id))
        branchTargetMap.set(r.branch_id, getBranchPointTarget(db, r.branch_id, year, month))
      const branchTarget = branchTargetMap.get(r.branch_id) ?? 0
      const individualTarget = getIndividualPointTarget(db, r.id, yearMonth) ?? branchTarget
      const kpiPct    = individualTarget > 0 ? (totalRaw / individualTarget) * 100 : 0
      const eomKpiPct = dayOfMonth > 0 ? (kpiPct / dayOfMonth) * daysInMonth : 0
      return {
        ...r,
        supervisor_name: r.supervisor_name ?? null,
        kpiPointTarget: individualTarget,
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
      // Per-rep scoring so qty tiers and B2B/B2C rates apply at individual level (not inflated by aggregation)
      const repRows = prepare(db, `
        SELECT s.staff_type,
          COALESCE(SUM(de.jewelry_weight_g),0) AS actual_jewelry,
          COALESCE(SUM(de.bar_weight_g),0)     AS actual_bar,
          COALESCE(SUM(de.quantity),0)          AS actual_qty
        FROM salesmen s
        LEFT JOIN daily_entries de ON de.salesman_id = s.id
          AND de.entry_date >= ? AND de.entry_date <= ?
        WHERE s.branch_id = ? AND s.active = 1
        GROUP BY s.id
      `).all(dateFrom, dateTo, b.id) as Array<{ staff_type: string; actual_jewelry: number; actual_bar: number; actual_qty: number }>

      let js = 0, bs = 0, qs = 0
      let totalJewelry = 0, totalBar = 0, totalQty = 0
      for (const r of repRows) {
        js += computeKpiScore(db, 1, b.id, r.actual_jewelry, 0, dateTo, r.staff_type).score
        bs += computeKpiScore(db, 2, b.id, r.actual_bar,     0, dateTo, r.staff_type).score
        qs += computeKpiScore(db, 3, b.id, r.actual_qty,     0, dateTo, r.staff_type).score
        totalJewelry += r.actual_jewelry
        totalBar     += r.actual_bar
        totalQty     += r.actual_qty
      }
      const kpiTotalScore = js + bs + qs

      const personCount     = repRows.length
      const perPersonTarget = getBranchPointTarget(db, b.id, year, month)
      const kpiPointTarget  = personCount * perPersonTarget
      const kpiPct          = kpiPointTarget > 0 ? (kpiTotalScore / kpiPointTarget) * 100 : 0

      return {
        branch_id: b.id, branch_name: b.name, code: b.code,
        actual_jewelry: totalJewelry,
        actual_bar:     totalBar,
        actual_qty:     totalQty,
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
    const user = requireAuth(token)
    const db = getDb()

    // branch_manager: always scope to their branch
    const effectiveBranchIds = user.role === 'branch_manager' && user.branch_id
      ? [user.branch_id]
      : branchIds

    const pctRow = prepare(db, `SELECT value FROM app_settings WHERE key='sup_kpi_pct'`).get() as { value: string } | undefined
    const supKpiPct = parseFloat(pctRow?.value ?? '30')

    const { sql: bSql, params: bParams } = buildSalesmenBranchFilter(effectiveBranchIds)
    const supervisors = prepare(db, `
      SELECT sv.id, sv.full_name, sv.nickname, sv.branch_id, sv.staff_type, b.name AS branch_name
      FROM supervisors sv
      JOIN branches b ON b.id = sv.branch_id
      WHERE sv.active = 1 ${effectiveBranchIds.length > 0 ? `AND sv.branch_id IN (${effectiveBranchIds.map(() => '?').join(',')})` : ''}
      ORDER BY sv.branch_id, sv.full_name
    `).all(...bParams) as Array<{ id: number; full_name: string; nickname: string; branch_id: number; staff_type: string; branch_name: string }>

    return supervisors.map(sup => {
      const reps = prepare(db, `
        SELECT s.id, s.branch_id, s.staff_type,
          COALESCE(SUM(de.jewelry_weight_g), 0) AS total_jewelry,
          COALESCE(SUM(de.bar_weight_g),     0) AS total_bar,
          COALESCE(SUM(de.quantity),          0) AS total_qty
        FROM salesmen s
        LEFT JOIN daily_entries de ON de.salesman_id = s.id
          AND de.entry_date >= ? AND de.entry_date <= ?
        WHERE s.supervisor_id = ? AND s.active = 1
        GROUP BY s.id
      `).all(dateFrom, dateTo, sup.id) as Array<{
        id: number; branch_id: number; staff_type: string; total_jewelry: number; total_bar: number; total_qty: number
      }>

      let teamScore = 0
      for (const r of reps) {
        const js = computeKpiScore(db, 1, r.branch_id, r.total_jewelry, 0, dateTo, r.staff_type).score
        const bs = computeKpiScore(db, 2, r.branch_id, r.total_bar,     0, dateTo, r.staff_type).score
        const qs = computeKpiScore(db, 3, r.branch_id, r.total_qty,     0, dateTo, r.staff_type).score
        teamScore += js + bs + qs
      }

      const supScore           = teamScore * supKpiPct / 100
      const perPersonTarget    = getBranchPointTarget(db, sup.branch_id, year, month)
      const teamTarget         = perPersonTarget * reps.length  // correct total: per-person × team size
      const teamKpiPct         = teamTarget > 0 ? (teamScore / teamTarget) * 100 : 0
      const supKpiPctAch       = teamTarget > 0 ? (supScore  / teamTarget) * 100 : 0

      return {
        id: sup.id,
        full_name: sup.full_name,
        nickname:  sup.nickname,
        branch_id: sup.branch_id,
        branch_name: sup.branch_name,
        staff_type: sup.staff_type,
        rep_count:        reps.length,
        team_total_score: teamScore,
        team_kpi_pct:     teamKpiPct,
        sup_kpi_pct:      supKpiPct,
        sup_score:        supScore,
        sup_kpi_pct_ach:  supKpiPctAch,
        branch_target:    teamTarget,  // total target for this supervisor's team (per-person × rep count)
      }
    })
  })

  // 6-month individual rep trend
  ipcMain.handle('report:repHistory', async (_e, token: string, salesmanId: number, numMonths = 6) => {
    requireAuth(token)
    const db = getDb()
    const rep = prepare(db, `
      SELECT s.id, s.rep_code, s.full_name, s.nickname,
             s.branch_id, b.name AS branch_name, b.code AS branch_code,
             s.supervisor_id, sup.full_name AS supervisor_name, s.staff_type, s.active
      FROM salesmen s
      JOIN branches b ON b.id = s.branch_id
      LEFT JOIN supervisors sup ON sup.id = s.supervisor_id
      WHERE s.id = ?
    `).get(salesmanId) as {
      id: number; rep_code: string; full_name: string; nickname: string
      branch_id: number; branch_name: string; branch_code: string
      supervisor_id: number | null; supervisor_name: string | null; staff_type: string; active: number
    } | undefined
    if (!rep) return null

    const months: Array<{ year: number; month: number; ym: string }> = []
    const now = new Date()
    for (let i = numMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1, ym: String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0') })
    }

    const history = months.map(m => {
      const dateFrom = `${m.year}-${String(m.month).padStart(2,'0')}-01`
      const dateTo   = `${m.year}-${String(m.month).padStart(2,'0')}-${new Date(m.year, m.month, 0).getDate()}`
      const act = prepare(db, `
        SELECT COALESCE(SUM(jewelry_weight_g),0) AS j, COALESCE(SUM(bar_weight_g),0) AS b,
               COALESCE(SUM(quantity),0) AS q, COUNT(DISTINCT entry_date) AS days
        FROM daily_entries WHERE salesman_id=? AND entry_date BETWEEN ? AND ?
      `).get(salesmanId, dateFrom, dateTo) as { j: number; b: number; q: number; days: number }
      const targetRow = prepare(db, `SELECT point_target FROM staff_monthly_targets WHERE salesman_id=? AND year_month=?`).get(salesmanId, m.ym) as { point_target: number } | undefined
      const j = act?.j ?? 0; const bar = act?.b ?? 0; const qty = act?.q ?? 0; const pt = targetRow?.point_target ?? 0
      const js = computeKpiScore(db, 1, rep.branch_id, j, 0, dateTo, rep.staff_type).score
      const bs = computeKpiScore(db, 2, rep.branch_id, bar, 0, dateTo, rep.staff_type).score
      const qs = computeKpiScore(db, 3, rep.branch_id, qty, 0, dateTo, rep.staff_type).score
      const total = js + bs + qs
      const commCfg = prepare(db, `SELECT jewelry_rate_lak, bar_rate_lak, qty_rate_lak FROM commission_configs WHERE staff_type=? AND year_month=?`).get(rep.staff_type, m.ym) as { jewelry_rate_lak: number; bar_rate_lak: number; qty_rate_lak: number } | undefined
      const commission_lak = commCfg ? j * commCfg.jewelry_rate_lak + bar * commCfg.bar_rate_lak + qty * commCfg.qty_rate_lak : 0
      return { year: m.year, month: m.month, year_month: m.ym, actual_jewelry: j, actual_bar: bar, actual_qty: qty, kpi_score_jewelry: js, kpi_score_bar: bs, kpi_score_qty: qs, kpi_total_score: total, kpi_pct: pt > 0 ? (total / pt) * 100 : 0, point_target: pt, days_with_entries: act?.days ?? 0, commission_lak }
    })
    return { ...rep, history }
  })

  // Daily entries for a rep in a specific month (for drill-down chart)
  ipcMain.handle('report:repDailyEntries', async (_e, token: string, salesmanId: number, year: number, month: number) => {
    requireAuth(token)
    const db = getDb()
    const dateFrom = `${year}-${String(month).padStart(2,'0')}-01`
    const dateTo   = `${year}-${String(month).padStart(2,'0')}-${new Date(year, month, 0).getDate()}`
    return prepare(db, `SELECT entry_date, jewelry_weight_g, bar_weight_g, quantity FROM daily_entries WHERE salesman_id=? AND entry_date BETWEEN ? AND ? ORDER BY entry_date`).all(salesmanId, dateFrom, dateTo)
  })

  // 6-month supervisor team trend
  ipcMain.handle('report:supHistory', async (_e, token: string, supId: number, numMonths = 6) => {
    requireAuth(token)
    const db = getDb()
    const sup = prepare(db, `
      SELECT sv.id, sv.full_name, sv.nickname, sv.branch_id, b.name AS branch_name, b.code AS branch_code, sv.staff_type, sv.active
      FROM supervisors sv JOIN branches b ON b.id=sv.branch_id WHERE sv.id=?
    `).get(supId) as { id: number; full_name: string; nickname: string; branch_id: number; branch_name: string; branch_code: string; staff_type: string; active: number } | undefined
    if (!sup) return null

    const reps = prepare(db, `SELECT id, branch_id, staff_type FROM salesmen WHERE supervisor_id=? AND active=1`).all(supId) as Array<{ id: number; branch_id: number; staff_type: string }>

    const months: Array<{ year: number; month: number; ym: string }> = []
    const now = new Date()
    for (let i = numMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1, ym: String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0') })
    }

    const history = months.map(m => {
      const dateFrom = `${m.year}-${String(m.month).padStart(2,'0')}-01`
      const dateTo   = `${m.year}-${String(m.month).padStart(2,'0')}-${new Date(m.year, m.month, 0).getDate()}`
      let teamScore = 0; let teamTarget = 0; let teamJ = 0; let teamBar = 0; let teamQty = 0
      for (const r of reps) {
        const act = prepare(db, `SELECT COALESCE(SUM(jewelry_weight_g),0) AS j, COALESCE(SUM(bar_weight_g),0) AS b, COALESCE(SUM(quantity),0) AS q FROM daily_entries WHERE salesman_id=? AND entry_date BETWEEN ? AND ?`).get(r.id, dateFrom, dateTo) as { j: number; b: number; q: number }
        const tRow = prepare(db, `SELECT point_target FROM staff_monthly_targets WHERE salesman_id=? AND year_month=?`).get(r.id, m.ym) as { point_target: number } | undefined
        const j = act?.j ?? 0; const bar = act?.b ?? 0; const qty = act?.q ?? 0; const pt = tRow?.point_target ?? 0
        teamJ += j; teamBar += bar; teamQty += qty; teamTarget += pt
        teamScore += computeKpiScore(db, 1, r.branch_id, j, 0, dateTo, r.staff_type).score + computeKpiScore(db, 2, r.branch_id, bar, 0, dateTo, r.staff_type).score + computeKpiScore(db, 3, r.branch_id, qty, 0, dateTo, r.staff_type).score
      }
      return { year: m.year, month: m.month, year_month: m.ym, actual_jewelry: teamJ, actual_bar: teamBar, actual_qty: teamQty, team_total_score: teamScore, team_kpi_pct: teamTarget > 0 ? (teamScore / teamTarget) * 100 : 0, team_point_target: teamTarget, rep_count: reps.length }
    })
    return { ...sup, rep_count: reps.length, history }
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
        COALESCE(SUM(de.jewelry_weight_g),0) AS total_jewelry,
        COALESCE(SUM(de.bar_weight_g),0)     AS total_bar,
        COALESCE(SUM(de.quantity),0)          AS total_qty
      FROM branches b
      LEFT JOIN daily_entries de ON de.branch_id=b.id
        AND de.entry_date >= ? AND de.entry_date <= ?
      GROUP BY b.id ORDER BY total_weight DESC
    `).all(dateFrom, dateTo)
    return { dailyTotals, branchContrib }
  })
}
