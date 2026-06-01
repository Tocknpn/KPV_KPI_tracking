import { IpcMain } from 'electron'
import { getDb } from '../db/connection'
import { prepare } from '../db/query'
import { requireAuth } from './auth'
import { computeKpiScore } from './kpi'

export function registerReportHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('report:dashboard', async (_e, token: string, branchId: number, year: number, month: number) => {
    const user = requireAuth(token)
    const effectiveBranch = user.role === 'supervisor' ? (user.branch_id ?? branchId) : branchId
    const db = getDb()
    const today = new Date().toISOString().split('T')[0]

    const mtd = prepare(db, `
      SELECT COALESCE(SUM(jewelry_weight_g),0) AS total_jewelry, COALESCE(SUM(bar_weight_g),0) AS total_bar, COALESCE(SUM(quantity),0) AS total_qty
      FROM daily_entries WHERE branch_id=? AND CAST(strftime('%Y',entry_date) AS INTEGER)=? AND CAST(strftime('%m',entry_date) AS INTEGER)=?
    `).get(effectiveBranch, year, month) as { total_jewelry: number; total_bar: number; total_qty: number }

    const targets = prepare(db, `
      SELECT COALESCE(SUM(jewelry_weight_g),0) AS target_jewelry, COALESCE(SUM(bar_weight_g),0) AS target_bar, COALESCE(SUM(quantity),0) AS target_qty
      FROM targets WHERE branch_id=? AND year=? AND month=?
    `).get(effectiveBranch, year, month) as { target_jewelry: number; target_bar: number; target_qty: number }

    const daysInMonth = new Date(year, month, 0).getDate()
    const dayOfMonth = (new Date(today).getMonth() + 1 === month) ? new Date(today).getDate() : daysInMonth
    const projFactor = daysInMonth / Math.max(dayOfMonth, 1)

    const topPerformers = prepare(db, `
      SELECT s.id, s.full_name, s.nickname, s.position,
        COALESCE(SUM(de.jewelry_weight_g),0) AS total_jewelry,
        COALESCE(SUM(de.bar_weight_g),0) AS total_bar,
        COALESCE(SUM(de.quantity),0) AS total_qty
      FROM salesmen s
      LEFT JOIN daily_entries de ON de.salesman_id=s.id AND CAST(strftime('%Y',de.entry_date) AS INTEGER)=? AND CAST(strftime('%m',de.entry_date) AS INTEGER)=?
      WHERE s.branch_id=? AND s.active=1
      GROUP BY s.id ORDER BY (COALESCE(SUM(de.jewelry_weight_g),0)+COALESCE(SUM(de.bar_weight_g),0)) DESC LIMIT 5
    `).all(year, month, effectiveBranch)

    return {
      mtd: mtd ?? { total_jewelry: 0, total_bar: 0, total_qty: 0 },
      targets: targets ?? { target_jewelry: 0, target_bar: 0, target_qty: 0 },
      projectedJewelry: (mtd?.total_jewelry ?? 0) * projFactor,
      projectedBar: (mtd?.total_bar ?? 0) * projFactor,
      projectedQty: (mtd?.total_qty ?? 0) * projFactor,
      daysInMonth, dayOfMonth,
      kpiScoreJewelry: computeKpiScore(db, 1, effectiveBranch, mtd?.total_jewelry ?? 0, targets?.target_jewelry ?? 0, today).score,
      kpiScoreBar:     computeKpiScore(db, 2, effectiveBranch, mtd?.total_bar ?? 0, targets?.target_bar ?? 0, today).score,
      kpiScoreQty:     computeKpiScore(db, 3, effectiveBranch, mtd?.total_qty ?? 0, targets?.target_qty ?? 0, today).score,
      topPerformers,
    }
  })

  ipcMain.handle('report:monthly', async (_e, token: string, branchId: number, year: number, month: number) => {
    const user = requireAuth(token)
    const effectiveBranch = user.role === 'supervisor' ? (user.branch_id ?? branchId) : branchId
    const db = getDb()
    const today = new Date().toISOString().split('T')[0]
    const daysInMonth = new Date(year, month, 0).getDate()
    const dayOfMonth = (new Date(today).getMonth() + 1 === month) ? new Date(today).getDate() : daysInMonth
    const daysRemaining = Math.max(daysInMonth - dayOfMonth, 0)

    const rows = prepare(db, `
      SELECT s.id, s.full_name, s.nickname, s.position,
        COALESCE(t.jewelry_weight_g,0) AS target_jewelry,
        COALESCE(t.bar_weight_g,0)     AS target_bar,
        COALESCE(t.quantity,0)         AS target_qty,
        COALESCE(SUM(de.jewelry_weight_g),0) AS actual_jewelry,
        COALESCE(SUM(de.bar_weight_g),0)     AS actual_bar,
        COALESCE(SUM(de.quantity),0)         AS actual_qty
      FROM salesmen s
      LEFT JOIN targets t ON t.salesman_id=s.id AND t.year=? AND t.month=?
      LEFT JOIN daily_entries de ON de.salesman_id=s.id AND CAST(strftime('%Y',de.entry_date) AS INTEGER)=? AND CAST(strftime('%m',de.entry_date) AS INTEGER)=?
      WHERE s.branch_id=? AND s.active=1
      GROUP BY s.id ORDER BY s.full_name
    `).all(year, month, year, month, effectiveBranch) as Array<{
      id: number; full_name: string; nickname: string; position: string
      target_jewelry: number; target_bar: number; target_qty: number
      actual_jewelry: number; actual_bar: number; actual_qty: number
    }>

    const projFactor = daysInMonth / Math.max(dayOfMonth, 1)
    const enriched = rows.map(r => {
      const pctJewelry = r.target_jewelry > 0 ? (r.actual_jewelry / r.target_jewelry) * 100 : 0
      const pctBar     = r.target_bar > 0     ? (r.actual_bar / r.target_bar) * 100 : 0
      const pctQty     = r.target_qty > 0     ? (r.actual_qty / r.target_qty) * 100 : 0
      return {
        ...r, pctJewelry, pctBar, pctQty,
        avgPct: (pctJewelry + pctBar + pctQty) / 3,
        dailyNeeded: daysRemaining > 0 ? {
          jewelry: (r.target_jewelry - r.actual_jewelry) / daysRemaining,
          bar: (r.target_bar - r.actual_bar) / daysRemaining,
          qty: Math.ceil((r.target_qty - r.actual_qty) / daysRemaining),
        } : { jewelry: 0, bar: 0, qty: 0 },
        eomProjected: { jewelry: r.actual_jewelry * projFactor, bar: r.actual_bar * projFactor, qty: r.actual_qty * projFactor },
        kpiScore: {
          jewelry: computeKpiScore(db, 1, effectiveBranch, r.actual_jewelry, r.target_jewelry, today).score,
          bar:     computeKpiScore(db, 2, effectiveBranch, r.actual_bar,     r.target_bar,     today).score,
          qty:     computeKpiScore(db, 3, effectiveBranch, r.actual_qty,     r.target_qty,     today).score,
        },
      }
    })
    return { rows: enriched, daysInMonth, dayOfMonth, daysRemaining }
  })

  ipcMain.handle('report:executive', async (_e, token: string, year: number, month: number) => {
    requireAuth(token)
    return prepare(getDb(), `
      SELECT b.id AS branch_id, b.name AS branch_name, b.code,
        COALESCE(SUM(de.jewelry_weight_g),0) AS actual_jewelry,
        COALESCE(SUM(de.bar_weight_g),0)     AS actual_bar,
        COALESCE(SUM(de.quantity),0)         AS actual_qty,
        COALESCE(SUM(t.jewelry_weight_g),0)  AS target_jewelry,
        COALESCE(SUM(t.bar_weight_g),0)      AS target_bar,
        COALESCE(SUM(t.quantity),0)          AS target_qty
      FROM branches b
      LEFT JOIN daily_entries de ON de.branch_id=b.id AND CAST(strftime('%Y',de.entry_date) AS INTEGER)=? AND CAST(strftime('%m',de.entry_date) AS INTEGER)=?
      LEFT JOIN targets t ON t.branch_id=b.id AND t.year=? AND t.month=?
      GROUP BY b.id ORDER BY b.id
    `).all(year, month, year, month)
  })

  ipcMain.handle('report:branchAnalytics', async (_e, token: string, year: number, month: number) => {
    requireAuth(token)
    const db = getDb()
    const dailyTotals = prepare(db, `
      SELECT entry_date,
        COALESCE(SUM(jewelry_weight_g),0) AS jewelry,
        COALESCE(SUM(bar_weight_g),0)     AS bar,
        COALESCE(SUM(quantity),0)         AS qty
      FROM daily_entries WHERE CAST(strftime('%Y',entry_date) AS INTEGER)=? AND CAST(strftime('%m',entry_date) AS INTEGER)=?
      GROUP BY entry_date ORDER BY entry_date
    `).all(year, month)
    const branchContrib = prepare(db, `
      SELECT b.id, b.name, b.code,
        COALESCE(SUM(de.jewelry_weight_g+de.bar_weight_g),0) AS total_weight,
        COALESCE(SUM(de.quantity),0) AS total_qty
      FROM branches b
      LEFT JOIN daily_entries de ON de.branch_id=b.id AND CAST(strftime('%Y',de.entry_date) AS INTEGER)=? AND CAST(strftime('%m',de.entry_date) AS INTEGER)=?
      GROUP BY b.id ORDER BY total_weight DESC
    `).all(year, month)
    return { dailyTotals, branchContrib }
  })
}
