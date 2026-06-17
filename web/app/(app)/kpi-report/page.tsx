import { getSession } from '@/lib/session'
import { getEntries, getBranches, getSettings, getQtyTiers, getMonthlyTargets } from '@/lib/sheets'
import { computeKpi, kpiColor, MONTHS } from '@/lib/kpi'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ year?: string; month?: string; branch?: string }>
}

export default async function KpiReportPage({ searchParams }: Props) {
  const session = await getSession()
  const params = await searchParams

  const now = new Date()
  const year = parseInt(params.year ?? '') || now.getFullYear()
  const month = parseInt(params.month ?? '') || now.getMonth() + 1

  const [allEntries, branches, settings, qtyTiers, monthlyTargets] = await Promise.all([
    getEntries(),
    getBranches(),
    getSettings(),
    getQtyTiers(),
    getMonthlyTargets(),
  ])

  const isBranchManager = session.role === 'branch_manager' || session.role === 'accountant_officer'
  const lockedBranch = isBranchManager ? (session.branchCode ?? null) : null

  // Determine which branch to show
  const selectedBranch = lockedBranch ?? (params.branch || null)
  const filterBranches = selectedBranch ? [selectedBranch] : undefined

  const branchKpis = computeKpi(allEntries, branches, settings, qtyTiers, monthlyTargets, year, month, filterBranches)

  // Flatten all reps across displayed branches
  const allReps = branchKpis.flatMap(b => b.reps.map(r => ({ ...r, branch_name: b.name, kpi_target: b.kpi_target })))
    .sort((a, b) => b.total_score - a.total_score)

  const yearOptions = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">KPI Report</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            {MONTHS[month - 1]} {year} · Per-rep KPI breakdown
          </p>
        </div>
      </div>

      {/* Filters */}
      <form method="GET" action="/kpi-report" className="card p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-on-surface-variant mb-1">Year</label>
          <select name="year" defaultValue={year} className="select">
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-on-surface-variant mb-1">Month</label>
          <select name="month" defaultValue={month} className="select">
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        {!isBranchManager && (
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Branch</label>
            <select name="branch" defaultValue={selectedBranch ?? ''} className="select">
              <option value="">All Branches</option>
              {branches.map(b => <option key={b.code} value={b.code}>{b.name} ({b.code})</option>)}
            </select>
          </div>
        )}
        <button type="submit" className="btn-primary">Apply</button>
      </form>

      {/* Branch KPI summary bars */}
      {branchKpis.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {branchKpis.map(b => (
            <div key={b.code} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-semibold text-on-surface text-sm">{b.name}</div>
                  <div className="text-xs text-on-surface-variant/60">{b.code} · {b.reps.length} reps</div>
                </div>
                <span className={`kpi-badge ${kpiColor(b.kpi_pct)}`}>{b.kpi_pct.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-surface-container rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${b.kpi_pct >= 80 ? 'bg-green-500' : b.kpi_pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(b.kpi_pct, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-on-surface-variant/60 mt-1">
                <span>{b.total_score.toLocaleString()} pts</span>
                <span>/ {b.kpi_target.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rep table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-outline-variant/10">
          <h2 className="font-semibold text-on-surface">Rep Breakdown — {MONTHS[month - 1]} {year}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header w-8">#</th>
                <th className="table-header">Rep</th>
                <th className="table-header">Branch</th>
                <th className="table-header text-right">Jewelry (g)</th>
                <th className="table-header text-right">J. Score</th>
                <th className="table-header text-right">Bar (g)</th>
                <th className="table-header text-right">B. Score</th>
                <th className="table-header text-right">Qty</th>
                <th className="table-header text-right">Q. Score</th>
                <th className="table-header text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {allReps.length === 0 && (
                <tr>
                  <td colSpan={10} className="table-cell text-center text-on-surface-variant/60 py-8">
                    No data for {MONTHS[month - 1]} {year}
                  </td>
                </tr>
              )}
              {allReps.map((rep, i) => (
                <tr key={rep.rep_code} className="hover:bg-surface-container-low/50">
                  <td className="table-cell text-on-surface-variant/60 text-xs">{i + 1}</td>
                  <td className="table-cell">
                    <div className="font-medium">{rep.full_name}</div>
                    <div className="text-xs text-on-surface-variant/60">{rep.rep_code}</div>
                  </td>
                  <td className="table-cell text-on-surface-variant text-xs">{rep.branch_name}</td>
                  <td className="table-cell text-right">{rep.jewelry_g.toLocaleString()}</td>
                  <td className="table-cell text-right text-blue-600">{Math.round(rep.jewelry_score).toLocaleString()}</td>
                  <td className="table-cell text-right">{rep.bar_g.toLocaleString()}</td>
                  <td className="table-cell text-right text-blue-600">{Math.round(rep.bar_score).toLocaleString()}</td>
                  <td className="table-cell text-right">{rep.qty.toLocaleString()}</td>
                  <td className="table-cell text-right text-blue-600">{Math.round(rep.qty_score).toLocaleString()}</td>
                  <td className="table-cell text-right font-bold">{Math.round(rep.total_score).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-on-surface-variant/60 mt-4 text-right">Data cached · refreshes every 5 min</p>
    </div>
  )
}
