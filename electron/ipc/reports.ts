import { IpcMain } from 'electron'
import { getDb } from '../db/connection'
import { prepare } from '../db/query'
import { requireAuth } from './auth'
import { computeKpiScore } from './kpi'
import { getHeadcountAsOf, resolveYm, getRosterMapAsOf } from '../db/history'

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

// staffType, if given, prefers the B2C/B2B override saved in KPI Settings — falls back to
// the overall branch target when no type-specific override is set for that month.
export function getBranchPointTarget(db: import('better-sqlite3').Database, branchId: number, year: number, month: number, staffType?: string): number {
  const monthly = prepare(db, `
    SELECT kpi_point_target, target_b2c, target_b2b FROM branch_kpi_monthly_targets WHERE branch_id=? AND year=? AND month=?
  `).get(branchId, year, month) as { kpi_point_target: number; target_b2c: number | null; target_b2b: number | null } | undefined
  if (monthly) {
    if (staffType === 'b2c' && monthly.target_b2c) return monthly.target_b2c
    if (staffType === 'b2b' && monthly.target_b2b) return monthly.target_b2b
    return monthly.kpi_point_target
  }
  const branch = prepare(db, `SELECT kpi_point_target, target_b2c_default, target_b2b_default FROM branches WHERE id = ?`)
    .get(branchId) as { kpi_point_target: number; target_b2c_default: number | null; target_b2b_default: number | null } | undefined
  if (staffType === 'b2c' && branch?.target_b2c_default) return branch.target_b2c_default
  if (staffType === 'b2b' && branch?.target_b2b_default) return branch.target_b2b_default
  return branch?.kpi_point_target ?? 0
}

