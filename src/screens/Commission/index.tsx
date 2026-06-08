import { useEffect, useState, useRef } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { MonthDropdown } from '../../components/ui/PeriodFilter'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtLak(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' ₭'
}
function fmt1(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

interface RepRow {
  id: number; full_name: string; nickname: string; staff_type: string
  branch_id: number; branch_name: string; branch_code: string
  supervisor_name: string | null
  actual_jewelry: number; actual_bar: number; actual_qty: number
  commission_lak: number
  rate_applied: { jewelry_rate_lak: number; bar_rate_lak: number; qty_rate_lak: number } | null
}
interface SupRow {
  id: number; full_name: string; nickname: string; staff_type: string
  branch_id: number; branch_name: string; branch_code: string
  team_commission_lak: number; supervisor_commission_lak: number; sup_pct: number
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider
      ${type === 'b2b' ? 'bg-secondary/10 text-secondary' : 'bg-primary/10 text-primary'}`}>
      {type.toUpperCase()}
    </span>
  )
}

function BranchDropdown({ branches, selectedIds, onChange }: {
  branches: Array<{ id: number; name: string; code: string }>
  selectedIds: number[]; onChange: (ids: number[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
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

export default function Commission() {
  const { token, user, branches } = useAuthStore()
  const { selectedBranchIds, setSelectedBranchIds } = useAppStore()

  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [reps, setReps]   = useState<RepRow[]>([])
  const [sups, setSups]   = useState<SupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'reps' | 'supervisors'>('reps')
  const [typeFilter, setTypeFilter] = useState<'all' | 'b2c' | 'b2b'>('all')
  const [search, setSearch]     = useState('')
  const [pulling, setPulling]   = useState(false)
  const [toast, setToast]       = useState('')

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500) }

  const isAdmin    = user?.role === 'admin'
  const isExec     = user?.role === 'executive' || isAdmin
  const isBranchMgr = user?.role === 'branch_manager'

  const effectiveBranchIds: number[] = (user?.role === 'supervisor' || isBranchMgr)
    ? [user.branchId ?? 1]
    : selectedBranchIds

  useEffect(() => {
    if (!token) return
    setLoading(true)
    window.api.getCommissionReport(token, effectiveBranchIds, year, month)
      .then((data: { reps: RepRow[]; supervisors: SupRow[] }) => {
        setReps(data.reps)
        setSups(data.supervisors)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [token, JSON.stringify(effectiveBranchIds), year, month])

  async function handlePullConfigs() {
    if (!token) return
    setPulling(true)
    try {
      const res = await window.api.pullCommissionConfigs(token) as { success: boolean; count?: number; error?: string }
      if (res.success) {
        showToast(`Pulled ${res.count ?? 0} commission configs from Google Sheets.`)
        // Reload report with updated configs
        const data = await window.api.getCommissionReport(token, effectiveBranchIds, year, month) as { reps: RepRow[]; supervisors: SupRow[] }
        setReps(data.reps); setSups(data.supervisors)
      } else {
        showToast(`Pull failed: ${res.error ?? 'Unknown error'}`)
      }
    } catch (e) {
      showToast('Pull failed: ' + String(e))
    }
    setPulling(false)
  }

  const isMultiBranch = effectiveBranchIds.length !== 1

  const filteredReps = reps.filter(r => {
    const matchType = typeFilter === 'all' || r.staff_type === typeFilter
    const matchSearch = !search || r.full_name.toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })
  const filteredSups = sups.filter(s => {
    const matchType = typeFilter === 'all' || s.staff_type === typeFilter
    const matchSearch = !search || s.full_name.toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  const totalRepCommission = filteredReps.reduce((s, r) => s + r.commission_lak, 0)
  const totalSupCommission = filteredSups.reduce((s, r) => s + r.supervisor_commission_lak, 0)
  const totalB2c = reps.filter(r => r.staff_type === 'b2c').reduce((s, r) => s + r.commission_lak, 0)
  const totalB2b = reps.filter(r => r.staff_type === 'b2b').reduce((s, r) => s + r.commission_lak, 0)

  const scopeLabel = (user?.role === 'supervisor' || isBranchMgr)
    ? (branches.find(b => b.id === user?.branchId)?.name ?? 'My Branch')
    : effectiveBranchIds.length === 0 ? 'All Branches'
    : effectiveBranchIds.length === 1 ? (branches.find(b => b.id === effectiveBranchIds[0])?.name ?? '1 Branch')
    : `${effectiveBranchIds.length} Branches`

  return (
    <AppShell title="Commission">
      {toast && (
        <div className="fixed top-20 right-6 z-50 bg-inverse-surface text-inverse-on-surface px-5 py-3 rounded-xl shadow-lg animate-slide-in font-body-sm">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div>
          <nav className="flex items-center gap-2 text-label-md text-on-surface-variant mb-2">
            <span>Reports</span>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="text-primary">Commission</span>
          </nav>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Commission Report</h2>
          <p className="text-on-surface-variant text-body-md mt-1">
            {scopeLabel} — {MONTHS[month - 1]} {year}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <MonthDropdown year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m) }} />
          {(isExec || isBranchMgr) && user?.role !== 'supervisor' && user?.role !== 'branch_manager' && (
            <BranchDropdown branches={branches} selectedIds={selectedBranchIds} onChange={setSelectedBranchIds} />
          )}
          {isAdmin && (
            <button
              onClick={handlePullConfigs}
              disabled={pulling}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container text-on-surface text-body-sm hover:bg-surface-container-high transition-colors border border-white/20 disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-sm text-secondary ${pulling ? 'animate-spin-slow' : ''}`}>
                {pulling ? 'sync' : 'cloud_download'}
              </span>
              {pulling ? 'Pulling...' : 'Pull Configs'}
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-card-gap mb-8">
        {[
          { label: 'Total Rep Commission',  value: fmtLak(totalRepCommission),  color: 'border-primary',   icon: 'payments', sub: `${reps.length} reps` },
          { label: 'Total Sup Commission',  value: fmtLak(totalSupCommission),  color: 'border-secondary', icon: 'supervisor_account', sub: `${sups.length} supervisors` },
          { label: 'B2C Commission',         value: fmtLak(totalB2c),            color: 'border-tertiary',  icon: 'person', sub: `${reps.filter(r => r.staff_type === 'b2c').length} reps` },
          { label: 'B2B Commission',         value: fmtLak(totalB2b),            color: 'border-error',     icon: 'business', sub: `${reps.filter(r => r.staff_type === 'b2b').length} reps` },
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

      {/* Tab + Filter bar */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        {/* Tabs */}
        <div className="flex rounded-xl bg-surface-container overflow-hidden border border-white/20">
          {(['reps', 'supervisors'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 font-label-md text-label-md transition-colors capitalize
                ${activeTab === tab ? 'bg-primary text-white' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
            >
              {tab === 'reps' ? 'Staff Commission' : 'Supervisor Commission'}
            </button>
          ))}
        </div>

        {/* Type filter chips */}
        <div className="flex gap-2">
          {(['all', 'b2c', 'b2b'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors
                ${typeFilter === t
                  ? t === 'b2b' ? 'bg-secondary text-white' : t === 'b2c' ? 'bg-primary text-white' : 'bg-on-surface text-surface'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}
            >
              {t === 'all' ? 'All Types' : t.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative ml-auto">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">search</span>
          <input
            type="text" placeholder="Search name..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="bg-white/60 backdrop-blur-sm border border-white/50 rounded-lg pl-9 pr-4 py-2 text-body-sm outline-none focus:ring-2 focus:ring-primary/20 w-48"
          />
        </div>
      </div>

      {/* Rep Commission Table */}
      {activeTab === 'reps' && (
        <GlassCard className="overflow-hidden shadow-sm border border-white/40" elevated>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-variant/20 border-b border-white/40">
                  <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">Representative</th>
                  {isMultiBranch && <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Branch</th>}
                  <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Type</th>
                  <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">Team Sup</th>
                  <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-right whitespace-nowrap">Jewelry (Baht)</th>
                  <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-right whitespace-nowrap">Bar (Baht)</th>
                  <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-right">Qty</th>
                  <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-right whitespace-nowrap">Commission (₭)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/20">
                {loading ? (
                  <tr><td colSpan={8} className="py-12 text-center text-on-surface-variant">
                    <span className="material-symbols-outlined animate-spin-slow text-2xl block mx-auto mb-2">sync</span>
                    Loading commission data...
                  </td></tr>
                ) : filteredReps.length === 0 ? (
                  <tr><td colSpan={8} className="py-8 text-center text-on-surface-variant text-body-sm">No results found.</td></tr>
                ) : filteredReps.map(r => (
                  <tr key={r.id} className="hover:bg-primary/[0.02] transition-colors">
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold uppercase
                          ${r.staff_type === 'b2b' ? 'bg-secondary/10 text-secondary' : 'bg-primary/10 text-primary'}`}>
                          {r.full_name.slice(0,1)}
                        </div>
                        <div>
                          <p className="font-label-md text-label-md font-bold">{r.full_name}</p>
                          {r.nickname && <p className="text-[10px] text-on-surface-variant">{r.nickname}</p>}
                        </div>
                      </div>
                    </td>
                    {isMultiBranch && (
                      <td className="px-5 py-3 text-body-sm text-on-surface-variant whitespace-nowrap">{r.branch_name}</td>
                    )}
                    <td className="px-5 py-3"><TypeBadge type={r.staff_type} /></td>
                    <td className="px-5 py-3 text-body-sm text-on-surface-variant whitespace-nowrap">{r.supervisor_name ?? '—'}</td>
                    <td className="px-5 py-3 text-right font-tabular-nums text-body-sm font-bold">{fmt1(r.actual_jewelry)}</td>
                    <td className="px-5 py-3 text-right font-tabular-nums text-body-sm font-bold">{fmt1(r.actual_bar)}</td>
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
              {!loading && filteredReps.length > 0 && (
                <tfoot>
                  <tr className="bg-surface-variant/20 border-t border-white/40">
                    <td colSpan={isMultiBranch ? 4 : 3} className="px-5 py-3 font-label-md text-label-md text-on-surface-variant uppercase">
                      Total ({filteredReps.length} reps)
                    </td>
                    <td className="px-5 py-3 text-right font-tabular-nums font-bold text-body-sm">
                      {fmt1(filteredReps.reduce((s, r) => s + r.actual_jewelry, 0))}
                    </td>
                    <td className="px-5 py-3 text-right font-tabular-nums font-bold text-body-sm">
                      {fmt1(filteredReps.reduce((s, r) => s + r.actual_bar, 0))}
                    </td>
                    <td className="px-5 py-3 text-right font-tabular-nums font-bold text-body-sm">
                      {filteredReps.reduce((s, r) => s + r.actual_qty, 0)}
                    </td>
                    <td className="px-5 py-3 text-right font-tabular-nums font-bold text-tertiary">
                      {fmtLak(totalRepCommission)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </GlassCard>
      )}

      {/* Supervisor Commission Table */}
      {activeTab === 'supervisors' && (
        <GlassCard className="overflow-hidden shadow-sm border border-white/40" elevated>
          <div className="p-4 border-b border-white/30 flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-sm">info</span>
            <p className="text-body-sm text-on-surface-variant">
              Supervisor commission = <strong className="text-secondary">{sups[0]?.sup_pct ?? 30}%</strong> of their team's total rep commission
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-variant/20 border-b border-white/40">
                  <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Supervisor</th>
                  {isMultiBranch && <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Branch</th>}
                  <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Type</th>
                  <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-right whitespace-nowrap">Team Commission</th>
                  <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-right whitespace-nowrap">Rate</th>
                  <th className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-right whitespace-nowrap">Sup Commission (₭)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/20">
                {loading ? (
                  <tr><td colSpan={6} className="py-12 text-center text-on-surface-variant">
                    <span className="material-symbols-outlined animate-spin-slow text-2xl block mx-auto mb-2">sync</span>
                    Loading...
                  </td></tr>
                ) : filteredSups.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-on-surface-variant text-body-sm">No supervisors found.</td></tr>
                ) : filteredSups.map(s => (
                  <tr key={s.id} className="hover:bg-secondary/[0.02] transition-colors">
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-secondary/10 text-secondary flex items-center justify-center text-xs font-bold uppercase">
                          {s.full_name.slice(0,1)}
                        </div>
                        <div>
                          <p className="font-label-md text-label-md font-bold">{s.full_name}</p>
                          {s.nickname && <p className="text-[10px] text-on-surface-variant">{s.nickname}</p>}
                        </div>
                      </div>
                    </td>
                    {isMultiBranch && (
                      <td className="px-5 py-3 text-body-sm text-on-surface-variant whitespace-nowrap">{s.branch_name}</td>
                    )}
                    <td className="px-5 py-3"><TypeBadge type={s.staff_type} /></td>
                    <td className="px-5 py-3 text-right font-tabular-nums text-body-sm">{fmtLak(s.team_commission_lak)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-secondary/10 text-secondary text-[11px] font-bold">
                        {s.sup_pct}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="font-tabular-nums font-bold text-body-sm text-tertiary">
                        {fmtLak(s.supervisor_commission_lak)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {!loading && filteredSups.length > 0 && (
                <tfoot>
                  <tr className="bg-surface-variant/20 border-t border-white/40">
                    <td colSpan={isMultiBranch ? 3 : 2} className="px-5 py-3 font-label-md text-label-md text-on-surface-variant uppercase">
                      Total ({filteredSups.length} supervisors)
                    </td>
                    <td className="px-5 py-3 text-right font-tabular-nums font-bold text-body-sm">
                      {fmtLak(filteredSups.reduce((s, r) => s + r.team_commission_lak, 0))}
                    </td>
                    <td />
                    <td className="px-5 py-3 text-right font-tabular-nums font-bold text-tertiary">
                      {fmtLak(totalSupCommission)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </GlassCard>
      )}

      {/* Rate reference footer */}
      {!loading && reps.length > 0 && reps[0]?.rate_applied && (
        <div className="mt-4 flex flex-wrap gap-4">
          {(['b2c', 'b2b'] as const).map(type => {
            const rep = reps.find(r => r.staff_type === type && r.rate_applied)
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
    </AppShell>
  )
}
