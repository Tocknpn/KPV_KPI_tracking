import { useEffect, useState, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList, Cell, Legend } from 'recharts'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { RadialGauge } from '../../components/ui/RadialGauge'
import { MonthDropdown, DateRangeBar } from '../../components/ui/PeriodFilter'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import { getDefaultDateRange } from '../../utils/dates'
import type { MonthlyReportRow, TeamPerformanceRow, ExecutiveBranchRow } from '../../types'
import { RepProfileModal, SupProfileModal } from './IndividualProfileModal'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Commission row types ──────────────────────────────────────────────────
interface CommRepRow {
  id: number; full_name: string; nickname: string; staff_type: string
  branch_id: number; branch_name: string; branch_code: string
  supervisor_name: string | null
  actual_jewelry: number; actual_bar: number; actual_qty: number
  commission_lak: number
  rate_applied: { jewelry_rate_lak: number; bar_rate_lak: number; qty_rate_lak: number } | null
}
interface CommSupRow {
  id: number; full_name: string; nickname: string; staff_type: string
  branch_id: number; branch_name: string; branch_code: string
  team_commission_lak: number; supervisor_commission_lak: number; sup_pct: number
}

type ReportTab = 'company_overview' | 'supervisor' | 'performance' | 'commission' | 'customer_type'

// ── Utilities ─────────────────────────────────────────────────────────────
function fmt(n: number, d = 1) { return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) }
function fmtPct(n: number) { return `${fmt(n, 1)}%` }
function fmtPts(n: number) { return n.toLocaleString('en-US', { maximumFractionDigits: 0 }) }
function fmtLak(n: number) { return n.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' ₭' }

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
function kpiColorSup(pct: number) {
  if (pct >= 100) return 'text-green-600'
  if (pct >= 70)  return 'text-primary'
  if (pct >= 40)  return 'text-yellow-600'
  return 'text-red-500'
}
function kpiBgSup(pct: number) {
  if (pct >= 100) return 'bg-green-50'
  if (pct >= 70)  return 'bg-primary/5'
  if (pct >= 40)  return 'bg-yellow-50'
  return 'bg-red-50'
}
function kpiHex(pct: number) {
  if (pct >= 100) return '#16a34a'
  if (pct >= 70)  return '#004f96'
  if (pct >= 40)  return '#ca8a04'
  return '#dc2626'
}

