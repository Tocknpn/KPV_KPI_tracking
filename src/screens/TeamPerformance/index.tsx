import { useEffect, useState, useRef } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { MonthDropdown, DateRangeBar } from '../../components/ui/PeriodFilter'
import { useAuthStore } from '../../store/auth.store'
import { getDefaultDateRange } from '../../utils/dates'
import type { TeamPerformanceRow, Supervisor, SalesmanBrief } from '../../types'

function fmt(n: number, d = 1) { return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) }
function fmtPts(n: number) { return n.toLocaleString('en-US', { maximumFractionDigits: 0 }) }
function fmtPct(n: number) { return `${fmt(n, 1)}%` }

function kpiColor(pct: number) {
  if (pct >= 100) return 'text-green-600'
  if (pct >= 70)  return 'text-primary'
  if (pct >= 40)  return 'text-yellow-600'
  return 'text-red-500'
}
function kpiBg(pct: number) {
  if (pct >= 100) return 'bg-green-50'
  if (pct >= 70)  return 'bg-primary/5'
  if (pct >= 40)  return 'bg-yellow-50'
  return 'bg-red-50'
}

// ── Supervisor form modal ─────────────────────────────────────────────────
interface SupModalProps {
  mode: 'create' | 'edit'
  initial: { id?: number; full_name: string; nickname: string; branch_id: number; sup_code?: string | null }
  branches: Array<{ id: number; name: string; code: string }>
  onSave: (data: { id?: number; fullName: string; nickname: string; branchId: number; supCode: string | null }) => void
  onClose: () => void
}

