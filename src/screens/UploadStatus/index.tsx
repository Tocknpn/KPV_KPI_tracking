import { useEffect, useState, useMemo } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { useAuthStore } from '../../store/auth.store'

type Rep = {
  id: number; rep_code: string; full_name: string; nickname: string
  staff_type: string; supervisor_name: string | null; days: boolean[]
}
type BranchGroup = {
  branch_id: number; branch_name: string; branch_code: string; reps: Rep[]
}
type StatusGrid = { dates: string[]; branches: BranchGroup[] }

function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return { day: d.toLocaleDateString('en-GB', { weekday: 'short' }), date: d.getDate() }
}

function isWeekend(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  const wd = d.getDay()
  return wd === 0 || wd === 6
}

export default function UploadStatus() {
  const { token, user, branches } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const isHr    = user?.role === 'hr'
  const isSup   = user?.role === 'sales_sup'

  const [grid, setGrid]         = useState<StatusGrid | null>(null)
  const [loading, setLoading]   = useState(true)
  const [days, setDays]         = useState(7)
  const [filterBranch, setFilterBranch] = useState<number | 'all'>('all')
  const [filterType, setFilterType]     = useState<'all' | 'b2c' | 'b2b'>('all')
  const [filterSearch, setFilterSearch] = useState('')

  const canFilterBranch = isAdmin || isHr

  async function load() {
    if (!token) return
    setLoading(true)
    try {
      const branchIds = filterBranch !== 'all' ? [filterBranch] : undefined
      const result = await window.api.getRepUploadStatus(token, branchIds, days)
      setGrid(result)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [token, days, filterBranch])

  const filteredBranches = useMemo(() => {
    if (!grid) return []
    return grid.branches.map(b => ({
      ...b,
      reps: b.reps.filter(r => {
        if (filterType !== 'all' && r.staff_type !== filterType) return false
        if (filterSearch) {
          const q = filterSearch.toLowerCase()
          return r.full_name.toLowerCase().includes(q) || r.rep_code.toLowerCase().includes(q)
        }
        return true
      }),
    })).filter(b => b.reps.length > 0)
  }, [grid, filterType, filterSearch])

  const totalReps = filteredBranches.reduce((s, b) => s + b.reps.length, 0)
  const missingToday = filteredBranches.reduce((s, b) =>
    s + b.reps.filter(r => !r.days[r.days.length - 1]).length, 0)

  return (
    <AppShell title="Upload Status">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Upload Status</h2>
          <p className="text-on-surface-variant text-body-md mt-1">
            {isSup ? 'Your team — last' : 'Per-rep daily entry coverage — last'} {days} days
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-lg bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-colors">
          <span className={`material-symbols-outlined text-sm ${loading ? 'animate-spin-slow' : ''}`}>refresh</span>
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        {/* Days selector */}
        <div className="flex bg-surface-container rounded-lg p-0.5">
          {[7, 14, 30].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-md font-label-md text-label-md transition-all ${days === d ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:text-primary'}`}>
              {d}d
            </button>
          ))}
        </div>

        {canFilterBranch && (
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm outline-none">
            <option value="all">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
          </select>
        )}

        <div className="flex bg-surface-container rounded-lg p-0.5">
          {(['all','b2c','b2b'] as const).map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-md font-label-md text-label-md uppercase transition-all ${filterType === t ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:text-primary'}`}>
              {t === 'all' ? 'All' : t.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-[200px] max-w-xs relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">search</span>
          <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
            placeholder="Search name or code..."
            className="w-full bg-surface-container rounded-lg pl-8 pr-3 py-2 text-body-sm outline-none border-none" />
        </div>
      </div>

      {/* Summary strip */}
      {grid && !loading && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <GlassCard className="px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary">group</span>
            </div>
            <div>
              <p className="font-bold text-on-surface text-xl tabular-nums">{totalReps}</p>
              <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">Total Reps</p>
            </div>
          </GlassCard>
          <GlassCard className="px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-error">warning</span>
            </div>
            <div>
              <p className="font-bold text-error text-xl tabular-nums">{missingToday}</p>
              <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">Missing Today</p>
            </div>
          </GlassCard>
          <GlassCard className="px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-tertiary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-tertiary">calendar_month</span>
            </div>
            <div>
              <p className="font-bold text-on-surface text-xl tabular-nums">{days}</p>
              <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">Days Shown</p>
            </div>
          </GlassCard>
        </div>
      )}

      {loading ? (
        <GlassCard className="py-20 flex flex-col items-center gap-3 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin-slow text-3xl">sync</span>
          <p className="text-body-sm">Loading upload status…</p>
        </GlassCard>
      ) : filteredBranches.length === 0 ? (
        <GlassCard className="py-20 text-center text-on-surface-variant text-body-sm">
          No reps found for current filters.
        </GlassCard>
      ) : (
        <div className="space-y-6">
          {filteredBranches.map(branch => (
            <GlassCard key={branch.branch_id} elevated className="overflow-hidden">
              {/* Branch header */}
              <div className="px-5 py-4 border-b border-outline-variant/10 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                  {branch.branch_code}
                </div>
                <div>
                  <h3 className="font-headline-md text-on-surface">{branch.branch_name}</h3>
                  <p className="text-[11px] text-on-surface-variant">{branch.reps.length} reps</p>
                </div>
                {/* Branch summary pills */}
                <div className="ml-auto flex gap-2">
                  <span className="text-[10px] bg-tertiary/10 text-tertiary px-2 py-0.5 rounded-full font-bold">
                    {branch.reps.filter(r => r.days[r.days.length - 1]).length}/{branch.reps.length} today
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-surface-container-low/50">
                      <th className="px-5 py-3 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider sticky left-0 bg-surface-container-low/80 backdrop-blur-sm min-w-[200px]">Rep</th>
                      <th className="px-3 py-3 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">Type</th>
                      {grid!.dates.map(d => {
                        const { day, date } = fmtDate(d)
                        const wknd = isWeekend(d)
                        return (
                          <th key={d} className={`px-2 py-3 text-center font-label-md text-label-md uppercase tracking-wider whitespace-nowrap min-w-[52px] ${wknd ? 'text-on-surface-variant/40' : 'text-on-surface-variant'}`}>
                            <div className="text-[9px]">{day}</div>
                            <div className="font-bold">{date}</div>
                          </th>
                        )
                      })}
                      <th className="px-5 py-3 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-center whitespace-nowrap">Coverage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {branch.reps.map(rep => {
                      const submitted = rep.days.filter(Boolean).length
                      const total     = rep.days.length
                      const pct       = total > 0 ? Math.round((submitted / total) * 100) : 0
                      return (
                        <tr key={rep.id} className="hover:bg-surface-container/20 transition-colors">
                          <td className="px-5 py-3 sticky left-0 bg-white/80 backdrop-blur-sm">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                                {rep.full_name.slice(0, 1)}
                              </div>
                              <div>
                                <p className="font-bold text-body-sm text-on-surface">{rep.full_name}</p>
                                <p className="text-[10px] text-on-surface-variant font-mono">{rep.rep_code}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${rep.staff_type === 'b2c' ? 'bg-secondary/10 text-secondary' : 'bg-tertiary/10 text-tertiary'}`}>
                              {rep.staff_type.toUpperCase()}
                            </span>
                          </td>
                          {rep.days.map((has, i) => {
                            const wknd = isWeekend(grid!.dates[i])
                            return (
                              <td key={i} className={`px-2 py-3 text-center ${wknd ? 'bg-surface-container-low/30' : ''}`}>
                                {has ? (
                                  <span className="material-symbols-outlined text-[16px] text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                ) : (
                                  <span className="material-symbols-outlined text-[16px] text-error/30">cancel</span>
                                )}
                              </td>
                            )
                          })}
                          <td className="px-5 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`font-bold text-body-sm tabular-nums ${pct >= 80 ? 'text-tertiary' : pct >= 50 ? 'text-secondary' : 'text-error'}`}>
                                {pct}%
                              </span>
                              <div className="w-16 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${pct >= 80 ? 'bg-tertiary' : pct >= 50 ? 'bg-secondary' : 'bg-error'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-[9px] text-on-surface-variant tabular-nums">{submitted}/{total}</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </AppShell>
  )
}
