import { IpcMain } from 'electron'
import { getDb } from '../db/connection'
import { prepare } from '../db/query'
import { requireAuth } from './auth'

// Local calendar date (not UTC) — toISOString() shifts the date across timezone offsets
function toLocalISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return toLocalISODate(d)
}

function daysInMonthOf(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

// Sunday-start of the calendar week (Sun–Sat) containing dateStr
function startOfWeekSun(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() - d.getDay())
  return toLocalISODate(d)
}

function weekLabel(start: string): string {
  const d = new Date(start + 'T00:00:00')
  return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getDate()}`
}

// Sun-start week number of the year (1-based)
function weekNumberSun(dateStr: string): number {
  const d    = new Date(dateStr + 'T00:00:00')
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const dayOfYear = Math.floor((d.getTime() - jan1.getTime()) / 86400000)
  return Math.floor((dayOfYear + jan1.getDay()) / 7) + 1
}

function buildFilters(branchIds: number[], staffType?: string): { branchSql: string; typeSql: string; params: unknown[] } {
  const branchSql = branchIds.length > 0 ? `AND de.branch_id IN (${branchIds.map(() => '?').join(',')})` : ''
  const typeSql   = staffType ? `AND s.staff_type = ?` : ''
  const params: unknown[] = [...branchIds, ...(staffType ? [staffType] : [])]
  return { branchSql, typeSql, params }
}

function sumPeriod(
  db: ReturnType<typeof getDb>,
  from: string, to: string,
  branchIds: number[], staffType?: string
) {
  const { branchSql, typeSql, params } = buildFilters(branchIds, staffType)
  const row = prepare(db, `
    SELECT
      COALESCE(SUM(de.jewelry_weight_g), 0) AS jewelry,
      COALESCE(SUM(de.bar_weight_g),     0) AS bar,
      COALESCE(SUM(de.quantity),         0) AS qty,
      COUNT(*)                              AS entries,
      COUNT(DISTINCT de.salesman_id)        AS reps
    FROM daily_entries de
    JOIN salesmen s ON s.id = de.salesman_id
    WHERE de.entry_date >= ? AND de.entry_date <= ?
      ${branchSql} ${typeSql}
  `).get(from, to, ...params) as { jewelry: number; bar: number; qty: number; entries: number; reps: number } | undefined
  const j = row?.jewelry ?? 0
  const b = row?.bar ?? 0
  return { jewelry: j, bar: b, total: j + b, qty: row?.qty ?? 0, entries: row?.entries ?? 0, reps: row?.reps ?? 0 }
}

export function registerSalesHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('sales:getReport', async (_e,
    token: string,
    branchIds: number[],
    year: number,
    month: number,
    dateFrom: string,
    dateTo: string,
    staffType?: string,
  ) => {
    const user = requireAuth(token)
    // Server-side enforcement — never trust client-passed branchIds for scoped roles
    const scopedRoles = ['sales_sup', 'branch_manager', 'accountant_officer']
    if (scopedRoles.includes(user.role) && user.branch_id) {
      branchIds = [user.branch_id]
    }
    const db = getDb()

    // ── Date math ────────────────────────────────────────────────────────
    const toD      = new Date(dateTo + 'T00:00:00')
    const fromD    = new Date(dateFrom + 'T00:00:00')
    const duration = Math.round((toD.getTime() - fromD.getTime()) / 86400000) + 1
    const daysInM  = daysInMonthOf(year, month)
    const dayOfM   = toD.getDate()
    const daysRem  = daysInM - dayOfM

    // Previous period (same duration, right before dateFrom)
    const prevTo   = addDays(dateFrom, -1)
    const prevFrom = addDays(dateFrom, -duration)

    // Same period last month (same day offsets, month-1)
    const lmYear  = month === 1 ? year - 1 : year
    const lmMonth = month === 1 ? 12 : month - 1
    const lmDays  = daysInMonthOf(lmYear, lmMonth)
    const lmFromDay = parseInt(dateFrom.slice(8))
    const lmToDay   = Math.min(parseInt(dateTo.slice(8)), lmDays)
    const pad = (n: number) => String(n).padStart(2, '0')
    const lmFrom     = `${lmYear}-${pad(lmMonth)}-${pad(lmFromDay)}`
    const lmTo       = `${lmYear}-${pad(lmMonth)}-${pad(lmToDay)}`
    const fullLmFrom = `${lmYear}-${pad(lmMonth)}-01`
    const fullLmTo   = `${lmYear}-${pad(lmMonth)}-${pad(lmDays)}`

    // ── Aggregate periods ────────────────────────────────────────────────
    const current       = sumPeriod(db, dateFrom,   dateTo,   branchIds, staffType)
    const prevPeriod    = sumPeriod(db, prevFrom,   prevTo,   branchIds, staffType)
    const sameLastMonth = sumPeriod(db, lmFrom,     lmTo,     branchIds, staffType)
    const fullLastMonth = sumPeriod(db, fullLmFrom, fullLmTo, branchIds, staffType)

    const eomFactor = dayOfM > 0 ? daysInM / dayOfM : 1
    const estMonthEnd = {
      jewelry: current.jewelry * eomFactor,
      bar:     current.bar     * eomFactor,
      total:   current.total   * eomFactor,
      qty:     Math.round(current.qty     * eomFactor),
      entries: Math.round(current.entries * eomFactor),
      reps:    current.reps,
    }

    // ── By branch ────────────────────────────────────────────────────────
    const { branchSql, typeSql, params: fParams } = buildFilters(branchIds, staffType)
    const byBranchRaw = prepare(db, `
      SELECT
        b.id   AS branch_id,
        b.name AS branch_name,
        b.code AS branch_code,
        COALESCE(SUM(de.jewelry_weight_g), 0) AS jewelry,
        COALESCE(SUM(de.bar_weight_g),     0) AS bar,
        COALESCE(SUM(de.quantity),         0) AS qty,
        COUNT(*)                              AS entries,
        COUNT(DISTINCT de.salesman_id)        AS reps
      FROM daily_entries de
      JOIN branches b ON b.id = de.branch_id
      JOIN salesmen s ON s.id = de.salesman_id
      WHERE de.entry_date >= ? AND de.entry_date <= ?
        ${branchSql} ${typeSql}
      GROUP BY b.id
      ORDER BY (SUM(de.jewelry_weight_g) + SUM(de.bar_weight_g)) DESC
    `).all(dateFrom, dateTo, ...fParams) as Array<{ branch_id: number; branch_name: string; branch_code: string; jewelry: number; bar: number; qty: number; entries: number; reps: number }>

    const totW = byBranchRaw.reduce((s, r) => s + r.jewelry + r.bar, 0)
    const totQ = byBranchRaw.reduce((s, r) => s + r.qty, 0)

    // By branch: also get prev period for each branch
    const { branchSql: bSqlPrev, typeSql: tSqlPrev, params: fParamsPrev } = buildFilters(branchIds, staffType)
    const byBranchPrevRaw = prepare(db, `
      SELECT
        de.branch_id,
        COALESCE(SUM(de.jewelry_weight_g), 0) AS jewelry,
        COALESCE(SUM(de.bar_weight_g),     0) AS bar,
        COALESCE(SUM(de.quantity),         0) AS qty
      FROM daily_entries de
      JOIN salesmen s ON s.id = de.salesman_id
      WHERE de.entry_date >= ? AND de.entry_date <= ?
        ${bSqlPrev} ${tSqlPrev}
      GROUP BY de.branch_id
    `).all(lmFrom, lmTo, ...fParamsPrev) as Array<{ branch_id: number; jewelry: number; bar: number; qty: number }>

    const prevByBranchMap = new Map(byBranchPrevRaw.map(r => [r.branch_id, r]))

    const byBranch = byBranchRaw.map(r => {
      const prev = prevByBranchMap.get(r.branch_id)
      const total = r.jewelry + r.bar
      const prevTotal = prev ? prev.jewelry + prev.bar : 0
      return {
        ...r,
        total,
        weight_contrib: totW > 0 ? (total / totW) * 100 : 0,
        qty_contrib:    totQ > 0 ? (r.qty / totQ) * 100 : 0,
        var_total_pct:  prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null,
        var_qty_pct:    prev && prev.qty > 0 ? ((r.qty - prev.qty) / prev.qty) * 100 : null,
      }
    })

    // ── By type ──────────────────────────────────────────────────────────
    const { branchSql: bSqlT, params: fParamsT } = buildFilters(branchIds)
    const byTypeRaw = prepare(db, `
      SELECT
        s.staff_type,
        COALESCE(SUM(de.jewelry_weight_g), 0) AS jewelry,
        COALESCE(SUM(de.bar_weight_g),     0) AS bar,
        COALESCE(SUM(de.quantity),         0) AS qty,
        COUNT(*)                              AS entries,
        COUNT(DISTINCT de.salesman_id)        AS reps
      FROM daily_entries de
      JOIN salesmen s ON s.id = de.salesman_id
      WHERE de.entry_date >= ? AND de.entry_date <= ?
        ${bSqlT}
      GROUP BY s.staff_type
    `).all(dateFrom, dateTo, ...fParamsT) as Array<{ staff_type: string; jewelry: number; bar: number; qty: number; entries: number; reps: number }>

    const totTW = byTypeRaw.reduce((s, r) => s + r.jewelry + r.bar, 0)
    const totTQ = byTypeRaw.reduce((s, r) => s + r.qty, 0)

    // prev period by type
    const byTypePrevRaw = prepare(db, `
      SELECT
        s.staff_type,
        COALESCE(SUM(de.jewelry_weight_g), 0) AS jewelry,
        COALESCE(SUM(de.bar_weight_g),     0) AS bar,
        COALESCE(SUM(de.quantity),         0) AS qty
      FROM daily_entries de
      JOIN salesmen s ON s.id = de.salesman_id
      WHERE de.entry_date >= ? AND de.entry_date <= ?
        ${bSqlT}
      GROUP BY s.staff_type
    `).all(lmFrom, lmTo, ...fParamsT) as Array<{ staff_type: string; jewelry: number; bar: number; qty: number }>

    const prevByTypeMap = new Map(byTypePrevRaw.map(r => [r.staff_type, r]))

    const byType = byTypeRaw.map(r => {
      const prev = prevByTypeMap.get(r.staff_type)
      const total = r.jewelry + r.bar
      const prevTotal = prev ? prev.jewelry + prev.bar : 0
      return {
        ...r,
        total,
        weight_contrib: totTW > 0 ? (total / totTW) * 100 : 0,
        qty_contrib:    totTQ > 0 ? (r.qty / totTQ) * 100 : 0,
        var_total_pct:  prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null,
        var_qty_pct:    prev && prev.qty > 0 ? ((r.qty - prev.qty) / prev.qty) * 100 : null,
      }
    })

    // ── Weekly trend (last 8 weeks ending on dateTo) ──────────────────────
    const weekFrom = addDays(dateTo, -55)
    const { branchSql: bSqlW, typeSql: tSqlW, params: fParamsW } = buildFilters(branchIds, staffType)
    const weeklyRaw = prepare(db, `
      SELECT
        strftime('%Y-W%W', de.entry_date)         AS week_key,
        MIN(de.entry_date)                         AS week_start,
        COALESCE(SUM(de.jewelry_weight_g), 0)      AS jewelry,
        COALESCE(SUM(de.bar_weight_g),     0)      AS bar,
        COALESCE(SUM(de.quantity),         0)      AS qty,
        COUNT(*)                                   AS entries
      FROM daily_entries de
      JOIN salesmen s ON s.id = de.salesman_id
      WHERE de.entry_date >= ? AND de.entry_date <= ?
        ${bSqlW} ${tSqlW}
      GROUP BY week_key
      ORDER BY week_key DESC
      LIMIT 8
    `).all(weekFrom, dateTo, ...fParamsW) as Array<{ week_key: string; week_start: string; jewelry: number; bar: number; qty: number; entries: number }>

    const weeklyTrend = weeklyRaw.reverse().map((r, i) => ({
      ...r,
      total: r.jewelry + r.bar,
      label: `W${i + 1}`,
    }))

    // ── Daily trend (within current period) ──────────────────────────────
    const { branchSql: bSqlD, typeSql: tSqlD, params: fParamsD } = buildFilters(branchIds, staffType)
    const dailyTrend = (prepare(db, `
      SELECT
        de.entry_date                             AS date,
        COALESCE(SUM(de.jewelry_weight_g), 0)     AS jewelry,
        COALESCE(SUM(de.bar_weight_g),     0)     AS bar,
        COALESCE(SUM(de.quantity),         0)     AS qty,
        COUNT(*)                                  AS entries
      FROM daily_entries de
      JOIN salesmen s ON s.id = de.salesman_id
      WHERE de.entry_date >= ? AND de.entry_date <= ?
        ${bSqlD} ${tSqlD}
      GROUP BY de.entry_date
      ORDER BY de.entry_date
    `).all(dateFrom, dateTo, ...fParamsD) as Array<{ date: string; jewelry: number; bar: number; qty: number; entries: number }>)
      .map(r => ({ ...r, total: r.jewelry + r.bar }))

    // ── Calendar-week (Sun–Sat) WoW: current week + previous 5 weeks ──────
    const curWeekStart = startOfWeekSun(dateTo)
    const calWeeks: Array<{ start: string; end: string }> = []
    for (let i = 5; i >= 0; i--) {
      const start = addDays(curWeekStart, -7 * i)
      calWeeks.push({ start, end: addDays(start, 6) })
    }

    const weeklyTrendCal = calWeeks.map((w, i) => {
      const sum = sumPeriod(db, w.start, w.end, branchIds, staffType)
      return {
        week_start: w.start, week_end: w.end,
        label: weekLabel(w.start),
        week_num: weekNumberSun(w.start),
        isCurrent: i === calWeeks.length - 1,
        jewelry: sum.jewelry, bar: sum.bar, total: sum.total, qty: sum.qty,
      }
    })

    function wow(cur: number, prev: number) {
      return { cur, prev, diff: cur - prev, pct: prev > 0 ? ((cur - prev) / prev) * 100 : null }
    }
    const curWk  = weeklyTrendCal[weeklyTrendCal.length - 1]
    const prevWk = weeklyTrendCal[weeklyTrendCal.length - 2]
    const companyWow = {
      jewelry: wow(curWk.jewelry, prevWk.jewelry),
      bar:     wow(curWk.bar,     prevWk.bar),
      total:   wow(curWk.total,   prevWk.total),
    }

    // Per-branch weekly totals for the same 6 weeks, pivoted for clustered chart
    const allBranches = prepare(db, `SELECT id, name, code FROM branches ORDER BY id`).all() as Array<{ id: number; name: string; code: string }>
    const weeklyByBranch = calWeeks.map((w, i) => {
      const row: Record<string, string | number | boolean> = { label: weekLabel(w.start), week_start: w.start, isCurrent: i === calWeeks.length - 1 }
      for (const b of allBranches) {
        const sum = sumPeriod(db, w.start, w.end, [b.id], staffType)
        row[b.code] = sum.total
      }
      return row
    })

    const branchWow = allBranches.map(b => {
      const curSum  = sumPeriod(db, curWk.week_start,  calWeeks[calWeeks.length - 1].end, [b.id], staffType)
      const prevSum = sumPeriod(db, prevWk.week_start, addDays(prevWk.week_start, 6),      [b.id], staffType)
      const w = wow(curSum.total, prevSum.total)
      return { branch_id: b.id, branch_name: b.name, branch_code: b.code, ...w }
    })

    return {
      current,
      prevPeriod,
      sameLastMonth,
      fullLastMonth,
      estMonthEnd,
      byBranch,
      byType,
      weeklyTrend,
      weeklyTrendCal,
      companyWow,
      weeklyByBranch,
      branchWow,
      dailyTrend,
      meta: { daysInMonth: daysInM, dayOfMonth: dayOfM, daysRemaining: daysRem },
    }
  })

  // Week-by-week and month-by-month breakdown over an ARBITRARY date range (can cross
  // month/year boundaries freely — unlike sales:getReport, this has no single anchor month).
  // "Days" counts trading days (Sun excluded, matches the rest of the app's closed-Sunday
  // convention) overlapping the selected range, not just days that happen to have entries —
  // that's what makes a partial first/last week or month detectable and comparable.
  ipcMain.handle('sales:getTrendDetail', async (_e,
    token: string, branchIds: number[], dateFrom: string, dateTo: string, staffType?: string,
  ) => {
    const user = requireAuth(token)
    const scopedRoles = ['sales_sup', 'branch_manager', 'accountant_officer']
    if (scopedRoles.includes(user.role) && user.branch_id) branchIds = [user.branch_id]
    const db = getDb()

    const { branchSql, typeSql, params } = buildFilters(branchIds, staffType)
    const dailyRows = prepare(db, `
      SELECT de.entry_date AS date,
        COALESCE(SUM(de.jewelry_weight_g),0) + COALESCE(SUM(de.bar_weight_g),0) AS total,
        COALESCE(SUM(de.quantity),0) AS qty
      FROM daily_entries de
      JOIN salesmen s ON s.id = de.salesman_id
      WHERE de.entry_date >= ? AND de.entry_date <= ? ${branchSql} ${typeSql}
      GROUP BY de.entry_date
    `).all(dateFrom, dateTo, ...params) as Array<{ date: string; total: number; qty: number }>
    const byDate = new Map(dailyRows.map(r => [r.date, r]))

    // Walk every calendar day in the range once, bucketing into weeks and months —
    // guarantees trading-day counts are correct even for days with zero entries.
    type Bucket = { total: number; qty: number; days: number }
    const weekBuckets = new Map<string, Bucket>()
    const monthBuckets = new Map<string, Bucket>()

    let cursor = dateFrom
    while (cursor <= dateTo) {
      const dow = new Date(cursor + 'T00:00:00').getDay()
      const row = byDate.get(cursor)
      const wKey = startOfWeekSun(cursor)
      const mKey = cursor.slice(0, 7) // YYYY-MM

      const w = weekBuckets.get(wKey) ?? { total: 0, qty: 0, days: 0 }
      const m = monthBuckets.get(mKey) ?? { total: 0, qty: 0, days: 0 }
      if (row) { w.total += row.total; w.qty += row.qty; m.total += row.total; m.qty += row.qty }
      if (dow !== 0) { w.days++; m.days++ } // Sunday = closed, not a trading day
      weekBuckets.set(wKey, w)
      monthBuckets.set(mKey, m)

      cursor = addDays(cursor, 1)
    }

    const weeklyDetail = [...weekBuckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([wKey, b], i, arr) => {
      const prev = i > 0 ? arr[i - 1][1] : null
      return {
        week_start: wKey, label: weekLabel(wKey),
        days: b.days, total: b.total, qty: b.qty,
        avg_per_day: b.days > 0 ? b.total / b.days : 0,
        partial: b.days < 6,
        wow_pct: prev ? (prev.total > 0 ? ((b.total - prev.total) / prev.total) * 100 : null) : null,
        is_base: i === 0,
      }
    })

    const monthlyDetail = [...monthBuckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mKey, b], i, arr) => {
      const prev = i > 0 ? arr[i - 1][1] : null
      const [y, m] = mKey.split('-').map(Number)
      const sundaysInMonth = (() => {
        let n = 0
        for (let d = 1; d <= daysInMonthOf(y, m); d++) if (new Date(y, m - 1, d).getDay() === 0) n++
        return n
      })()
      const fullTradingDays = daysInMonthOf(y, m) - sundaysInMonth
      return {
        year_month: mKey, label: mKey,
        days: b.days, total: b.total, qty: b.qty,
        avg_per_day: b.days > 0 ? b.total / b.days : 0,
        partial: b.days < fullTradingDays,
        mom_pct: prev ? (prev.total > 0 ? ((b.total - prev.total) / prev.total) * 100 : null) : null,
        is_base: i === 0,
      }
    })

    return { weeklyDetail, monthlyDetail }
  })
}
