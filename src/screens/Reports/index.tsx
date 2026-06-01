import { useEffect, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import type { MonthlyReportRow } from '../../types'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function pctVariant(pct: number): 'success' | 'warning' | 'error' | 'neutral' {
  if (pct >= 100) return 'success'
  if (pct >= 75) return 'neutral'
  if (pct >= 50) return 'warning'
  return 'error'
}

function pctLabel(pct: number) {
  if (pct >= 100) return 'Over Target'
  if (pct >= 75) return 'On Track'
  if (pct >= 50) return 'Pacing'
  return 'Behind'
}

function fmt(n: number, d = 1) { return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) }

export default function Reports() {
  const { token, user, branches } = useAuthStore()
  const { selectedBranchId, selectedYear, selectedMonth, setSelectedBranch, setSelectedPeriod } = useAppStore()
  const [rows, setRows] = useState<MonthlyReportRow[]>([])
  const [meta, setMeta] = useState({ daysInMonth: 30, dayOfMonth: 1, daysRemaining: 29 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const effectiveBranchId = user?.role === 'supervisor'
    ? (user.branchId ?? 1)
    : (selectedBranchId ?? branches[0]?.id ?? 1)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    window.api.getMonthlyReport(token, effectiveBranchId, selectedYear, selectedMonth)
      .then(data => { setRows(data.rows); setMeta({ daysInMonth: data.daysInMonth, dayOfMonth: data.dayOfMonth, daysRemaining: data.daysRemaining }) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [token, effectiveBranchId, selectedYear, selectedMonth])

  const filtered = rows.filter(r =>
    r.full_name.toLowerCase().includes(search.toLowerCase()) ||
    r.position.toLowerCase().includes(search.toLowerCase())
  )

  // Summary stats
  const totalTarget = rows.reduce((s, r) => s + r.target_jewelry + r.target_bar, 0)
  const totalMtd    = rows.reduce((s, r) => s + r.actual_jewelry + r.actual_bar, 0)
  const avgPct      = rows.length ? rows.reduce((s, r) => s + r.avgPct, 0) / rows.length : 0
  const eomPct      = totalTarget > 0 ? (totalMtd / meta.dayOfMonth * meta.daysInMonth / totalTarget) * 100 : 0

  return (
    <AppShell title="SalesTrack Pro">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <nav className="flex items-center gap-2 text-label-md text-on-surface-variant mb-2">
            <span>Reports</span>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="text-primary">Performance Tracking</span>
          </nav>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Monthly Tracking Report</h2>
          <p className="text-on-surface-variant text-body-md mt-1">
            {branches.find(b => b.id === effectiveBranchId)?.name} — {MONTHS[selectedMonth - 1]} {selectedYear}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Period selector */}
          <select
            value={selectedMonth}
            onChange={e => setSelectedPeriod(selectedYear, Number(e.target.value))}
            className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm text-on-surface outline-none"
          >
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <input
            type="number"
            value={selectedYear}
            onChange={e => setSelectedPeriod(Number(e.target.value), selectedMonth)}
            className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm text-on-surface w-24 outline-none"
          />
          {/* Branch selector */}
          {user?.role !== 'supervisor' && (
            <select
              value={effectiveBranchId}
              onChange={e => setSelectedBranch(Number(e.target.value))}
              className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm text-on-surface outline-none"
            >
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* KPI Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-card-gap mb-8">
        {[
          { label: 'Total Target (Weight)', value: `${fmt(totalTarget / 1000, 2)} kg`, color: 'border-primary' },
          { label: 'Total MTD (Weight)',    value: `${fmt(totalMtd / 1000, 2)} kg`,   color: 'border-secondary-container' },
          { label: 'Avg % Hit',            value: `${fmt(avgPct, 1)}%`,              color: 'border-tertiary' },
          { label: 'EOM Pacing',           value: eomPct >= 100 ? 'On Track' : `${fmt(eomPct, 1)}%`, color: 'border-primary-container' },
        ].map(k => (
          <GlassCard key={k.label} className={`p-6 border-l-4 ${k.color}`}>
            <p className="font-label-md text-label-md text-on-surface-variant uppercase mb-2">{k.label}</p>
            <h3 className="font-display-xl text-display-xl text-on-surface tabular-nums">{k.value}</h3>
          </GlassCard>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">search</span>
        <input
          type="text"
          placeholder="Search by name or position..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-white/60 backdrop-blur-sm border border-white/50 rounded-lg pl-9 pr-4 py-2 text-body-sm outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Main Table */}
      <GlassCard className="overflow-hidden shadow-sm border border-white/40" elevated>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-variant/20 border-b border-white/40">
                {['Representative','Jewelry Target','Jewelry MTD','Bar Target','Bar MTD','Qty Target','Qty MTD','Avg %','EOM Proj.','KPI Score'].map(h => (
                  <th key={h} className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/20">
              {loading ? (
                <tr><td colSpan={10} className="py-12 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined animate-spin-slow text-2xl block mx-auto mb-2">sync</span>
                  Loading report...
                </td></tr>
              ) : filtered.map(r => {
                const variant = pctVariant(r.avgPct)
                const totalKpi = r.kpiScore.jewelry + r.kpiScore.bar + r.kpiScore.qty
                return (
                  <tr key={r.id} className={`transition-colors group hover:bg-primary/[0.02] ${variant === 'error' ? 'hover:bg-error-container/5' : ''}`}>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold uppercase">
                          {r.full_name.slice(0,1)}
                        </div>
                        <div>
                          <p className="font-label-md text-label-md font-bold">{r.full_name}</p>
                          <p className="text-[10px] text-on-surface-variant">{r.position}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-tabular-nums text-body-sm">{fmt(r.target_jewelry)}g</td>
                    <td className="px-5 py-3 font-tabular-nums text-body-sm font-bold">{fmt(r.actual_jewelry)}g</td>
                    <td className="px-5 py-3 font-tabular-nums text-body-sm">{fmt(r.target_bar)}g</td>
                    <td className="px-5 py-3 font-tabular-nums text-body-sm font-bold">{fmt(r.actual_bar)}g</td>
                    <td className="px-5 py-3 font-tabular-nums text-body-sm">{r.target_qty}</td>
                    <td className="px-5 py-3 font-tabular-nums text-body-sm font-bold">{r.actual_qty}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col items-center gap-0.5">
                        <StatusBadge label={`${fmt(r.avgPct, 1)}%`} variant={variant} />
                        <span className={`text-[9px] font-bold uppercase ${variant === 'error' ? 'text-error' : variant === 'success' ? 'text-tertiary' : 'text-on-surface-variant'}`}>
                          {pctLabel(r.avgPct)}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className={`flex items-center gap-1 font-tabular-nums text-body-sm ${eomPct >= 100 ? 'text-tertiary' : 'text-on-surface-variant'}`}>
                        <span className="material-symbols-outlined text-sm">
                          {r.eomProjected.jewelry + r.eomProjected.bar > r.target_jewelry + r.target_bar ? 'trending_up' : 'trending_down'}
                        </span>
                        {fmt((r.eomProjected.jewelry + r.eomProjected.bar) / Math.max(r.target_jewelry + r.target_bar, 1) * 100, 1)}%
                      </div>
                    </td>
                    <td className="px-5 py-3 font-tabular-nums text-body-sm font-bold text-primary">
                      {fmt(totalKpi, 0)}
                    </td>
                  </tr>
                )
              })}
              {!loading && !filtered.length && (
                <tr><td colSpan={10} className="py-8 text-center text-on-surface-variant text-body-sm">No results found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-4 bg-surface-variant/10 border-t border-white/40 flex justify-between items-center">
          <p className="text-body-sm text-on-surface-variant italic">
            Showing {filtered.length} of {rows.length} representatives · Day {meta.dayOfMonth} of {meta.daysInMonth} · {meta.daysRemaining} days remaining
          </p>
        </div>
      </GlassCard>
    </AppShell>
  )
}
