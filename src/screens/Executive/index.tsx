import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList, Legend, Cell } from 'recharts'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { RadialGauge } from '../../components/ui/RadialGauge'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import type { ExecutiveBranchRow } from '../../types'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmt(n: number, d = 0) { return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) }
function fmtPct(n: number) { return `${n.toFixed(1)}%` }

function kpiColor(pct: number) {
  if (pct >= 100) return '#16a34a'
  if (pct >= 70)  return '#004f96'
  if (pct >= 40)  return '#ca8a04'
  return '#dc2626'
}

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

  // Company-wide aggregates
  const totalScore    = rows.reduce((s, r) => s + r.kpi_total_score, 0)
  const totalTarget   = rows.reduce((s, r) => s + r.kpi_point_target, 0)
  const overallKpiPct = totalTarget > 0 ? (totalScore / totalTarget) * 100 : 0
  const totalPeople   = rows.reduce((s, r) => s + r.person_count, 0)

  // Chart data — one bar per branch
  const chartData = rows.map(r => ({
    name:       r.code,
    branchName: r.branch_name,
    kpiPct:     parseFloat(r.kpi_pct.toFixed(1)),
    score:      r.kpi_total_score,
    target:     r.kpi_point_target,
  }))

  // Sorted by KPI%
  const ranked = [...rows].sort((a, b) => b.kpi_pct - a.kpi_pct)

  return (
    <AppShell title="SalesTrack Pro" allowedRoles={['admin','executive']}>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-background">Company Overview</h2>
          <p className="text-on-surface-variant text-body-md">KPI performance analytics for all active branches</p>
        </div>
        <select
          value={selectedMonth}
          onChange={e => setSelectedPeriod(selectedYear, Number(e.target.value))}
          className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm outline-none"
        >
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m} {selectedYear}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin-slow text-4xl">sync</span>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-card-gap">

          {/* ── Main KPI Card ── */}
          <GlassCard elevated className="col-span-12 lg:col-span-8 p-8 relative overflow-hidden group">
            <div className="absolute -right-16 -top-16 w-64 h-64 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors duration-700" />
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="bg-primary/10 text-primary px-3 py-1 rounded-full font-label-md text-[10px] uppercase tracking-widest mb-4 inline-block">
                    KPI Score — {MONTHS[selectedMonth - 1]} {selectedYear}
                  </span>
                  <h3 className="font-display-xl text-display-xl text-primary tabular-nums">
                    {fmtPct(overallKpiPct)}
                  </h3>
                  <p className="text-on-surface-variant text-body-md mt-1">
                    {fmt(totalScore)} of {fmt(totalTarget)} pts across {totalPeople} staff
                  </p>
                </div>
                <RadialGauge pct={Math.min(overallKpiPct, 100)} label="Overall KPI" size={120} color="#004f96" />
              </div>
              {/* Per-branch quick stats */}
              <div className="grid grid-cols-4 gap-4 pt-6 border-t border-outline-variant/30">
                {rows.map(r => (
                  <div key={r.branch_id}>
                    <p className="text-on-surface-variant font-label-md mb-1 uppercase tracking-wider text-[10px]">{r.branch_name}</p>
                    <p className="font-headline-md text-[20px] font-bold tabular-nums" style={{ color: kpiColor(r.kpi_pct) }}>
                      {fmtPct(r.kpi_pct)}
                    </p>
                    <p className="text-[10px] text-on-surface-variant">{fmt(r.kpi_total_score)} / {fmt(r.kpi_point_target)} pts</p>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>

          {/* ── Branch KPI Progress ── */}
          <GlassCard className="col-span-12 lg:col-span-4 p-6">
            <h4 className="font-headline-md text-headline-md text-on-surface mb-5">Branch KPI Achievement</h4>
            <div className="space-y-5">
              {ranked.map(r => {
                const pct  = Math.min(r.kpi_pct, 100)
                const color = kpiColor(r.kpi_pct)
                return (
                  <div key={r.branch_id}>
                    <div className="flex justify-between text-body-sm mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ background: color }}>
                          {r.code}
                        </div>
                        <span className="font-medium">{r.branch_name}</span>
                      </div>
                      <span className="font-bold tabular-nums" style={{ color }}>{fmtPct(r.kpi_pct)}</span>
                    </div>
                    <div className="h-2.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                    <p className="text-[10px] text-on-surface-variant mt-1">
                      {fmt(r.kpi_total_score)} pts &nbsp;·&nbsp; {r.person_count} staff &nbsp;·&nbsp; Target: {fmt(r.per_person_target)} pts/person
                    </p>
                  </div>
                )
              })}
            </div>
          </GlassCard>

          {/* ── KPI % Chart ── */}
          <GlassCard elevated className="col-span-12 p-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-headline-md text-on-surface">Branch KPI % Comparison</h3>
                <p className="text-on-surface-variant text-body-sm">KPI achievement % per branch — 100% = target fully met</p>
              </div>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 28, right: 16, bottom: 4, left: 4 }} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e0e0e0" />
                  <XAxis dataKey="name" tick={{ fontSize: 13, fontWeight: 700 }} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={v => `${v}%`}
                    domain={[0, Math.max(100, Math.ceil(Math.max(...chartData.map(d => d.kpiPct)) / 10) * 10 + 10)]}
                  />
                  <Tooltip
                    formatter={(v: number, _name: string, props) => [
                      `${v.toFixed(1)}%  (${fmt(props.payload.score)} / ${fmt(props.payload.target)} pts)`,
                      'KPI Score %',
                    ]}
                    labelFormatter={(_l, payload) => payload?.[0]?.payload?.branchName ?? _l}
                    contentStyle={{ borderRadius: 10, fontSize: 12 }}
                  />
                  <Bar dataKey="kpiPct" name="KPI %" radius={[6,6,0,0]} maxBarSize={80}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={kpiColor(d.kpiPct)} />
                    ))}
                    <LabelList
                      dataKey="kpiPct"
                      position="top"
                      formatter={(v: number) => `${v.toFixed(1)}%`}
                      style={{ fontSize: 12, fontWeight: 700 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* ── Branch Rankings Table ── */}
          <GlassCard elevated className="col-span-12 overflow-hidden">
            <div className="p-6 border-b border-outline-variant/20">
              <h3 className="font-headline-md text-on-surface">Branch Performance Rankings</h3>
              <p className="text-body-sm text-on-surface-variant">Ranked by KPI % achievement</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="bg-surface-container/30">
                  <tr>
                    {['Rank','Branch','Staff','Jewelry (g)','Bar (g)','Qty','KPI Score','Point Target','KPI %'].map(h => (
                      <th key={h} className="text-left px-6 py-4 font-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {ranked.map((r, i) => (
                    <tr key={r.branch_id} className="hover:bg-surface-container/20 transition-colors">
                      <td className="px-6 py-3">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs inline-flex ${i === 0 ? 'bg-yellow-500' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-amber-700' : 'bg-surface-container-highest text-on-surface-variant'}`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs" style={{ background: kpiColor(r.kpi_pct) }}>
                            {r.code}
                          </div>
                          <p className="font-bold">{r.branch_name}</p>
                        </div>
                      </td>
                      <td className="px-6 py-3 font-tabular-nums text-on-surface-variant">{r.person_count}</td>
                      <td className="px-6 py-3 font-tabular-nums">{fmt(r.actual_jewelry)}g</td>
                      <td className="px-6 py-3 font-tabular-nums">{fmt(r.actual_bar)}g</td>
                      <td className="px-6 py-3 font-tabular-nums">{fmt(r.actual_qty)}</td>
                      <td className="px-6 py-3 font-tabular-nums font-bold">{fmt(r.kpi_total_score)} pts</td>
                      <td className="px-6 py-3 font-tabular-nums text-on-surface-variant">
                        {fmt(r.kpi_point_target)} pts
                        <span className="text-[10px] block text-on-surface-variant/60">{fmt(r.per_person_target)}/person</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="font-bold text-body-sm tabular-nums px-3 py-1 rounded-lg" style={{ background: kpiColor(r.kpi_pct) + '20', color: kpiColor(r.kpi_pct) }}>
                          {fmtPct(r.kpi_pct)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

        </div>
      )}
    </AppShell>
  )
}
