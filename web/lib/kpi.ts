import type { EntryRow, BranchRow, KpiRateRow, QtyTierRow, MonthlyTargetRow, RosterRow } from './sheets'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RepKpi = {
  rep_code: string
  full_name: string
  branch_code: string
  staff_type: 'b2c' | 'b2b'
  jewelry_g: number
  bar_g: number
  qty: number
  jewelry_score: number
  bar_score: number
  qty_score: number
  total_score: number
}

export type BranchKpi = {
  code: string
  name: string
  kpi_target: number
  total_score: number
  kpi_pct: number
  jewelry_g: number
  bar_g: number
  qty: number
  reps: RepKpi[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// Entries tab is append-only; newer rows for the same (date, rep) supersede older ones.
function deduplicateEntries(entries: EntryRow[]): EntryRow[] {
  const map = new Map<string, EntryRow>()
  for (const e of entries) {
    map.set(`${e.entry_date}:${e.rep_code}`, e)
  }
  return Array.from(map.values())
}

// Resolves a rep's staff_type as of a given month from their roster history: the most
// recent roster row at or before that month wins; falls back to the earliest known row if
// the rep has no roster history yet at/before that month (e.g. a rep added retroactively).
function resolveStaffType(rosterByRep: Map<string, RosterRow[]>, repCode: string, ym: string): 'b2c' | 'b2b' {
  const rows = rosterByRep.get(repCode)
  if (!rows || rows.length === 0) return 'b2c'
  let best: RosterRow | undefined
  for (const r of rows) {
    if (r.year_month <= ym && (!best || r.year_month > best.year_month)) best = r
  }
  return (best ?? rows[0]).staff_type
}

// Mirrors kpi:getBranchMetricRates' priority: branch+month(3) > branch+standing(2) >
// global+month(1) > global+standing(0).
function resolveRate(
  rates: KpiRateRow[],
  metric: 'jewelry' | 'bar' | 'qty',
  branchCode: string,
  staffType: 'b2c' | 'b2b',
  ym: string
): number {
  let best = -1
  let value = 0
  for (const r of rates) {
    if (r.metric !== metric || r.staff_type !== staffType) continue
    const isBranch = r.branch_code === branchCode
    if (!isBranch && r.branch_code !== 'Global') continue
    const isMonth = r.year_month === ym
    if (!isMonth && r.year_month !== null) continue
    const score = (isBranch ? 2 : 0) + (isMonth ? 1 : 0)
    if (score > best) { best = score; value = r.points_per_unit }
  }
  return value
}

// Mirrors kpi_tier_configs' lookup priority: branch > global, staff_type-specific > ALL,
// month-bounded (effective_to set, covering the probe date) > standing (effective_to null).
function resolveQtyScore(
  tiers: QtyTierRow[],
  branchCode: string,
  staffType: 'b2c' | 'b2b',
  probeDate: string,
  quantity: number
): number {
  type Config = { branch_code: string; staff_type: 'b2c' | 'b2b' | null; effective_from: string | null; effective_to: string | null }
  const byConfig = new Map<string, { config: Config; rows: QtyTierRow[] }>()
  for (const t of tiers) {
    const isBranch = t.branch_code === branchCode
    if (!isBranch && t.branch_code !== 'Global') continue
    const isType = t.staff_type === staffType
    if (!isType && t.staff_type !== null) continue
    if (t.effective_from && probeDate < t.effective_from) continue
    if (t.effective_to && probeDate > t.effective_to) continue
    const key = `${t.branch_code}::${t.staff_type}::${t.effective_from}::${t.effective_to}`
    if (!byConfig.has(key)) {
      byConfig.set(key, { config: { branch_code: t.branch_code, staff_type: t.staff_type, effective_from: t.effective_from, effective_to: t.effective_to }, rows: [] })
    }
    byConfig.get(key)!.rows.push(t)
  }

  let bestScore = -1
  let bestRows: QtyTierRow[] | null = null
  for (const { config, rows } of byConfig.values()) {
    const isBranch = config.branch_code === branchCode
    const isType = config.staff_type === staffType
    const isStanding = !config.effective_to
    const score = (isBranch ? 4 : 0) + (isType ? 2 : 0) + (isStanding ? 0 : 1)
    if (score > bestScore) { bestScore = score; bestRows = rows }
  }
  if (!bestRows) return 0

  const sorted = [...bestRows].sort((a, b) => b.threshold - a.threshold)
  for (const tier of sorted) {
    if (quantity >= tier.threshold) return quantity * tier.score
  }
  return 0
}

// Resolves a branch's per-person target for one staff_type as of a given month: a monthly
// override wins if set, otherwise the branch's standing default — mirrors getBranchPointTarget.
function resolveBranchTarget(
  branches: BranchRow[],
  monthlyTargets: MonthlyTargetRow[],
  branchCode: string,
  year: number,
  month: number,
  staffType: 'b2c' | 'b2b'
): number {
  const mt = monthlyTargets.find(t => t.branch_code === branchCode && t.year === year && t.month === month)
  const override = staffType === 'b2c' ? mt?.target_b2c : mt?.target_b2b
  if (override) return override
  const branch = branches.find(b => b.code === branchCode)
  return staffType === 'b2c' ? (branch?.target_b2c_default ?? 0) : (branch?.target_b2b_default ?? 0)
}

// ── Main computation ───────────────────────────────────────────────────────────

export function computeKpi(
  allEntries: EntryRow[],
  branches: BranchRow[],
  kpiRates: KpiRateRow[],
  qtyTiers: QtyTierRow[],
  monthlyTargets: MonthlyTargetRow[],
  roster: RosterRow[],
  year: number,
  month: number,
  filterBranchCodes?: string[]
): BranchKpi[] {
  const ym = `${year}${String(month).padStart(2, '0')}`
  const probeDate = `${year}-${String(month).padStart(2, '0')}-15`

  let entries = allEntries.filter(e => e.entry_date.startsWith(`${year}-${String(month).padStart(2, '0')}`))
  if (filterBranchCodes?.length) {
    entries = entries.filter(e => filterBranchCodes.includes(e.branch_code))
  }
  entries = deduplicateEntries(entries)

  const rosterByRep = new Map<string, RosterRow[]>()
  for (const r of roster) {
    if (!rosterByRep.has(r.rep_code)) rosterByRep.set(r.rep_code, [])
    rosterByRep.get(r.rep_code)!.push(r)
  }

  const activeBranches = filterBranchCodes?.length
    ? branches.filter(b => filterBranchCodes.includes(b.code))
    : branches

  return activeBranches.map(branch => {
    const branchEntries = entries.filter(e => e.branch_code === branch.code)

    const repMap = new Map<string, RepKpi>()
    for (const e of branchEntries) {
      if (!repMap.has(e.rep_code)) {
        const staffType = resolveStaffType(rosterByRep, e.rep_code, ym)
        repMap.set(e.rep_code, {
          rep_code: e.rep_code,
          full_name: e.full_name,
          branch_code: branch.code,
          staff_type: staffType,
          jewelry_g: 0, bar_g: 0, qty: 0,
          jewelry_score: 0, bar_score: 0, qty_score: 0,
          total_score: 0,
        })
      }
      const rep = repMap.get(e.rep_code)!
      const qtyRate = resolveRate(kpiRates, 'qty', branch.code, rep.staff_type, ym)
      rep.jewelry_g     += e.jewelry_weight_g
      rep.bar_g         += e.bar_weight_g
      rep.qty           += e.quantity
      rep.jewelry_score += e.jewelry_weight_g * resolveRate(kpiRates, 'jewelry', branch.code, rep.staff_type, ym)
      rep.bar_score     += e.bar_weight_g * resolveRate(kpiRates, 'bar', branch.code, rep.staff_type, ym)
      rep.qty_score     += qtyRate > 0
        ? e.quantity * qtyRate
        : resolveQtyScore(qtyTiers, branch.code, rep.staff_type, probeDate, e.quantity)
    }

    const reps = Array.from(repMap.values())
      .map(r => ({ ...r, total_score: r.jewelry_score + r.bar_score + r.qty_score }))
      .sort((a, b) => b.total_score - a.total_score)

    const totalScore   = reps.reduce((s, r) => s + r.total_score, 0)
    const totalJewelry = reps.reduce((s, r) => s + r.jewelry_g, 0)
    const totalBar     = reps.reduce((s, r) => s + r.bar_g, 0)
    const totalQty     = reps.reduce((s, r) => s + r.qty, 0)

    // Headcount-weighted target — mirrors the desktop Company Overview calc: each active
    // roster rep (as of this month, regardless of whether they have entries yet) counts
    // toward their staff_type's headcount, multiplied by that staff_type's per-person target.
    const branchRoster = roster.filter(r => r.branch_code === branch.code)
    const repCodesAsOfMonth = new Set(branchRoster.map(r => r.rep_code))
    let b2cCount = 0, b2bCount = 0
    for (const repCode of repCodesAsOfMonth) {
      const rows = (rosterByRep.get(repCode) ?? []).filter(r => r.branch_code === branch.code)
      let asOf: RosterRow | undefined
      for (const r of rows) {
        if (r.year_month <= ym && (!asOf || r.year_month > asOf.year_month)) asOf = r
      }
      if (!asOf || !asOf.active) continue
      if (asOf.staff_type === 'b2c') b2cCount++; else b2bCount++
    }
    const b2cTarget = resolveBranchTarget(branches, monthlyTargets, branch.code, year, month, 'b2c')
    const b2bTarget = resolveBranchTarget(branches, monthlyTargets, branch.code, year, month, 'b2b')
    const kpiTarget = b2cCount * b2cTarget + b2bCount * b2bTarget

    return {
      code:        branch.code,
      name:        branch.name,
      kpi_target:  Math.round(kpiTarget * 100) / 100,
      total_score: Math.round(totalScore * 100) / 100,
      kpi_pct:     kpiTarget > 0 ? Math.round((totalScore / kpiTarget) * 10000) / 100 : 0,
      jewelry_g:   Math.round(totalJewelry * 100) / 100,
      bar_g:       Math.round(totalBar * 100) / 100,
      qty:         totalQty,
      reps,
    }
  })
}

export function kpiColor(pct: number): string {
  if (pct >= 80) return 'text-green-700 bg-green-50'
  if (pct >= 50) return 'text-amber-700 bg-amber-50'
  return 'text-red-700 bg-red-50'
}

export function kpiBarColor(pct: number): string {
  if (pct >= 80) return 'bg-green-500'
  if (pct >= 50) return 'bg-amber-500'
  return 'bg-red-500'
}

export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