// ── TypeBadge ─────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider
      ${type === 'b2b' ? 'bg-secondary/10 text-secondary' : 'bg-primary/10 text-primary'}`}>
      {type.toUpperCase()}
    </span>
  )
}

// ── Sortable TH ───────────────────────────────────────────────────────────
function SortTh({ label, col, sortCol, sortDir, onSort, className = '', right = false }: {
  label: string; col: string; sortCol: string; sortDir: 'asc' | 'desc'
  onSort: (c: string) => void; className?: string; right?: boolean
}) {
  const active = sortCol === col
  return (
    <th onClick={() => onSort(col)}
      className={`px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-primary transition-colors ${active ? 'text-primary' : ''} ${className}`}>
      <div className={`flex items-center gap-1 ${right ? 'justify-end' : ''}`}>
        {label}
        <span className={`material-symbols-outlined text-sm transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}>
          {sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
        </span>
      </div>
    </th>
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

// ── Supervisor multi-select ───────────────────────────────────────────────
function SupervisorMultiDropdown({ supervisors, selectedIds, onChange }: {
  supervisors: Array<{ id: number; full_name: string; branch_name: string }>
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
  const label = isAll ? 'All Supervisors'
    : selectedIds.length === 1 ? (supervisors.find(s => s.id === selectedIds[0])?.full_name ?? '1 Supervisor')
    : `${selectedIds.length} Supervisors`
  function toggle(id: number) {
    const next = selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]
    onChange(next)
  }
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container text-on-surface text-body-sm hover:bg-surface-container-high transition-colors border border-white/20">
        <span className="material-symbols-outlined text-sm text-secondary">supervisor_account</span>
        {label}
        <span className="material-symbols-outlined text-sm">{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 bg-white/95 backdrop-blur-xl shadow-xl rounded-xl border border-white/40 z-50 min-w-56 py-1 max-h-72 overflow-y-auto">
          <label className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-primary/5 cursor-pointer">
            <input type="checkbox" checked={isAll} onChange={() => onChange([])} className="accent-primary" />
            <span className="text-body-sm">All Supervisors</span>
          </label>
          {supervisors.length > 0 && <div className="border-t border-black/5 my-1" />}
          {supervisors.map(s => (
            <label key={s.id} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-primary/5 cursor-pointer">
              <input type="checkbox" checked={selectedIds.includes(s.id)} onChange={() => toggle(s.id)} className="accent-primary" />
              <div>
                <span className="text-body-sm">{s.full_name}</span>
                <span className="ml-2 text-[10px] text-on-surface-variant">{s.branch_name}</span>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── B2C/B2B multi chips ───────────────────────────────────────────────────
function TypeMultiChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const isAll = value.length === 0
  function toggle(t: 'b2c' | 'b2b') {
    const next = value.includes(t) ? value.filter(x => x !== t) : [...value, t]
    onChange(next)
  }
  return (
    <div className="flex gap-2">
      <button onClick={() => onChange([])}
        className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors
          ${isAll ? 'bg-on-surface text-surface' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
        All
      </button>
      {(['b2c', 'b2b'] as const).map(t => (
        <button key={t} onClick={() => toggle(t)}
          className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors
            ${value.includes(t)
              ? t === 'b2b' ? 'bg-secondary text-white' : 'bg-primary text-white'
              : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
          {t.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────
export default function Reports() {
  const { token, user, branches } = useAuthStore()
  const { selectedBranchIds, setSelectedBranchIds } = useAppStore()

  // ── Shared date state ──────────────────────────────────────────────────
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

  // ── Shared filters ─────────────────────────────────────────────────────
  const [selectedSupIds, setSelectedSupIds] = useState<number[]>([])
  const [typeFilter, setTypeFilter] = useState<string[]>([])  // [] = all

  // ── Tab ────────────────────────────────────────────────────────────────
  const canSeeOverview = user?.role === 'admin' || user?.role === 'executive'
  const [activeTab, setActiveTab] = useState<ReportTab>(canSeeOverview ? 'company_overview' : 'performance')

  // ── Toast ──────────────────────────────────────────────────────────────
  const [toast, setToast] = useState('')
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500) }

  // ── Scope helpers ──────────────────────────────────────────────────────
  const isBranchScoped = user?.role === 'supervisor' || user?.role === 'branch_manager'
  const effectiveBranchIds: number[] = isBranchScoped ? [user.branchId ?? 1] : selectedBranchIds
  const isMultiBranch = effectiveBranchIds.length !== 1
  const showSupFilter = user?.role !== 'supervisor'

  const scopeLabel = isBranchScoped
    ? branches.find(b => b.id === user?.branchId)?.name ?? 'My Branch'
    : effectiveBranchIds.length === 0 ? 'All Branches'
    : effectiveBranchIds.length === 1 ? (branches.find(b => b.id === effectiveBranchIds[0])?.name ?? '1 Branch')
    : `${effectiveBranchIds.length} Branches`

  // EOM helpers (company overview)
  const daysInMonth = new Date(year, month, 0).getDate()
  const dayOfMonth  = new Date(dateTo + 'T00:00:00').getDate()
  function calcEomPct(pct: number) { return dayOfMonth > 0 ? (pct / dayOfMonth) * daysInMonth : 0 }

  // ── Data state ─────────────────────────────────────────────────────────
  const [rows, setRows]       = useState<MonthlyReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [meta, setMeta]       = useState({ daysInMonth: 30, dayOfMonth: 1, daysRemaining: 29 })
  const [search, setSearch]   = useState('')
  const [sortCol, setSortCol] = useState('kpiPct')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [custSortCol, setCustSortCol] = useState('kpiPct')
  const [custSortDir, setCustSortDir] = useState<'asc' | 'desc'>('desc')

  const [supervisors, setSupervisors] = useState<Array<{ id: number; full_name: string; branch_name: string }>>([])

  const [supRows, setSupRows]       = useState<TeamPerformanceRow[]>([])
  const [supLoading, setSupLoading] = useState(false)
  const [supSortCol, setSupSortCol] = useState('team_kpi_pct')
  const [supSortDir, setSupSortDir] = useState<'asc' | 'desc'>('desc')

  const [execRows, setExecRows]     = useState<ExecutiveBranchRow[]>([])
  const [execLoading, setExecLoading] = useState(false)

  const [profileRepId, setProfileRepId] = useState<number | null>(null)
  const [profileSupId, setProfileSupId] = useState<number | null>(null)

  const [commReps, setCommReps]   = useState<CommRepRow[]>([])
  const [commSups, setCommSups]   = useState<CommSupRow[]>([])
  const [commLoading, setCommLoading] = useState(false)
  const [commSubTab, setCommSubTab]   = useState<'reps' | 'supervisors'>('reps')
  const [commSearch, setCommSearch]   = useState('')
  const [commRepSortCol, setCommRepSortCol] = useState('commission_lak')
  const [commRepSortDir, setCommRepSortDir] = useState<'asc' | 'desc'>('desc')
  const [commSupSortCol, setCommSupSortCol] = useState('supervisor_commission_lak')
  const [commSupSortDir, setCommSupSortDir] = useState<'asc' | 'desc'>('desc')
  const [commPulling, setCommPulling]       = useState(false)

  // ── Load supervisors list ──────────────────────────────────────────────
  useEffect(() => {
    if (!token || !showSupFilter) return
    const branchId = user?.role === 'branch_manager' ? (user.branchId ?? undefined) : undefined
    window.api.getSupervisors(token, branchId)
      .then(data => setSupervisors(data as Array<{ id: number; full_name: string; branch_name: string }>))
      .catch(console.error)
  }, [token, user?.role, user?.branchId])

  useEffect(() => { setSelectedSupIds([]) }, [JSON.stringify(effectiveBranchIds)])

  // ── Load all data when filters change ─────────────────────────────────
  useEffect(() => {
    if (!token) return

    setLoading(true)
    window.api.getMonthlyReport(token, effectiveBranchIds, year, month, dateFrom, dateTo)
      .then(data => { setRows(data.rows); setMeta({ daysInMonth: data.daysInMonth, dayOfMonth: data.dayOfMonth, daysRemaining: data.daysRemaining }) })
      .catch(console.error)
      .finally(() => setLoading(false))

    setSupLoading(true)
    window.api.getTeamPerformance(token, effectiveBranchIds, year, month, dateFrom, dateTo)
      .then(data => setSupRows(data as TeamPerformanceRow[]))
      .catch(console.error)
      .finally(() => setSupLoading(false))

    setCommLoading(true)
    window.api.getCommissionReport(token, effectiveBranchIds, year, month, dateFrom, dateTo)
      .then((data: { reps: CommRepRow[]; supervisors: CommSupRow[] }) => { setCommReps(data.reps); setCommSups(data.supervisors) })
      .catch(console.error)
      .finally(() => setCommLoading(false))

    if (canSeeOverview) {
      setExecLoading(true)
      window.api.getExecutiveReport(token, year, month, dateFrom, dateTo)
        .then(data => setExecRows(data as ExecutiveBranchRow[]))
        .catch(console.error)
        .finally(() => setExecLoading(false))
    }
  }, [token, JSON.stringify(effectiveBranchIds), year, month, dateFrom, dateTo])

  // ── Sort handlers ──────────────────────────────────────────────────────
  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }
  function handleCustSort(col: string) {
    if (custSortCol === col) setCustSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setCustSortCol(col); setCustSortDir('desc') }
  }
  function handleSupSort(col: string) {
    if (supSortCol === col) setSupSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSupSortCol(col); setSupSortDir('desc') }
  }
  function handleCommRepSort(col: string) {
    if (commRepSortCol === col) setCommRepSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setCommRepSortCol(col); setCommRepSortDir('desc') }
  }
  function handleCommSupSort(col: string) {
    if (commSupSortCol === col) setCommSupSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setCommSupSortCol(col); setCommSupSortDir('desc') }
  }

  // ── Shared filter helpers ──────────────────────────────────────────────
  const selectedSupNames = new Set(
    selectedSupIds.map(id => supervisors.find(s => s.id === id)?.full_name).filter(Boolean) as string[]
  )
  function matchesSup(supervisorName: string | null | undefined) {
    return selectedSupIds.length === 0 || selectedSupNames.has(supervisorName ?? '')
  }
  function matchesType(staffType: string) {
    return typeFilter.length === 0 || typeFilter.includes(staffType)
  }

  const visibleSupervisors = user?.role === 'branch_manager' ? supervisors
    : selectedBranchIds.length > 0
      ? supervisors.filter(s => { const b = branches.find(br => br.name === s.branch_name); return b ? selectedBranchIds.includes(b.id) : true })
      : supervisors

  // ── Performance derived ────────────────────────────────────────────────
  const searched = rows.filter(r =>
    matchesType(r.staff_type) &&
    matchesSup(r.supervisor_name) &&
    (r.full_name.toLowerCase().includes(search.toLowerCase()) ||
     r.position.toLowerCase().includes(search.toLowerCase()))
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
  const showSupColumn = showSupFilter && selectedSupIds.length === 0
  const avgKpiPct    = searched.length ? searched.reduce((s, r) => s + r.kpiScore.pct, 0) / searched.length : 0
  const avgEomKpiPct = searched.length ? searched.reduce((s, r) => s + r.eomKpiPct, 0) / searched.length : 0
  const totalJewelry = searched.reduce((s, r) => s + r.actual_jewelry, 0)
  const totalBar     = searched.reduce((s, r) => s + r.actual_bar, 0)

  // ── Customer Type derived ──────────────────────────────────────────────
  const b2cRows    = rows.filter(r => r.staff_type === 'b2c' && matchesSup(r.supervisor_name))
  const b2bRows    = rows.filter(r => r.staff_type === 'b2b' && matchesSup(r.supervisor_name))
  const shownB2c   = typeFilter.length === 0 || typeFilter.includes('b2c') ? b2cRows : []
  const shownB2b   = typeFilter.length === 0 || typeFilter.includes('b2b') ? b2bRows : []
  function groupStats(group: MonthlyReportRow[]) {
    const n = group.length
    return {
      count: n,
      totalJewelry: group.reduce((s, r) => s + r.actual_jewelry, 0),
      totalBar:     group.reduce((s, r) => s + r.actual_bar, 0),
      totalQty:     group.reduce((s, r) => s + r.actual_qty, 0),
      avgKpiPct:    n ? group.reduce((s, r) => s + r.kpiScore.pct, 0) / n : 0,
      avgEomPct:    n ? group.reduce((s, r) => s + r.eomKpiPct, 0) / n : 0,
      totalPts:     group.reduce((s, r) => s + r.kpiScore.total, 0),
    }
  }
  const b2cStats = groupStats(b2cRows)
  const b2bStats = groupStats(b2bRows)
  function sortTypeRows(group: MonthlyReportRow[]) {
    return [...group].sort((a, b) => {
      const mul = custSortDir === 'asc' ? 1 : -1
      switch (custSortCol) {
        case 'full_name':      return a.full_name.localeCompare(b.full_name) * mul
        case 'actual_jewelry': return (a.actual_jewelry - b.actual_jewelry) * mul
        case 'actual_bar':     return (a.actual_bar - b.actual_bar) * mul
        case 'actual_qty':     return (a.actual_qty - b.actual_qty) * mul
        case 'kpiPct':         return (a.kpiScore.pct - b.kpiScore.pct) * mul
        default: return 0
      }
    })
  }

  // ── Supervisor tab derived ─────────────────────────────────────────────
  const filteredSupRows = supRows.filter(r =>
    matchesType(r.staff_type ?? 'b2c') &&
    (selectedSupIds.length === 0 || selectedSupNames.has(r.full_name))
  )
  const sortedSupRows = [...filteredSupRows].sort((a, b) => {
    const mul = supSortDir === 'asc' ? 1 : -1
    switch (supSortCol) {
      case 'full_name':        return a.full_name.localeCompare(b.full_name) * mul
      case 'branch_name':      return a.branch_name.localeCompare(b.branch_name) * mul
      case 'rep_count':        return (a.rep_count - b.rep_count) * mul
      case 'team_total_score': return (a.team_total_score - b.team_total_score) * mul
      case 'team_kpi_pct':     return (a.team_kpi_pct - b.team_kpi_pct) * mul
      default: return 0
    }
  })
  const supTotalReps  = filteredSupRows.reduce((s, r) => s + r.rep_count, 0)
  const supTotalScore = filteredSupRows.reduce((s, r) => s + r.team_total_score, 0)
  const supAvgKpi     = filteredSupRows.length ? filteredSupRows.reduce((s, r) => s + r.team_kpi_pct, 0) / filteredSupRows.length : 0

  // ── Commission derived ─────────────────────────────────────────────────
  const filteredCommReps = commReps.filter(r =>
    matchesType(r.staff_type) &&
    matchesSup(r.supervisor_name) &&
    (!commSearch || r.full_name.toLowerCase().includes(commSearch.toLowerCase()))
  )
  const filteredCommSups = commSups.filter(s =>
    matchesType(s.staff_type) &&
    (selectedSupIds.length === 0 || selectedSupNames.has(s.full_name)) &&
    (!commSearch || s.full_name.toLowerCase().includes(commSearch.toLowerCase()))
  )
  const sortedCommReps = [...filteredCommReps].sort((a, b) => {
    const mul = commRepSortDir === 'asc' ? 1 : -1
    switch (commRepSortCol) {
      case 'full_name':      return a.full_name.localeCompare(b.full_name) * mul
      case 'branch_name':    return (a.branch_name ?? '').localeCompare(b.branch_name ?? '') * mul
      case 'actual_jewelry': return (a.actual_jewelry - b.actual_jewelry) * mul
      case 'actual_bar':     return (a.actual_bar - b.actual_bar) * mul
      case 'actual_qty':     return (a.actual_qty - b.actual_qty) * mul
      case 'commission_lak': return (a.commission_lak - b.commission_lak) * mul
      default: return 0
    }
  })
  const sortedCommSups = [...filteredCommSups].sort((a, b) => {
    const mul = commSupSortDir === 'asc' ? 1 : -1
    switch (commSupSortCol) {
      case 'full_name':                 return a.full_name.localeCompare(b.full_name) * mul
      case 'branch_name':               return (a.branch_name ?? '').localeCompare(b.branch_name ?? '') * mul
      case 'team_commission_lak':       return (a.team_commission_lak - b.team_commission_lak) * mul
      case 'supervisor_commission_lak': return (a.supervisor_commission_lak - b.supervisor_commission_lak) * mul
      default: return 0
    }
  })
  const commTotalRep = filteredCommReps.reduce((s, r) => s + r.commission_lak, 0)
  const commTotalSup = filteredCommSups.reduce((s, r) => s + r.supervisor_commission_lak, 0)
  const commTotalB2c = commReps.filter(r => r.staff_type === 'b2c').reduce((s, r) => s + r.commission_lak, 0)
  const commTotalB2b = commReps.filter(r => r.staff_type === 'b2b').reduce((s, r) => s + r.commission_lak, 0)

  // ── Company Overview derived ───────────────────────────────────────────
  const filteredExecRows = effectiveBranchIds.length === 0
    ? execRows
    : execRows.filter(r => effectiveBranchIds.includes(r.branch_id))
  const execTotalScore  = filteredExecRows.reduce((s, r) => s + r.kpi_total_score, 0)
  const execTotalTarget = filteredExecRows.reduce((s, r) => s + r.kpi_point_target, 0)
  const execOverallPct  = execTotalTarget > 0 ? (execTotalScore / execTotalTarget) * 100 : 0
  const execTotalPeople = filteredExecRows.reduce((s, r) => s + r.person_count, 0)
  const execRanked      = [...filteredExecRows].sort((a, b) => b.kpi_pct - a.kpi_pct)
  const supChartData = supRows
    .filter(r => {
      if (effectiveBranchIds.length === 0) return true
      const b = branches.find(br => br.name === r.branch_name)
      return b ? effectiveBranchIds.includes(b.id) : true
    })
    .map(r => ({
      name:     r.nickname || r.full_name.split(' ')[0],
      fullName: r.full_name,
      branch:   r.branch_name,
      current:  parseFloat(r.team_kpi_pct.toFixed(1)),
      eom:      parseFloat(calcEomPct(r.team_kpi_pct).toFixed(1)),
    }))

  async function handlePullConfigs() {
    if (!token) return
    setCommPulling(true)
    try {
      const res = await window.api.pullCommissionConfigs(token) as { success: boolean; count?: number; error?: string }
      if (res.success) {
        showToast(`Pulled ${res.count ?? 0} commission configs from Google Sheets.`)
        const data = await window.api.getCommissionReport(token, effectiveBranchIds, year, month, dateFrom, dateTo) as { reps: CommRepRow[]; supervisors: CommSupRow[] }
        setCommReps(data.reps); setCommSups(data.supervisors)
      } else { showToast(`Pull failed: ${res.error ?? 'Unknown error'}`) }
    } catch (e) { showToast('Pull failed: ' + String(e)) }
    setCommPulling(false)
  }

  // ── Tabs ───────────────────────────────────────────────────────────────
  const TABS = [
    ...(canSeeOverview ? [{ key: 'company_overview' as const, label: 'Company Overview',      icon: 'leaderboard'        }] : []),
    { key: 'supervisor'    as const, label: 'Supervisor Performance', icon: 'supervisor_account' },
    { key: 'performance'   as const, label: 'Reps Performance',       icon: 'insert_chart'      },
    { key: 'commission'    as const, label: 'Commission',             icon: 'payments'           },
    { key: 'customer_type' as const, label: 'Customer Type Report',   icon: 'group'             },
  ]

  return (
    <AppShell title="SalesTrack Pro">
      {toast && (
        <div className="fixed top-20 right-6 z-50 bg-inverse-surface text-inverse-on-surface px-5 py-3 rounded-xl shadow-lg animate-slide-in text-body-sm">
          {toast}
        </div>
      )}
      {profileRepId != null && token && (
        <RepProfileModal id={profileRepId} token={token} onClose={() => setProfileRepId(null)} />
      )}
      {profileSupId != null && token && (
        <SupProfileModal id={profileSupId} token={token} onClose={() => setProfileSupId(null)} />
      )}

      {/* ── Page Header ────────────────────────────────────────────────── */}
      <div className="mb-5">
        <h2 className="font-headline-lg text-headline-lg text-on-surface">KPI Report</h2>
        <p className="text-on-surface-variant text-body-md mt-0.5">{scopeLabel} — {MONTHS[month - 1]} {year}</p>
      </div>

      {/* ── Shared Filter Bar ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-5 p-4 rounded-2xl bg-surface-container/40 border border-white/20 backdrop-blur-sm">
        <MonthDropdown year={year} month={month} onChange={handleMonthChange} />
        <DateRangeBar year={year} month={month} dateFrom={dateFrom} dateTo={dateTo} maxDate={maxDate}
          onDateFromChange={setDateFrom} onDateToChange={setDateTo} />
        {!isBranchScoped && (
          <BranchDropdown branches={branches} selectedIds={selectedBranchIds} onChange={setSelectedBranchIds} />
        )}
        {showSupFilter && visibleSupervisors.length > 0 && (
          <SupervisorMultiDropdown supervisors={visibleSupervisors} selectedIds={selectedSupIds} onChange={setSelectedSupIds} />
        )}
        <div className="ml-auto flex items-center gap-3">
          <TypeMultiChips value={typeFilter} onChange={setTypeFilter} />
          {user?.role === 'admin' && activeTab === 'commission' && (
            <button onClick={handlePullConfigs} disabled={commPulling}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container text-on-surface text-body-sm hover:bg-surface-container-high transition-colors border border-white/20 disabled:opacity-50">
              <span className={`material-symbols-outlined text-sm text-secondary ${commPulling ? 'animate-spin-slow' : ''}`}>
                {commPulling ? 'sync' : 'cloud_download'}
              </span>
              {commPulling ? 'Pulling...' : 'Pull Configs'}
            </button>
          )}
        </div>
      </div>

      {/* ── Tab Bar ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
        <div className="flex rounded-xl bg-surface-container overflow-hidden border border-white/20 flex-shrink-0">
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

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: Company Overview
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'company_overview' && (
        execLoading ? (
          <div className="flex items-center justify-center h-64 text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin-slow text-4xl">sync</span>
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-card-gap">
            {/* Main KPI card */}
            <GlassCard elevated className="col-span-12 lg:col-span-8 p-8 relative overflow-hidden group">
              <div className="absolute -right-16 -top-16 w-64 h-64 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors duration-700" />
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <span className="bg-primary/10 text-primary px-3 py-1 rounded-full font-label-md text-[10px] uppercase tracking-widest mb-4 inline-block">
                      KPI Score — {MONTHS[month - 1]} {year}
                    </span>
                    <h3 className="font-display-xl text-display-xl text-primary tabular-nums">{fmtPct(execOverallPct)}</h3>
                    <p className="text-on-surface-variant text-body-md mt-1">
                      {fmtPts(execTotalScore)} of {fmtPts(execTotalTarget)} pts across {execTotalPeople} staff
                    </p>
                    <p className="text-[11px] text-on-surface-variant/60 mt-1 font-mono">{dateFrom} → {dateTo}</p>
                  </div>
                  <RadialGauge pct={Math.min(execOverallPct, 100)} label="Overall KPI" size={120} color="#004f96" />
                </div>
                <div className={`grid gap-4 pt-6 border-t border-outline-variant/30 grid-cols-${Math.min(filteredExecRows.length, 4)}`}>
                  {filteredExecRows.map(r => (
                    <div key={r.branch_id}>
                      <p className="text-on-surface-variant font-label-md mb-1 uppercase tracking-wider text-[10px]">{r.branch_name}</p>
                      <p className="font-headline-md text-[20px] font-bold tabular-nums" style={{ color: kpiHex(r.kpi_pct) }}>
                        {fmtPct(r.kpi_pct)}
                      </p>
                      <p className="text-[10px] text-on-surface-variant">{fmtPts(r.kpi_total_score)} / {fmtPts(r.kpi_point_target)} pts</p>
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>

            {/* Branch KPI Progress */}
            <GlassCard className="col-span-12 lg:col-span-4 p-6">
              <h4 className="font-headline-md text-headline-md text-on-surface mb-1">Branch KPI Achievement</h4>
              <p className="text-[10px] text-on-surface-variant mb-4">Current · Est. Month End (day {dayOfMonth} of {daysInMonth})</p>
              <div className="space-y-5">
                {execRanked.map(r => {
                  const pct    = Math.min(r.kpi_pct, 100)
                  const eom    = calcEomPct(r.kpi_pct)
                  const eomCap = Math.min(eom, 100)
                  const color  = kpiHex(r.kpi_pct)
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
                          <span className="text-[10px] text-on-surface-variant ml-1.5">
                            → <span className={eom >= 100 ? 'text-green-600 font-bold' : 'text-tertiary font-semibold'}>{fmtPct(eom)}</span> est.
                          </span>
                        </div>
                      </div>
                      <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden mb-0.5">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <div className="h-1 w-full bg-surface-container-highest rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700 opacity-40" style={{ width: `${eomCap}%`, background: color }} />
                      </div>
                      <p className="text-[10px] text-on-surface-variant mt-1">
                        {fmtPts(r.kpi_total_score)} pts · {r.person_count} staff · Target: {fmtPts(r.per_person_target)} pts/person
                      </p>
                    </div>
                  )
                })}
              </div>
            </GlassCard>

            {/* Team Supervisor Chart */}
            {supChartData.length > 0 && (
              <GlassCard elevated className="col-span-12 p-8">
                <div className="mb-6">
                  <h3 className="font-headline-md text-on-surface">Team Supervisor KPI% Performance</h3>
                  <p className="text-on-surface-variant text-body-sm">
                    Team KPI% per supervisor — Current (solid) vs Est. Month End (faded) — day {dayOfMonth} of {daysInMonth}
                  </p>
                </div>
                <div style={{ height: Math.max(220, supChartData.length * 40) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={supChartData} layout="vertical"
                      margin={{ top: 4, right: 60, bottom: 4, left: 8 }} barCategoryGap="25%" barGap={2}>
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
                        contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                      <Legend iconType="circle" iconSize={8} />
                      <Bar dataKey="current" name="Team KPI % (Current)" radius={[0,4,4,0]} maxBarSize={14}>
                        {supChartData.map((d, i) => <Cell key={i} fill={kpiHex(d.current)} />)}
                        <LabelList dataKey="current" position="right"
                          formatter={(v: number) => `${v.toFixed(1)}%`}
                          style={{ fontSize: 10, fontWeight: 700 }} />
                      </Bar>
                      <Bar dataKey="eom" name="Est. Month End %" radius={[0,4,4,0]} maxBarSize={14} opacity={0.45}>
                        {supChartData.map((d, i) => <Cell key={i} fill={kpiHex(d.eom)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </GlassCard>
            )}

            {/* Branch Rankings Table */}
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
                    {execRanked.map((r, i) => (
                      <tr key={r.branch_id} className="hover:bg-surface-container/20 transition-colors">
                        <td className="px-6 py-3">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs inline-flex ${i === 0 ? 'bg-yellow-500' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-amber-700' : 'bg-surface-container-highest text-on-surface-variant'}`}>
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs" style={{ background: kpiHex(r.kpi_pct) }}>
                              {r.code}
                            </div>
                            <p className="font-bold">{r.branch_name}</p>
                          </div>
                        </td>
                        <td className="px-6 py-3 font-tabular-nums text-on-surface-variant">{r.person_count}</td>
                        <td className="px-6 py-3 font-tabular-nums">{fmt(r.actual_jewelry, 0)} Baht</td>
                        <td className="px-6 py-3 font-tabular-nums">{fmt(r.actual_bar, 0)} Baht</td>
                        <td className="px-6 py-3 font-tabular-nums">{fmt(r.actual_qty, 0)}</td>
                        <td className="px-6 py-3 font-tabular-nums font-bold">{fmtPts(r.kpi_total_score)} pts</td>
                        <td className="px-6 py-3 font-tabular-nums text-on-surface-variant">
                          {fmtPts(r.kpi_point_target)} pts
                          <span className="text-[10px] block text-on-surface-variant/60">{fmtPts(r.per_person_target)}/person</span>
                        </td>
                        <td className="px-6 py-3">
                          <span className="font-bold text-body-sm tabular-nums px-3 py-1 rounded-lg"
                            style={{ background: kpiHex(r.kpi_pct) + '20', color: kpiHex(r.kpi_pct) }}>
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
        )
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: Supervisor Performance
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'supervisor' && (<>
        <div className="flex items-center justify-end mb-5">
          <p className="text-[11px] text-on-surface-variant/70 italic">
            Team KPI % = team total score ÷ branch target × 100
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-card-gap mb-6">
          {[
            { label: 'Total Supervisors', value: filteredSupRows.length,    unit: '',     color: 'border-primary' },
            { label: 'Total Reps',        value: supTotalReps,              unit: 'reps', color: 'border-secondary' },
            { label: 'Avg Team KPI %',    value: fmtPct(supAvgKpi),         unit: '',     color: 'border-tertiary' },
            { label: 'Total Team Score',  value: fmtPts(supTotalScore),     unit: 'pts',  color: 'border-outline-variant' },
          ].map(k => (
            <GlassCard key={k.label} className={`p-5 border-l-4 ${k.color}`}>
              <p className="font-label-md text-label-md text-on-surface-variant uppercase mb-1">{k.label}</p>
              <h3 className="font-display-xl text-display-xl text-on-surface tabular-nums">{k.value}</h3>
              {k.unit && <p className="text-[10px] text-on-surface-variant mt-0.5">{k.unit}</p>}
            </GlassCard>
          ))}
        </div>
        <GlassCard elevated className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-variant/20 border-b border-white/40">
                  <SortTh label="Supervisor"   col="full_name"        sortCol={supSortCol} sortDir={supSortDir} onSort={handleSupSort} />
                  <SortTh label="Branch"       col="branch_name"      sortCol={supSortCol} sortDir={supSortDir} onSort={handleSupSort} />
                  <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Type</th>
                  <SortTh label="Reps"         col="rep_count"        sortCol={supSortCol} sortDir={supSortDir} onSort={handleSupSort} />
                  <SortTh label="Team Score"   col="team_total_score" sortCol={supSortCol} sortDir={supSortDir} onSort={handleSupSort} />
                  <SortTh label="Team KPI %"   col="team_kpi_pct"     sortCol={supSortCol} sortDir={supSortDir} onSort={handleSupSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/20">
                {supLoading ? (
                  <tr><td colSpan={6} className="py-12 text-center text-on-surface-variant">
                    <span className="material-symbols-outlined animate-spin-slow text-2xl block mx-auto mb-2">sync</span>
                    Loading...
                  </td></tr>
                ) : sortedSupRows.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-on-surface-variant text-body-sm">
                    No supervisors found.
                  </td></tr>
                ) : sortedSupRows.map(r => (
                  <tr key={r.id} onClick={() => setProfileSupId(r.id)} className="hover:bg-secondary/[0.06] transition-colors cursor-pointer">
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold uppercase">
                          {r.full_name.slice(0, 1)}
                        </div>
                        <p className="font-label-md text-label-md font-bold">{r.full_name}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-body-sm text-on-surface-variant whitespace-nowrap">{r.branch_name}</td>
                    <td className="px-5 py-3"><TypeBadge type={r.staff_type ?? 'b2c'} /></td>
                    <td className="px-5 py-3 tabular-nums text-on-surface-variant">{r.rep_count}</td>
                    <td className="px-5 py-3 tabular-nums font-semibold">{fmtPts(r.team_total_score)} pts</td>
                    <td className="px-5 py-3">
                      <div className={`inline-flex items-center px-3 py-1 rounded-lg ${kpiBgSup(r.team_kpi_pct)}`}>
                        <span className={`font-tabular-nums font-bold text-body-sm ${kpiColorSup(r.team_kpi_pct)}`}>{fmtPct(r.team_kpi_pct)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sortedSupRows.length > 0 && (
            <div className="px-5 py-3 bg-surface-variant/10 border-t border-white/40 text-body-sm text-on-surface-variant italic">
              Avg Team KPI: <strong>{fmtPct(supAvgKpi)}</strong> · {filteredSupRows.length} supervisor(s) · {supTotalReps} reps
            </div>
          )}
        </GlassCard>
      </>)}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: Reps Performance
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'performance' && (<>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-card-gap mb-8">
          {[
            { label: 'Avg KPI Score %',    value: fmtPct(avgKpiPct),             color: 'border-primary',            sub: `Day ${meta.dayOfMonth} of ${meta.daysInMonth}` },
            { label: 'Avg Est. Month End',  value: fmtPct(avgEomKpiPct),          color: 'border-tertiary',            sub: `${meta.daysRemaining} days remaining` },
            { label: 'Total Jewelry MTD',   value: `${fmt(totalJewelry, 1)} Baht`, color: 'border-secondary-container', sub: `${searched.length} reps${typeFilter.length ? ` (${typeFilter.map(t => t.toUpperCase()).join('/')})` : ''}` },
            { label: 'Total Bar MTD',       value: `${fmt(totalBar, 1)} Baht`,     color: 'border-outline-variant',    sub: `${dateFrom} → ${dateTo}` },
          ].map(k => (
            <GlassCard key={k.label} className={`p-5 border-l-4 ${k.color}`}>
              <p className="font-label-md text-label-md text-on-surface-variant uppercase mb-1">{k.label}</p>
              <h3 className="font-display-xl text-display-xl text-on-surface tabular-nums">{k.value}</h3>
              <p className="text-[10px] text-on-surface-variant mt-1">{k.sub}</p>
            </GlassCard>
          ))}
        </div>

        <div className="relative mb-4 max-w-sm">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">search</span>
          <input type="text" placeholder="Search by name or position..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/60 backdrop-blur-sm border border-white/50 rounded-lg pl-9 pr-4 py-2 text-body-sm outline-none focus:ring-2 focus:ring-primary/20" />
        </div>

        <p className="text-[11px] text-on-surface-variant/60 mb-3 italic">
          KPI % = (Jewelry + Bar + Qty Score) ÷ individual point target &nbsp;·&nbsp;
          Est. Month End = KPI % ÷ Day {meta.dayOfMonth} × {meta.daysInMonth} days
        </p>

        <GlassCard className="overflow-hidden shadow-sm border border-white/40" elevated>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-variant/20 border-b border-white/40">
                  <SortTh label="Representative"  col="full_name"      sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  {isMultiBranch  && <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">Branch</th>}
                  {showSupColumn  && <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">Team Sup</th>}
                  <SortTh label="Jewelry (Baht)"  col="actual_jewelry" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Bar (Baht)"      col="actual_bar"     sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Qty (pcs)"       col="actual_qty"     sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="KPI Score %"     col="kpiPct"         sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Est. Month End"  col="eomKpiPct"      sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
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
                    <tr key={r.id} onClick={() => setProfileRepId(r.id)} className="hover:bg-primary/[0.06] transition-colors cursor-pointer" title="Click to view individual trend">
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
                      {isMultiBranch && <td className="px-5 py-3 text-body-sm text-on-surface-variant whitespace-nowrap">{r.branch_name}</td>}
                      {showSupColumn  && <td className="px-5 py-3 text-body-sm text-on-surface-variant whitespace-nowrap">{r.supervisor_name ?? '—'}</td>}
                      <td className="px-5 py-3 font-tabular-nums text-body-sm font-bold">{fmt(r.actual_jewelry)} Baht</td>
                      <td className="px-5 py-3 font-tabular-nums text-body-sm font-bold">{fmt(r.actual_bar)} Baht</td>
                      <td className="px-5 py-3 font-tabular-nums text-body-sm font-bold">{r.actual_qty}</td>
                      <td className="px-5 py-3">
                        <div className={`inline-flex flex-col items-center px-3 py-1 rounded-lg ${kpiBg(pct)}`}>
                          <span className={`font-tabular-nums font-bold text-body-sm ${kpiColor(pct)}`}>{fmtPct(pct)}</span>
                          <span className="text-[9px] text-on-surface-variant tabular-nums">{r.kpiScore.total.toLocaleString('en-US', { maximumFractionDigits: 0 })} pts</span>
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
      </>)}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: Customer Type Report
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'customer_type' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { type: 'B2C', stats: b2cStats, color: 'border-primary',   bg: 'bg-primary/5',   textColor: 'text-primary' },
              { type: 'B2B', stats: b2bStats, color: 'border-secondary', bg: 'bg-secondary/5', textColor: 'text-secondary' },
            ].map(({ type, stats, color, bg, textColor }) => (
              <GlassCard key={type} className={`p-6 border-l-4 ${color}`} elevated>
                <div className="flex items-center gap-3 mb-5">
                  <div className={`px-3 py-1 rounded-full ${bg} ${textColor} font-bold text-sm`}>{type}</div>
                  <span className="text-on-surface-variant text-body-sm">{stats.count} representatives</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Jewelry MTD',   value: `${fmt(stats.totalJewelry, 1)} Baht` },
                    { label: 'Bar MTD',       value: `${fmt(stats.totalBar, 1)} Baht` },
                    { label: 'Qty MTD',       value: stats.totalQty.toLocaleString() + ' pcs' },
                    { label: 'Total KPI Pts', value: stats.totalPts.toLocaleString('en-US', { maximumFractionDigits: 0 }) },
                    { label: 'Avg KPI %',     value: fmtPct(stats.avgKpiPct) },
                    { label: 'Avg Est. EOM',  value: fmtPct(stats.avgEomPct) },
                  ].map(item => (
                    <div key={item.label} className="rounded-lg bg-white/40 p-3">
                      <p className="text-[10px] text-on-surface-variant uppercase font-bold mb-1">{item.label}</p>
                      <p className={`font-tabular-nums font-bold text-body-sm ${textColor}`}>{item.value}</p>
                    </div>
                  ))}
                </div>
              </GlassCard>
            ))}
          </div>

          {[
            { type: 'b2c', label: 'B2C Staff', labelColor: 'text-primary',   rows: shownB2c },
            { type: 'b2b', label: 'B2B Staff', labelColor: 'text-secondary', rows: shownB2b },
          ].map(({ type, label, labelColor, rows: typeRows }) => typeRows.length === 0 ? null : (
            <GlassCard key={type} className="overflow-hidden shadow-sm border border-white/40" elevated>
              <div className="px-5 py-4 border-b border-white/30 flex items-center gap-3">
                <span className={`font-headline-md text-headline-md ${labelColor}`}>{label}</span>
                <span className="text-on-surface-variant text-body-sm">{typeRows.length} reps</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-variant/20 border-b border-white/40">
                      <SortTh label="Representative"  col="full_name"      sortCol={custSortCol} sortDir={custSortDir} onSort={handleCustSort} />
                      {isMultiBranch && <th className="px-5 py-3 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Branch</th>}
                      <SortTh label="Jewelry (Baht)"  col="actual_jewelry" sortCol={custSortCol} sortDir={custSortDir} onSort={handleCustSort} />
                      <SortTh label="Bar (Baht)"      col="actual_bar"     sortCol={custSortCol} sortDir={custSortDir} onSort={handleCustSort} />
                      <SortTh label="Qty"             col="actual_qty"     sortCol={custSortCol} sortDir={custSortDir} onSort={handleCustSort} right />
                      <SortTh label="KPI %"           col="kpiPct"         sortCol={custSortCol} sortDir={custSortDir} onSort={handleCustSort} right />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/20">
                    {loading ? (
                      <tr><td colSpan={6} className="py-8 text-center text-on-surface-variant text-body-sm">Loading...</td></tr>
                    ) : sortTypeRows(typeRows).map(r => (
                      <tr key={r.id} onClick={() => setProfileRepId(r.id)} className="hover:bg-primary/[0.06] transition-colors cursor-pointer">
                        <td className="px-5 py-3 whitespace-nowrap">
                          <p className="font-label-md text-label-md font-bold">{r.full_name}</p>
                          <p className="text-[10px] text-on-surface-variant font-mono">{r.rep_code ?? r.supervisor_name ?? '—'}</p>
                        </td>
                        {isMultiBranch && <td className="px-5 py-3 text-body-sm text-on-surface-variant">{r.branch_name}</td>}
                        <td className="px-5 py-3 text-right font-tabular-nums text-body-sm font-bold">{fmt(r.actual_jewelry)} Baht</td>
                        <td className="px-5 py-3 text-right font-tabular-nums text-body-sm font-bold">{fmt(r.actual_bar)} Baht</td>
                        <td className="px-5 py-3 text-right font-tabular-nums text-body-sm">{r.actual_qty}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={`font-tabular-nums font-bold text-body-sm ${kpiColor(r.kpiScore.pct)}`}>{fmtPct(r.kpiScore.pct)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: Commission
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'commission' && (<>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-card-gap mb-8">
          {[
            { label: 'Total Rep Commission',  value: fmtLak(commTotalRep), color: 'border-primary',   icon: 'payments',           sub: `${commReps.length} reps` },
            { label: 'Total Sup Commission',  value: fmtLak(commTotalSup), color: 'border-secondary', icon: 'supervisor_account', sub: `${commSups.length} supervisors` },
            { label: 'B2C Commission',         value: fmtLak(commTotalB2c), color: 'border-tertiary',  icon: 'person',             sub: `${commReps.filter(r => r.staff_type === 'b2c').length} reps` },
            { label: 'B2B Commission',         value: fmtLak(commTotalB2b), color: 'border-error',     icon: 'business',           sub: `${commReps.filter(r => r.staff_type === 'b2b').length} reps` },
          ].map(k => (
            <GlassCard key={k.label} className={`p-5 border-l-4 ${k.color}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="material-symbols-outlined text-sm text-on-surface-variant">{k.icon}</span>
                <p className="font-label-md text-label-md text-on-surface-variant uppercase">{k.label}</p>
              </div>
              <h3 className="font-display-xl text-display-xl text-on-surface tabular-nums text-[22px]">{k.value}</h3>
              <p className="text-[10px] text-on-surface-variant mt-1">{k.sub}</p>
            </GlassCard>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="flex rounded-xl bg-surface-container overflow-hidden border border-white/20">
            {(['reps', 'supervisors'] as const).map(tab => (
              <button key={tab} onClick={() => setCommSubTab(tab)}
                className={`px-5 py-2.5 font-label-md text-label-md transition-colors capitalize
                  ${commSubTab === tab ? 'bg-primary text-white' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
                {tab === 'reps' ? 'Staff Commission' : 'Supervisor Commission'}
              </button>
            ))}
          </div>
          <div className="relative ml-auto">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">search</span>
            <input type="text" placeholder="Search name..."
              value={commSearch} onChange={e => setCommSearch(e.target.value)}
              className="bg-white/60 backdrop-blur-sm border border-white/50 rounded-lg pl-9 pr-4 py-2 text-body-sm outline-none focus:ring-2 focus:ring-primary/20 w-48" />
          </div>
        </div>

        {commSubTab === 'reps' && (
          <GlassCard className="overflow-hidden shadow-sm border border-white/40" elevated>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-variant/20 border-b border-white/40">
                    <SortTh label="Representative"  col="full_name"      sortCol={commRepSortCol} sortDir={commRepSortDir} onSort={handleCommRepSort} />
                    {isMultiBranch && <SortTh label="Branch"  col="branch_name"    sortCol={commRepSortCol} sortDir={commRepSortDir} onSort={handleCommRepSort} />}
                    <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Type</th>
                    <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">Team Sup</th>
                    <SortTh label="Jewelry (Baht)"  col="actual_jewelry" sortCol={commRepSortCol} sortDir={commRepSortDir} onSort={handleCommRepSort} right />
                    <SortTh label="Bar (Baht)"      col="actual_bar"     sortCol={commRepSortCol} sortDir={commRepSortDir} onSort={handleCommRepSort} right />
                    <SortTh label="Qty"             col="actual_qty"     sortCol={commRepSortCol} sortDir={commRepSortDir} onSort={handleCommRepSort} right />
                    <SortTh label="Commission (₭)"  col="commission_lak" sortCol={commRepSortCol} sortDir={commRepSortDir} onSort={handleCommRepSort} right />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/20">
                  {commLoading ? (
                    <tr><td colSpan={8} className="py-12 text-center text-on-surface-variant">
                      <span className="material-symbols-outlined animate-spin-slow text-2xl block mx-auto mb-2">sync</span>
                      Loading commission data...
                    </td></tr>
                  ) : sortedCommReps.length === 0 ? (
                    <tr><td colSpan={8} className="py-8 text-center text-on-surface-variant text-body-sm">No results found.</td></tr>
                  ) : sortedCommReps.map(r => (
                    <tr key={r.id} className="hover:bg-primary/[0.02] transition-colors">
                      <td className="px-5 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold uppercase
                            ${r.staff_type === 'b2b' ? 'bg-secondary/10 text-secondary' : 'bg-primary/10 text-primary'}`}>
                            {r.full_name.slice(0,1)}
                          </div>
                          <p className="font-label-md text-label-md font-bold">{r.full_name}</p>
                        </div>
                      </td>
                      {isMultiBranch && <td className="px-5 py-3 text-body-sm text-on-surface-variant whitespace-nowrap">{r.branch_name}</td>}
                      <td className="px-5 py-3"><TypeBadge type={r.staff_type} /></td>
                      <td className="px-5 py-3 text-body-sm text-on-surface-variant whitespace-nowrap">{r.supervisor_name ?? '—'}</td>
                      <td className="px-5 py-3 text-right font-tabular-nums text-body-sm font-bold">{fmt(r.actual_jewelry, 1)}</td>
                      <td className="px-5 py-3 text-right font-tabular-nums text-body-sm font-bold">{fmt(r.actual_bar, 1)}</td>
                      <td className="px-5 py-3 text-right font-tabular-nums text-body-sm">{r.actual_qty}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex flex-col items-end">
                          <span className="font-tabular-nums font-bold text-body-sm text-tertiary">{fmtLak(r.commission_lak)}</span>
                          {r.rate_applied && (
                            <span className="text-[9px] text-on-surface-variant/60 whitespace-nowrap">
                              j×{r.rate_applied.jewelry_rate_lak} · b×{r.rate_applied.bar_rate_lak} · q×{r.rate_applied.qty_rate_lak}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {!commLoading && sortedCommReps.length > 0 && (
                  <tfoot>
                    <tr className="bg-surface-variant/20 border-t border-white/40">
                      <td colSpan={isMultiBranch ? 4 : 3} className="px-5 py-3 font-label-md text-label-md text-on-surface-variant uppercase">
                        Total ({sortedCommReps.length} reps)
                      </td>
                      <td className="px-5 py-3 text-right font-tabular-nums font-bold text-body-sm">{fmt(sortedCommReps.reduce((s, r) => s + r.actual_jewelry, 0), 1)}</td>
                      <td className="px-5 py-3 text-right font-tabular-nums font-bold text-body-sm">{fmt(sortedCommReps.reduce((s, r) => s + r.actual_bar, 0), 1)}</td>
                      <td className="px-5 py-3 text-right font-tabular-nums font-bold text-body-sm">{sortedCommReps.reduce((s, r) => s + r.actual_qty, 0)}</td>
                      <td className="px-5 py-3 text-right font-tabular-nums font-bold text-tertiary">{fmtLak(commTotalRep)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </GlassCard>
        )}

        {commSubTab === 'supervisors' && (
          <GlassCard className="overflow-hidden shadow-sm border border-white/40" elevated>
            <div className="p-4 border-b border-white/30 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-sm">info</span>
              <p className="text-body-sm text-on-surface-variant">
                Supervisor commission = <strong className="text-secondary">{commSups[0]?.sup_pct ?? 30}%</strong> of their team's total rep commission
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-variant/20 border-b border-white/40">
                    <SortTh label="Supervisor"           col="full_name"               sortCol={commSupSortCol} sortDir={commSupSortDir} onSort={handleCommSupSort} />
                    {isMultiBranch && <SortTh label="Branch" col="branch_name"         sortCol={commSupSortCol} sortDir={commSupSortDir} onSort={handleCommSupSort} />}
                    <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Type</th>
                    <SortTh label="Team Commission"      col="team_commission_lak"     sortCol={commSupSortCol} sortDir={commSupSortDir} onSort={handleCommSupSort} right />
                    <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-right whitespace-nowrap">Rate</th>
                    <SortTh label="Sup Commission (₭)"  col="supervisor_commission_lak" sortCol={commSupSortCol} sortDir={commSupSortDir} onSort={handleCommSupSort} right />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/20">
                  {commLoading ? (
                    <tr><td colSpan={6} className="py-12 text-center text-on-surface-variant">
                      <span className="material-symbols-outlined animate-spin-slow text-2xl block mx-auto mb-2">sync</span>
                      Loading...
                    </td></tr>
                  ) : sortedCommSups.length === 0 ? (
                    <tr><td colSpan={6} className="py-8 text-center text-on-surface-variant text-body-sm">No supervisors found.</td></tr>
                  ) : sortedCommSups.map(s => (
                    <tr key={s.id} className="hover:bg-secondary/[0.02] transition-colors">
                      <td className="px-5 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-secondary/10 text-secondary flex items-center justify-center text-xs font-bold uppercase">
                            {s.full_name.slice(0,1)}
                          </div>
                          <p className="font-label-md text-label-md font-bold">{s.full_name}</p>
                        </div>
                      </td>
                      {isMultiBranch && <td className="px-5 py-3 text-body-sm text-on-surface-variant whitespace-nowrap">{s.branch_name}</td>}
                      <td className="px-5 py-3"><TypeBadge type={s.staff_type} /></td>
                      <td className="px-5 py-3 text-right font-tabular-nums text-body-sm">{fmtLak(s.team_commission_lak)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-secondary/10 text-secondary text-[11px] font-bold">
                          {s.sup_pct}%
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="font-tabular-nums font-bold text-body-sm text-tertiary">{fmtLak(s.supervisor_commission_lak)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {!commLoading && sortedCommSups.length > 0 && (
                  <tfoot>
                    <tr className="bg-surface-variant/20 border-t border-white/40">
                      <td colSpan={isMultiBranch ? 3 : 2} className="px-5 py-3 font-label-md text-label-md text-on-surface-variant uppercase">
                        Total ({sortedCommSups.length} supervisors)
                      </td>
                      <td className="px-5 py-3 text-right font-tabular-nums font-bold text-body-sm">
                        {fmtLak(sortedCommSups.reduce((s, r) => s + r.team_commission_lak, 0))}
                      </td>
                      <td />
                      <td className="px-5 py-3 text-right font-tabular-nums font-bold text-tertiary">{fmtLak(commTotalSup)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </GlassCard>
        )}

        {!commLoading && commReps.length > 0 && commReps[0]?.rate_applied && (
          <div className="mt-4 flex flex-wrap gap-4">
            {(['b2c', 'b2b'] as const).map(type => {
              const rep = commReps.find(r => r.staff_type === type && r.rate_applied)
              if (!rep?.rate_applied) return null
              return (
                <GlassCard key={type} className="p-4 flex items-center gap-4">
                  <TypeBadge type={type} />
                  <div className="text-[11px] text-on-surface-variant space-x-3">
                    <span>Jewelry: <strong className="text-on-surface">{fmtLak(rep.rate_applied.jewelry_rate_lak)}/Baht</strong></span>
                    <span>Bar: <strong className="text-on-surface">{fmtLak(rep.rate_applied.bar_rate_lak)}/Baht</strong></span>
                    <span>Qty: <strong className="text-on-surface">{fmtLak(rep.rate_applied.qty_rate_lak)}/pc</strong></span>
                  </div>
                </GlassCard>
              )
            })}
          </div>
        )}
      </>)}

    </AppShell>
  )
}
