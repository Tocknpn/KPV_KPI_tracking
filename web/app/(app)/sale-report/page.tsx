import { getSession } from '@/lib/session'
import { getEntries, getBranches } from '@/lib/sheets'
import { MONTHS } from '@/lib/kpi'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ year?: string; month?: string; branch?: string }>
}

// Deduplicate entries — newer row for same (date, rep) supersedes older one
function dedupe(entries: Awaited<ReturnType<typeof getEntries>>) {
  const map = new Map<string, typeof entries[0]>()
  for (const e of entries) map.set(`${e.entry_date}:${e.rep_code}`, e)
  return Array.from(map.values())
}

export default async function SaleReportPage({ searchParams }: Props) {
  const session = await getSession()
  const params = await searchParams

  const now = new Date()
  const year = parseInt(params.year ?? '') || now.getFullYear()
  const month = parseInt(params.month ?? '') || now.getMonth() + 1

  const [allEntries, branches] = await Promise.all([getEntries(), getBranches()])

  const isBranchManager = session.role === 'branch_manager'
  const lockedBranch = isBranchManager ? (session.branchCode ?? null) : null
  const selectedBranch = lockedBranch ?? (params.branch || null)

  const monthStr = `${year}-${String(month).padStart(2, '0')}`
  let entries = allEntries.filter(e => e.entry_date.startsWith(monthStr))
  if (selectedBranch) entries = entries.filter(e => e.branch_code === selectedBranch)
  entries = dedupe(entries)
  entries = entries.sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.branch_code.localeCompare(b.branch_code))

  const totalJewelry = entries.reduce((s, e) => s + e.jewelry_weight_g, 0)
  const totalBar = entries.reduce((s, e) => s + e.bar_weight_g, 0)
  const totalQty = entries.reduce((s, e) => s + e.quantity, 0)

  // Group by date for the grouped display
  const byDate = new Map<string, typeof entries>()
  for (const e of entries) {
    if (!byDate.has(e.entry_date)) byDate.set(e.entry_date, [])
    byDate.get(e.entry_date)!.push(e)
  }

  const yearOptions = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Sale Report</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {MONTHS[month - 1]} {year} · Daily sales entries
        </p>
      </div>

      {/* Filters */}
      <form method="GET" action="/sale-report" className="card p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
          <select name="year" defaultValue={year} className="select">
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Month</label>
          <select name="month" defaultValue={month} className="select">
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        {!isBranchManager && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Branch</label>
            <select name="branch" defaultValue={selectedBranch ?? ''} className="select">
              <option value="">All Branches</option>
              {branches.map(b => <option key={b.code} value={b.code}>{b.name} ({b.code})</option>)}
            </select>
          </div>
        )}
        <button type="submit" className="btn-primary">Apply</button>
      </form>

      {/* Summary totals */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Jewelry</div>
          <div className="text-2xl font-bold text-gray-900">{totalJewelry.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="text-sm font-normal text-gray-400">g</span></div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Bar</div>
          <div className="text-2xl font-bold text-gray-900">{totalBar.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="text-sm font-normal text-gray-400">g</span></div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Qty</div>
          <div className="text-2xl font-bold text-gray-900">{totalQty.toLocaleString()}</div>
        </div>
      </div>

      {/* Entries table grouped by date */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Daily Entries</h2>
          <span className="text-sm text-gray-400">{entries.length} rows</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Date</th>
                <th className="table-header">Branch</th>
                <th className="table-header">Rep</th>
                <th className="table-header text-right">Jewelry (g)</th>
                <th className="table-header text-right">Bar (g)</th>
                <th className="table-header text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="table-cell text-center text-gray-400 py-8">
                    No entries for {MONTHS[month - 1]} {year}
                  </td>
                </tr>
              )}
              {Array.from(byDate.entries()).map(([date, dayEntries]) => {
                const dayJewelry = dayEntries.reduce((s, e) => s + e.jewelry_weight_g, 0)
                const dayBar = dayEntries.reduce((s, e) => s + e.bar_weight_g, 0)
                const dayQty = dayEntries.reduce((s, e) => s + e.quantity, 0)
                const d = new Date(date + 'T00:00:00')
                const dayLabel = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', weekday: 'short' })

                return [
                  // Date sub-header row
                  <tr key={`hdr-${date}`} className="bg-gray-50">
                    <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-gray-600">{dayLabel}</td>
                    <td className="px-4 py-2 text-xs font-semibold text-right text-gray-600">{dayJewelry.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2 text-xs font-semibold text-right text-gray-600">{dayBar.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2 text-xs font-semibold text-right text-gray-600">{dayQty.toLocaleString()}</td>
                  </tr>,
                  // Rep rows
                  ...dayEntries.map(e => (
                    <tr key={`${e.entry_date}-${e.rep_code}`} className="hover:bg-gray-50">
                      <td className="table-cell text-gray-400 text-xs pl-8">↳</td>
                      <td className="table-cell text-xs text-gray-500">{e.branch_code}</td>
                      <td className="table-cell">
                        <div className="text-sm">{e.full_name}</div>
                        <div className="text-xs text-gray-400">{e.rep_code}</div>
                      </td>
                      <td className="table-cell text-right">{e.jewelry_weight_g.toLocaleString()}</td>
                      <td className="table-cell text-right">{e.bar_weight_g.toLocaleString()}</td>
                      <td className="table-cell text-right">{e.quantity}</td>
                    </tr>
                  )),
                ]
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-4 text-right">Data cached · refreshes every 5 min</p>
    </div>
  )
}
