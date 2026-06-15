import type { EntryRow, BranchRow, QtyTierRow, MonthlyTargetRow } from './sheets'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RepKpi = {
  rep_code: string
  full_name: string
  branch_code: string
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

function getQtyScore(tiers: QtyTierRow[], branchCode: string, quantity: number): number {
  const branchTiers = tiers.filter(t => t.branch_code === branchCode)
  const globalTiers = tiers.filter(t => t.branch_code === 'Global')
  const pool = branchTiers.length > 0 ? branchTiers : globalTiers
  const sorted = [...pool].sort((a, b) => b.threshold - a.threshold)
  for (const tier of sorted) {
    if (quantity >= tier.threshold) return quantity * tier.multiplier
  }
  return 0
}

// ── Main computation ───────────────────────────────────────────────────────────

export function computeKpi(
  allEntries: EntryRow[],
  branches: BranchRow[],
  settings: Record<string, string>,
  qtyTiers: QtyTierRow[],
  monthlyTargets: MonthlyTargetRow[],
  year: number,
  month: number,
  filterBranchCodes?: string[]
): BranchKpi[] {
  const jewelryPts = parseFloat(settings['jewelry_pts_per_unit'] ?? '0')
  const barPts = parseFloat(settings['bar_pts_per_unit'] ?? '0')
  const qtyPtsFlat = parseFloat(settings['qty_pts_per_unit'] ?? '0')

  const monthStr = `${year}-${String(month).padStart(2, '0')}`
  let entries = allEntries.filter(e => e.entry_date.startsWith(monthStr))
  if (filterBranchCodes?.length) {
    entries = entries.filter(e => filterBranchCodes.includes(e.branch_code))
  }
  entries = deduplicateEntries(entries)

  const activeBranches = filterBranchCodes?.length
    ? branches.filter(b => filterBranchCodes.includes(b.code))
    : branches

  return activeBranches.map(branch => {
    const mt = monthlyTargets.find(
      t => t.branch_code === branch.code && t.year === year && t.month === month
    )
    const kpiTarget = mt?.kpi_point_target || branch.kpi_point_target

    const branchEntries = entries.filter(e => e.branch_code === branch.code)

    const repMap = new Map<string, RepKpi>()
    for (const e of branchEntries) {
      if (!repMap.has(e.rep_code)) {
        repMap.set(e.rep_code, {
          rep_code: e.rep_code,
          full_name: e.full_name,
          branch_code: branch.code,
          jewelry_g: 0, bar_g: 0, qty: 0,
          jewelry_score: 0, bar_score: 0, qty_score: 0,
          total_score: 0,
        })
      }
      const rep = repMap.get(e.rep_code)!
      rep.jewelry_g    += e.jewelry_weight_g
      rep.bar_g        += e.bar_weight_g
      rep.qty          += e.quantity
      rep.jewelry_score += e.jewelry_weight_g * jewelryPts
      rep.bar_score    += e.bar_weight_g * barPts
      // Electron priority: flat pts_per_unit from kpi_metrics > tier lookup
      rep.qty_score    += qtyPtsFlat > 0
        ? e.quantity * qtyPtsFlat
        : getQtyScore(qtyTiers, branch.code, e.quantity)
    }

    const reps = Array.from(repMap.values())
      .map(r => ({ ...r, total_score: r.jewelry_score + r.bar_score + r.qty_score }))
      .sort((a, b) => b.total_score - a.total_score)

    const totalScore   = reps.reduce((s, r) => s + r.total_score, 0)
    const totalJewelry = reps.reduce((s, r) => s + r.jewelry_g, 0)
    const totalBar     = reps.reduce((s, r) => s + r.bar_g, 0)
    const totalQty     = reps.reduce((s, r) => s + r.qty, 0)

    return {
      code:        branch.code,
      name:        branch.name,
      kpi_target:  kpiTarget,
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