function SupModal({ mode, initial, branches, onSave, onClose }: SupModalProps) {
  const [name, setName]   = useState(initial.full_name)
  const [nick, setNick]   = useState(initial.nickname)
  const [branchId, setBranchId] = useState(initial.branch_id)
  const [supCode, setSupCode] = useState(initial.sup_code ?? '')

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 animate-slide-in">
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-headline-md text-on-surface">
            {mode === 'create' ? 'New Supervisor' : 'Edit Supervisor'}
          </h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-error transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="font-label-md text-label-md block mb-1 text-primary">Full Name *</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-surface-container-low border-b-2 border-primary px-3 py-2 text-body-sm outline-none"
              placeholder="e.g. Somchai Phommachan" />
          </div>
          <div>
            <label className="font-label-md text-label-md block mb-1 text-primary">Nickname</label>
            <input value={nick} onChange={e => setNick(e.target.value)}
              className="w-full bg-surface-container-low border-b-2 border-primary px-3 py-2 text-body-sm outline-none"
              placeholder="e.g. Som" />
          </div>
          <div>
            <label className="font-label-md text-label-md block mb-1 text-primary">Branch *</label>
            <select value={branchId} onChange={e => setBranchId(Number(e.target.value))}
              className="w-full bg-surface-container-low border-b-2 border-primary px-3 py-2 text-body-sm outline-none">
              <option value={0}>— Select branch —</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="font-label-md text-label-md block mb-1 text-on-surface-variant">Sup Code</label>
            <input value={supCode} onChange={e => setSupCode(e.target.value)}
              className="w-full bg-surface-container-low border-b-2 border-outline-variant px-3 py-2 text-body-sm outline-none font-mono"
              placeholder="e.g. MM-SUP-01 (optional, but recommended)" />
            <p className="text-[10px] text-on-surface-variant/60 mt-1">Stable ID for roster uploads — avoids name-matching issues (typos, duplicate names, Lao text).</p>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-outline-variant text-on-surface-variant font-label-md hover:bg-surface-container transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { if (name.trim() && branchId > 0) onSave({ id: initial.id, fullName: name.trim(), nickname: nick.trim(), branchId, supCode: supCode.trim() || null }) }}
            disabled={!name.trim() || branchId === 0}
            className="flex-1 py-2.5 rounded-lg bg-primary text-white font-label-md flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 shadow-primary"
          >
            <span className="material-symbols-outlined text-sm">save</span>
            {mode === 'create' ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Assign reps modal ─────────────────────────────────────────────────────
interface AssignModalProps {
  supervisor: Supervisor
  branchSalesmen: SalesmanBrief[]
  onSave: (ids: number[]) => void
  onClose: () => void
}

function AssignModal({ supervisor, branchSalesmen, onSave, onClose }: AssignModalProps) {
  const [selected, setSelected] = useState<Set<number>>(
    new Set(branchSalesmen.filter(s => s.supervisor_id === supervisor.id).map(s => s.id))
  )

  function toggle(id: number) {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7 animate-slide-in">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="font-headline-md text-on-surface">Assign Reps</h3>
            <p className="text-body-sm text-on-surface-variant mt-0.5">{supervisor.full_name} · {supervisor.branch_name}</p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-error transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="max-h-72 overflow-y-auto space-y-1 mb-5">
          {branchSalesmen.length === 0 ? (
            <p className="text-body-sm text-on-surface-variant text-center py-6">No sales reps in this branch.</p>
          ) : branchSalesmen.map(s => (
            <label key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-container cursor-pointer transition-colors">
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="accent-primary w-4 h-4" />
              <div className="flex-1 min-w-0">
                <p className="font-label-md text-label-md text-on-surface">{s.full_name}</p>
                <p className="text-[10px] text-on-surface-variant">{s.position}
                  {s.supervisor_id && s.supervisor_id !== supervisor.id && (
                    <span className="ml-1 text-secondary"> · currently under {s.supervisor_name}</span>
                  )}
                </p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-outline-variant text-on-surface-variant font-label-md hover:bg-surface-container transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onSave([...selected])}
            className="flex-1 py-2.5 rounded-lg bg-primary text-white font-label-md flex items-center justify-center gap-2 hover:opacity-90 shadow-primary"
          >
            <span className="material-symbols-outlined text-sm">group</span>
            Save Team ({selected.size} reps)
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────
export default function TeamPerformance() {
  const { token, branches, user } = useAuthStore()
  const [tab, setTab] = useState<'performance' | 'setup'>('performance')
  const [rows, setRows] = useState<TeamPerformanceRow[]>([])
  const [supervisors, setSupervisors] = useState<Supervisor[]>([])
  const [loading, setLoading]         = useState(true)
  const [supModal, setSupModal]       = useState<'create' | 'edit' | null>(null)
  const [editSup, setEditSup]         = useState<Supervisor | null>(null)
  const [assignSup, setAssignSup]     = useState<Supervisor | null>(null)
  const [branchReps, setBranchReps]   = useState<SalesmanBrief[]>([])
  const [toast, setToast]             = useState('')

  // ── Date state ────────────────────────────────────────────────────────
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

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function loadPerformance() {
    if (!token) return
    setLoading(true)
    try {
      // branch_manager: auto-scope to their branch; others pass selected filters
      const branchFilter = user?.role === 'branch_manager' && user.branchId
        ? [user.branchId]
        : []
      const data = await window.api.getTeamPerformance(token, branchFilter, year, month, dateFrom, dateTo)
      setRows(data as TeamPerformanceRow[])
    } finally {
      setLoading(false)
    }
  }

  async function loadSupervisors() {
    if (!token) return
    const data = await window.api.getSupervisors(token)
    setSupervisors(data as Supervisor[])
  }

  useEffect(() => { loadPerformance() }, [token, year, month, dateFrom, dateTo])
  useEffect(() => { loadSupervisors() }, [token])

  async function handleSaveSup(data: { id?: number; fullName: string; nickname: string; branchId: number; supCode: string | null }) {
    if (!token) return
    await window.api.saveSupervisor(token, data)
    showToast(data.id ? 'Supervisor updated.' : 'Supervisor created.')
    setSupModal(null); setEditSup(null)
    loadSupervisors(); loadPerformance()
  }

  async function handleDeleteSup(sup: Supervisor) {
    if (!token) return
    if (!confirm(`Remove supervisor "${sup.full_name}"? Their reps will be unassigned.`)) return
    await window.api.deleteSupervisor(token, sup.id)
    showToast(`Supervisor "${sup.full_name}" removed.`)
    loadSupervisors(); loadPerformance()
  }

  async function openAssign(sup: Supervisor) {
    if (!token) return
    const reps = await window.api.getSalesmenForBranch(token, sup.branch_id)
    setBranchReps(reps as SalesmanBrief[])
    setAssignSup(sup)
  }

  async function handleAssign(ids: number[]) {
    if (!token || !assignSup) return
    await window.api.assignSalesmen(token, assignSup.id, ids)
    showToast(`Team updated — ${ids.length} rep(s) assigned.`)
    setAssignSup(null)
    loadSupervisors(); loadPerformance()
  }

  // Company totals for summary row
  const totalTeamScore = rows.reduce((s, r) => s + r.team_total_score, 0)
  const totalSupScore  = rows.reduce((s, r) => s + r.sup_score, 0)
  const avgTeamKpi     = rows.length ? rows.reduce((s, r) => s + r.team_kpi_pct, 0) / rows.length : 0
  const avgSupKpi      = rows.length ? rows.reduce((s, r) => s + r.sup_kpi_pct_ach, 0) / rows.length : 0

  return (
    <AppShell title="SalesTrack Pro" allowedRoles={['admin','branch_manager','top_manager']}>
      {toast && (
        <div className="fixed top-20 right-6 z-50 bg-inverse-surface text-inverse-on-surface px-5 py-3 rounded-xl shadow-lg animate-slide-in text-body-sm">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div>
          <nav className="flex items-center gap-2 text-label-md text-on-surface-variant mb-2">
            <span>Reports</span>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="text-primary">Team Performance</span>
          </nav>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Supervisor Team KPI</h2>
          <p className="text-on-surface-variant text-body-md mt-0.5">
            {user?.role === 'branch_manager'
              ? `${branches.find(b => b.id === user.branchId)?.name ?? 'My Branch'} — `
              : ''}
            Supervisor score = {rows[0]?.sup_kpi_pct ?? 30}% of team KPI total
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <MonthDropdown year={year} month={month} onChange={handleMonthChange} />
          <DateRangeBar
            year={year} month={month}
            dateFrom={dateFrom} dateTo={dateTo} maxDate={maxDate}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-container rounded-xl p-1 mb-6 w-fit">
        {(['performance', 'setup'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg font-label-md text-label-md capitalize transition-all ${tab === t ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:text-primary'}`}>
            {t === 'performance' ? 'Team KPI' : 'Team Setup'}
          </button>
        ))}
      </div>

      {/* ── Performance tab ────────────────────────────────────────────── */}
      {tab === 'performance' && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-card-gap mb-6">
            {[
              { label: 'Total Supervisors', value: rows.length,             unit: '',   color: 'border-primary' },
              { label: 'Avg Team KPI %',   value: fmtPct(avgTeamKpi),       unit: '',   color: 'border-secondary' },
              { label: 'Total Team Score', value: fmtPts(totalTeamScore),   unit: 'pts', color: 'border-tertiary' },
              { label: 'Total Sup Score',  value: fmtPts(totalSupScore),    unit: 'pts', color: 'border-outline-variant' },
            ].map(k => (
              <GlassCard key={k.label} className={`p-5 border-l-4 ${k.color}`}>
                <p className="font-label-md text-label-md text-on-surface-variant uppercase mb-1">{k.label}</p>
                <h3 className="font-display-xl text-display-xl text-on-surface tabular-nums">{k.value}</h3>
                {k.unit && <p className="text-[10px] text-on-surface-variant mt-0.5">{k.unit}</p>}
              </GlassCard>
            ))}
          </div>

          {/* Performance table */}
          <GlassCard elevated className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-variant/20 border-b border-white/40">
                    {['Supervisor','Branch','Reps','Team Score','Team KPI %','Sup Score','Sup KPI %'].map(h => (
                      <th key={h} className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/20">
                  {loading ? (
                    <tr><td colSpan={7} className="py-12 text-center text-on-surface-variant">
                      <span className="material-symbols-outlined animate-spin-slow text-2xl block mx-auto mb-2">sync</span>
                      Loading...
                    </td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={7} className="py-10 text-center text-on-surface-variant text-body-sm">
                      No supervisors found. Create supervisors and assign reps in Team Setup.
                    </td></tr>
                  ) : rows.map(r => (
                    <tr key={r.id} className="hover:bg-primary/[0.02] transition-colors">
                      <td className="px-5 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold uppercase">
                            {r.full_name.slice(0, 1)}
                          </div>
                          <div>
                            <p className="font-label-md text-label-md font-bold">{r.full_name}</p>
                            {r.nickname && <p className="text-[10px] text-on-surface-variant">{r.nickname}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-body-sm text-on-surface-variant whitespace-nowrap">{r.branch_name}</td>
                      <td className="px-5 py-3 tabular-nums text-on-surface-variant">{r.rep_count}</td>
                      <td className="px-5 py-3 tabular-nums font-semibold">{fmtPts(r.team_total_score)} pts</td>
                      <td className="px-5 py-3">
                        <div className={`inline-flex items-center px-3 py-1 rounded-lg ${kpiBg(r.team_kpi_pct)}`}>
                          <span className={`font-tabular-nums font-bold text-body-sm ${kpiColor(r.team_kpi_pct)}`}>{fmtPct(r.team_kpi_pct)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 tabular-nums font-semibold text-secondary">{fmtPts(r.sup_score)} pts</td>
                      <td className="px-5 py-3">
                        <div className={`inline-flex flex-col items-center px-3 py-1 rounded-lg ${kpiBg(r.sup_kpi_pct_ach)}`}>
                          <span className={`font-tabular-nums font-bold text-body-sm ${kpiColor(r.sup_kpi_pct_ach)}`}>{fmtPct(r.sup_kpi_pct_ach)}</span>
                          <span className="text-[9px] text-on-surface-variant">{r.sup_kpi_pct}% of team</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 0 && (
              <div className="px-5 py-3 bg-surface-variant/10 border-t border-white/40 text-body-sm text-on-surface-variant italic">
                Avg Team KPI: <strong>{fmtPct(avgTeamKpi)}</strong> · Avg Sup KPI: <strong>{fmtPct(avgSupKpi)}</strong>
              </div>
            )}
          </GlassCard>
        </>
      )}

      {/* ── Team Setup tab ─────────────────────────────────────────────── */}
      {tab === 'setup' && (
        <div className="grid grid-cols-12 gap-card-gap">
          {/* Supervisor list */}
          <GlassCard elevated className="col-span-12 overflow-hidden">
            <div className="p-5 border-b border-white/20 flex items-center justify-between">
              <div>
                <h4 className="font-headline-md text-on-surface">Supervisor Roster</h4>
                <p className="text-body-sm text-on-surface-variant mt-0.5">{supervisors.length} supervisor(s) {user?.role === 'branch_manager' ? 'in your branch' : 'across all branches'}</p>
              </div>
              {user?.role !== 'branch_manager' && (
                <button
                  onClick={() => { setEditSup(null); setSupModal('create') }}
                  className="bg-primary text-white px-4 py-2 rounded-lg font-label-md text-label-md flex items-center gap-2 hover:opacity-90 shadow-primary"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  New Supervisor
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container/30">
                    {['Supervisor','Branch','Team Size','Actions'].map(h => (
                      <th key={h} className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {supervisors.length === 0 ? (
                    <tr><td colSpan={4} className="py-10 text-center text-on-surface-variant text-body-sm">
                      No supervisors yet. Click "New Supervisor" to create one.
                    </td></tr>
                  ) : supervisors.map(sup => (
                    <tr key={sup.id} className="hover:bg-surface-container/20 transition-colors group">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center text-secondary text-xs font-bold uppercase">
                            {sup.full_name.slice(0, 1)}
                          </div>
                          <div>
                            <p className="font-bold text-body-sm">{sup.full_name}</p>
                            <p className="text-[10px] text-on-surface-variant">
                              {sup.nickname}{sup.nickname && sup.sup_code ? ' · ' : ''}
                              {sup.sup_code && <span className="font-mono">{sup.sup_code}</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-body-sm text-on-surface-variant">{sup.branch_name}</td>
                      <td className="px-5 py-3">
                        <span className="bg-primary/10 text-primary font-bold text-xs px-2 py-1 rounded-full">
                          {sup.rep_count} rep{sup.rep_count !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {user?.role !== 'branch_manager' && (
                            <>
                              <button onClick={() => openAssign(sup)}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors text-body-sm font-label-md">
                                <span className="material-symbols-outlined text-sm">group</span> Assign Reps
                              </button>
                              <button onClick={() => { setEditSup(sup); setSupModal('edit') }}
                                className="p-1.5 text-on-surface-variant hover:bg-surface-variant/30 rounded-lg transition-colors">
                                <span className="material-symbols-outlined text-sm">edit</span>
                              </button>
                              <button onClick={() => handleDeleteSup(sup)}
                                className="p-1.5 text-error hover:bg-error-container/30 rounded-lg transition-colors">
                                <span className="material-symbols-outlined text-sm">delete</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Modals */}
      {supModal && (
        <SupModal
          mode={supModal}
          initial={editSup ?? { full_name: '', nickname: '', branch_id: 0 }}
          branches={branches}
          onSave={handleSaveSup}
          onClose={() => { setSupModal(null); setEditSup(null) }}
        />
      )}
      {assignSup && (
        <AssignModal
          supervisor={assignSup}
          branchSalesmen={branchReps}
          onSave={handleAssign}
          onClose={() => setAssignSup(null)}
        />
      )}
    </AppShell>
  )
}
