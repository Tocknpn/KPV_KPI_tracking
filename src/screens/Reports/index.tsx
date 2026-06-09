import { useEffect, useState, useRef } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { MonthDropdown, DateRangeBar } from '../../components/ui/PeriodFilter'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import { getDefaultDateRange } from '../../utils/dates'
import type { MonthlyReportRow, TeamPerformanceRow } from '../../types'
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

type StaffTypeFilter = 'all' | 'b2c' | 'b2b'
type ReportTab = 'performance' | 'customer_type' | 'supervisor' | 'commission'

// ── Utility functions ─────────────────────────────────────────────────────
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

// ── TypeBadge ─────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider
      ${type === 'b2b' ? 'bg-secondary/10 text-secondary' : 'bg-primary/10 text-primary'}`}>
      {type.toUpperCase()}
    </span>
  )
}

// ── Sortable column header (string-typed for reuse across all tables) ─────
function SortTh({ label, col, sortCol, sortDir, onSort, className = '', right = false }: {
  label: string; col: string; sortCol: string; sortDir: 'asc' | 'desc'
  onSort: (c: string) => void; className?: string; right?: boolean
}) {
  const active = sortCol === col
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-primary transition-colors ${active ? 'text-primary' : ''} ${className}`}
    >
      <div className={`flex items-center gap-1 ${right ? 'justify-end' : ''}`}>
        {label}
        <span className={`material-symbols-outlined text-sm transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}>
          {sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
        </span>
      </div>
    </th>
  )
}

// ── TypeChips (shared filter chips) ──────────────────────────────────────
function TypeChips({ value, onChange }: { value: StaffTypeFilter; onChange: (v: StaffTypeFilter) => void }) {
  return (
    <div className="flex gap-2">
      {(['all', 'b2c', 'b2b'] as const).map(t => (
        <button key={t} onClick={() => onChange(t)}
          className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors
            ${value === t
              ? t === 'b2b' ? 'bg-secondary text-white' : t === 'b2c' ? 'bg-primary text-white' : 'bg-on-surface text-surface'
              : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
          {t === 'all' ? 'All Types' : t.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

// ── Supervisor single-select dropdown ─────────────────────────────────────
function SupervisorDropdown({ supervisors, selectedId, onChange }: {
  supervisors: Array<{ id: number; full_name: string; branch_name: string }>
  selectedId: number | null; onChange: (id: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onOut(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])
  const label = selectedId == null ? 'All Supervisors'
    : supervisors.find(s => s.id === selectedId)?.full_name ?? 'Supervisor'
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container text-on-surface text-body-sm hover:bg-surface-container-high transition-colors border border-white/20">
        <span className="material-symbols-outlined text-sm text-secondary">supervisor_account</span>
        {label}
        <span className="material-symbols-outlined text-sm">{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 bg-white/95 backdrop-blur-xl shadow-xl rounded-xl border border-white/40 z-50 min-w-56 py-1 max-h-72 overflow-y-auto">
          <label className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-primary/5 cursor-pointer"
            onClick={() => { onChange(null); setOpen(false) }}>
            <input type="radio" checked={selectedId == null} readOnly className="accent-primary" />
            <span className="text-body-sm">All Supervisors</span>
          </label>
          {supervisors.length > 0 && <div className="border-t border-black/5 my-1" />}
          {supervisors.map(s => (
            <label key={s.id} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-primary/5 cursor-pointer"
              onClick={() => { onChange(s.id); setOpen(false) }}>
              <input type="radio" checked={selectedId === s.id} readOnly className="accent-primary" />
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

// ── Branch multi-select dropdown ──────────────────────────────────────────
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

// ── Main screen ───────────────────────────────────────────────────────────
export default function Reports() {
  const { token, user, branches } = useAuthStore()
  const { selectedBranchIds, setSelectedBranchIds } = useAppStore()

  // ── Shared date state ──────────────────────────────────────────────────
  const now = new Date()
  const [year, setYear]     = useState(now.getFullYear())
  const [month, setMonth]   = useState(now.getMonth() + 1)
  const initRange = getDefaultDateRange(now.getFullYear(), now.getMonth() + 1)
  const [dateFrom, setDateFrom] = useState(initRange.dateFrom)
  const [dateTo, setDateTo]     = useState(initRange.dateTo)
  function handleMonthChange(y: number, m: number) {
    setYear(y); setMonth(m)
    const { dateFrom: df, dateTo: dt } = getDefaultDateRange(y, m)
    setDateFrom(df); setDateTo(dt)
  }
  const maxDate = getDefaultDateRange(year, month).dateTo

  // ── Tab ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ReportTab>('performance')

  // ── Toast ──────────────────────────────────────────────────────────────
  const [toast, setToast] = useState('')
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500) }

  // ── Scope helpers ──────────────────────────────────────────────────────
  const isBranchScoped = user?.role === 'supervisor' || user?.role === 'branch_manager'
  const effectiveBranchIds: number[] = isBranchScoped
    ? [user.branchId ?? 1]
    : selectedBranchIds
  const isMultiBranch = effectiveBranchIds.length !== 1
  const showSupFilter = user?.role === 'branch_manager' || user?.role === 'executive' || user?.role === 'admin'

  const scopeLabel = isBranchScoped
    ? branches.find(b => b.id === user?.branchId)?.name ?? 'My Branch'
    : effectiveBranchIds.length === 0 ? 'All Branches'
    : effectiveBranchIds.length === 1 ? (branches.find(b => b.id === effectiveBranchIds[0])?.name ?? '1 Branch')
    : `${effectiveBranchIds.length} Branches`

  // ── Performance tab state ──────────────────────────────────────────────
  const [rows, setRows]         = useState<MonthlyReportRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [meta, setMeta]         = useState({ daysInMonth: 30, dayOfMonth: 1, daysRemaining: 29 })
  const [search, setSearch]     = useState('')
  const [sortCol, setSortCol]   = useState('kpiPct')
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('desc')
  const [selectedSupId, setSelectedSupId] = useState<number | null>(null)
  const [supervisors, setSupervisors] = useState<Array<{ id: number; full_name: string; branch_name: string }>>([])
  const [typeFilter, setTypeFilter]   = useState<StaffTypeFilter>('all')
  // Customer type sort
  const [custSortCol, setCustSortCol] = useState('kpiPct')
  const [custSortDir, setCustSortDir] = useState<'asc' | 'desc'>('desc')

  // ── Supervisor Performance tab state ───────────────────────────────────
  const [supRows, setSupRows]       = useState<TeamPerformanceRow[]>([])
  const [supLoading, setSupLoading] = useState(false)
  const [supTypeFilter, setSupTypeFilter] = useState<StaffTypeFilter>('all')
  const [supSortCol, setSupSortCol] = useState('team_kpi_pct')
  const [supSortDir, setSupSortDir] = useState<'asc' | 'desc'>('desc')

  // ── Individual profile modal state ────────────────────────────────────
  const [profileRepId, setProfileRepId] = useState<number | null>(null)
  const [profileSupId, setProfileSupId] = useState<number | null>(null)

  // ── Commission tab state ───────────────────────────────────────────────
  const [commReps, setCommReps]   = useState<CommRepRow[]>([])
  const [commSups, setCommSups]   = useState<CommSupRow[]>([])
  const [commLoading, setCommLoading] = useState(false)
  const [commSubTab, setCommSubTab]   = useState<'reps' | 'supervisors'>('reps')
  const [commTypeFilter, setCommTypeFilter] = useState<StaffTypeFilter>('all')
  const [commSearch, setCommSearch]         = useState('')
  const [commRepSortCol, setCommRepSortCol] = useState('commission_lak')
  const [commRepSortDir, setCommRepSortDir] = useState<'asc' | 'desc'>('desc')
  const [commSupSortCol, setCommSupSortCol] = useState('supervisor_commission_lak')
  const [commSupSortDir, setCommSupSortDir] = useState<'asc' | 'desc'>('desc')
  const [commPulling, setCommPulling]       = useState(false)

  // ── Load supervisors list (for filter dropdown) ────────────────────────
  useEffect(() => {
    if (!token || !showSupFilter) return
    const branchId = user?.role === 'branch_manager' ? (user.branchId ?? undefined) : undefined
    window.api.getSupervisors(token, branchId)
      .then(data => setSupervisors(data as Array<{ id: number; full_name: string; branch_name: string }>))
      .catch(console.error)
  }, [token, user?.role, user?.branchId])

  useEffect(() => { setSelectedSupId(null) }, [JSON.stringify(effectiveBranchIds)])

  // ── Load all tab data when filters change ──────────────────────────────
  useEffect(() => {
    if (!token) return

    // Performance
    setLoading(true)
    window.api.getMonthlyReport(token, effectiveBranchIds, year, month, dateFrom, dateTo, selectedSupId ?? undefined)
      .then(data => { setRows(data.rows); setMeta({ daysInMonth: data.daysInMonth, dayOfMonth: data.dayOfMonth, daysRemaining: data.daysRemaining }) })
      .catch(console.error)
      .finally(() => setLoading(false))

    // Supervisor Performance
    setSupLoading(true)
    window.api.getTeamPerformance(token, effectiveBranchIds, year, month, dateFrom, dateTo)
      .then(data => setSupRows(data as TeamPerformanceRow[]))
      .catch(console.error)
      .finally(() => setSupLoading(false))

    // Commission
    setCommLoading(true)
    window.api.getCommissionReport(token, effectiveBranchIds, year, month, dateFrom, dateTo)
      .then((data: { reps: CommRepRow[]; supervisors: CommSupRow[] }) => { setCommReps(data.reps); setCommSups(data.supervisors) })
      .catch(console.error)
      .finally(() => setCommLoading(false))
  }, [token, JSON.stringify(effectiveBranchIds), year, month, dateFrom, dateTo, selectedSupId])

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

  // ── Performance tab derived data ───────────────────────────────────────
  const searched = rows.filter(r =>
    (typeFilter === 'all' || r.staff_type === typeFilter) &&
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
  const showSupColumn = showSupFilter && selectedSupId == null

  const avgKpiPct    = rows.length ? rows.reduce((s, r) => s + r.kpiScore.pct, 0) / rows.length : 0
  const avgEomKpiPct = rows.length ? rows.reduce((s, r) => s + r.eomKpiPct, 0) / rows.length : 0
  const totalJewelry = rows.reduce((s, r) => s + r.actual_jewelry, 0)
  const totalBar     = rows.reduce((s, r) => s + r.actual_bar, 0)

  const visibleSupervisors = user?.role === 'branch_manager' ? supervisors
    : selectedBranchIds.length > 0
      ? supervisors.filter(s => { const b = branches.find(br => br.name === s.branch_name); return b ? selectedBranchIds.includes(b.id) : true })
      : supervisors

  // ── Customer type tab derived data ─────────────────────────────────────
  const b2cRows = rows.filter(r => r.staff_type === 'b2c')
  const b2bRows = rows.filter(r => r.staff_type === 'b2b')
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

  // ── Supervisor tab derived data ────────────────────────────────────────
  const filteredSupRows = supRows.filter(r => supTypeFilter === 'all' || r.staff_type === supTypeFilter)
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

  // ── Commission tab derived data ────────────────────────────────────────
  const filteredCommReps = commReps.filter(r =>
    (commTypeFilter === 'all' || r.staff_type === commTypeFilter) &&
    (!commSearch || r.full_name.toLowerCase().includes(commSearch.toLowerCase()))
  )
  const filteredCommSups = commSups.filter(s =>
    (commTypeFilter === 'all' || s.staff_type === commTypeFilter) &&
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
      case 'full_name':               return a.full_name.localeCompare(b.full_name) * mul
      case 'branch_name':             return (a.branch_name ?? '').localeCompare(b.branch_name ?? '') * mul
      case 'team_commission_lak':     return (a.team_commission_lak - b.team_commission_lak) * mul
      case 'supervisor_commission_lak': return (a.supervisor_commission_lak - b.supervisor_commission_lak) * mul
      default: return 0
    }
  })
  const commTotalRep = filteredCommReps.reduce((s, r) => s + r.commission_lak, 0)
  const commTotalSup = filteredCommSups.reduce((s, r) => s + r.supervisor_commission_lak, 0)
  const commTotalB2c = commReps.filter(r => r.staff_type === 'b2c').reduce((s, r) => s + r.commission_lak, 0)
  const commTotalB2b = commReps.filter(r => r.staff_type === 'b2b').reduce((s, r) => s + r.commission_lak, 0)

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

  // ── Tab bar ────────────────────────────────────────────────────────────
  const TABS = [
    { key: 'performance',  label: 'Performance Tracking',  icon: 'insert_chart' },
    { key: 'customer_type',label: 'Customer Type Report',   icon: 'group' },
    { key: 'supervisor',   label: 'Supervisor Performance', icon: 'supervisor_account' },
    { key: 'commission',   label: 'Commission',             icon: 'payments' },
  ] as const

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

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div>
          <nav className="flex items-center gap-2 text-label-md text-on-surface-variant mb-2">
            <span>Reports</span>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="text-primary">{TABS.find(t => t.key === activeTab)?.label}</span>
          </nav>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">
            {activeTab === 'commission' ? 'Commission Report' : activeTab === 'supervisor' ? 'Supervisor Team KPI' : 'Monthly Tracking Report'}
          </h2>
          <p className="text-on-surface-variant text-body-md mt-1">{scopeLabel} — {MONTHS[month - 1]} {year}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <MonthDropdown year={year} month={month} onChange={handleMonthChange} />
          <DateRangeBar year={year} month={month} dateFrom={dateFrom} dateTo={dateTo} maxDate={maxDate}
            onDateFromChange={setDateFrom} onDateToChange={setDateTo} />
          {!isBranchScoped && (
            <BranchDropdown branches={branches} selectedIds={selectedBranchIds} onChange={setSelectedBranchIds} />
          )}
          {showSupFilter && activeTab === 'performance' && (
            <SupervisorDropdown supervisors={visibleSupervisors} selectedId={selectedSupId} onChange={setSelectedSupId} />
          )}
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

      {/* ── Tab bar ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <div className="flex rounded-xl bg-surface-container overflow-hidden border border-white/20">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 font-label-md text-label-md transition-colors
                ${activeTab === t.key ? 'bg-primary text-white' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
              <span className="material-symbols-outlined text-sm">{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
        {/* Type chips — shown for performance and customer_type tabs inline */}
        {(activeTab === 'performance' || activeTab === 'customer_type') && (
          <div className="ml-auto">
            <TypeChips value={typeFilter} onChange={setTypeFilter} />
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: Performance Tracking
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'performance' && (<>
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-card-gap mb-8">
          {[
            { label: 'Avg KPI Score %',   value: fmtPct(avgKpiPct),    color: 'border-primary',            sub: `Day ${meta.dayOfMonth} of ${meta.daysInMonth}` },
            { label: 'Avg Est. Month End', value: fmtPct(avgEomKpiPct), color: 'border-tertiary',            sub: `${meta.daysRemaining} days remaining` },
            { label: 'Total Jewelry MTD',  value: `${fmt(totalJewelry, 1)} Baht`, color: 'border-secondary-container', sub: `${searched.length} reps${typeFilter !== 'all' ? ` (${typeFilter.toUpperCase()})` : ''}` },
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
                  <SortTh label="Representative" col="full_name"      sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  {isMultiBranch && <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">Branch</th>}
                  {showSupColumn  && <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">Team Sup</th>}
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
                    { label: 'Jewelry MTD', value: `${fmt(stats.totalJewelry, 1)} Baht` },
                    { label: 'Bar MTD',     value: `${fmt(stats.totalBar, 1)} Baht` },
                    { label: 'Qty MTD',     value: stats.totalQty.toLocaleString() + ' pcs' },
                    { label: 'Total KPI Pts', value: stats.totalPts.toLocaleString('en-US', { maximumFractionDigits: 0 }) },
                    { label: 'Avg KPI %',   value: fmtPct(stats.avgKpiPct) },
                    { label: 'Avg Est. EOM',value: fmtPct(stats.avgEomPct) },
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
            { type: 'b2c', label: 'B2C Staff', labelColor: 'text-primary',   rows: typeFilter === 'b2b' ? [] : b2cRows },
            { type: 'b2b', label: 'B2B Staff', labelColor: 'text-secondary', rows: typeFilter === 'b2c' ? [] : b2bRows },
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
                      <SortTh label="Representative" col="full_name"      sortCol={custSortCol} sortDir={custSortDir} onSort={handleCustSort} />
                      {isMultiBranch && <th className="px-5 py-3 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Branch</th>}
                      <SortTh label="Jewelry (Baht)" col="actual_jewelry" sortCol={custSortCol} sortDir={custSortDir} onSort={handleCustSort} />
                      <SortTh label="Bar (Baht)"     col="actual_bar"     sortCol={custSortCol} sortDir={custSortDir} onSort={handleCustSort} />
                      <SortTh label="Qty"            col="actual_qty"     sortCol={custSortCol} sortDir={custSortDir} onSort={handleCustSort} right />
                      <SortTh label="KPI %"          col="kpiPct"         sortCol={custSortCol} sortDir={custSortDir} onSort={handleCustSort} right />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/20">
                    {loading ? (
                      <tr><td colSpan={6} className="py-8 text-center text-on-surface-variant text-body-sm">Loading...</td></tr>
                    ) : sortTypeRows(typeRows).map(r => (
                      <tr key={r.id} onClick={() => setProfileRepId(r.id)} className="hover:bg-primary/[0.06] transition-colors cursor-pointer" title="Click to view individual trend">
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
          TAB: Supervisor Performance
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'supervisor' && (<>
        {/* Type chips + sub-label */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <TypeChips value={supTypeFilter} onChange={setSupTypeFilter} />
          <p className="text-[11px] text-on-surface-variant/70 italic">
            Team KPI % = team total score ÷ branch target × 100
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-card-gap mb-6">
          {[
            { label: 'Total Supervisors', value: filteredSupRows.length,      unit: '',    color: 'border-primary' },
            { label: 'Total Reps',        value: supTotalReps,                unit: 'reps', color: 'border-secondary' },
            { label: 'Avg Team KPI %',    value: fmtPct(supAvgKpi),           unit: '',    color: 'border-tertiary' },
            { label: 'Total Team Score',  value: fmtPts(supTotalScore),       unit: 'pts', color: 'border-outline-variant' },
          ].map(k => (
            <GlassCard key={k.label} className={`p-5 border-l-4 ${k.color}`}>
              <p className="font-label-md text-label-md text-on-surface-variant uppercase mb-1">{k.label}</p>
              <h3 className="font-display-xl text-display-xl text-on-surface tabular-nums">{k.value}</h3>
              {k.unit && <p className="text-[10px] text-on-surface-variant mt-0.5">{k.unit}</p>}
            </GlassCard>
          ))}
        </div>

        {/* Table */}
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
                    No supervisors found for current filters.
                  </td></tr>
                ) : sortedSupRows.map(r => (
                  <tr key={r.id} onClick={() => setProfileSupId(r.id)} className="hover:bg-secondary/[0.06] transition-colors cursor-pointer" title="Click to view team trend">
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
          TAB: Commission
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'commission' && (<>
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-card-gap mb-8">
          {[
            { label: 'Total Rep Commission', value: fmtLak(commTotalRep), color: 'border-primary',   icon: 'payments',            sub: `${commReps.length} reps` },
            { label: 'Total Sup Commission', value: fmtLak(commTotalSup), color: 'border-secondary', icon: 'supervisor_account',  sub: `${commSups.length} supervisors` },
            { label: 'B2C Commission',        value: fmtLak(commTotalB2c), color: 'border-tertiary',  icon: 'person',              sub: `${commReps.filter(r => r.staff_type === 'b2c').length} reps` },
            { label: 'B2B Commission',        value: fmtLak(commTotalB2b), color: 'border-error',     icon: 'business',            sub: `${commReps.filter(r => r.staff_type === 'b2b').length} reps` },
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

        {/* Sub-tab + filter bar */}
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
          <TypeChips value={commTypeFilter} onChange={setCommTypeFilter} />
          <div className="relative ml-auto">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">search</span>
            <input type="text" placeholder="Search name..."
              value={commSearch} onChange={e => setCommSearch(e.target.value)}
              className="bg-white/60 backdrop-blur-sm border border-white/50 rounded-lg pl-9 pr-4 py-2 text-body-sm outline-none focus:ring-2 focus:ring-primary/20 w-48" />
          </div>
        </div>

        {/* Staff Commission table */}
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

        {/* Supervisor Commission table */}
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
                    <SortTh label="Supervisor"        col="full_name"               sortCol={commSupSortCol} sortDir={commSupSortDir} onSort={handleCommSupSort} />
                    {isMultiBranch && <SortTh label="Branch" col="branch_name"      sortCol={commSupSortCol} sortDir={commSupSortDir} onSort={handleCommSupSort} />}
                    <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Type</th>
                    <SortTh label="Team Commission"   col="team_commission_lak"     sortCol={commSupSortCol} sortDir={commSupSortDir} onSort={handleCommSupSort} right />
                    <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-right whitespace-nowrap">Rate</th>
                    <SortTh label="Sup Commission (₭)" col="supervisor_commission_lak" sortCol={commSupSortCol} sortDir={commSupSortDir} onSort={handleCommSupSort} right />
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

        {/* Rate reference footer */}
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
