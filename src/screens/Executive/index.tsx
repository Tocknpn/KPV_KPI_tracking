import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList, CartesianGrid, Legend, ReferenceLine } from 'recharts'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { RadialGauge } from '../../components/ui/RadialGauge'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import type { ExecutiveBranchRow } from '../../types'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function Executive() {
  const { token } = useAuthStore()
  const { selectedYear, selectedMonth, setSelectedPeriod } = useAppStore()
  const [rows, setRows] = useState<ExecutiveBranchRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    window.api.getExecutiveReport(token, selectedYear, selectedMonth)
      .then(setRows)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [token, selectedYear, selectedMonth])

  const totalActualWeight = rows.reduce((s, r) => s + r.actual_jewelry + r.actual_bar, 0)
  const totalTargetWeight = rows.reduce((s, r) => s + r.target_jewelry + r.target_bar, 0)
  const overallPct = totalTargetWeight > 0 ? (totalActualWeight / totalTargetWeight) * 100 : 0

  const chartData = rows.map(r => {
    const actual = r.actual_jewelry + r.actual_bar
    const target = r.target_jewelry + r.target_bar
    const pct    = target > 0 ? (actual / target) * 100 : 0
    return {
      name:       r.code,
      branchName: r.branch_name,
      actual,
      target,
      pct,
    }
  })

  return (
    <AppShell title="SalesTrack Pro" allowedRoles={['admin','executive']}>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-background">Company Overview</h2>
          <p className="text-on-surface-variant text-body-md">Aggregated performance analytics for all active branches</p>
        </div>
        <div className="flex gap-2">
          <select
            value={selectedMonth}
            onChange={e => setSelectedPeriod(selectedYear, Number(e.target.value))}
            className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm outline-none"
          >
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m} {selectedYear}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin-slow text-4xl">sync</span>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-card-gap">
          {/* Main KPI Card */}
          <GlassCard elevated className="col-span-12 lg:col-span-8 p-8 relative overflow-hidden group">
            <div className="absolute -right-16 -top-16 w-64 h-64 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors duration-700" />
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="bg-primary/10 text-primary px-3 py-1 rounded-full font-label-md text-[10px] uppercase tracking-widest mb-4 inline-block">
                    Weight Target — {MONTHS[selectedMonth - 1]} {selectedYear}
                  </span>
                  <h3 className="font-display-xl text-display-xl text-primary tabular-nums">
                    {(totalActualWeight / 1000).toLocaleString('en-US', { minimumFractionDigits: 2 })} kg
                  </h3>
                  <p className="text-on-surface-variant text-body-md mt-1">
                    of {(totalTargetWeight / 1000).toLocaleString('en-US', { minimumFractionDigits: 2 })} kg target
                  </p>
                </div>
                <RadialGauge pct={overallPct} label="Overall" size={120} color="#004f96" />
              </div>
              <div className="grid grid-cols-3 gap-8 pt-6 border-t border-outline-variant/30">
                {rows.slice(0, 3).map(r => {
                  const branchPct = (r.target_jewelry + r.target_bar) > 0
                    ? ((r.actual_jewelry + r.actual_bar) / (r.target_jewelry + r.target_bar)) * 100 : 0
                  return (
                    <div key={r.branch_id}>
                      <p className="text-on-surface-variant font-label-md mb-1 uppercase tracking-wider">{r.branch_name}</p>
                      <p className="font-headline-md text-[20px] text-on-surface tabular-nums font-bold">{branchPct.toFixed(1)}%</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </GlassCard>

          {/* Branch Quick Stats */}
          <GlassCard className="col-span-12 lg:col-span-4 p-6">
            <h4 className="font-headline-md text-headline-md text-on-surface mb-6">Branch Targets Hit</h4>
            <div className="space-y-5">
              {rows.map(r => {
                const total = r.target_jewelry + r.target_bar
                const actual = r.actual_jewelry + r.actual_bar
                const pct = total > 0 ? Math.min((actual / total) * 100, 100) : 0
                return (
                  <div key={r.branch_id}>
                    <div className="flex justify-between text-body-sm mb-1">
                      <span className="font-medium">{r.branch_name}</span>
                      <span className="font-bold">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </GlassCard>

          {/* Branch KPI Comparison — cleaner 2-bar grouped chart */}
          <GlassCard elevated className="col-span-12 p-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-headline-md text-on-surface">Branch KPI Comparison</h3>
                <p className="text-on-surface-variant text-body-sm">Total weight MTD vs. target — Jewelry + Bar combined</p>
              </div>
              <div className="flex gap-4 text-xs items-center">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-primary" />
                  <span className="font-medium">Actual MTD</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-primary/20 border border-primary/30" />
                  <span className="font-medium">Target</span>
                </div>
              </div>
            </div>

            {/* % hit mini-badges per branch */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              {chartData.map((d, i) => (
                <div key={d.name} className={`rounded-xl px-4 py-3 text-center ${d.pct >= 100 ? 'bg-green-50' : d.pct >= 50 ? 'bg-blue-50' : 'bg-red-50'}`}>
                  <p className="text-[10px] text-on-surface-variant uppercase font-bold mb-1">{d.branchName}</p>
                  <p className={`text-xl font-bold tabular-nums ${d.pct >= 100 ? 'text-green-600' : d.pct >= 50 ? 'text-primary' : 'text-red-500'}`}>
                    {d.pct.toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-on-surface-variant mt-0.5">
                    {(d.actual / 1000).toFixed(2)} / {(d.target / 1000).toFixed(2)} kg
                  </p>
                </div>
              ))}
            </div>

            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 16, bottom: 4, left: 4 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e0e0e0" />
                  <XAxis dataKey="name" tick={{ fontSize: 13, fontWeight: 700 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: number, name: string) => [`${(v/1000).toFixed(2)} kg  (${v.toLocaleString()} g)`, name]}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.branchName ?? label}
                    contentStyle={{ borderRadius: 10, fontSize: 12 }}
                  />
                  <Legend iconType="square" iconSize={12} />
                  <Bar dataKey="actual" name="Actual MTD" fill="#004f96" radius={[4,4,0,0]} maxBarSize={64}>
                    <LabelList
                      dataKey="pct"
                      position="top"
                      formatter={(v: number) => `${v.toFixed(1)}%`}
                      style={{ fontSize: 11, fontWeight: 700, fill: '#004f96' }}
                    />
                  </Bar>
                  <Bar dataKey="target" name="Target" fill="#004f96" fillOpacity={0.18} radius={[4,4,0,0]} maxBarSize={64} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* Branch Rankings Table */}
          <GlassCard elevated className="col-span-12 overflow-hidden">
            <div className="p-6 border-b border-outline-variant/20 flex justify-between items-center">
              <h3 className="font-headline-md text-on-surface">Branch Performance Rankings</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="bg-surface-container/30">
                  <tr>
                    {['Rank','Branch','Jewelry Actual','Bar Actual','Qty Actual','Jewelry Target','Bar Target','% Hit'].map(h => (
                      <th key={h} className="text-left px-6 py-4 font-label-md text-on-surface-variant uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {rows
                    .slice()
                    .sort((a, b) => (b.actual_jewelry + b.actual_bar) - (a.actual_jewelry + a.actual_bar))
                    .map((r, i) => {
                      const total = r.target_jewelry + r.target_bar
                      const actual = r.actual_jewelry + r.actual_bar
                      const pct = total > 0 ? (actual / total) * 100 : 0
                      return (
                        <tr key={r.branch_id} className="hover:bg-surface-container/20 transition-colors">
                          <td className="px-6 py-3 font-bold text-on-surface-variant">#{i + 1}</td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">{r.code}</div>
                              <p className="font-bold">{r.branch_name}</p>
                            </div>
                          </td>
                          <td className="px-6 py-3 font-tabular-nums">{r.actual_jewelry.toLocaleString()}g</td>
                          <td className="px-6 py-3 font-tabular-nums">{r.actual_bar.toLocaleString()}g</td>
                          <td className="px-6 py-3 font-tabular-nums">{r.actual_qty.toLocaleString()}</td>
                          <td className="px-6 py-3 font-tabular-nums text-on-surface-variant">{r.target_jewelry.toLocaleString()}g</td>
                          <td className="px-6 py-3 font-tabular-nums text-on-surface-variant">{r.target_bar.toLocaleString()}g</td>
                          <td className="px-6 py-3 font-bold text-primary tabular-nums">{pct.toFixed(1)}%</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      )}
    </AppShell>
  )
}
