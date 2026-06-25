import { getSession } from '@/lib/session'
import { getEntries, getBranches, getKpiRates, getQtyTiers, getMonthlyTargets, getRoster } from '@/lib/sheets'
import { computeKpi, kpiColor, kpiBarColor, MONTHS } from '@/lib/kpi'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await getSession()

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const [allEntries, branches, kpiRates, qtyTiers, monthlyTargets, roster] = await Promise.all([
    getEntries(),
    getBranches(),
    getKpiRates(),
    getQtyTiers(),
    getMonthlyTargets(),
    getRoster(),
  ])

  const isBranchScoped = session.role === 'branch_manager' || session.role === 'accountant_officer'
  const filterBranches = isBranchScoped && session.branchCode
    ? [session.branchCode as string]
    : undefined

  const branchKpis = computeKpi(allEntries, branches, kpiRates, qtyTiers, monthlyTargets, roster, year, month, filterBranches)

  const overallScore = branchKpis.reduce((s, b) => s + b.total_score, 0)
  const overallTarget = branchKpis.reduce((s, b) => s + b.kpi_target, 0)
  const overallPct = overallTarget > 0 ? Math.round((overallScore / overallTarget) * 10000) / 100 : 0

  const todayStr = now.toISOString().split('T')[0]
  const todayEntries = new Set(allEntries.filter(e => e.entry_date === todayStr).map(e => e.branch_code))
  const branchesWithDataToday = todayEntries.size

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-on-surface">Dashboard</h1>
        <p className="text-sm text-on-surface-variant mt-0.5">
          MTD performance — {MONTHS[month - 1]} {year}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-xs text-on-surface-variant uppercase tracking-wide mb-1">Active Branches</div>
          <div className="text-3xl font-bold text-on-surface">{branchKpis.length}</div>
          <div className="text-xs text-on-surface-variant/60 mt-1">{branchesWithDataToday} submitted today</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-on-surface-variant uppercase tracking-wide mb-1">Total KPI Score</div>
          <div className="text-3xl font-bold text-on-surface">{overallScore.toLocaleString()}</div>
          <div className="text-xs text-on-surface-variant/60 mt-1">Target: {overallTarget.toLocaleString()}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-on-surface-variant uppercase tracking-wide mb-1">Overall KPI %</div>
          <div className={`text-3xl font-bold ${overallPct >= 80 ? 'text-green-600' : overallPct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
            {overallPct.toFixed(1)}%
          </div>
          <div className="w-full bg-surface-container rounded-full h-1.5 mt-2">
            <div
              className={`h-1.5 rounded-full ${kpiBarColor(overallPct)}`}
              style={{ width: `${Math.min(overallPct, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Branch table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-outline-variant/10">
          <h2 className="font-semibold text-on-surface">Branch Performance</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Branch</th>
                <th className="table-header text-right">Reps</th>
                <th className="table-header text-right">Jewelry (g)</th>
                <th className="table-header text-right">Bar (g)</th>
                <th className="table-header text-right">Qty</th>
                <th className="table-header text-right">Score</th>
                <th className="table-header text-right">Target</th>
                <th className="table-header text-right">KPI %</th>
              </tr>
            </thead>
            <tbody>
              {branchKpis.length === 0 && (
                <tr>
                  <td colSpan={8} className="table-cell text-center text-on-surface-variant/60 py-8">
                    No data for {MONTHS[month - 1]} {year}
                  </td>
                </tr>
              )}
              {branchKpis.map(b => (
                <tr key={b.code} className="hover:bg-surface-container-low/50">
                  <td className="table-cell font-medium">
                    <div>{b.name}</div>
                    <div className="text-xs text-on-surface-variant/60">{b.code}</div>
                  </td>
                  <td className="table-cell text-right">{b.reps.length}</td>
                  <td className="table-cell text-right">{b.jewelry_g.toLocaleString()}</td>
                  <td className="table-cell text-right">{b.bar_g.toLocaleString()}</td>
                  <td className="table-cell text-right">{b.qty.toLocaleString()}</td>
                  <td className="table-cell text-right font-medium">{b.total_score.toLocaleString()}</td>
                  <td className="table-cell text-right text-on-surface-variant">{b.kpi_target.toLocaleString()}</td>
                  <td className="table-cell text-right">
                    <span className={`kpi-badge ${kpiColor(b.kpi_pct)}`}>
                      {b.kpi_pct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-on-surface-variant/60 mt-4 text-right">
        Data cached · refreshes every 5 min
      </p>
    </div>
  )
}
