import { useEffect, useState, useRef } from 'react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Cell, Legend,
} from 'recharts'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { MonthDropdown, DateRangeBar } from '../../components/ui/PeriodFilter'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import { getDefaultDateRange } from '../../utils/dates'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Data types ────────────────────────────────────────────────────────────
interface SalesPeriod {
  jewelry: number; bar: number; total: number
  qty: number; entries: number; reps: number
}
interface BranchRow {
  branch_id: number; branch_name: string; branch_code: string
  jewelry: number; bar: number; total: number; qty: number; entries: number; reps: number
  weight_contrib: number; qty_contrib: number
  var_total_pct: number | null; var_qty_pct: number | null
}
interface TypeRow {
  staff_type: string
  jewelry: number; bar: number; total: number; qty: number; entries: number; reps: number
  weight_contrib: number; qty_contrib: number
  var_total_pct: number | null; var_qty_pct: number | null
}
interface WeekRow { label: string; week_key: string; week_start: string; jewelry: number; bar: number; total: number; qty: number; entries: number }
interface DayRow  { date: string; jewelry: number; bar: number; total: number; qty: number; entries: number }
interface CalWeekRow { week_start: string; week_end: string; label: string; week_num: number; isCurrent: boolean; jewelry: number; bar: number; total: number; qty: number }
interface WowMetric { cur: number; prev: number; diff: number; pct: number | null }
interface BranchWeekRow { label: string; week_start: string; isCurrent: boolean; [branchCode: string]: number | string | boolean }
interface BranchWowRow { branch_id: number; branch_name: string; branch_code: string; cur: number; prev: number; diff: number; pct: number | null }
interface WeeklyDetailRow { week_start: string; label: string; days: number; total: number; qty: number; avg_per_day: number; partial: boolean; wow_pct: number | null; is_base: boolean }
interface MonthlyDetailRow { year_month: string; label: string; days: number; total: number; qty: number; avg_per_day: number; partial: boolean; mom_pct: number | null; is_base: boolean }
interface TrendDetailData { weeklyDetail: WeeklyDetailRow[]; monthlyDetail: MonthlyDetailRow[] }
interface ReportData {
  current: SalesPeriod; prevPeriod: SalesPeriod
  sameLastMonth: SalesPeriod; fullLastMonth: SalesPeriod; estMonthEnd: SalesPeriod
  byBranch: BranchRow[]; byType: TypeRow[]
  weeklyTrend: WeekRow[]; dailyTrend: DayRow[]
  weeklyTrendCal: CalWeekRow[]
  companyWow: { jewelry: WowMetric; bar: WowMetric; total: WowMetric }
  weeklyByBranch: BranchWeekRow[]
  branchWow: BranchWowRow[]
  meta: { daysInMonth: number; dayOfMonth: number; daysRemaining: number }
}

const BRANCH_COLORS = ['#004f96', '#9c6e1b', '#6750a4', '#17575c']

type SaleTab = 'overview' | 'branch' | 'type' | 'trends'

