import { useEffect, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import type { RosterRow, Supervisor } from '../../types'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Rep create/edit modal ────────────────────────────────────────────────────
interface RepModalProps {
  mode: 'create' | 'edit'
  initial: Partial<RosterRow>
  branches: Array<{ id: number; name: string; code: string }>
  supervisors: Supervisor[]
  defaultYearMonth: string
  onSave: (data: {
    id?: number; repCode: string; fullName: string; nickname: string
    branchId: number; supervisorId: number | null; staffType: string
    yearMonth: string; pointTarget: number
  }) => void
  onClose: () => void
}

function RepModal({ mode, initial, branches, supervisors, defaultYearMonth, onSave, onClose }: RepModalProps) {
  const [repCode,     setRepCode]     = useState(initial.rep_code ?? '')
  const [fullName,    setFullName]    = useState(initial.full_name ?? '')
  const [nickname,    setNickname]    = useState(initial.nickname ?? '')
  const [branchId,    setBranchId]    = useState(initial.branch_id ?? 0)
  const [supId,       setSupId]       = useState<number | null>(initial.supervisor_id ?? null)
  const [staffType,   setStaffType]   = useState(initial.staff_type ?? 'b2c')
  const [yearMonth,   setYearMonth]   = useState(initial.year_month ?? defaultYearMonth)
  const [pointTarget, setPointTarget] = useState(initial.point_target ?? 0)

  const branchSups = supervisors.filter(s => s.branch_id === branchId)

  function handleBranchChange(id: number) {
    setBranchId(id)
    setSupId(null)
  }

  function submit() {
    if (!repCode.trim() || !fullName.trim() || branchId === 0) return
    onSave({
      id: initial.id, repCode: repCode.trim(), fullName: fullName.trim(),
      nickname: nickname.trim(), branchId, supervisorId: supId,
      staffType, yearMonth, pointTarget,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7 animate-slide-in">
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-headline-md text-on-surface">{mode === 'create' ? 'Add Sales Rep' : 'Edit Sales Rep'}</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-error transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-label-md text-label-md block mb-1 text-primary">Rep Code *</label>
              <input autoFocus value={repCode} onChange={e => setRepCode(e.target.value)}
                className="w-full bg-surface-container-low border-b-2 border-primary px-3 py-2 text-body-sm outline-none" placeholder="e.g. B1-01" />
            </div>
            <div>
              <label className="font-label-md text-label-md block mb-1 text-on-surface-variant">Staff Type</label>
              <div className="flex bg-surface-container rounded-lg p-0.5 mt-1">
                {(['b2c','b2b'] as const).map(t => (
                  <button key={t} onClick={() => setStaffType(t)}
                    className={`flex-1 py-1.5 rounded-md font-label-md text-label-md uppercase transition-all ${staffType === t ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:text-primary'}`}>
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="font-label-md text-label-md block mb-1 text-primary">Full Name *</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)}
              className="w-full bg-surface-container-low border-b-2 border-primary px-3 py-2 text-body-sm outline-none" placeholder="e.g. Somchai Phommachan" />
          </div>
          <div>
            <label className="font-label-md text-label-md block mb-1 text-on-surface-variant">Nickname</label>
            <input value={nickname} onChange={e => setNickname(e.target.value)}
              className="w-full bg-surface-container-low border-b-2 border-outline-variant px-3 py-2 text-body-sm outline-none" placeholder="Optional short name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-label-md text-label-md block mb-1 text-primary">Branch *</label>
              <select value={branchId} onChange={e => handleBranchChange(Number(e.target.value))}
                className="w-full bg-surface-container-low border-b-2 border-primary px-3 py-2 text-body-sm outline-none">
                <option value={0}>— Select —</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="font-label-md text-label-md block mb-1 text-on-surface-variant">Supervisor</label>
              <select value={supId ?? 0} onChange={e => setSupId(Number(e.target.value) || null)}
                disabled={branchId === 0}
                className="w-full bg-surface-container-low border-b-2 border-outline-variant px-3 py-2 text-body-sm outline-none disabled:opacity-50">
                <option value={0}>— None —</option>
                {branchSups.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-label-md text-label-md block mb-1 text-on-surface-variant">Year-Month (YYYYMM)</label>
              <input value={yearMonth} onChange={e => setYearMonth(e.target.value)}
                maxLength={6}
                className="w-full bg-surface-container-low border-b-2 border-outline-variant px-3 py-2 text-body-sm outline-none font-mono" placeholder="202606" />
            </div>
            <div>
              <label className="font-label-md text-label-md block mb-1 text-on-surface-variant">Point Target</label>
              <input type="number" min={0} value={pointTarget} onChange={e => setPointTarget(Number(e.target.value))}
                className="w-full bg-surface-container-low border-b-2 border-outline-variant px-3 py-2 text-body-sm outline-none" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-outline-variant text-on-surface-variant font-label-md hover:bg-surface-container transition-colors">
            Cancel
          </button>
          <button onClick={submit} disabled={!repCode.trim() || !fullName.trim() || branchId === 0}
            className="flex-1 py-2.5 rounded-lg bg-primary text-white font-label-md flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 shadow-primary">
            <span className="material-symbols-outlined text-sm">save</span>
            {mode === 'create' ? 'Add Rep' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Upload history types ─────────────────────────────────────────────────────
interface CoverageRow {
  branch_id: number; branch_name: string; branch_code: string
  target_uploaded: boolean; target_last_upload: string | null; target_records: number
  days_with_entries: number; days_in_month: number
  last_entry: string | null; last_daily_upload: string | null
}

interface LogRow {
  id: number; uploaded_at: string; branch_name: string; branch_code: string
  upload_type: string; filename: string; records_count: number
  date_from: string | null; date_to: string | null
  month: number | null; year: number | null
  status: string; notes: string | null; uploaded_by: string
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }
  catch { return iso }
}

function progressBar(value: number, total: number, color: string) {
  const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-bold tabular-nums text-on-surface-variant">{value}/{total}</span>
    </div>
  )
}

type MainTab = 'history' | 'roster'

export default function UploadHistory() {
  const { token, user, branches } = useAuthStore()
  const { selectedYear, selectedMonth, setSelectedPeriod } = useAppStore()

  const [mainTab, setMainTab] = useState<MainTab>('history')
  const isAdmin = user?.role === 'admin'

  // ── Upload History state ──────────────────────────────────────────────
  const [coverage, setCoverage] = useState<CoverageRow[]>([])
  const [logs, setLogs]         = useState<LogRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [filterType, setFilterType]     = useState<'all' | 'target' | 'daily'>('all')
  const [filterBranch, setFilterBranch] = useState<number | undefined>(undefined)

  // ── Roster state ──────────────────────────────────────────────────────
  const [roster, setRoster]           = useState<RosterRow[]>([])
  const [supervisors, setSupervisors] = useState<Supervisor[]>([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [rosterSyncing, setRosterSyncing] = useState(false)
  const [repModal, setRepModal]       = useState<'create' | 'edit' | null>(null)
  const [editRep, setEditRep]         = useState<RosterRow | null>(null)
  const [rosterToast, setRosterToast] = useState('')
  const [filterRBranch, setFilterRBranch] = useState<number | 'all'>('all')
  const [filterRType, setFilterRType]     = useState<'all' | 'b2c' | 'b2b'>('all')
  const [filterRSearch, setFilterRSearch] = useState('')
  const [showInactive, setShowInactive]   = useState(false)

  const defaultYearMonth = String(selectedYear) + String(selectedMonth).padStart(2, '0')

  function showRosterToast(msg: string) {
    setRosterToast(msg)
    setTimeout(() => setRosterToast(''), 3500)
  }

  async function loadHistory() {
    if (!token) return
    setLoading(true)
    try {
      const [cov, lg] = await Promise.all([
        window.api.getUploadCoverage(token, selectedYear, selectedMonth),
        window.api.getUploadLogs(token, filterBranch, filterType === 'all' ? undefined : filterType, 100),
      ])
      setCoverage(cov as CoverageRow[])
      setLogs(lg as LogRow[])
    } finally { setLoading(false) }
  }

  async function loadRoster() {
    if (!token || !isAdmin) return
    setRosterLoading(true)
    try {
      const [reps, sups] = await Promise.all([
        window.api.getRosterAll(token),
        window.api.getSupervisors(token),
      ])
      setRoster(reps as RosterRow[])
      setSupervisors(sups as Supervisor[])
    } finally { setRosterLoading(false) }
  }

  useEffect(() => { loadHistory() }, [token, selectedYear, selectedMonth, filterType, filterBranch])
  useEffect(() => { if (mainTab === 'roster') loadRoster() }, [mainTab, token])

  async function handleSaveRep(data: {
    id?: number; repCode: string; fullName: string; nickname: string
    branchId: number; supervisorId: number | null; staffType: string
    yearMonth: string; pointTarget: number
  }) {
    if (!token) return
    const res = await window.api.saveRosterRep(token, data)
    if (res?.success) {
      showRosterToast(data.id ? `"${data.fullName}" updated.` : `"${data.fullName}" added to roster.`)
      setRepModal(null); setEditRep(null)
      loadRoster()
    }
  }

  async function handleDeactivate(rep: RosterRow) {
    if (!token) return
    if (!confirm(`Deactivate "${rep.full_name}"? They will be hidden from entry screens.`)) return
    await window.api.deactivateRosterRep(token, rep.id)
    showRosterToast(`"${rep.full_name}" deactivated.`)
    loadRoster()
  }

  async function handleReactivate(rep: RosterRow) {
    if (!token) return
    await window.api.reactivateRosterRep(token, rep.id)
    showRosterToast(`"${rep.full_name}" reactivated.`)
    loadRoster()
  }

  async function syncRosterToSheets() {
    if (!token) return
    setRosterSyncing(true)
    try {
      await window.api.forceSyncAll(token)
      showRosterToast('All data synced to Google Sheets.')
    } catch {
      showRosterToast('Sync failed — check Sheets config in Settings.')
    }
    setRosterSyncing(false)
  }

  const filteredRoster = roster.filter(r => {
    if (!showInactive && r.active === 0) return false
    if (filterRBranch !== 'all' && r.branch_id !== filterRBranch) return false
    if (filterRType !== 'all' && r.staff_type !== filterRType) return false
    if (filterRSearch) {
      const q = filterRSearch.toLowerCase()
      return r.full_name.toLowerCase().includes(q) ||
             (r.rep_code ?? '').toLowerCase().includes(q) ||
             (r.nickname ?? '').toLowerCase().includes(q)
    }
    return true
  })

  const branchesWithTarget  = coverage.filter(c => c.target_uploaded).length
  const branchesWithEntries = coverage.filter(c => c.days_with_entries > 0).length
  const totalBranches       = coverage.length
  const alertBranches       = coverage.filter(c => !c.target_uploaded || c.days_with_entries === 0)

  return (
    <AppShell title="Upload History">
      {rosterToast && (
        <div className="fixed top-20 right-6 z-50 bg-inverse-surface text-inverse-on-surface px-5 py-3 rounded-xl shadow-lg animate-slide-in font-body-sm">
          {rosterToast}
        </div>
      )}

      {repModal && (
        <RepModal
          mode={repModal}
          initial={editRep ?? {}}
          branches={branches}
          supervisors={supervisors}
          defaultYearMonth={defaultYearMonth}
          onSave={handleSaveRep}
          onClose={() => { setRepModal(null); setEditRep(null) }}
        />
      )}

      {/* Header */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Upload History</h2>
          <p className="text-on-surface-variant text-body-md mt-1">
            {mainTab === 'history'
              ? `Coverage & logs for ${MONTHS[selectedMonth - 1]} ${selectedYear}`
              : 'View and manage the sales rep roster — edit, add, or deactivate reps'}
          </p>
        </div>
        {mainTab === 'history' && (
          <div className="flex gap-2 items-center">
            <select value={selectedMonth} onChange={e => setSelectedPeriod(selectedYear, Number(e.target.value))}
              className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm outline-none">
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <input type="number" value={selectedYear} onChange={e => setSelectedPeriod(Number(e.target.value), selectedMonth)}
              className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm w-24 outline-none" />
            <button onClick={loadHistory} className="p-2 rounded-lg bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-colors">
              <span className="material-symbols-outlined text-sm">refresh</span>
            </button>
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex bg-surface-container rounded-xl p-1 mb-6 w-fit">
        <button onClick={() => setMainTab('history')}
          className={`px-5 py-2.5 rounded-lg font-label-md text-label-md transition-all flex items-center gap-2 ${mainTab === 'history' ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:text-primary'}`}>
          <span className="material-symbols-outlined text-sm">history</span>
          Upload History
        </button>
        {isAdmin && (
          <button onClick={() => setMainTab('roster')}
            className={`px-5 py-2.5 rounded-lg font-label-md text-label-md transition-all flex items-center gap-2 ${mainTab === 'roster' ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:text-primary'}`}>
            <span className="material-symbols-outlined text-sm">badge</span>
            Roster
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold">Admin</span>
          </button>
        )}
      </div>

      {/* ── Upload History tab ── */}
      {mainTab === 'history' && (
        <>
          {alertBranches.length > 0 && (
            <div className="mb-6 flex items-start gap-3 bg-error-container/20 border border-error/20 rounded-xl px-5 py-4">
              <span className="material-symbols-outlined text-error mt-0.5">warning</span>
              <div>
                <p className="font-label-md text-label-md text-error font-bold uppercase mb-1">Action Required</p>
                <p className="text-body-sm text-on-surface-variant">
                  {alertBranches.map(b => b.branch_name).join(', ')} — missing targets or daily entries for {MONTHS[selectedMonth - 1]} {selectedYear}.
                </p>
              </div>
            </div>
          )}

          <GlassCard elevated className="overflow-hidden mb-8">
            <div className="p-5 border-b border-outline-variant/10 flex justify-between items-center">
              <h3 className="font-headline-md text-headline-md text-on-surface">Branch Coverage Matrix</h3>
              <div className="flex gap-4 text-body-sm">
                <span className="text-tertiary font-bold">{branchesWithTarget}/{totalBranches} targets uploaded</span>
                <span className="text-primary font-bold">{branchesWithEntries}/{totalBranches} branches have entries</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/50">
                    {['Branch','Monthly Target','Days with Entries','Last Entry','Last Upload','Status'].map(h => (
                      <th key={h} className="px-6 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {loading ? (
                    <tr><td colSpan={6} className="py-10 text-center text-on-surface-variant">
                      <span className="material-symbols-outlined animate-spin-slow text-2xl block mx-auto mb-2">sync</span>Loading...
                    </td></tr>
                  ) : coverage.map(c => {
                    const entryPct = c.days_in_month > 0 ? (c.days_with_entries / c.days_in_month) * 100 : 0
                    const status   = !c.target_uploaded ? 'error' : c.days_with_entries === 0 ? 'warning' : entryPct >= 80 ? 'success' : 'neutral'
                    const statusLabel = !c.target_uploaded ? 'No Target' : c.days_with_entries === 0 ? 'No Entries' : entryPct >= 80 ? 'Good' : 'Partial'
                    return (
                      <tr key={c.branch_id} className={`transition-colors hover:bg-surface-container/20 ${status === 'error' ? 'bg-error-container/5' : status === 'warning' ? 'bg-secondary-container/5' : ''}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">{c.branch_code}</div>
                            <span className="font-medium">{c.branch_name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {c.target_uploaded ? (
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="material-symbols-outlined text-tertiary text-sm">check_circle</span>
                                <span className="text-body-sm font-bold text-tertiary">{c.target_records} records</span>
                              </div>
                              <p className="text-[10px] text-on-surface-variant">{fmtDate(c.target_last_upload)}</p>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-error">
                              <span className="material-symbols-outlined text-sm">cancel</span>
                              <span className="text-body-sm font-bold">Not uploaded</span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 min-w-[180px]">{progressBar(c.days_with_entries, c.days_in_month, 'bg-primary')}</td>
                        <td className="px-6 py-4 text-body-sm text-on-surface-variant">{fmtDate(c.last_entry)}</td>
                        <td className="px-6 py-4 text-body-sm text-on-surface-variant">{fmtDate(c.last_daily_upload)}</td>
                        <td className="px-6 py-4"><StatusBadge label={statusLabel} variant={status as 'success' | 'warning' | 'error' | 'neutral'} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </GlassCard>

          <GlassCard elevated className="overflow-hidden">
            <div className="p-5 border-b border-outline-variant/10 flex justify-between items-center flex-wrap gap-3">
              <h3 className="font-headline-md text-headline-md text-on-surface">Upload Log</h3>
              <div className="flex gap-2">
                <div className="flex bg-surface-container rounded-lg p-0.5">
                  {(['all', 'daily', 'target'] as const).map(t => (
                    <button key={t} onClick={() => setFilterType(t)}
                      className={`px-3 py-1.5 rounded-md font-label-md text-label-md capitalize transition-all ${filterType === t ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:text-primary'}`}>
                      {t === 'all' ? 'All' : t === 'daily' ? 'Daily' : 'Targets'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/50">
                    {['Date & Time','Branch','Type','Filename','Records','Period','Uploaded By','Status'].map(h => (
                      <th key={h} className="px-5 py-3 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {logs.length === 0 ? (
                    <tr><td colSpan={8} className="py-10 text-center text-on-surface-variant text-body-sm">No upload history found for this filter.</td></tr>
                  ) : logs.map(log => (
                    <tr key={log.id} className="hover:bg-surface-container/20 transition-colors">
                      <td className="px-5 py-3 text-body-sm font-tabular-nums">{fmtDate(log.uploaded_at)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">{log.branch_code}</span>
                          <span className="text-body-sm">{log.branch_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge label={log.upload_type === 'daily' ? 'Daily' : 'Target'} variant={log.upload_type === 'daily' ? 'info' : 'gold'} />
                      </td>
                      <td className="px-5 py-3 text-body-sm text-on-surface-variant max-w-[180px] truncate" title={log.filename}>{log.filename || '—'}</td>
                      <td className="px-5 py-3 font-tabular-nums text-body-sm font-bold">{log.records_count}</td>
                      <td className="px-5 py-3 text-body-sm text-on-surface-variant">
                        {log.upload_type === 'daily' && log.date_from
                          ? log.date_from === log.date_to ? log.date_from : `${log.date_from} → ${log.date_to}`
                          : log.month && log.year ? `${MONTHS[log.month - 1]} ${log.year}` : '—'}
                      </td>
                      <td className="px-5 py-3 text-body-sm">{log.uploaded_by}</td>
                      <td className="px-5 py-3"><StatusBadge label={log.status === 'success' ? 'OK' : 'Error'} variant={log.status === 'success' ? 'success' : 'error'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 bg-surface-container-low/20 border-t border-outline-variant/10">
              <p className="text-[11px] text-on-surface-variant">Showing last {logs.length} uploads</p>
            </div>
          </GlassCard>
        </>
      )}

      {/* ── Roster tab ── */}
      {mainTab === 'roster' && (
        <>
          {/* Action bar */}
          <div className="flex flex-wrap gap-3 mb-5 items-center">
            <select value={filterRBranch} onChange={e => setFilterRBranch(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm outline-none">
              <option value="all">All Branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
            </select>

            <div className="flex bg-surface-container rounded-lg p-0.5">
              {(['all','b2c','b2b'] as const).map(t => (
                <button key={t} onClick={() => setFilterRType(t)}
                  className={`px-3 py-1.5 rounded-md font-label-md text-label-md uppercase transition-all ${filterRType === t ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:text-primary'}`}>
                  {t === 'all' ? 'All' : t.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="flex-1 min-w-[200px] max-w-xs relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">search</span>
              <input value={filterRSearch} onChange={e => setFilterRSearch(e.target.value)}
                placeholder="Search name or rep code..."
                className="w-full bg-surface-container rounded-lg pl-8 pr-3 py-2 text-body-sm outline-none border-none" />
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-body-sm text-on-surface-variant select-none">
              <button onClick={() => setShowInactive(v => !v)}
                className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${showInactive ? 'bg-primary' : 'bg-surface-container-highest'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${showInactive ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              Show inactive
            </label>

            <div className="ml-auto flex gap-2">
              <button onClick={loadRoster}
                className="p-2 rounded-lg bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-colors" title="Refresh roster">
                <span className={`material-symbols-outlined text-sm ${rosterLoading ? 'animate-spin-slow' : ''}`}>refresh</span>
              </button>
              <button onClick={syncRosterToSheets} disabled={rosterSyncing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-tertiary text-white font-label-md text-label-md hover:opacity-90 disabled:opacity-60 transition-all">
                <span className={`material-symbols-outlined text-sm ${rosterSyncing ? 'animate-spin-slow' : ''}`}>cloud_upload</span>
                {rosterSyncing ? 'Syncing...' : 'Sync to Sheets'}
              </button>
              <button onClick={() => { setEditRep(null); setRepModal('create') }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-label-md text-label-md hover:opacity-90 shadow-primary transition-all">
                <span className="material-symbols-outlined text-sm">person_add</span>
                Add Rep
              </button>
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Total Active', value: roster.filter(r => r.active === 1).length, color: 'text-primary', bg: 'bg-primary/10', icon: 'badge' },
              { label: 'Inactive', value: roster.filter(r => r.active === 0).length, color: 'text-on-surface-variant', bg: 'bg-surface-container-highest', icon: 'person_off' },
              { label: 'B2C Reps', value: roster.filter(r => r.active === 1 && r.staff_type === 'b2c').length, color: 'text-secondary', bg: 'bg-secondary/10', icon: 'storefront' },
              { label: 'B2B Reps', value: roster.filter(r => r.active === 1 && r.staff_type === 'b2b').length, color: 'text-tertiary', bg: 'bg-tertiary/10', icon: 'business' },
            ].map(s => (
              <GlassCard key={s.label} className="px-4 py-3 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center`}>
                  <span className={`material-symbols-outlined ${s.color}`}>{s.icon}</span>
                </div>
                <div>
                  <p className="font-bold text-on-surface text-xl tabular-nums">{s.value}</p>
                  <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">{s.label}</p>
                </div>
              </GlassCard>
            ))}
          </div>

          {/* Roster table */}
          <GlassCard elevated className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/50">
                    {['Rep Code','Name','Branch','Supervisor','Type','Target','Status','Actions'].map(h => (
                      <th key={h} className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {rosterLoading ? (
                    <tr><td colSpan={8} className="py-10 text-center text-on-surface-variant">
                      <span className="material-symbols-outlined animate-spin-slow text-2xl block mx-auto mb-2">sync</span>Loading roster...
                    </td></tr>
                  ) : filteredRoster.length === 0 ? (
                    <tr><td colSpan={8} className="py-10 text-center text-on-surface-variant text-body-sm">
                      No reps match the current filters.
                    </td></tr>
                  ) : filteredRoster.map(rep => (
                    <tr key={rep.id} className={`transition-colors group ${rep.active === 0 ? 'opacity-50' : 'hover:bg-surface-container/20'}`}>
                      <td className="px-5 py-3">
                        <span className="font-mono text-body-sm font-bold text-on-surface">{rep.rep_code || '—'}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold uppercase flex-shrink-0">
                            {rep.full_name.slice(0, 1)}
                          </div>
                          <div>
                            <p className="font-bold text-body-sm text-on-surface">{rep.full_name}</p>
                            {rep.nickname && <p className="text-[10px] text-on-surface-variant">{rep.nickname}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">{rep.branch_code}</span>
                          <span className="text-body-sm">{rep.branch_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-body-sm text-on-surface-variant">{rep.supervisor_name ?? '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${rep.staff_type === 'b2c' ? 'bg-secondary/10 text-secondary' : 'bg-tertiary/10 text-tertiary'}`}>
                          {rep.staff_type.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-body-sm tabular-nums">
                        {rep.point_target != null
                          ? <><span className="font-bold">{rep.point_target.toLocaleString()}</span><span className="text-on-surface-variant"> pts</span></>
                          : <span className="text-on-surface-variant">—</span>}
                        {rep.year_month && (
                          <p className="text-[10px] text-on-surface-variant">{rep.year_month.slice(0,4)}-{rep.year_month.slice(4)}</p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge label={rep.active === 1 ? 'Active' : 'Inactive'} variant={rep.active === 1 ? 'success' : 'neutral'} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditRep(rep); setRepModal('edit') }}
                            className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors" title="Edit rep">
                            <span className="material-symbols-outlined text-sm">edit</span>
                          </button>
                          {rep.active === 1 ? (
                            <button onClick={() => handleDeactivate(rep)}
                              className="p-1.5 text-error hover:bg-error-container/30 rounded-lg transition-colors" title="Deactivate">
                              <span className="material-symbols-outlined text-sm">person_off</span>
                            </button>
                          ) : (
                            <button onClick={() => handleReactivate(rep)}
                              className="p-1.5 text-tertiary hover:bg-tertiary/10 rounded-lg transition-colors" title="Reactivate">
                              <span className="material-symbols-outlined text-sm">person_check</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 bg-surface-container-low/20 border-t border-outline-variant/10 flex items-center justify-between">
              <p className="text-[11px] text-on-surface-variant">
                Showing {filteredRoster.length} of {roster.length} reps
                {!showInactive && roster.filter(r => r.active === 0).length > 0 && ` · ${roster.filter(r => r.active === 0).length} inactive hidden`}
              </p>
              <p className="text-[10px] text-on-surface-variant/60 italic">Changes auto-push to Google Sheets Roster tab</p>
            </div>
          </GlassCard>
        </>
      )}
    </AppShell>
  )
}
