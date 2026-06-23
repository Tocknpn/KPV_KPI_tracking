import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList, Cell, Legend } from 'recharts'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { RadialGauge } from '../../components/ui/RadialGauge'
import { MonthDropdown, DateRangeBar } from '../../components/ui/PeriodFilter'
import { useAuthStore } from '../../store/auth.store'
import { getDefaultDateRange } from '../../utils/dates'
import type { ExecutiveBranchRow, TeamPerformanceRow } from '../../types'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmt(n: number, d = 0) { return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) }
function fmtPct(n: number) { return `${n.toFixed(1)}%` }

function kpiColor(pct: number) {
  if (pct >= 100) return '#16a34a'
  if (pct >= 70)  return '#990000'
  if (pct >= 40)  return '#ca8a04'
  return '#dc2626'
}

export default function Executive() {
  const { token } = useAuthStore()
  const [rows, setRows]         = useState<ExecutiveBranchRow[]>([])
  const [teamRows, setTeamRows] = useState<TeamPerformanceRow[]>([])
  const [loading, setLoading]   = useState(true)

  // ── Local date state ──────────────────────────────────────────────────
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const initRange = getDefaultDateRange(now.getFullYear(), now.getMonth() + 1)
  const [dateFrom, setDateFrom] = useState(initRange.dateFrom)
  const [dateTo, setDateTo]     = useState(initRange.dateTo)

  function handleMonthChange(y: number, m: number) {
    setYear(y); setMonth(m)
    const { dateFrom: df, dateTo: dt } = getDefaultDateRange(y, m)
    setDateFrom(df); setDateTo(dt)
  }

  const maxDate = getDefaultDateRange(year, month).dateTo

  // Est. Month End helpers
  const daysInMonth = new Date(year, month, 0).getDate()
  const dayOfMonth  = new Date(dateTo + 'T00:00:00').getDate()
  function eomPct(pct: number) { return dayOfMonth > 0 ? (pct / dayOfMonth) * daysInMonth : 0 }

  useEffect(() => {
    if (!token) return
    setLoading(true)
    Promise.all([
      window.api.getExecutiveReport(token, year, month, dateFrom, dateTo),
      window.api.getTeamPerformance(token, [], year, month, dateFrom, dateTo),
    ]).then(([branchData, teamData]) => {
      setRows(branchData as ExecutiveBranchRow[])
      setTeamRows(teamData as TeamPerformanceRow[])
    }).catch(console.error).finally(() => setLoading(false))
  }, [token, year, month, dateFrom, dateTo])

  const totalScore    = rows.reduce((s, r) => s + r.kpi_total_score, 0)
  const totalTarget   = rows.reduce((s, r) => s + r.kpi_point_target, 0)
  const overallKpiPct = totalTarget > 0 ? (totalScore / totalTarget) * 100 : 0
  const totalPeople   = rows.reduce((s, r) => s + r.person_count, 0)

  const ranked = [...rows].sort((a, b) => b.kpi_pct - a.kpi_pct)

  // Team Sup chart data
  const supChartData = teamRows.map(r => ({
    name:    r.nickname || r.full_name.split(' ')[0],
    fullName: r.full_name,
    branch:  r.branch_name,
    current: parseFloat(r.team_kpi_pct.toFixed(1)),
    eom:     parseFloat(eomPct(r.team_kpi_pct).toFixed(1)),
    supKpi:  parseFloat(r.sup_kpi_pct_ach.toFixed(1)),
  }))

  return (
    <AppShell title="SalesTrack Pro" allowedRoles={['admin','top_manager']}>
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-background">Company Overview</h2>
          <p className="text-on-surface-variant text-body-md">
            KPI analytics · {MONTHS[month - 1]} {year}
            {(dateFrom !== `${year}-${String(month).padStart(2,'0')}-01` || dateTo !== maxDate) && (
              <span className="ml-2 text-[11px] font-mono bg-surface-container px-1.5 py-0.5 rounded">{dateFrom} → {dateTo}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <MonthDropdown year={year} month={month} onChange={handleMonthChange} />
          <DateRangeBar
            year={year} month={month}
            dateFrom={dateFrom} dateTo={dateTo} maxDate={maxDate}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
          />
        </div>
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
                    KPI Score — {MONTHS[month - 1]} {year}
                  </span>
                  <h3 className="font-display-xl text-display-xl text-primary tabular-nums">
                    {fmtPct(overallKpiPct)}
                  </h3>
                  <p className="text-on-surface-variant text-body-md mt-1">
                    {fmt(totalScore)} of {fmt(totalTarget)} pts across {totalPeople} staff
                  </p>
                  <p className="text-[11px] text-on-surface-variant/60 mt-1 font-mono">
                    {dateFrom} → {dateTo}
                  </p>
                </div>
                <RadialGauge pct={Math.min(overallKpiPct, 100)} label="Overall KPI" size={120} color="#990000" />
              </div>
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
            <h4 className="font-headline-md text-headline-md text-on-surface mb-1">Branch KPI Achievement</h4>
            <p className="text-[10px] text-on-surface-variant mb-4">Current · Est. Month End (day {dayOfMonth} of {daysInMonth})</p>
            <div className="space-y-5">
              {ranked.map(r => {
                const pct    = Math.min(r.kpi_pct, 100)
                const eom    = eomPct(r.kpi_pct)
                const eomCap = Math.min(eom, 100)
                const color  = kpiColor(r.kpi_pct)
                return (
                  <div key={r.branch_id}>
                    <div className="flex justify-between text-body-sm mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ background: color }}>
                          {r.code}
                        </div>
                        <span className="font-medium">{r.branch_name}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold tabular-nums" style={{ color }}>{fmtPct(r.kpi_pct)}</span>
                        <span className="text-[10px] text-on-surface-variant ml-1.5">→ <span className={eom >= 100 ? 'text-green-600 font-bold' : 'text-tertiary font-semibold'}>{fmtPct(eom)}</span> est.</span>
                      </div>
                    </div>
                    {/* Current progress bar */}
                    <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden mb-0.5">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: color }} />
                    </div>
                    {/* Est. month end bar */}
                    <div className="h-1 w-full bg-surface-container-highest rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700 opacity-40"
                        style={{ width: `${eomCap}%`, background: color }} />
                    </div>
                    <p className="text-[10px] text-on-surface-variant mt-1">
                      {fmt(r.kpi_total_score)} pts &nbsp;·&nbsp; {r.person_count} staff &nbsp;·&nbsp; Target: {fmt(r.per_person_target)} pts/person
                    </p>
                  </div>
                )
              })}
            </div>
          </GlassCard>

          {/* ── Team Supervisor KPI% Chart ── */}
          {supChartData.length > 0 && (
            <GlassCard elevated className="col-span-12 p-8">
              <div className="mb-6">
                <h3 className="font-headline-md text-on-surface">Team Supervisor KPI% Performance</h3>
                <p className="text-on-surface-variant text-body-sm">Team KPI% per supervisor — Current (solid) vs Est. Month End (faded) — day {dayOfMonth} of {daysInMonth}</p>
              </div>
              <div style={{ height: Math.max(220, supChartData.length * 40) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={supChartData}
                    layout="vertical"
                    margin={{ top: 4, right: 60, bottom: 4, left: 8 }}
                    barCategoryGap="25%"
                    barGap={2}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e0e0e0" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`}
                      domain={[0, Math.max(100, Math.ceil(Math.max(...supChartData.map(d => Math.max(d.current, d.eom))) / 10) * 10 + 10)]} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={72} />
                    <Tooltip
                      formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name]}
                      labelFormatter={(_l, payload) => {
                        const d = payload?.[0]?.payload
                        return d ? `${d.fullName} · ${d.branch}` : _l
                      }}
                      contentStyle={{ borderRadius: 10, fontSize: 12 }}
                    />
                    <Legend iconType="circle" iconSize={8} />
                    <Bar dataKey="current" name="Team KPI % (Current)" radius={[0,4,4,0]} maxBarSize={14}>
                      {supChartData.map((d, i) => <Cell key={i} fill={kpiColor(d.current)} />)}
                      <LabelList dataKey="current" position="right"
                        formatter={(v: number) => `${v.toFixed(1)}%`}
                        style={{ fontSize: 10, fontWeight: 700 }} />
                    </Bar>
                    <Bar dataKey="eom" name="Est. Month End %" radius={[0,4,4,0]} maxBarSize={14} opacity={0.45}>
                      {supChartData.map((d, i) => <Cell key={i} fill={kpiColor(d.eom)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          )}

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
                    {['Rank','Branch','Staff','Jewelry (Baht)','Bar (Baht)','Qty','KPI Score','Point Target','KPI %'].map(h => (
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
                      <td className="px-6 py-3 font-tabular-nums">{fmt(r.actual_jewelry)} Baht</td>
                      <td className="px-6 py-3 font-tabular-nums">{fmt(r.actual_bar)} Baht</td>
                      <td className="px-6 py-3 font-tabular-nums">{fmt(r.actual_qty)}</td>
                      <td className="px-6 py-3 font-tabular-nums font-bold">{fmt(r.kpi_total_score)} pts</td>
                      <td className="px-6 py-3 font-tabular-nums text-on-surface-variant">
                        {fmt(r.kpi_point_target)} pts
                        <span className="text-[10px] block text-on-surface-variant/60">{fmt(r.per_person_target)}/person</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="font-bold text-body-sm tabular-nums px-3 py-1 rounded-lg"
                          style={{ background: kpiColor(r.kpi_pct) + '20', color: kpiColor(r.kpi_pct) }}>
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