export function getIndividualPointTarget(db: import('better-sqlite3').Database, salesmanId: number, yearMonth: string): number | null {
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
    if (user.role === 'sales_sup' || user.role === 'branch_manager' || user.role === 'accountant_officer') {
      effectiveBranchIds = [user.branch_id ?? 1]
    } else {
      effectiveBranchIds = branchIds
    }
    const db = getDb()

    const daysInMonth = new Date(year, month, 0).getDate()
    const dayOfMonth  = new Date(dateTo + 'T00:00:00').getDate()

    const { sql: bSql, params: bParams } = buildBranchFilter(effectiveBranchIds)

    // Raw MTD totals for display (jewelry/bar/qty widgets)
    const mtd = prepare(db, `
      SELECT COALESCE(SUM(jewelry_weight_g),0) AS total_jewelry,
             COALESCE(SUM(bar_weight_g),0)     AS total_bar,
             COALESCE(SUM(quantity),0)          AS total_qty
      FROM daily_entries
      WHERE 1=1 ${bSql} AND entry_date >= ? AND entry_date <= ?
    `).get(...bParams, dateFrom, dateTo) as { total_jewelry: number; total_bar: number; total_qty: number }

    // Actuals driven by daily_entries.branch_id/staff_type (entry's own stamped values at
    // time of sale) — not the rep's current roster assignment, so transfers don't lose/
    // mis-price historical data. effectiveBranchIds scoping applies to de.branch_id directly.
    const repRows = prepare(db, `
      SELECT de.salesman_id, de.branch_id, de.staff_type,
        COALESCE(SUM(de.jewelry_weight_g),0) AS j,
        COALESCE(SUM(de.bar_weight_g),0)     AS b,
        COALESCE(SUM(de.quantity),0)          AS q
      FROM daily_entries de
      WHERE 1=1 ${bSql} AND de.entry_date >= ? AND de.entry_date <= ?
      GROUP BY de.salesman_id, de.branch_id, de.staff_type
    `).all(...bParams, dateFrom, dateTo) as Array<{ salesman_id: number; branch_id: number; staff_type: string; j: number; b: number; q: number }>

    let kpiScoreJewelry = 0, kpiScoreBar = 0, kpiScoreQty = 0
    for (const r of repRows) {
      kpiScoreJewelry += computeKpiScore(db, 1, r.branch_id, r.j, 0, dateTo, r.staff_type).score
      kpiScoreBar     += computeKpiScore(db, 2, r.branch_id, r.b, 0, dateTo, r.staff_type).score
      kpiScoreQty     += computeKpiScore(db, 3, r.branch_id, r.q, 0, dateTo, r.staff_type).score
    }
    const kpiTotalScore = kpiScoreJewelry + kpiScoreBar + kpiScoreQty

    // Headcount as it was AT THE END OF THAT MONTH — not today's roster — so transfers/
    // departures since then never change a past month's target/KPI%. Split by staff_type
    // so a branch's B2C/B2B target override (if set in KPI Settings) is actually applied.
    const targetBranches = (effectiveBranchIds.length > 0
      ? effectiveBranchIds
      : (prepare(db, `SELECT id FROM branches`).all() as Array<{ id: number }>).map(r => r.id))
    const kpiPointTarget = targetBranches.reduce((sum, bId) =>
      sum
      + getHeadcountAsOf(db, bId, year, month, 'b2c') * getBranchPointTarget(db, bId, year, month, 'b2c')
      + getHeadcountAsOf(db, bId, year, month, 'b2b') * getBranchPointTarget(db, bId, year, month, 'b2b'),
      0)
    const kpiPct = kpiPointTarget > 0 ? (kpiTotalScore / kpiPointTarget) * 100 : 0

    // Top performers: combine a rep's entries across branches/types (in case of mid-period transfer)
    const perRepRaw = prepare(db, `
      SELECT de.salesman_id, de.branch_id, de.staff_type,
        COALESCE(SUM(de.jewelry_weight_g),0) AS j,
        COALESCE(SUM(de.bar_weight_g),0)     AS b,
        COALESCE(SUM(de.quantity),0)          AS q
      FROM daily_entries de
      WHERE 1=1 ${bSql} AND de.entry_date >= ? AND de.entry_date <= ?
      GROUP BY de.salesman_id, de.branch_id, de.staff_type
    `).all(...bParams, dateFrom, dateTo) as Array<{ salesman_id: number; branch_id: number; staff_type: string; j: number; b: number; q: number }>

    const perRepMap = new Map<number, { totalJewelry: number; totalBar: number; totalQty: number; score: number; branchId: number; staffType: string }>()
    for (const r of perRepRaw) {
      const js = computeKpiScore(db, 1, r.branch_id, r.j, 0, dateTo, r.staff_type).score
      const bs = computeKpiScore(db, 2, r.branch_id, r.b, 0, dateTo, r.staff_type).score
      const qs = computeKpiScore(db, 3, r.branch_id, r.q, 0, dateTo, r.staff_type).score
      const prev = perRepMap.get(r.salesman_id) ?? { totalJewelry: 0, totalBar: 0, totalQty: 0, score: 0, branchId: r.branch_id, staffType: r.staff_type }
      perRepMap.set(r.salesman_id, {
        totalJewelry: prev.totalJewelry + r.j, totalBar: prev.totalBar + r.b, totalQty: prev.totalQty + r.q,
        score: prev.score + js + bs + qs, branchId: r.branch_id, staffType: r.staff_type, // most-recent branch/type wins for target lookup
      })
    }

    const repIds = [...perRepMap.keys()]
    const repInfo = repIds.length
      ? prepare(db, `SELECT id, full_name, nickname, position, branch_id FROM salesmen WHERE id IN (${repIds.map(() => '?').join(',')})`)
          .all(...repIds) as Array<{ id: number; full_name: string; nickname: string; position: string; branch_id: number }>
      : []
    const repInfoMap = new Map(repInfo.map(r => [r.id, r]))

    const topPerformers = [...perRepMap.entries()]
      .sort((a, b) => (b[1].totalJewelry + b[1].totalBar) - (a[1].totalJewelry + a[1].totalBar))
      .slice(0, 10)
      .map(([salesmanId, agg]) => {
      const info = repInfoMap.get(salesmanId)
      const p = { id: salesmanId, full_name: info?.full_name ?? '—', nickname: info?.nickname ?? '', position: info?.position ?? '', branch_id: agg.branchId, total_jewelry: agg.totalJewelry, total_bar: agg.totalBar, total_qty: agg.totalQty }
      const totalScore   = agg.score
      const branchTarget = getBranchPointTarget(db, p.branch_id, year, month, agg.staffType)
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

    if (user.role === 'sales_sup') {
      // No branch filter here — roster_monthly.branch_id for the resolved month is already
      // correct AS OF that month. Filtering by user.branch_id (today's branch) too would AND
      // a live value against a historical one, wrongly blanking past months after a transfer.
      effectiveBranchIds = []
      effectiveSupervisorId = user.supervisor_id
    } else if (user.role === 'branch_manager' || user.role === 'accountant_officer') {
      effectiveBranchIds = user.branch_id ? [user.branch_id] : branchIds
    } else {
      effectiveBranchIds = branchIds
    }

    const db = getDb()
    const daysInMonth  = new Date(year, month, 0).getDate()
    const dayOfMonth   = new Date(dateTo + 'T00:00:00').getDate()
    const daysRemaining = Math.max(daysInMonth - dayOfMonth, 0)

    const branchTargetMap = new Map<string, number>()
    const yearMonth = `${year}${String(month).padStart(2, '0')}`

    // Who's "on the team" for this row, which branch they're filed under, and which rate/
    // target applies to them must all reflect what was true AS OF this month — not today's
    // roster — so a later transfer or deactivation never changes how a past month reads.
    // Only SCORING separately re-derives entry.branch_id/staff_type (stamped at write time),
    // which is what actually protects the score itself from retroactive re-pricing.
    const resolvedYm = resolveYm(db, year, month)
    const rmBranchSql = effectiveBranchIds.length > 0 ? `AND rm.branch_id IN (${effectiveBranchIds.map(() => '?').join(',')})` : ''
    const rmBranchParams = effectiveBranchIds.length > 0 ? effectiveBranchIds : []
    const rmSupSql    = effectiveSupervisorId ? `AND rm.supervisor_id = ?` : ''
    const rmSupParams = effectiveSupervisorId ? [effectiveSupervisorId] : []

    const baseRows = resolvedYm ? prepare(db, `
      SELECT s.id, s.rep_code, s.full_name, s.nickname, s.position, rm.branch_id, rm.staff_type,
        b.name AS branch_name,
        sv.full_name AS supervisor_name
      FROM roster_monthly rm
      JOIN salesmen s ON s.id = rm.salesman_id
      LEFT JOIN branches b ON b.id = rm.branch_id
      LEFT JOIN supervisors sv ON sv.id = rm.supervisor_id
      WHERE rm.year_month = ? AND rm.active=1 ${rmBranchSql} ${rmSupSql}
      ORDER BY rm.branch_id, sv.full_name, s.full_name
    `).all(resolvedYm, ...rmBranchParams, ...rmSupParams) as Array<{
      id: number; rep_code: string | null; full_name: string; nickname: string; position: string
      branch_id: number; branch_name: string; supervisor_name: string | null; staff_type: string
    }> : []

    const repIds = baseRows.map(r => r.id)
    const entryGroups = repIds.length ? prepare(db, `
      SELECT salesman_id, branch_id, staff_type,
        COALESCE(SUM(jewelry_weight_g),0) AS j, COALESCE(SUM(bar_weight_g),0) AS b, COALESCE(SUM(quantity),0) AS q
      FROM daily_entries
      WHERE salesman_id IN (${repIds.map(() => '?').join(',')}) AND entry_date >= ? AND entry_date <= ?
      GROUP BY salesman_id, branch_id, staff_type
    `).all(...repIds, dateFrom, dateTo) as Array<{ salesman_id: number; branch_id: number; staff_type: string; j: number; b: number; q: number }> : []

    const scoreMap = new Map<number, { j: number; b: number; q: number; js: number; bs: number; qs: number }>()
    for (const g of entryGroups) {
      const js = computeKpiScore(db, 1, g.branch_id, g.j, 0, dateTo, g.staff_type).score
      const bs = computeKpiScore(db, 2, g.branch_id, g.b, 0, dateTo, g.staff_type).score
      const qs = computeKpiScore(db, 3, g.branch_id, g.q, 0, dateTo, g.staff_type).score
      const prev = scoreMap.get(g.salesman_id) ?? { j: 0, b: 0, q: 0, js: 0, bs: 0, qs: 0 }
      scoreMap.set(g.salesman_id, { j: prev.j + g.j, b: prev.b + g.b, q: prev.q + g.q, js: prev.js + js, bs: prev.bs + bs, qs: prev.qs + qs })
    }

    const enriched = baseRows.map(r => {
      const agg = scoreMap.get(r.id) ?? { j: 0, b: 0, q: 0, js: 0, bs: 0, qs: 0 }
      const totalRaw = agg.js + agg.bs + agg.qs
      const targetKey = `${r.branch_id}-${r.staff_type}`
      if (!branchTargetMap.has(targetKey))
        branchTargetMap.set(targetKey, getBranchPointTarget(db, r.branch_id, year, month, r.staff_type))
      const branchTarget = branchTargetMap.get(targetKey) ?? 0
      const individualTarget = getIndividualPointTarget(db, r.id, yearMonth) ?? branchTarget
      const kpiPct    = individualTarget > 0 ? (totalRaw / individualTarget) * 100 : 0
      const eomKpiPct = dayOfMonth > 0 ? (kpiPct / dayOfMonth) * daysInMonth : 0
      return {
        ...r,
        actual_jewelry: agg.j, actual_bar: agg.b, actual_qty: agg.q,
        supervisor_name: r.supervisor_name ?? null,
        kpiPointTarget: individualTarget,
        kpiScore: { jewelry: agg.js, bar: agg.bs, qty: agg.qs, total: totalRaw, pct: kpiPct },
        eomKpiPct,
      }
    })
    return { rows: enriched, daysInMonth, dayOfMonth, daysRemaining }
  })

  // Daily Tracking — a reconciliation grid, not a scoring report. One row per rep, one
  // column per calendar day of the month, raw uploaded values (Jewelry+Bar combined, Qty),
  // no KPI math at all. Purpose: Supervisor/Accountant eyeball whether what got uploaded
  // looks right, day by day — same role scoping as report:monthly (sales_sup → own team,
  // accountant_officer/branch_manager → own branch, everyone else → whatever's selected).
  ipcMain.handle('report:dailyTracking', async (_e,
    token: string, branchIds: number[], year: number, month: number,
  ) => {
    const user = requireAuth(token)
    let effectiveBranchIds: number[]
    let effectiveSupervisorId: number | null = null

    if (user.role === 'sales_sup') {
      // Same reasoning as report:monthly — drop the live-branch filter, supervisor_id
      // alone (matched against that month's roster_monthly) is the correct historical scope.
      effectiveBranchIds = []
      effectiveSupervisorId = user.supervisor_id
    } else if (user.role === 'branch_manager' || user.role === 'accountant_officer') {
      effectiveBranchIds = user.branch_id ? [user.branch_id] : branchIds
    } else {
      effectiveBranchIds = branchIds
    }

    const db = getDb()
    const daysInMonth = new Date(year, month, 0).getDate()
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const monthEnd   = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

    // Reconciliation report — must reflect the EXACT month's own roster, not a carried-forward
    // one, or it'd grid a rep who already left against a month they were never on (defeats
    // the report's purpose: checking whether what got uploaded for THIS month looks right).
    const targetYm = `${year}${String(month).padStart(2, '0')}`
    const rmBranchSql = effectiveBranchIds.length > 0 ? `AND rm.branch_id IN (${effectiveBranchIds.map(() => '?').join(',')})` : ''
    const rmBranchParams = effectiveBranchIds.length > 0 ? effectiveBranchIds : []
    const rmSupSql    = effectiveSupervisorId ? `AND rm.supervisor_id = ?` : ''
    const rmSupParams = effectiveSupervisorId ? [effectiveSupervisorId] : []

    const reps = prepare(db, `
      SELECT s.id, s.rep_code, s.full_name, s.nickname, b.name AS branch_name, sv.full_name AS supervisor_name
      FROM roster_monthly rm
      JOIN salesmen s ON s.id = rm.salesman_id
      LEFT JOIN branches b ON b.id = rm.branch_id
      LEFT JOIN supervisors sv ON sv.id = rm.supervisor_id
      WHERE rm.year_month = ? AND rm.active = 1 ${rmBranchSql} ${rmSupSql}
      ORDER BY b.name, sv.full_name, s.full_name
    `).all(targetYm, ...rmBranchParams, ...rmSupParams) as Array<{
      id: number; rep_code: string | null; full_name: string; nickname: string; branch_name: string; supervisor_name: string | null
    }>

    if (!reps.length) return { reps: [], daysInMonth, published: false }

    const repIds = reps.map(r => r.id)
    const entryRows = prepare(db, `
      SELECT salesman_id, entry_date, jewelry_weight_g, bar_weight_g, quantity
      FROM daily_entries
      WHERE salesman_id IN (${repIds.map(() => '?').join(',')}) AND entry_date >= ? AND entry_date <= ?
    `).all(...repIds, monthStart, monthEnd) as Array<{
      salesman_id: number; entry_date: string; jewelry_weight_g: number; bar_weight_g: number; quantity: number
    }>

    // Keyed by "salesmanId-day" — day-of-month only since every row is already within this
    // exact month. A missing key means "nothing uploaded," distinct from an explicit 0 entry.
    const byRepDay = new Map<string, { value: number; qty: number }>()
    for (const e of entryRows) {
      const day = parseInt(e.entry_date.slice(8, 10), 10)
      byRepDay.set(`${e.salesman_id}-${day}`, { value: (e.jewelry_weight_g || 0) + (e.bar_weight_g || 0), qty: e.quantity || 0 })
    }

    const result = reps.map(r => {
      const days: Array<{ value: number; qty: number } | null> = []
      let totalValue = 0, totalQty = 0
      for (let d = 1; d <= daysInMonth; d++) {
        const cell = byRepDay.get(`${r.id}-${d}`) ?? null
        if (cell) { totalValue += cell.value; totalQty += cell.qty }
        days.push(cell)
      }
      return {
        id: r.id, rep_code: r.rep_code, full_name: r.full_name, nickname: r.nickname,
        branch_name: r.branch_name, supervisor_name: r.supervisor_name,
        days, totalValue, totalQty,
      }
    })

    return { reps: result, daysInMonth, published: true }
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
      // Actuals are driven by daily_entries.branch_id / staff_type — the entry's own stamped
      // values at time of sale — NOT the rep's current roster assignment. A rep transferred
      // branch or B2C/B2B mid-period must not lose/duplicate/misprice their past entries.
      const repRows = prepare(db, `
        SELECT de.salesman_id, de.staff_type,
          COALESCE(SUM(de.jewelry_weight_g),0) AS actual_jewelry,
          COALESCE(SUM(de.bar_weight_g),0)     AS actual_bar,
          COALESCE(SUM(de.quantity),0)          AS actual_qty
        FROM daily_entries de
        WHERE de.branch_id = ? AND de.entry_date >= ? AND de.entry_date <= ?
        GROUP BY de.salesman_id, de.staff_type
      `).all(b.id, dateFrom, dateTo) as Array<{ salesman_id: number; staff_type: string; actual_jewelry: number; actual_bar: number; actual_qty: number }>

      // Split by staff_type as we go — the Company Overview tab's B2C/B2B filter needs a
      // real per-type score/target, not just a per-type headcount applied to a combined score.
      let js = 0, bs = 0, qs = 0
      let totalJewelry = 0, totalBar = 0, totalQty = 0
      let b2cScore = 0, b2bScore = 0
      for (const r of repRows) {
        const rj = computeKpiScore(db, 1, b.id, r.actual_jewelry, 0, dateTo, r.staff_type).score
        const rb = computeKpiScore(db, 2, b.id, r.actual_bar,     0, dateTo, r.staff_type).score
        const rq = computeKpiScore(db, 3, b.id, r.actual_qty,     0, dateTo, r.staff_type).score
        js += rj; bs += rb; qs += rq
        totalJewelry += r.actual_jewelry
        totalBar     += r.actual_bar
        totalQty     += r.actual_qty
        if (r.staff_type === 'b2c') b2cScore += rj + rb + rq
        else if (r.staff_type === 'b2b') b2bScore += rj + rb + rq
      }
      const kpiTotalScore = js + bs + qs

      // Headcount as it was AT THE END OF THAT MONTH — not today's roster — so a rep who
      // later transfers or leaves never changes a past month's target/KPI%. Split B2C/B2B
      // so a branch's type-specific target override (KPI Settings) is actually applied.
      const b2cCount  = getHeadcountAsOf(db, b.id, year, month, 'b2c')
      const b2bCount  = getHeadcountAsOf(db, b.id, year, month, 'b2b')
      const b2cTarget = getBranchPointTarget(db, b.id, year, month, 'b2c')
      const b2bTarget = getBranchPointTarget(db, b.id, year, month, 'b2b')
      const personCount     = b2cCount + b2bCount
      const perPersonTarget = getBranchPointTarget(db, b.id, year, month)
      const b2cPointTarget  = b2cCount * b2cTarget
      const b2bPointTarget  = b2bCount * b2bTarget
      const kpiPointTarget  = b2cPointTarget + b2bPointTarget
      const kpiPct          = kpiPointTarget > 0 ? (kpiTotalScore / kpiPointTarget) * 100 : 0

      return {
        branch_id: b.id, branch_name: b.name, code: b.code,
        actual_jewelry: totalJewelry,
        actual_bar:     totalBar,
        actual_qty:     totalQty,
        kpi_score_jewelry: js, kpi_score_bar: bs, kpi_score_qty: qs,
        kpi_total_score: kpiTotalScore, kpi_point_target: kpiPointTarget,
        per_person_target: perPersonTarget, kpi_pct: kpiPct, person_count: personCount,
        b2c_score: b2cScore, b2c_target: b2cPointTarget, b2c_person_count: b2cCount,
        b2b_score: b2bScore, b2b_target: b2bPointTarget, b2b_person_count: b2bCount,
      }
    })
  })

  ipcMain.handle('report:teamPerformance', async (_e,
    token: string, branchIds: number[], year: number, month: number,
    dateFrom: string, dateTo: string,
  ) => {
    const user = requireAuth(token)
    const db = getDb()

    // branch_manager: always scope to their branch. sales_sup: scope to ONLY their own
    // supervisor record — without this they'd see every supervisor/team in the branch.
    const effectiveBranchIds = user.role === 'branch_manager' && user.branch_id
      ? [user.branch_id]
      : branchIds

    const pctRow = prepare(db, `SELECT value FROM app_settings WHERE key='sup_kpi_pct'`).get() as { value: string } | undefined
    const supKpiPct = parseFloat(pctRow?.value ?? '30')

    const { sql: bSql, params: bParams } = buildSalesmenBranchFilter(effectiveBranchIds)
    const supervisors = user.role === 'sales_sup'
      ? prepare(db, `
          SELECT sv.id, sv.full_name, sv.nickname, sv.branch_id, sv.staff_type, b.name AS branch_name
          FROM supervisors sv
          JOIN branches b ON b.id = sv.branch_id
          WHERE sv.id = ?
        `).all(user.supervisor_id) as Array<{ id: number; full_name: string; nickname: string; branch_id: number; staff_type: string; branch_name: string }>
      : prepare(db, `
          SELECT sv.id, sv.full_name, sv.nickname, sv.branch_id, sv.staff_type, b.name AS branch_name
          FROM supervisors sv
          JOIN branches b ON b.id = sv.branch_id
          WHERE sv.active = 1 ${effectiveBranchIds.length > 0 ? `AND sv.branch_id IN (${effectiveBranchIds.map(() => '?').join(',')})` : ''}
          ORDER BY sv.branch_id, sv.full_name
        `).all(...bParams) as Array<{ id: number; full_name: string; nickname: string; branch_id: number; staff_type: string; branch_name: string }>

    // Team membership AS OF this month — not today's roster — so a rep who later
    // transfers off this team or deactivates doesn't change a past month's headcount.
    // Scoring still uses each entry's own stamped branch_id/staff_type below.
    const rosterMap = getRosterMapAsOf(db, year, month)

    return supervisors.map(sup => {
      const repIds = [...rosterMap.entries()].filter(([, v]) => v.supervisor_id === sup.id && v.active === 1).map(([id]) => id)

      const entryGroups = repIds.length ? prepare(db, `
        SELECT salesman_id, branch_id, staff_type,
          COALESCE(SUM(jewelry_weight_g), 0) AS j,
          COALESCE(SUM(bar_weight_g),     0) AS b,
          COALESCE(SUM(quantity),          0) AS q
        FROM daily_entries
        WHERE salesman_id IN (${repIds.map(() => '?').join(',')}) AND entry_date >= ? AND entry_date <= ?
        GROUP BY salesman_id, branch_id, staff_type
      `).all(...repIds, dateFrom, dateTo) as Array<{ salesman_id: number; branch_id: number; staff_type: string; j: number; b: number; q: number }> : []

      let teamScore = 0
      for (const g of entryGroups) {
        const js = computeKpiScore(db, 1, g.branch_id, g.j, 0, dateTo, g.staff_type).score
        const bs = computeKpiScore(db, 2, g.branch_id, g.b, 0, dateTo, g.staff_type).score
        const qs = computeKpiScore(db, 3, g.branch_id, g.q, 0, dateTo, g.staff_type).score
        teamScore += js + bs + qs
      }
      const reps = repIds

      const supScore           = teamScore * supKpiPct / 100
      const perPersonTarget    = getBranchPointTarget(db, sup.branch_id, year, month, sup.staff_type)
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

    // One query spanning the whole window instead of one per month — same data, ~12x
    // fewer round-trips for a 6-month window (was: 1 groups query + 1 days query per month).
    const rangeFrom = `${months[0].year}-${String(months[0].month).padStart(2,'0')}-01`
    const lastM = months[months.length - 1]
    const rangeTo = `${lastM.year}-${String(lastM.month).padStart(2,'0')}-${new Date(lastM.year, lastM.month, 0).getDate()}`

    const allGroups = prepare(db, `
      SELECT strftime('%Y%m', entry_date) AS ym, branch_id, staff_type,
        COALESCE(SUM(jewelry_weight_g),0) AS j, COALESCE(SUM(bar_weight_g),0) AS b, COALESCE(SUM(quantity),0) AS q
      FROM daily_entries WHERE salesman_id=? AND entry_date BETWEEN ? AND ?
      GROUP BY ym, branch_id, staff_type
    `).all(salesmanId, rangeFrom, rangeTo) as Array<{ ym: string; branch_id: number; staff_type: string; j: number; b: number; q: number }>
    const groupsByYm = new Map<string, typeof allGroups>()
    for (const g of allGroups) groupsByYm.set(g.ym, [...(groupsByYm.get(g.ym) ?? []), g])

    const allDays = prepare(db, `
      SELECT strftime('%Y%m', entry_date) AS ym, COUNT(DISTINCT entry_date) AS days
      FROM daily_entries WHERE salesman_id=? AND entry_date BETWEEN ? AND ? GROUP BY ym
    `).all(salesmanId, rangeFrom, rangeTo) as Array<{ ym: string; days: number }>
    const daysByYm = new Map(allDays.map(r => [r.ym, r.days]))

    const allTargets = prepare(db, `SELECT year_month, point_target FROM staff_monthly_targets WHERE salesman_id=? AND year_month IN (${months.map(() => '?').join(',')})`)
      .all(salesmanId, ...months.map(m => m.ym)) as Array<{ year_month: string; point_target: number }>
    const targetByYm = new Map(allTargets.map(r => [r.year_month, r.point_target]))

    const allCommCfg = prepare(db, `SELECT staff_type, year_month, jewelry_rate_lak, bar_rate_lak, qty_rate_lak FROM commission_configs WHERE year_month IN (${months.map(() => '?').join(',')})`)
      .all(...months.map(m => m.ym)) as Array<{ staff_type: string; year_month: string; jewelry_rate_lak: number; bar_rate_lak: number; qty_rate_lak: number }>
    const commCfgByKey = new Map(allCommCfg.map(r => [`${r.staff_type}-${r.year_month}`, r]))

    const history = months.map(m => {
      const dateTo = `${m.year}-${String(m.month).padStart(2,'0')}-${new Date(m.year, m.month, 0).getDate()}`
      // Group by the entry's OWN stamped branch_id/staff_type — not the rep's current
      // values — so a mid-trend transfer or B2C/B2B change never re-rates past months.
      const groups = groupsByYm.get(m.ym) ?? []

      let j = 0, bar = 0, qty = 0, js = 0, bs = 0, qs = 0, commission_lak = 0
      for (const g of groups) {
        j += g.j; bar += g.b; qty += g.q
        js += computeKpiScore(db, 1, g.branch_id, g.j, 0, dateTo, g.staff_type).score
        bs += computeKpiScore(db, 2, g.branch_id, g.b, 0, dateTo, g.staff_type).score
        qs += computeKpiScore(db, 3, g.branch_id, g.q, 0, dateTo, g.staff_type).score
        const commCfg = commCfgByKey.get(`${g.staff_type}-${m.ym}`)
        if (commCfg) commission_lak += g.j * commCfg.jewelry_rate_lak + g.b * commCfg.bar_rate_lak + g.q * commCfg.qty_rate_lak
      }
      // Individual override if HR set one, else the branch+staffType target — same fallback
      // chain used everywhere else (Roster screen, report:monthly). Without this, a rep with
      // no per-rep override (the common case) always shows kpi_pct=0 despite a real score.
      const pt = targetByYm.get(m.ym) ?? getBranchPointTarget(db, rep.branch_id, m.year, m.month, rep.staff_type)
      const total = js + bs + qs
      return { year: m.year, month: m.month, year_month: m.ym, actual_jewelry: j, actual_bar: bar, actual_qty: qty, kpi_score_jewelry: js, kpi_score_bar: bs, kpi_score_qty: qs, kpi_total_score: total, kpi_pct: pt > 0 ? (total / pt) * 100 : 0, point_target: pt, days_with_entries: daysByYm.get(m.ym) ?? 0, commission_lak }
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

    const months: Array<{ year: number; month: number; ym: string }> = []
    const now = new Date()
    for (let i = numMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1, ym: String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0') })
    }

    // Team membership AS OF each month — not today's roster — so a rep who later transfers
    // off this team or deactivates doesn't change a past month's headcount. Membership
    // genuinely varies per month, so this part stays a per-month lookup (6 small queries) —
    // but everything keyed off the resulting rep IDs below is batched into 2 queries total
    // instead of 2-per-rep-per-month.
    const repIdsByYm = new Map<string, number[]>()
    const unionRepIds = new Set<number>()
    for (const m of months) {
      const rosterMap = getRosterMapAsOf(db, m.year, m.month)
      const ids = [...rosterMap.entries()].filter(([, v]) => v.supervisor_id === supId && v.active === 1).map(([id]) => id)
      repIdsByYm.set(m.ym, ids)
      for (const id of ids) unionRepIds.add(id)
    }
    const allRepIds = [...unionRepIds]

    const rangeFrom = `${months[0].year}-${String(months[0].month).padStart(2,'0')}-01`
    const lastM = months[months.length - 1]
    const rangeTo = `${lastM.year}-${String(lastM.month).padStart(2,'0')}-${new Date(lastM.year, lastM.month, 0).getDate()}`

    const groupsByYmThenRep = new Map<string, Array<{ salesman_id: number; branch_id: number; staff_type: string; j: number; b: number; q: number }>>()
    const targetByYmThenRep = new Map<string, number>()

    if (allRepIds.length > 0) {
      const idPh = allRepIds.map(() => '?').join(',')
      const allGroups = prepare(db, `
        SELECT strftime('%Y%m', entry_date) AS ym, salesman_id, branch_id, staff_type,
          COALESCE(SUM(jewelry_weight_g),0) AS j, COALESCE(SUM(bar_weight_g),0) AS b, COALESCE(SUM(quantity),0) AS q
        FROM daily_entries WHERE salesman_id IN (${idPh}) AND entry_date BETWEEN ? AND ?
        GROUP BY ym, salesman_id, branch_id, staff_type
      `).all(...allRepIds, rangeFrom, rangeTo) as Array<{ ym: string; salesman_id: number; branch_id: number; staff_type: string; j: number; b: number; q: number }>
      for (const g of allGroups) groupsByYmThenRep.set(`${g.ym}-${g.salesman_id}`, [...(groupsByYmThenRep.get(`${g.ym}-${g.salesman_id}`) ?? []), g])

      const allTargets = prepare(db, `SELECT salesman_id, year_month, point_target FROM staff_monthly_targets WHERE salesman_id IN (${idPh}) AND year_month IN (${months.map(() => '?').join(',')})`)
        .all(...allRepIds, ...months.map(m => m.ym)) as Array<{ salesman_id: number; year_month: string; point_target: number }>
      for (const t of allTargets) targetByYmThenRep.set(`${t.year_month}-${t.salesman_id}`, t.point_target)
    }

    const history = months.map(m => {
      const dateTo = `${m.year}-${String(m.month).padStart(2,'0')}-${new Date(m.year, m.month, 0).getDate()}`
      const repIds = repIdsByYm.get(m.ym) ?? []

      let teamScore = 0; let teamTarget = 0; let teamJ = 0; let teamBar = 0; let teamQty = 0
      for (const repId of repIds) {
        // Same fallback chain as report:repHistory/Roster — individual override if HR set
        // one, else the branch+staffType target. Without this, teamTarget stays 0 for any
        // team without per-rep overrides (the common case) and team_kpi_pct always reads 0%
        // despite a real team_total_score.
        teamTarget += targetByYmThenRep.get(`${m.ym}-${repId}`) ?? getBranchPointTarget(db, sup.branch_id, m.year, m.month, sup.staff_type)
        // Score from the entry's OWN stamped branch_id/staff_type — not the rep's current
        // values — so a mid-trend transfer/type-change never re-rates past months.
        const groups = groupsByYmThenRep.get(`${m.ym}-${repId}`) ?? []
        for (const g of groups) {
          teamJ += g.j; teamBar += g.b; teamQty += g.q
          teamScore += computeKpiScore(db, 1, g.branch_id, g.j, 0, dateTo, g.staff_type).score
                     + computeKpiScore(db, 2, g.branch_id, g.b, 0, dateTo, g.staff_type).score
                     + computeKpiScore(db, 3, g.branch_id, g.q, 0, dateTo, g.staff_type).score
        }
      }
      return { year: m.year, month: m.month, year_month: m.ym, actual_jewelry: teamJ, actual_bar: teamBar, actual_qty: teamQty, team_total_score: teamScore, team_kpi_pct: teamTarget > 0 ? (teamScore / teamTarget) * 100 : 0, team_point_target: teamTarget, rep_count: repIds.length }
    })
    const currentRepCount = (prepare(db, `SELECT COUNT(*) AS cnt FROM salesmen WHERE supervisor_id=? AND active=1`).get(supId) as { cnt: number }).cnt
    return { ...sup, rep_count: currentRepCount, history }
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
