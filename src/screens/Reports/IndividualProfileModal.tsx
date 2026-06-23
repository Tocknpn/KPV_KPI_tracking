import { useEffect, useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import type { RepDailyEntry, RepHistoryProfile, SupHistoryProfile } from '../../types'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmt(n: number, d = 1) { return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) }
function fmtPct(n: number) { return `${fmt(n, 1)}%` }
function fmtLak(n: number) { return n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(0)}K` : n.toLocaleString('en-US',{maximumFractionDigits:0}) }

function kpiColor(pct: number) {
  if (pct >= 80)  return 'text-green-600'
  if (pct >= 50)  return 'text-yellow-600'
  if (pct >= 30)  return 'text-orange-500'
  return 'text-red-500'
}

function trendIcon(current: number, prev: number) {
  if (current > prev + 2) return <span className="material-symbols-outlined text-green-600 text-base">trending_up</span>
  if (current < prev - 2) return <span className="material-symbols-outlined text-red-500 text-base">trending_down</span>
  return <span className="material-symbols-outlined text-on-surface-variant text-base">trending_flat</span>
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-xl border border-white/60 p-3 text-xs">
      <p className="font-bold text-on-surface mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex justify-between gap-4 mb-1">
          <span style={{ color: p.color }} className="font-medium">{p.name}</span>
          <span className="font-tabular-nums font-bold">
            {p.name === 'KPI %' ? `${fmt(p.value, 1)}%` : p.name === 'Qty' ? p.value : fmt(p.value, 1)}
          </span>
        </div>
      ))}
    </div>
  )
}

type Granularity = 'month' | 'week' | 'day'

// ── Rep profile modal ─────────────────────────────────────────────────────────
interface RepModalProps { id: number; token: string; onClose: () => void }

export function RepProfileModal({ id, token, onClose }: RepModalProps) {
  const [data, setData]             = useState<RepHistoryProfile | null>(null)
  const [loading, setLoading]       = useState(true)
  const [granularity, setGranularity] = useState<Granularity>('month')
  const [drillYM, setDrillYM]       = useState<string>('')
  const [drillEntries, setDrillEntries] = useState<RepDailyEntry[]>([])
  const [drillLoading, setDrillLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    window.api.getRepHistory(token, id, 6)
      .then(d => {
        const profile = d as RepHistoryProfile | null
        setData(profile)
        if (profile?.history.length) setDrillYM(profile.history[profile.history.length - 1].year_month)
      })
      .finally(() => setLoading(false))
  }, [id, token])

  useEffect(() => {
    if (granularity === 'month' || !drillYM || !token) { setDrillEntries([]); return }
    const year = parseInt(drillYM.slice(0, 4))
    const month = parseInt(drillYM.slice(4))
    setDrillLoading(true)
    window.api.getRepDailyEntries(token, id, year, month)
      .then(d => setDrillEntries(d as RepDailyEntry[]))
      .finally(() => setDrillLoading(false))
  }, [drillYM, granularity, id, token])

  const current = data?.history[data.history.length - 1]
  const prev    = data?.history[data.history.length - 2]

  const monthChartData = useMemo(() => (data?.history ?? []).map(h => ({
    label: `${MONTHS[h.month - 1]} ${String(h.year).slice(2)}`,
    weight: h.actual_jewelry + h.actual_bar, qty: h.actual_qty,
  })), [data])

  const drillChartData = useMemo(() => {
    if (granularity === 'week') {
      const weeks: Record<string, { label: string; weight: number; qty: number }> = {}
      for (const e of drillEntries) {
        const day = parseInt(e.entry_date.slice(8))
        const key = `W${Math.ceil(day / 7)}`
        if (!weeks[key]) weeks[key] = { label: key, weight: 0, qty: 0 }
        weeks[key].weight += e.jewelry_weight_g + e.bar_weight_g
        weeks[key].qty    += e.quantity
      }
      return Object.values(weeks)
    }
    return drillEntries.map(e => ({
      label:  e.entry_date.slice(5),
      weight: e.jewelry_weight_g + e.bar_weight_g,
      qty:    e.quantity,
    }))
  }, [granularity, drillEntries])

  const chartData  = granularity === 'month' ? monthChartData : drillChartData

  const drillMonthLabel = drillYM ? `${MONTHS[parseInt(drillYM.slice(4)) - 1]} ${drillYM.slice(0, 4)}` : ''

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-slide-in">
        {/* Header */}
        <div className="sticky top-0 bg-white/90 backdrop-blur-xl border-b border-white/60 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-primary flex items-center justify-center text-white font-bold text-lg uppercase flex-shrink-0">
              {data?.full_name.slice(0,1) ?? '?'}
            </div>
            <div>
              <h3 className="font-headline-md text-on-surface font-bold">
                {loading ? 'Loading...' : data?.full_name ?? 'Unknown'}
              </h3>
              {data && (
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <span className="font-mono text-[10px] text-on-surface-variant">{data.rep_code}</span>
                  <span className="text-on-surface-variant text-[10px]">·</span>
                  <span className="text-[10px] text-on-surface-variant">{data.branch_name}</span>
                  {data.supervisor_name && <><span className="text-on-surface-variant text-[10px]">·</span><span className="text-[10px] text-on-surface-variant">Team: {data.supervisor_name}</span></>}
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${data.staff_type === 'b2c' ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'}`}>
                    {data.staff_type?.toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-on-surface-variant hover:text-error hover:bg-error-container/20 rounded-lg transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="material-symbols-outlined animate-spin-slow text-3xl text-primary">sync</span>
          </div>
        ) : !data ? (
          <div className="p-10 text-center text-on-surface-variant">No data found for this rep.</div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'This Month KPI%', value: current ? fmtPct(current.kpi_pct) : '—', sub: current ? `${current.kpi_total_score.toLocaleString('en-US',{maximumFractionDigits:0})} pts` : '', color: current ? kpiColor(current.kpi_pct) : '', icon: 'target' },
                { label: 'vs Last Month', value: current && prev ? `${current.kpi_pct - prev.kpi_pct > 0 ? '+' : ''}${fmt(current.kpi_pct - prev.kpi_pct, 1)}%` : '—', sub: prev ? `Last: ${fmtPct(prev.kpi_pct)}` : 'First month', color: current && prev ? (current.kpi_pct >= prev.kpi_pct ? 'text-green-600' : 'text-red-500') : 'text-on-surface-variant', icon: current && prev && current.kpi_pct >= prev.kpi_pct ? 'trending_up' : 'trending_down' },
                { label: 'Active Days', value: current ? String(current.days_with_entries) : '—', sub: 'this month', color: 'text-on-surface', icon: 'calendar_today' },
                { label: 'Point Target', value: current?.point_target ? current.point_target.toLocaleString('en-US',{maximumFractionDigits:0}) : '—', sub: current?.year_month ? `${current.year_month.slice(0,4)}-${current.year_month.slice(4)}` : '', color: 'text-on-surface', icon: 'adjust' },
              ].map(c => (
                <div key={c.label} className="bg-surface-container/40 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="material-symbols-outlined text-sm text-on-surface-variant">{c.icon}</span>
                    <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">{c.label}</p>
                  </div>
                  <p className={`font-bold text-xl tabular-nums ${c.color}`}>{c.value}</p>
                  {c.sub && <p className="text-[10px] text-on-surface-variant mt-0.5">{c.sub}</p>}
                </div>
              ))}
            </div>

            {/* Trend chart with drill-down controls */}
            <div className="bg-surface-container/30 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                  {granularity === 'month' ? 'Weight & Qty Trend — Last 6 Months' : `${granularity === 'week' ? 'Weekly' : 'Daily'} Breakdown — ${drillMonthLabel}`}
                </p>
                <div className="flex items-center gap-2">
                  {/* Granularity toggle */}
                  <div className="flex bg-white/60 rounded-lg p-0.5 border border-outline-variant/20">
                    {(['month','week','day'] as Granularity[]).map(g => (
                      <button key={g} onClick={() => setGranularity(g)}
                        className={`px-3 py-1 rounded-md font-label-md text-[11px] capitalize transition-all ${granularity === g ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant hover:text-primary'}`}>
                        {g}
                      </button>
                    ))}
                  </div>
                  {/* Month selector for week/day drill */}
                  {granularity !== 'month' && (
                    <select value={drillYM} onChange={e => setDrillYM(e.target.value)}
                      className="bg-white/70 border border-outline-variant/20 rounded-lg px-2 py-1 text-[11px] outline-none font-mono">
                      {data.history.filter(h => h.days_with_entries > 0).map(h => (
                        <option key={h.year_month} value={h.year_month}>
                          {MONTHS[h.month - 1]} {h.year}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              {(drillLoading) ? (
                <div className="flex items-center justify-center h-[220px]">
                  <span className="material-symbols-outlined animate-spin-slow text-2xl text-primary">sync</span>
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex items-center justify-center h-[220px] text-on-surface-variant text-body-sm">
                  No entries for {drillMonthLabel}.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#666' }} interval={granularity === 'day' ? 'preserveStartEnd' : 0} />
                    <YAxis yAxisId="vol" tick={{ fontSize: 10, fill: '#666' }} width={52} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                    <YAxis yAxisId="qty" orientation="right" tick={{ fontSize: 10, fill: '#666' }} width={40} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="vol" dataKey="weight" name="Total Weight (g)" fill="#990000" fillOpacity={0.75} radius={[3,3,0,0]} />
                    <Line yAxisId="qty" type="monotone" dataKey="qty" name="Qty" stroke="#9c6e1b" strokeWidth={2.5} dot={{ r: 3.5, fill: '#9c6e1b' }} strokeDasharray="4 2" />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Monthly history table */}
            <div className="overflow-x-auto rounded-xl border border-outline-variant/20">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-surface-container/60">
                  <tr>
                    {['Month','Jewelry (g)','Bar (g)','Qty','KPI Score','KPI %','Target','Days','Commission (₭)'].map(h => (
                      <th key={h} className="px-4 py-3 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {data.history.map((h, i) => {
                    const isLatest = i === data.history.length - 1
                    const prevH    = data.history[i - 1]
                    return (
                      <tr key={h.year_month} className={`${isLatest ? 'bg-primary/5 font-bold' : 'hover:bg-surface-container/30'} transition-colors`}>
                        <td className="px-4 py-2.5 font-bold whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {MONTHS[h.month - 1]} {h.year}
                            {prevH && trendIcon(h.kpi_pct, prevH.kpi_pct)}
                            {isLatest && <span className="text-[9px] bg-primary text-white px-1.5 py-0.5 rounded-full uppercase font-bold">Current</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 tabular-nums">{fmt(h.actual_jewelry, 1)}</td>
                        <td className="px-4 py-2.5 tabular-nums">{fmt(h.actual_bar, 1)}</td>
                        <td className="px-4 py-2.5 tabular-nums">{h.actual_qty}</td>
                        <td className="px-4 py-2.5 tabular-nums">{h.kpi_total_score.toLocaleString('en-US',{maximumFractionDigits:0})} pts</td>
                        <td className="px-4 py-2.5">
                          <span className={`font-bold tabular-nums ${kpiColor(h.kpi_pct)}`}>{fmtPct(h.kpi_pct)}</span>
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-on-surface-variant">{h.point_target ? h.point_target.toLocaleString('en-US',{maximumFractionDigits:0}) : '—'}</td>
                        <td className="px-4 py-2.5 tabular-nums text-on-surface-variant">{h.days_with_entries}</td>
                        <td className="px-4 py-2.5 tabular-nums text-tertiary font-bold">
                          {h.commission_lak > 0 ? fmtLak(h.commission_lak) : <span className="text-on-surface-variant font-normal">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Supervisor profile modal ──────────────────────────────────────────────────
interface SupModalProps { id: number; token: string; onClose: () => void }

export function SupProfileModal({ id, token, onClose }: SupModalProps) {
  const [data, setData]       = useState<SupHistoryProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [granularity, setGranularity] = useState<Granularity>('month')

  useEffect(() => {
    setLoading(true)
    window.api.getSupHistory(token, id, 6)
      .then(d => setData(d as SupHistoryProfile | null))
      .finally(() => setLoading(false))
  }, [id, token])

  const current = data?.history[data.history.length - 1]
  const prev    = data?.history[data.history.length - 2]
  const allMonths = (data?.history ?? []).map(h => ({
    label: `${MONTHS[h.month - 1]} ${String(h.year).slice(2)}`,
    weight: h.actual_jewelry + h.actual_bar, qty: h.actual_qty,
  }))

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-slide-in">
        <div className="sticky top-0 bg-white/90 backdrop-blur-xl border-b border-white/60 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center text-white font-bold text-lg uppercase flex-shrink-0">
              {data?.full_name.slice(0,1) ?? '?'}
            </div>
            <div>
              <h3 className="font-headline-md text-on-surface font-bold">
                {loading ? 'Loading...' : data?.full_name ?? 'Unknown'}
              </h3>
              {data && (
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <span className="text-[10px] text-on-surface-variant">{data.branch_name}</span>
                  <span className="text-on-surface-variant text-[10px]">·</span>
                  <span className="text-[10px] text-on-surface-variant">{data.rep_count} reps</span>
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${data.staff_type === 'b2c' ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'}`}>
                    {data.staff_type?.toUpperCase()}
                  </span>
                  <span className="text-[9px] bg-secondary/10 text-secondary px-1.5 py-0.5 rounded-full font-bold uppercase">Supervisor</span>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-on-surface-variant hover:text-error hover:bg-error-container/20 rounded-lg transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="material-symbols-outlined animate-spin-slow text-3xl text-secondary">sync</span>
          </div>
        ) : !data ? (
          <div className="p-10 text-center text-on-surface-variant">No data found for this supervisor.</div>
        ) : (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Team KPI % (This Month)', value: current ? fmtPct(current.team_kpi_pct) : '—', sub: current ? `${current.team_total_score.toLocaleString('en-US',{maximumFractionDigits:0})} pts` : '', color: current ? kpiColor(current.team_kpi_pct) : '', icon: 'groups' },
                { label: 'vs Last Month', value: current && prev ? `${current.team_kpi_pct - prev.team_kpi_pct > 0 ? '+' : ''}${fmt(current.team_kpi_pct - prev.team_kpi_pct, 1)}%` : '—', sub: prev ? `Last: ${fmtPct(prev.team_kpi_pct)}` : 'First month', color: current && prev ? (current.team_kpi_pct >= prev.team_kpi_pct ? 'text-green-600' : 'text-red-500') : 'text-on-surface-variant', icon: current && prev && current.team_kpi_pct >= prev.team_kpi_pct ? 'trending_up' : 'trending_down' },
                { label: 'Team Size', value: String(data.rep_count), sub: 'active reps', color: 'text-on-surface', icon: 'badge' },
                { label: 'Team Target', value: current?.team_point_target ? current.team_point_target.toLocaleString('en-US',{maximumFractionDigits:0}) : '—', sub: 'combined pts', color: 'text-on-surface', icon: 'adjust' },
              ].map(c => (
                <div key={c.label} className="bg-surface-container/40 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="material-symbols-outlined text-sm text-on-surface-variant">{c.icon}</span>
                    <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">{c.label}</p>
                  </div>
                  <p className={`font-bold text-xl tabular-nums ${c.color}`}>{c.value}</p>
                  {c.sub && <p className="text-[10px] text-on-surface-variant mt-0.5">{c.sub}</p>}
                </div>
              ))}
            </div>

            <div className="bg-surface-container/30 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Team Weight & Qty Trend — Last 6 Months</p>
                <div className="flex bg-white/60 rounded-lg p-0.5 border border-outline-variant/20">
                  {(['month'] as Granularity[]).map(g => (
                    <button key={g} onClick={() => setGranularity(g)}
                      className={`px-3 py-1 rounded-md font-label-md text-[11px] capitalize transition-all ${granularity === g ? 'bg-secondary text-white shadow-sm' : 'text-on-surface-variant hover:text-secondary'}`}>
                      Month
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={allMonths} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#666' }} />
                  <YAxis yAxisId="vol" tick={{ fontSize: 10, fill: '#666' }} width={56} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                  <YAxis yAxisId="qty" orientation="right" tick={{ fontSize: 10, fill: '#666' }} width={50} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="vol" dataKey="weight" name="Total Weight (g)" fill="#990000" fillOpacity={0.75} radius={[3,3,0,0]} />
                  <Line yAxisId="qty" type="monotone" dataKey="qty" name="Qty" stroke="#9c6e1b" strokeWidth={2.5} dot={{ r: 3.5, fill: '#9c6e1b' }} strokeDasharray="4 2" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto rounded-xl border border-outline-variant/20">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-surface-container/60">
                  <tr>
                    {['Month','Team Jewelry (g)','Team Bar (g)','Team Qty','Team Score','Team KPI %','Team Target'].map(h => (
                      <th key={h} className="px-4 py-3 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {data.history.map((h, i) => {
                    const isLatest = i === data.history.length - 1
                    const prevH    = data.history[i - 1]
                    return (
                      <tr key={h.year_month} className={`${isLatest ? 'bg-secondary/5 font-bold' : 'hover:bg-surface-container/30'} transition-colors`}>
                        <td className="px-4 py-2.5 font-bold whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {MONTHS[h.month - 1]} {h.year}
                            {prevH && trendIcon(h.team_kpi_pct, prevH.team_kpi_pct)}
                            {isLatest && <span className="text-[9px] bg-secondary text-white px-1.5 py-0.5 rounded-full uppercase font-bold">Current</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 tabular-nums">{fmt(h.actual_jewelry, 1)}</td>
                        <td className="px-4 py-2.5 tabular-nums">{fmt(h.actual_bar, 1)}</td>
                        <td className="px-4 py-2.5 tabular-nums">{h.actual_qty}</td>
                        <td className="px-4 py-2.5 tabular-nums">{h.team_total_score.toLocaleString('en-US',{maximumFractionDigits:0})} pts</td>
                        <td className="px-4 py-2.5">
                          <span className={`font-bold tabular-nums ${kpiColor(h.team_kpi_pct)}`}>{fmtPct(h.team_kpi_pct)}</span>
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-on-surface-variant">{h.team_point_target ? h.team_point_target.toLocaleString('en-US',{maximumFractionDigits:0}) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
