import { useEffect, useState, useRef } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { MonthDropdown, DateRangeBar } from '../../components/ui/PeriodFilter'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import { getDefaultDateRange } from '../../utils/dates'
import type { MonthlyReportRow } from '../../types'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmt(n: number, d = 1) { return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) }
function fmtPct(n: number) { return `${fmt(n, 1)}%` }

function kpiColor(pct: number) {
  if (pct >= 80)  return 'text-green-600'
  if (pct >= 50)  return 'text-yellow-600'
  if (pct >= 30)  return 'text-orange-500'
  return 'text-red-500'
}
function kpiBg(pct: number) {
  if (pct >= 80)  return 'bg-green-50'
  if (pct >= 50)  return 'bg-yellow-50'
  if (pct >= 30)  return 'bg-orange-50'
  return 'bg-red-50'
}

type SortCol = 'full_name' | 'actual_jewelry' | 'actual_bar' | 'actual_qty' | 'kpiPct' | 'eomKpiPct'

// ── Team Supervisor single-select dropdown ────────────────────────────────
interface SupervisorDropdownProps {
  supervisors: Array<{ id: number; full_name: string; branch_name: string }>
  selectedId: number | null
  onChange: (id: number | null) => void
}

function SupervisorDropdown({ supervisors, selectedId, onChange }: SupervisorDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])

  const label = selectedId == null
    ? 'All Supervisors'
    : supervisors.find(s => s.id === selectedId)?.full_name ?? 'Supervisor'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container text-on-surface text-body-sm hover:bg-surface-container-high transition-colors border border-white/20"
      >
        <span className="material-symbols-outlined text-sm text-secondary">supervisor_account</span>
        {label}
        <span className="material-symbols-outlined text-sm">{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 bg-white/95 backdrop-blur-xl shadow-xl rounded-xl border border-white/40 z-50 min-w-56 py-1 max-h-72 overflow-y-auto">
          <label
            className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-primary/5 cursor-pointer"
            onClick={() => { onChange(null); setOpen(false) }}
          >
            <input type="radio" checked={selectedId == null} readOnly className="accent-primary" />
            <span className="text-body-sm">All Supervisors</span>
          </label>
          {supervisors.length === 0 ? (
            <p className="px-4 py-3 text-[11px] text-on-surface-variant italic">No supervisors yet. Use Team Setup to create them.</p>
          ) : (
            <>
              <div className="border-t border-black/5 my-1" />
              {supervisors.map(s => (
                <label
                  key={s.id}
                  className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-primary/5 cursor-pointer"
                  onClick={() => { onChange(s.id); setOpen(false) }}
                >
                  <input type="radio" checked={selectedId === s.id} readOnly className="accent-primary" />
                  <div>
                    <span className="text-body-sm">{s.full_name}</span>
                    <span className="ml-2 text-[10px] text-on-surface-variant">{s.branch_name}</span>
                  </div>
                </label>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Multi-select branch dropdown ──────────────────────────────────────────
interface BranchDropdownProps {
  branches: Array<{ id: number; name: string; code: string }>
  selectedIds: number[]
  onChange: (ids: number[]) => void
}

function BranchDropdown({ branches, selectedIds, onChange }: BranchDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])

  const isAll = selectedIds.length === 0
  const label = isAll
    ? 'All Branches'
    : selectedIds.length === 1
    ? branches.find(b => b.id === selectedIds[0])?.name ?? '1 Branch'
    : `${selectedIds.length} Branches`

  function toggle(id: number) {
    if (isAll) { onChange([id]); return }
    const next = selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]
    onChange(next.length === branches.length ? [] : next)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container text-on-surface text-body-sm hover:bg-surface-container-high transition-colors border border-white/20"
      >
        <span className="material-symbols-outlined text-sm text-primary">corporate_fare</span>
        {label}
        <span className="material-symbols-outlined text-sm">{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 bg-white/95 backdrop-blur-xl shadow-xl rounded-xl border border-white/40 z-50 min-w-52 py-1">
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

// ── Sortable column header ─────────────────────────────────────────────────
function SortTh({ label, col, sortCol, sortDir, onSort, className = '' }: {
  label: string; col: SortCol; sortCol: SortCol; sortDir: 'asc' | 'desc'
  onSort: (c: SortCol) => void; className?: string
}) {
  const active = sortCol === col
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-primary transition-colors ${active ? 'text-primary' : ''} ${className}`}
    >
      <div className="flex items-center gap-1">
        {label}
        <span className={`material-symbols-outlined text-sm transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}>
          {sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
        </span>
      </div>
    </th>
  )
}

export default function Reports() {
  const { token, user, branches } = useAuthStore()
  const { selectedBranchIds, setSelectedBranchIds } = useAppStore()
  const [rows, setRows] = useState<MonthlyReportRow[]>([])
  const [meta, setMeta] = useState({ daysInMonth: 30, dayOfMonth: 1, daysRemaining: 29 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<SortCol>('kpiPct')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedSupId, setSelectedSupId] = useState<number | null>(null)
  const [supervisors, setSupervisors] = useState<Array<{ id: number; full_name: string; branch_name: string }>>([])

  const showSupFilter = user?.role === 'branch_manager' || user?.role === 'executive' || user?.role === 'admin'

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

  const effectiveBranchIds: number[] = (user?.role === 'supervisor' || user?.role === 'branch_manager')
    ? [user.branchId ?? 1]
    : selectedBranchIds

  // Load supervisors list for filter dropdown
  useEffect(() => {
    if (!token || !showSupFilter) return
    const branchId = user?.role === 'branch_manager' ? (user.branchId ?? undefined) : undefined
    window.api.getSupervisors(token, branchId)
      .then(data => setSupervisors(data as Array<{ id: number; full_name: string; branch_name: string }>))
      .catch(console.error)
  }, [token, user?.role, user?.branchId])

  // Reset sup filter when branch changes
  useEffect(() => { setSelectedSupId(null) }, [JSON.stringify(effectiveBranchIds)])

  useEffect(() => {
    if (!token) return
    setLoading(true)
    window.api.getMonthlyReport(token, effectiveBranchIds, year, month, dateFrom, dateTo, selectedSupId ?? undefined)
      .then(data => {
        setRows(data.rows)
        setMeta({
          daysInMonth:    data.daysInMonth,
          dayOfMonth:     data.dayOfMonth,
          daysRemaining:  data.daysRemaining,
        })
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [token, JSON.stringify(effectiveBranchIds), year, month, dateFrom, dateTo, selectedSupId])

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const searched = rows.filter(r =>
    r.full_name.toLowerCase().includes(search.toLowerCase()) ||
    r.position.toLowerCase().includes(search.toLowerCase())
  )

  const sorted = [...searched].sort((a, b) => {
    const mul = sortDir === 'asc' ? 1 : -1
    switch (sortCol) {
      case 'full_name':      return a.full_name.localeCompare(b.full_name) * mul
      case 'actual_jewelry': return (a.actual_jewelry - b.actual_jewelry) * mul
      case 'actual_bar':     return (a.actual_bar - b.actual_bar) * mul
      case 'actual_qty':     return (a.actual_qty - b.actual_qty) * mul
      case 'kpiPct':         return (a.kpiScore.pct - b.kpiScore.pct) * mul
      case 'eomKpiPct':      return (a.eomKpiPct - b.eomKpiPct) * mul
      default: return 0
    }
  })

  const isMultiBranch = effectiveBranchIds.length !== 1
  const showSupColumn = showSupFilter && selectedSupId == null

  const avgKpiPct    = rows.length ? rows.reduce((s, r) => s + r.kpiScore.pct, 0) / rows.length : 0
  const avgEomKpiPct = rows.length ? rows.reduce((s, r) => s + r.eomKpiPct, 0) / rows.length : 0
  const totalJewelry = rows.reduce((s, r) => s + r.actual_jewelry, 0)
  const totalBar     = rows.reduce((s, r) => s + r.actual_bar, 0)

  const scopeLabel = (user?.role === 'supervisor' || user?.role === 'branch_manager')
    ? branches.find(b => b.id === user.branchId)?.name ?? 'My Branch'
    : effectiveBranchIds.length === 0 ? 'All Branches'
    : effectiveBranchIds.length === 1 ? (branches.find(b => b.id === effectiveBranchIds[0])?.name ?? '1 Branch')
    : `${effectiveBranchIds.length} Branches`

  // Supervisors visible in filter (scoped by branch for branch_manager)
  const visibleSupervisors = user?.role === 'branch_manager'
    ? supervisors
    : selectedBranchIds.length > 0
      ? supervisors.filter(s => {
          const branch = branches.find(b => b.name === s.branch_name)
          return branch ? selectedBranchIds.includes(branch.id) : true
        })
      : supervisors

  return (
    <AppShell title="SalesTrack Pro">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div>
          <nav className="flex items-center gap-2 text-label-md text-on-surface-variant mb-2">
            <span>Reports</span>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="text-primary">Performance Tracking</span>
          </nav>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Monthly Tracking Report</h2>
          <p className="text-on-surface-variant text-body-md mt-1">
            {scopeLabel} — {MONTHS[month - 1]} {year}
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
          {user?.role !== 'supervisor' && user?.role !== 'branch_manager' && (
            <BranchDropdown branches={branches} selectedIds={selectedBranchIds} onChange={setSelectedBranchIds} />
          )}
          {showSupFilter && (
            <SupervisorDropdown supervisors={visibleSupervisors} selectedId={selectedSupId} onChange={setSelectedSupId} />
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-card-gap mb-8">
        {[
          { label: 'Avg KPI Score %',   value: fmtPct(avgKpiPct),    color: 'border-primary',            sub: `Day ${meta.dayOfMonth} of ${meta.daysInMonth}` },
          { label: 'Avg Est. Month End', value: fmtPct(avgEomKpiPct), color: 'border-tertiary',            sub: `${meta.daysRemaining} days remaining` },
          { label: 'Total Jewelry MTD',  value: `${fmt(totalJewelry, 1)} Baht`, color: 'border-secondary-container', sub: `${rows.length} reps` },
          { label: 'Total Bar MTD',      value: `${fmt(totalBar, 1)} Baht`,     color: 'border-outline-variant',    sub: `${dateFrom} → ${dateTo}` },
        ].map(k => (
          <GlassCard key={k.label} className={`p-5 border-l-4 ${k.color}`}>
            <p className="font-label-md text-label-md text-on-surface-variant uppercase mb-1">{k.label}</p>
            <h3 className="font-display-xl text-display-xl text-on-surface tabular-nums">{k.value}</h3>
            <p className="text-[10px] text-on-surface-variant mt-1">{k.sub}</p>
          </GlassCard>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">search</span>
        <input
          type="text" placeholder="Search by name or position..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-white/60 backdrop-blur-sm border border-white/50 rounded-lg pl-9 pr-4 py-2 text-body-sm outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Est. Month End note */}
      <p className="text-[11px] text-on-surface-variant/60 mb-3 italic">
        KPI % = (Jewelry + Bar + Qty Score) ÷ branch point target &nbsp;·&nbsp;
        Est. Month End = KPI % ÷ Day {meta.dayOfMonth} × {meta.daysInMonth} days
      </p>

      {/* Main Table */}
      <GlassCard className="overflow-hidden shadow-sm border border-white/40" elevated>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-variant/20 border-b border-white/40">
                <SortTh label="Representative" col="full_name"      sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                {isMultiBranch && (
                  <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">Branch</th>
                )}
                {showSupColumn && (
                  <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">Team Sup</th>
                )}
                <SortTh label="Jewelry (Baht)" col="actual_jewelry" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Bar (Baht)"     col="actual_bar"     sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Qty (pcs)"      col="actual_qty"     sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="KPI Score %"    col="kpiPct"         sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Est. Month End" col="eomKpiPct"      sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/20">
              {loading ? (
                <tr><td colSpan={6 + (isMultiBranch ? 1 : 0) + (showSupColumn ? 1 : 0)} className="py-12 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined animate-spin-slow text-2xl block mx-auto mb-2">sync</span>
                  Loading report...
                </td></tr>
              ) : sorted.map(r => {
                const pct    = r.kpiScore.pct
                const eomPct = r.eomKpiPct
                return (
                  <tr key={r.id} className="hover:bg-primary/[0.02] transition-colors">
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold uppercase">
                          {r.full_name.slice(0,1)}
                        </div>
                        <div>
                          <p className="font-label-md text-label-md font-bold">{r.full_name}</p>
                          <p className="text-[10px] text-on-surface-variant font-mono">{r.rep_code ?? r.position}</p>
                        </div>
                      </div>
                    </td>
                    {isMultiBranch && (
                      <td className="px-5 py-3 text-body-sm text-on-surface-variant whitespace-nowrap">{r.branch_name}</td>
                    )}
                    {showSupColumn && (
                      <td className="px-5 py-3 text-body-sm text-on-surface-variant whitespace-nowrap">{r.supervisor_name ?? '—'}</td>
                    )}
                    <td className="px-5 py-3 font-tabular-nums text-body-sm font-bold">{fmt(r.actual_jewelry)} Baht</td>
                    <td className="px-5 py-3 font-tabular-nums text-body-sm font-bold">{fmt(r.actual_bar)} Baht</td>
                    <td className="px-5 py-3 font-tabular-nums text-body-sm font-bold">{r.actual_qty}</td>
                    <td className="px-5 py-3">
                      <div className={`inline-flex flex-col items-center px-3 py-1 rounded-lg ${kpiBg(pct)}`}>
                        <span className={`font-tabular-nums font-bold text-body-sm ${kpiColor(pct)}`}>{fmtPct(pct)}</span>
                        <span className="text-[9px] text-on-surface-variant tabular-nums">
                          {r.kpiScore.total.toLocaleString('en-US', { maximumFractionDigits: 0 })} pts
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1 font-tabular-nums text-body-sm">
                        <span className={`material-symbols-outlined text-sm ${eomPct >= pct ? 'text-tertiary' : 'text-on-surface-variant'}`}>
                          {eomPct >= 50 ? 'trending_up' : 'trending_down'}
                        </span>
                        <span className={`font-bold ${kpiColor(eomPct)}`}>{fmtPct(eomPct)}</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && !sorted.length && (
                <tr><td colSpan={6 + (isMultiBranch ? 1 : 0) + (showSupColumn ? 1 : 0)} className="py-8 text-center text-on-surface-variant text-body-sm">No results found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-4 bg-surface-variant/10 border-t border-white/40 flex justify-between items-center">
          <p className="text-body-sm text-on-surface-variant italic">
            Showing {sorted.length} of {rows.length} representatives · Day {meta.dayOfMonth} of {meta.daysInMonth} · {meta.daysRemaining} days remaining
          </p>
        </div>
      </GlassCard>
    </AppShell>
  )
}