// ── Utils ─────────────────────────────────────────────────────────────────
function fmt(n: number, d = 1) { return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) }
function addDaysLocal(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function fmtInt(n: number)     { return n.toLocaleString('en-US', { maximumFractionDigits: 0 }) }
function fmtPct(n: number)     { return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%` }

function VarChip({ pct, compact = false }: { pct: number | null; compact?: boolean }) {
  if (pct == null) return <span className="text-[10px] text-on-surface-variant/50">—</span>
  const up = pct >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 font-bold ${compact ? 'text-[11px]' : 'text-sm'} ${up ? 'text-green-600' : 'text-red-500'}`}>
      <span className="material-symbols-outlined" style={{ fontSize: compact ? 12 : 14 }}>{up ? 'arrow_upward' : 'arrow_downward'}</span>
      {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

// ── Weekday heatmap — % contribution to period total, by day of week ──────
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function WeekdayHeatmap({ rows }: { rows: DayRow[] }) {
  const byWeekday = WEEKDAY_LABELS.map(() => 0)
  for (const r of rows) {
    const dow = new Date(r.date + 'T00:00:00').getDay()
    byWeekday[dow] += r.total
  }
  const grandTotal = byWeekday.reduce((s, v) => s + v, 0)
  const contrib = byWeekday.map(v => grandTotal > 0 ? (v / grandTotal) * 100 : 0)
  const maxContrib = Math.max(...contrib, 0.0001)
  const busiestIdx = contrib.indexOf(Math.max(...contrib))

  function cellColor(pct: number): string {
    const intensity = pct / maxContrib // 0..1, relative to the busiest day
    const alpha = 0.08 + intensity * 0.82
    return `rgba(0, 79, 150, ${alpha.toFixed(2)})`
  }

  return (
    <GlassCard elevated className="p-6">
      <h4 className="font-headline-md text-headline-md text-on-surface mb-1">Volume by Day of Week</h4>
      <p className="text-body-sm text-on-surface-variant mb-4">
        % contribution to period total (jewelry + bar weight) · busiest: <strong>{WEEKDAY_LABELS[busiestIdx]}</strong>
      </p>
      <div className="grid grid-cols-7 gap-2">
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={label} className="rounded-xl overflow-hidden border border-outline-variant/10">
            <div
              className="flex flex-col items-center justify-center py-6 transition-all"
              style={{ backgroundColor: cellColor(contrib[i]) }}
              title={`${label}: ${fmt(contrib[i], 1)}% (${fmt(byWeekday[i], 1)} Baht)`}
            >
              <span className={`font-bold text-lg tabular-nums ${contrib[i] / maxContrib > 0.55 ? 'text-white' : 'text-on-surface'}`}>
                {fmt(contrib[i], 1)}%
              </span>
            </div>
            <div className="text-center py-1.5 bg-surface-container-low/40">
              <span className="text-[11px] font-bold uppercase text-on-surface-variant">{label}</span>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

// ── Weekly & Monthly Detail — WoW/MoM % change, partial-period aware ──────
function WeeklyMonthlyDetail({ data, loading, trendTo }: { data: TrendDetailData | null; loading: boolean; trendTo: string }) {
  if (loading) {
    return <div className="flex items-center justify-center h-32 text-on-surface-variant text-body-sm">
      <span className="material-symbols-outlined animate-spin-slow mr-2">sync</span>Loading…
    </div>
  }
  if (!data || (data.weeklyDetail.length === 0 && data.monthlyDetail.length === 0)) {
    return <div className="flex items-center justify-center h-32 text-on-surface-variant text-body-sm">No entry data for this range.</div>
  }

  const lastMonthly = data.monthlyDetail[data.monthlyDetail.length - 1]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Weekly */}
      <div>
        <p className="font-bold text-body-md text-on-surface mb-0.5">Weekly Detail — WoW % Change</p>
        <p className="text-[11px] text-on-surface-variant mb-3">First and last weeks are partial (fewer than 6 trading days)</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/20">
                {['Week Of','Days','Total','Avg/Day','WoW'].map(h => (
                  <th key={h} className="py-2 px-2 text-[10px] font-bold uppercase text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {data.weeklyDetail.map(w => (
                <tr key={w.week_start}>
                  <td className="py-2 px-2 text-body-sm tabular-nums">{w.week_start}{w.partial && <span className="text-[10px] text-on-surface-variant ml-1.5">(partial)</span>}</td>
                  <td className="py-2 px-2 text-body-sm tabular-nums">{w.days}</td>
                  <td className="py-2 px-2 text-body-sm font-bold tabular-nums">{fmt(w.total)}</td>
                  <td className="py-2 px-2 text-body-sm tabular-nums text-on-surface-variant">{fmt(w.avg_per_day)}</td>
                  <td className="py-2 px-2 text-right">
                    {w.is_base
                      ? <span className="text-[10px] font-bold uppercase text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">base</span>
                      : <VarChip pct={w.wow_pct} compact />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly */}
      <div>
        <p className="font-bold text-body-md text-on-surface mb-0.5">Monthly Detail — MoM % Change</p>
        <p className="text-[11px] text-on-surface-variant mb-3">
          {lastMonthly?.partial ? `${MONTHS[parseInt(lastMonthly.year_month.slice(5,7),10)-1]} reflects data through ${trendTo} only` : ' '}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/20">
                {['Month','Days','Total','Avg/Day','MoM'].map(h => (
                  <th key={h} className="py-2 px-2 text-[10px] font-bold uppercase text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {data.monthlyDetail.map(m => (
                <tr key={m.year_month}>
                  <td className="py-2 px-2 text-body-sm tabular-nums">{m.year_month}{m.partial && <span className="text-[10px] text-on-surface-variant ml-1.5">(partial)</span>}</td>
                  <td className="py-2 px-2 text-body-sm tabular-nums">{m.days}</td>
                  <td className="py-2 px-2 text-body-sm font-bold tabular-nums">{fmt(m.total)}</td>
                  <td className="py-2 px-2 text-body-sm tabular-nums text-on-surface-variant">{fmt(m.avg_per_day)}</td>
                  <td className="py-2 px-2 text-right">
                    {m.is_base
                      ? <span className="text-[10px] font-bold uppercase text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">base</span>
                      : <VarChip pct={m.mom_pct} compact />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {lastMonthly?.partial && (
          <div className="mt-3 bg-secondary-container/20 border border-secondary/20 rounded-xl px-3 py-2.5 text-[11px] text-on-surface-variant">
            {lastMonthly.label}'s total looks lower simply because the month is only {lastMonthly.days} trading days in — its avg/day
            ({fmt(lastMonthly.avg_per_day)}) is the fairer comparison to the prior month's avg/day.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Branch multi-select ───────────────────────────────────────────────────
function BranchDropdown({ branches, selectedIds, onChange }: {
  branches: Array<{ id: number; name: string; code: string }>
  selectedIds: number[]; onChange: (ids: number[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onOut(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])
  const isAll = selectedIds.length === 0
  const label = isAll ? 'All Branches'
    : selectedIds.length === 1 ? (branches.find(b => b.id === selectedIds[0])?.name ?? '1 Branch')
    : `${selectedIds.length} Branches`
  function toggle(id: number) {
    if (isAll) { onChange([id]); return }
    const next = selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]
    onChange(next.length === branches.length ? [] : next)
  }
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container text-on-surface text-body-sm hover:bg-surface-container-high transition-colors border border-white/20">
        <span className="material-symbols-outlined text-sm text-primary">corporate_fare</span>
        {label}
        <span className="material-symbols-outlined text-sm">{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 bg-white/95 backdrop-blur-xl shadow-xl rounded-xl border border-white/40 z-50 min-w-52 py-1">
          <label className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-primary/5 cursor-pointer">
            <input type="checkbox" checked={isAll} onChange={() => onChange([])} className="accent-primary" />
            <span className="text-body-sm">All Branches</span>
          </label>
          <div className="border-t border-black/5 my-1" />
          {branches.map(b => (
            <label key={b.id} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-primary/5 cursor-pointer">
              <input type="checkbox" checked={!isAll && selectedIds.includes(b.id)} onChange={() => toggle(b.id)} className="accent-primary" />
              <span className="text-body-sm">{b.name}</span>
              <span className="ml-auto text-[10px] text-on-surface-variant font-mono">{b.code}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Mini sparkline ─────────────────────────────────────────────────────────
function Sparkline({ data, dataKey, color }: { data: WeekRow[]; dataKey: 'jewelry' | 'bar' | 'total' | 'qty'; color: string }) {
  const values = data.map(d => d[dataKey] as number)
  const max = Math.max(...values, 1)
  return (
    <div className="flex items-end gap-0.5 h-10 w-full mt-2">
      {data.map((d, i) => {
        const h = Math.max(((d[dataKey] as number) / max) * 100, 4)
        const isLast = i === data.length - 1
        return (
          <div key={i} className="flex-1 flex flex-col justify-end group relative">
            <div
              className="w-full rounded-sm transition-all"
              style={{ height: `${h}%`, background: isLast ? color : `${color}55` }}
            />
          </div>
        )
      })}
    </div>
  )
}

// ── MTD metric card (pic 2 style) ─────────────────────────────────────────
function MetricCard({
  icon, label, color,
  current, prevMTD, estEnd, fullLM,
  unit = 'Baht', sparkData, sparkKey,
  month, year,
}: {
  icon: string; label: string; color: string
  current: number; prevMTD: number; estEnd: number; fullLM: number
  unit?: string; sparkData: WeekRow[]; sparkKey: 'jewelry' | 'bar' | 'total' | 'qty'
  month: number; year: number
}) {
  const lmYear  = month === 1 ? year - 1 : year
  const lmMonth = month === 1 ? 12 : month - 1
  const lmLabel = `${MONTHS[lmMonth - 1]} '${String(lmYear).slice(2)}`
  const mtdVar  = prevMTD > 0 ? ((current - prevMTD) / prevMTD) * 100 : null
  const eomVar  = fullLM  > 0 ? ((estEnd  - fullLM ) / fullLM ) * 100 : null
  const isQty   = unit === 'pcs'

  return (
    <GlassCard elevated className="p-5 flex flex-col gap-0">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
          <span className="material-symbols-outlined text-lg" style={{ color }}>{icon}</span>
        </div>
        <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wide font-bold">{label}</span>
      </div>

      {/* MTD row */}
      <div className="mb-3 pb-3 border-b border-white/30">
        <p className="text-[10px] text-on-surface-variant uppercase mb-1 font-semibold tracking-wider" style={{ color }}>MTD</p>
        <div className="flex items-baseline gap-2">
          <span className="font-display-xl text-[26px] font-bold text-on-surface tabular-nums">
            {isQty ? fmtInt(current) : fmt(current, 1)}
          </span>
          <span className="text-[11px] text-on-surface-variant">{unit}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <VarChip pct={mtdVar} />
          <span className="text-[10px] text-on-surface-variant">vs {lmLabel} ({isQty ? fmtInt(prevMTD) : fmt(prevMTD, 1)})</span>
        </div>
      </div>

      {/* Est. Month End row */}
      <div>
        <p className="text-[10px] text-on-surface-variant uppercase mb-1 font-semibold tracking-wider text-orange-500">Est. End</p>
        <div className="flex items-baseline gap-2">
          <span className="font-display-xl text-[22px] font-bold tabular-nums" style={{ color: '#d97706' }}>
            {isQty ? fmtInt(estEnd) : fmt(estEnd, 1)}
          </span>
          <span className="text-[11px] text-on-surface-variant">{unit}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <VarChip pct={eomVar} />
          <span className="text-[10px] text-on-surface-variant">vs Full {lmLabel} ({isQty ? fmtInt(fullLM) : fmt(fullLM, 1)})</span>
        </div>
      </div>

      {/* Sparkline */}
      {sparkData.length > 1 && (
        <Sparkline data={sparkData} dataKey={sparkKey} color={color} />
      )}
    </GlassCard>
  )
}

// ── Compact week-over-week card (MTD-card style, single number + var chip) ─
function WowMiniCard({
  icon, label, color, weekNum, prevWeekNum,
  cur, prev, pct, diff, chartData, dataKey,
}: {
  icon: string; label: string; color: string
  weekNum: number; prevWeekNum: number
  cur: number; prev: number; pct: number | null; diff: number
  chartData: Array<Record<string, unknown>>; dataKey: string
}) {
  return (
    <GlassCard elevated className="p-5 flex flex-col gap-0">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}20` }}>
          <span className="material-symbols-outlined text-lg" style={{ color }}>{icon}</span>
        </div>
        <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wide font-bold truncate">{label}</span>
      </div>

      <p className="text-[10px] text-on-surface-variant uppercase mb-1 font-semibold tracking-wider" style={{ color }}>Week {weekNum}</p>
      <div className="flex items-baseline gap-2">
        <span className="font-display-xl text-[26px] font-bold text-on-surface tabular-nums">{fmt(cur, 1)}</span>
        <span className="text-[11px] text-on-surface-variant">Baht</span>
      </div>
      <div className="flex items-center gap-2 mt-1 mb-3">
        <VarChip pct={pct} />
        <span className="text-[10px] text-on-surface-variant">vs Week {prevWeekNum} ({fmt(prev, 1)})</span>
      </div>

      {chartData.length > 1 && (
        <div className="h-24">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="label" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 8 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number) => [fmt(v, 1) + ' Baht', label]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Bar dataKey={dataKey} radius={[2,2,0,0]} maxBarSize={20}>
                {chartData.map((wk, i) => <Cell key={i} fill={wk.isCurrent ? color : `${color}66`} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────
export default function SaleReport() {
  const { token, user, branches } = useAuthStore()
  const { selectedBranchIds, setSelectedBranchIds } = useAppStore()

  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const initRange = getDefaultDateRange(now.getFullYear(), now.getMonth() + 1)
  const [dateFrom, setDateFrom] = useState(initRange.dateFrom)
  const [dateTo, setDateTo]     = useState(initRange.dateTo)
  const maxDate = getDefaultDateRange(year, month).dateTo

  function handleMonthChange(y: number, m: number) {
    setYear(y); setMonth(m)
    const { dateFrom: df, dateTo: dt } = getDefaultDateRange(y, m)
    setDateFrom(df); setDateTo(dt)
  }

  // B2C/B2B filter
  const [staffType, setStaffType] = useState<string>('')  // '' = all

  const [activeTab, setActiveTab] = useState<SaleTab>('overview')
  const [data, setData]   = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  // Weekly/Monthly Detail — its own free date range, NOT locked to the Month picker above,
  // so it can cross month/year boundaries (the rest of this screen's "vs same period last
  // month" math needs a single anchor month; this widget doesn't, so it gets its own range).
  const [trendFrom, setTrendFrom] = useState(() => addDaysLocal(initRange.dateTo, -60))
  const [trendTo, setTrendTo]     = useState(initRange.dateTo)
  const [trendData, setTrendData] = useState<TrendDetailData | null>(null)
  const [trendLoading, setTrendLoading] = useState(false)

  const isBranchScoped = user?.role === 'sales_sup' || user?.role === 'branch_manager' || user?.role === 'accountant_officer'
  const effectiveBranchIds: number[] = isBranchScoped ? [user.branchId ?? 1] : selectedBranchIds

  const scopeLabel = isBranchScoped
    ? branches.find(b => b.id === user?.branchId)?.name ?? 'My Branch'
    : effectiveBranchIds.length === 0 ? 'All Branches'
    : effectiveBranchIds.length === 1 ? (branches.find(b => b.id === effectiveBranchIds[0])?.name ?? '1 Branch')
    : `${effectiveBranchIds.length} Branches`

  useEffect(() => {
    if (!token) return
    setLoading(true)
    window.api.getSalesReport(token, effectiveBranchIds, year, month, dateFrom, dateTo, staffType || undefined)
      .then(d => setData(d as ReportData))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [token, JSON.stringify(effectiveBranchIds), year, month, dateFrom, dateTo, staffType])

  useEffect(() => {
    if (!token || activeTab !== 'trends') return
    setTrendLoading(true)
    window.api.getSalesTrendDetail(token, effectiveBranchIds, trendFrom, trendTo, staffType || undefined)
      .then(setTrendData)
      .catch(console.error)
      .finally(() => setTrendLoading(false))
  }, [token, JSON.stringify(effectiveBranchIds), trendFrom, trendTo, staffType, activeTab])

  const d = data

  // Status bar computations
  const mtdVsPrevSamePct = d && d.sameLastMonth.total > 0
    ? ((d.current.total - d.sameLastMonth.total) / d.sameLastMonth.total) * 100 : null
  const eomVsFullLmPct   = d && d.fullLastMonth.total > 0
    ? ((d.estMonthEnd.total - d.fullLastMonth.total) / d.fullLastMonth.total) * 100 : null

  const lmLabel = (() => {
    const lmY = month === 1 ? year - 1 : year
    const lmM = month === 1 ? 12 : month - 1
    return `${MONTHS[lmM - 1]} '${String(lmY).slice(2)}`
  })()

  const TABS = [
    { key: 'overview' as const, label: 'Overview',         icon: 'dashboard' },
    { key: 'branch'   as const, label: 'By Branch',        icon: 'corporate_fare' },
    { key: 'type'     as const, label: 'By Customer Type', icon: 'group' },
    { key: 'trends'   as const, label: 'Trends',           icon: 'trending_up' },
  ]

  return (
    <AppShell title="SalesTrack Pro">
      {/* ── Page Header ────────────────────────────────────────────────── */}
      <div className="mb-5">
        <h2 className="font-headline-lg text-headline-lg text-on-surface">Sale Report</h2>
        <p className="text-on-surface-variant text-body-md mt-0.5">{scopeLabel} — {MONTHS[month - 1]} {year}</p>
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-5 p-4 rounded-2xl bg-surface-container/40 border border-white/20 backdrop-blur-sm">
        <MonthDropdown year={year} month={month} onChange={handleMonthChange} />
        <DateRangeBar year={year} month={month} dateFrom={dateFrom} dateTo={dateTo} maxDate={maxDate}
          onDateFromChange={setDateFrom} onDateToChange={setDateTo} />
        {!isBranchScoped && (
          <BranchDropdown branches={branches} selectedIds={selectedBranchIds} onChange={setSelectedBranchIds} />
        )}
        {/* Customer type chips */}
        <div className="flex gap-2 ml-auto">
          {[{ v: '', l: 'All' }, { v: 'b2c', l: 'B2C' }, { v: 'b2b', l: 'B2B' }].map(({ v, l }) => (
            <button key={v} onClick={() => setStaffType(v)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors
                ${staffType === v
                  ? v === 'b2b' ? 'bg-secondary text-white' : v === 'b2c' ? 'bg-primary text-white' : 'bg-on-surface text-surface'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── Status Banner ──────────────────────────────────────────────── */}
      {!loading && d && (
        <div className="flex flex-wrap items-center gap-4 mb-5 px-5 py-3 rounded-xl bg-primary/5 border border-primary/15">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">MTD Status:</span>
            <VarChip pct={mtdVsPrevSamePct} />
            <span className="text-[11px] text-on-surface-variant">vs {lmLabel} same period</span>
          </div>
          <div className="w-px h-4 bg-outline-variant/30" />
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-orange-500">Est. Month End:</span>
            <VarChip pct={eomVsFullLmPct} />
            <span className="text-[11px] text-on-surface-variant">vs Full {lmLabel}</span>
          </div>
          <div className="ml-auto text-[11px] text-on-surface-variant font-mono">{dateFrom} → {dateTo} · Day {d.meta.dayOfMonth} of {d.meta.daysInMonth}</div>
        </div>
      )}

      {/* ── Tab Bar ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 mb-6">
        <div className="flex rounded-xl bg-surface-container overflow-hidden border border-white/20">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 font-label-md text-label-md transition-colors whitespace-nowrap
                ${activeTab === t.key ? 'bg-primary text-white' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
              <span className="material-symbols-outlined text-sm">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin-slow text-4xl">sync</span>
        </div>
      ) : !d ? null : (
        <>
          {/* ═════════════════════════════════════════════════════════════
              TAB: Overview
          ═════════════════════════════════════════════════════════════ */}
          {activeTab === 'overview' && (<>
            {/* 4 MTD metric cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-card-gap mb-8">
              <MetricCard
                icon="diamond" label="Jewelry Weight" color="#004f96"
                current={d.current.jewelry} prevMTD={d.sameLastMonth.jewelry}
                estEnd={d.estMonthEnd.jewelry} fullLM={d.fullLastMonth.jewelry}
                sparkData={d.weeklyTrend} sparkKey="jewelry"
                month={month} year={year}
              />
              <MetricCard
                icon="payments" label="Bar Weight" color="#9c6e1b"
                current={d.current.bar} prevMTD={d.sameLastMonth.bar}
                estEnd={d.estMonthEnd.bar} fullLM={d.fullLastMonth.bar}
                sparkData={d.weeklyTrend} sparkKey="bar"
                month={month} year={year}
              />
              <MetricCard
                icon="scale" label="Total Weight" color="#17575c"
                current={d.current.total} prevMTD={d.sameLastMonth.total}
                estEnd={d.estMonthEnd.total} fullLM={d.fullLastMonth.total}
                sparkData={d.weeklyTrend} sparkKey="total"
                month={month} year={year}
              />
              <MetricCard
                icon="inventory_2" label="Quantity" color="#6750a4" unit="pcs"
                current={d.current.qty} prevMTD={d.sameLastMonth.qty}
                estEnd={d.estMonthEnd.qty} fullLM={d.fullLastMonth.qty}
                sparkData={d.weeklyTrend} sparkKey="qty"
                month={month} year={year}
              />
            </div>

            {/* Period comparison summary bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-card-gap mb-8">
              {[
                { label: 'Active Reps',    value: fmtInt(d.current.reps),    icon: 'people',        color: 'border-primary' },
                { label: 'Days Remaining', value: String(d.meta.daysRemaining), icon: 'calendar_today', color: 'border-secondary' },
                { label: 'Vs Prev Period', value: d.prevPeriod.total > 0 ? fmtPct((d.current.total - d.prevPeriod.total) / d.prevPeriod.total * 100) : '—', icon: 'compare_arrows', color: 'border-tertiary', isVar: true, varPct: d.prevPeriod.total > 0 ? (d.current.total - d.prevPeriod.total) / d.prevPeriod.total * 100 : null },
                { label: 'Est. Month End', value: `${fmt(d.estMonthEnd.total, 1)} Baht`, icon: 'event_available', color: 'border-outline-variant' },
              ].map(k => (
                <GlassCard key={k.label} className={`p-5 border-l-4 ${k.color}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-sm text-on-surface-variant">{k.icon}</span>
                    <p className="font-label-md text-label-md text-on-surface-variant uppercase">{k.label}</p>
                  </div>
                  {'isVar' in k && k.isVar
                    ? <div className="mt-1"><VarChip pct={'varPct' in k ? k.varPct as number | null : null} /></div>
                    : <h3 className="font-display-xl text-display-xl text-on-surface tabular-nums mt-1 text-[22px]">{k.value}</h3>
                  }
                </GlassCard>
              ))}
            </div>

            {/* Week-over-Week (Sun–Sat calendar weeks) */}
            {d.weeklyTrendCal.length >= 2 && (<>
              <div className="mb-3">
                <h4 className="font-headline-md text-headline-md text-on-surface">Week-over-Week</h4>
                <p className="text-body-sm text-on-surface-variant">
                  This week ({d.weeklyTrendCal[d.weeklyTrendCal.length - 1].label}) vs last week ({d.weeklyTrendCal[d.weeklyTrendCal.length - 2].label}) · Sun–Sat calendar weeks
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-card-gap mb-8">
                {([
                  { key: 'jewelry' as const, label: 'Jewelry Weight', color: '#004f96', icon: 'diamond' },
                  { key: 'bar'     as const, label: 'Bar Weight',     color: '#9c6e1b', icon: 'payments' },
                  { key: 'total'   as const, label: 'Total Weight',   color: '#17575c', icon: 'scale' },
                ]).map(({ key, label, color, icon }) => {
                  const w = d.companyWow[key]
                  const curWk  = d.weeklyTrendCal[d.weeklyTrendCal.length - 1]
                  const prevWk = d.weeklyTrendCal[d.weeklyTrendCal.length - 2]
                  return (
                    <WowMiniCard key={key} icon={icon} label={label} color={color}
                      weekNum={curWk.week_num} prevWeekNum={prevWk.week_num}
                      cur={w.cur} prev={w.prev} pct={w.pct} diff={w.diff}
                      chartData={d.weeklyTrendCal} dataKey={key} />
                  )
                })}
              </div>

              {/* Branch WoW — one card per branch, same compact style */}
              {d.branchWow.length > 0 && (<>
                <div className="mb-3">
                  <h4 className="font-headline-md text-headline-md text-on-surface">Branch Total Weight — Week-over-Week</h4>
                  <p className="text-body-sm text-on-surface-variant">Sun–Sat weeks · current + previous 5 weeks</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-card-gap mb-8">
                  {d.branchWow.map((b, i) => {
                    const curWk  = d.weeklyTrendCal[d.weeklyTrendCal.length - 1]
                    const prevWk = d.weeklyTrendCal[d.weeklyTrendCal.length - 2]
                    return (
                      <WowMiniCard key={b.branch_id} icon="storefront" label={b.branch_name} color={BRANCH_COLORS[i % BRANCH_COLORS.length]}
                        weekNum={curWk.week_num} prevWeekNum={prevWk.week_num}
                        cur={b.cur} prev={b.prev} pct={b.pct} diff={b.diff}
                        chartData={d.weeklyByBranch} dataKey={b.branch_code} />
                    )
                  })}
                </div>
              </>)}
            </>)}
          </>)}

          {/* ═════════════════════════════════════════════════════════════
              TAB: By Branch
          ═════════════════════════════════════════════════════════════ */}
          {activeTab === 'branch' && (
            <div className="space-y-6">
              {/* Branch bar chart */}
              {d.byBranch.length > 0 && (
                <GlassCard elevated className="p-6">
                  <h4 className="font-headline-md text-headline-md text-on-surface mb-1">Branch Weight Contribution</h4>
                  <p className="text-body-sm text-on-surface-variant mb-4">Jewelry + Bar (Baht) — {MONTHS[month - 1]} {year}</p>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={d.byBranch} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e0e0e0" />
                        <XAxis dataKey="branch_code" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${fmtInt(v)}`} />
                        <Tooltip
                          formatter={(v: number, name: string) => [fmt(v, 1) + ' Baht', name]}
                          labelFormatter={(_l, p) => p?.[0]?.payload?.branch_name ?? _l}
                          contentStyle={{ borderRadius: 10, fontSize: 12 }}
                        />
                        <Legend iconType="circle" iconSize={8} />
                        <Bar dataKey="jewelry" name="Jewelry" stackId="a" fill="#004f96" radius={[0,0,0,0]} />
                        <Bar dataKey="bar"     name="Bar"     stackId="a" fill="#9c6e1b" radius={[3,3,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>
              )}

              {/* Branch table */}
              <GlassCard elevated className="overflow-hidden">
                <div className="px-5 py-4 border-b border-white/30">
                  <h4 className="font-headline-md text-headline-md text-on-surface">Branch Performance</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-variant/20 border-b border-white/40">
                        {['Branch','Jewelry (Baht)','Bar (Baht)','Total (Baht)','% Weight Contrib','Qty (pcs)','% Qty Contrib','vs LM%','Reps'].map(h => (
                          <th key={h} className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/20">
                      {d.byBranch.map(r => (
                        <tr key={r.branch_id} className="hover:bg-primary/[0.04] transition-colors">
                          <td className="px-5 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-white text-[10px] font-bold">
                                {r.branch_code}
                              </div>
                              <span className="font-label-md text-label-md font-bold">{r.branch_name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 tabular-nums text-body-sm">{fmt(r.jewelry, 1)}</td>
                          <td className="px-5 py-3 tabular-nums text-body-sm">{fmt(r.bar, 1)}</td>
                          <td className="px-5 py-3 tabular-nums font-bold text-body-sm">{fmt(r.total, 1)}</td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-surface-container-highest rounded-full max-w-24">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(r.weight_contrib, 100)}%` }} />
                              </div>
                              <span className="tabular-nums text-body-sm font-semibold text-primary">{r.weight_contrib.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 tabular-nums text-body-sm">{fmtInt(r.qty)}</td>
                          <td className="px-5 py-3">
                            <span className="tabular-nums text-body-sm font-semibold text-secondary">{r.qty_contrib.toFixed(1)}%</span>
                          </td>
                          <td className="px-5 py-3"><VarChip pct={r.var_total_pct} compact /></td>
                          <td className="px-5 py-3 tabular-nums text-on-surface-variant">{r.reps}</td>
                        </tr>
                      ))}
                    </tbody>
                    {d.byBranch.length > 0 && (
                      <tfoot>
                        <tr className="bg-surface-variant/20 border-t border-white/40 font-bold">
                          <td className="px-5 py-3 font-label-md text-label-md text-on-surface-variant uppercase">Total</td>
                          <td className="px-5 py-3 tabular-nums">{fmt(d.current.jewelry, 1)}</td>
                          <td className="px-5 py-3 tabular-nums">{fmt(d.current.bar, 1)}</td>
                          <td className="px-5 py-3 tabular-nums">{fmt(d.current.total, 1)}</td>
                          <td className="px-5 py-3 tabular-nums text-primary">100%</td>
                          <td className="px-5 py-3 tabular-nums">{fmtInt(d.current.qty)}</td>
                          <td className="px-5 py-3 tabular-nums text-secondary">100%</td>
                          <td className="px-5 py-3" />
                          <td className="px-5 py-3 tabular-nums">{d.current.reps}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </GlassCard>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════
              TAB: By Customer Type
          ═════════════════════════════════════════════════════════════ */}
          {activeTab === 'type' && (
            <div className="space-y-6">
              {/* Type cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(['b2c', 'b2b'] as const).map(type => {
                  const r = d.byType.find(x => x.staff_type === type)
                  const color = type === 'b2b' ? '#6750a4' : '#004f96'
                  const label = type === 'b2c' ? 'B2C (Retail)' : 'B2B (Wholesale)'
                  if (!r) return (
                    <GlassCard key={type} className="p-6 flex items-center justify-center h-40">
                      <p className="text-on-surface-variant text-body-sm">No {type.toUpperCase()} data this period</p>
                    </GlassCard>
                  )
                  return (
                    <GlassCard key={type} elevated className="p-6" style={{ borderTop: `3px solid ${color}` }}>
                      <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 rounded-full text-white font-bold text-sm" style={{ background: color }}>{type.toUpperCase()}</span>
                          <span className="font-headline-md text-headline-md text-on-surface">{label}</span>
                        </div>
                        <span className="text-on-surface-variant text-body-sm">{r.reps} reps</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {[
                          { l: 'Jewelry MTD',      v: fmt(r.jewelry, 1) + ' Baht' },
                          { l: 'Bar MTD',          v: fmt(r.bar, 1) + ' Baht'     },
                          { l: 'Total Weight MTD', v: fmt(r.total, 1) + ' Baht', bold: true },
                          { l: 'Qty MTD',          v: fmtInt(r.qty) + ' pcs'      },
                          { l: 'Weight % Contrib', v: r.weight_contrib.toFixed(1) + '%' },
                          { l: 'Qty % Contrib',    v: r.qty_contrib.toFixed(1) + '%'    },
                        ].map(item => (
                          <div key={item.l} className="rounded-xl p-3" style={{ background: `${color}12` }}>
                            <p className="text-[10px] text-on-surface-variant uppercase font-bold mb-1">{item.l}</p>
                            <p className={`tabular-nums text-body-sm ${'bold' in item && item.bold ? 'font-bold text-[16px]' : 'font-semibold'}`} style={{ color }}>
                              {item.v}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 pt-3 border-t border-white/20">
                        <span className="text-[11px] text-on-surface-variant">vs {lmLabel} same period:</span>
                        <VarChip pct={r.var_total_pct} />
                      </div>
                    </GlassCard>
                  )
                })}
              </div>

              {/* B2C vs B2B side-by-side bar */}
              {d.byType.length > 0 && (
                <GlassCard elevated className="p-6">
                  <h4 className="font-headline-md text-headline-md text-on-surface mb-4">B2C vs B2B Comparison</h4>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={d.byType} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="staff_type" tickFormatter={v => v.toUpperCase()} tick={{ fontSize: 12, fontWeight: 700 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtInt} />
                        <Tooltip formatter={(v: number, name: string) => [fmt(v, 1) + ' Baht', name]} contentStyle={{ fontSize: 12, borderRadius: 10 }} />
                        <Legend iconType="circle" iconSize={8} />
                        <Bar dataKey="jewelry" name="Jewelry" fill="#004f96" radius={[0,0,0,0]} maxBarSize={48} />
                        <Bar dataKey="bar"     name="Bar"     fill="#9c6e1b" radius={[3,3,0,0]} maxBarSize={48} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>
              )}
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════
              TAB: Trends
          ═════════════════════════════════════════════════════════════ */}
          {activeTab === 'trends' && (
            <div className="space-y-6">
              {/* Weekly/Monthly Detail — free date range, can cross months/years */}
              <GlassCard elevated className="p-5">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
                  <p className="font-headline-md text-headline-md text-on-surface">Weekly & Monthly Detail</p>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container border border-white/20">
                    <span className="material-symbols-outlined text-sm text-primary">date_range</span>
                    <input type="date" value={trendFrom} max={trendTo}
                      onChange={e => setTrendFrom(e.target.value)}
                      className="text-body-sm bg-transparent border-none outline-none text-on-surface w-[118px]" />
                    <span className="text-on-surface-variant text-xs">→</span>
                    <input type="date" value={trendTo} min={trendFrom} max={maxDate}
                      onChange={e => setTrendTo(e.target.value)}
                      className="text-body-sm bg-transparent border-none outline-none text-on-surface w-[118px]" />
                  </div>
                </div>
                <p className="text-body-sm text-on-surface-variant mb-4">
                  Independent of the Month filter above — pick any range, even across multiple months or years.
                </p>
                <WeeklyMonthlyDetail data={trendData} loading={trendLoading} trendTo={trendTo} />
              </GlassCard>

              {/* Daily area chart */}
              {d.dailyTrend.length > 0 && (
                <GlassCard elevated className="p-6">
                  <h4 className="font-headline-md text-headline-md text-on-surface mb-1">Daily Sales Trend</h4>
                  <p className="text-body-sm text-on-surface-variant mb-4">
                    Jewelry + Bar weight per day · {dateFrom} → {dateTo}
                  </p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={d.dailyTrend} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                        <defs>
                          <linearGradient id="gradJewelry" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#004f96" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#004f96" stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id="gradBar" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#9c6e1b" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#9c6e1b" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e0e0e0" />
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={d => d.slice(5)} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtInt} />
                        <Tooltip
                          formatter={(v: number, name: string) => [fmt(v, 1) + ' Baht', name]}
                          contentStyle={{ borderRadius: 10, fontSize: 12 }}
                        />
                        <Legend iconType="circle" iconSize={8} />
                        <Area type="monotone" dataKey="jewelry" name="Jewelry" stroke="#004f96" strokeWidth={2} fill="url(#gradJewelry)" dot={{ r: 2.5, fill: '#004f96' }} />
                        <Area type="monotone" dataKey="bar"     name="Bar"     stroke="#9c6e1b" strokeWidth={2} fill="url(#gradBar)"     dot={{ r: 2.5, fill: '#9c6e1b' }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>
              )}

              {/* Weekday heatmap — which day of week carries the most volume */}
              {d.dailyTrend.length > 0 && <WeekdayHeatmap rows={d.dailyTrend} />}

              {/* Qty daily line */}
              {d.dailyTrend.length > 0 && (
                <GlassCard elevated className="p-6">
                  <h4 className="font-headline-md text-headline-md text-on-surface mb-1">Daily Quantity Trend</h4>
                  <p className="text-body-sm text-on-surface-variant mb-4">Units sold per day</p>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={d.dailyTrend} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e0e0e0" />
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={d => d.slice(5)} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => [fmtInt(v) + ' pcs', 'Qty']} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                        <Line type="monotone" dataKey="qty" name="Quantity" stroke="#6750a4" strokeWidth={2.5} dot={{ r: 3, fill: '#6750a4' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>
              )}

              {/* Weekly summary bar chart (last 8 weeks) */}
              {d.weeklyTrend.length > 0 && (
                <GlassCard elevated className="p-6">
                  <h4 className="font-headline-md text-headline-md text-on-surface mb-1">Weekly Trend (Last 8 Weeks)</h4>
                  <p className="text-body-sm text-on-surface-variant mb-4">Total weight per week · Latest week highlighted</p>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={d.weeklyTrend} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e0e0e0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtInt} />
                        <Tooltip
                          formatter={(v: number, name: string) => [fmt(v, 1) + ' Baht', name]}
                          labelFormatter={(_l, p) => `${p?.[0]?.payload?.label ?? _l} (${p?.[0]?.payload?.week_start ?? ''})`}
                          contentStyle={{ borderRadius: 10, fontSize: 12 }}
                        />
                        <Legend iconType="circle" iconSize={8} />
                        <Bar dataKey="jewelry" name="Jewelry" stackId="w" fill="#004f96" radius={[0,0,0,0]}>
                          {d.weeklyTrend.map((_, i) => <Cell key={i} fill={i === d.weeklyTrend.length - 1 ? '#004f96' : '#004f9688'} />)}
                        </Bar>
                        <Bar dataKey="bar" name="Bar" stackId="w" fill="#9c6e1b" radius={[3,3,0,0]}>
                          {d.weeklyTrend.map((_, i) => <Cell key={i} fill={i === d.weeklyTrend.length - 1 ? '#9c6e1b' : '#9c6e1b88'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>
              )}

              {/* No data fallback */}
              {d.dailyTrend.length === 0 && d.weeklyTrend.length === 0 && (
                <div className="flex items-center justify-center h-48 text-on-surface-variant text-body-sm">
                  No entry data for this period.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </AppShell>
  )
}
