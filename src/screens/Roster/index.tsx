import { useEffect, useState, useRef } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useAuthStore } from '../../store/auth.store'
import type { RosterRow, Supervisor } from '../../types'
import { validateRosterRows, downloadCSV } from '../../utils/csv'
import { parseXLSX, readFileAsArrayBuffer, generateRosterTemplateXLSX, downloadXLSX } from '../../utils/xlsx'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function toCSV(rows: Array<Record<string, string | number>>): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n')
}

// ── Rep create/edit modal ────────────────────────────────────────────────────
interface RepModalProps {
  mode: 'create' | 'edit'
  initial: Partial<RosterRow>
  branches: Array<{ id: number; name: string; code: string }>
  supervisors: Supervisor[]
  onSave: (data: {
    id?: number; repCode: string; fullName: string; nickname: string
    branchId: number; supervisorId: number | null; staffType: string
  }) => void
  onClose: () => void
}

function RepModal({ mode, initial, branches, supervisors, onSave, onClose }: RepModalProps) {
  const [repCode,     setRepCode]     = useState(initial.rep_code ?? '')
  const [fullName,    setFullName]    = useState(initial.full_name ?? '')
  const [nickname,    setNickname]    = useState(initial.nickname ?? '')
  const [branchId,    setBranchId]    = useState(initial.branch_id ?? 0)
  const [supId,       setSupId]       = useState<number | null>(initial.supervisor_id ?? null)
  const [staffType,   setStaffType]   = useState(initial.staff_type ?? 'b2c')

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
      staffType,
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
          <p className="text-[11px] text-on-surface-variant/60 italic">
            KPI point target is configured in KPI Settings (per branch / staff type) — not per rep.
          </p>
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

// ── Roster upload modal — file drops here, auto-syncs to Sheets on success ──
function RosterUploadModal({ token, onDone, onClose }: {
  token: string
  onDone: (msg: string) => void
  onClose: () => void
}) {
  const [file, setFile]       = useState<File | null>(null)
  const [errors, setErrors]   = useState<string[]>([])
  const [result, setResult]   = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function pickFile(f: File) {
    setFile(f); setErrors([]); setResult(null)
  }

  async function submit() {
    if (!file) return
    setUploading(true)
    try {
      const buf = await readFileAsArrayBuffer(file)
      const parsed = parseXLSX(buf)
      const { rows, errors: parseErrors } = validateRosterRows(parsed)
      if (parseErrors.length) setErrors(parseErrors)
      if (!rows.length) { setUploading(false); return }
      const res = await window.api.uploadRoster(token, rows)
      if (res.success) {
        setResult(`Created: ${res.created} · Updated: ${res.updated}${res.skipped ? ` · Skipped: ${res.skipped}` : ''}`)
        onDone(`Roster uploaded — created ${res.created}, updated ${res.updated}.`)
      } else {
        setErrors([res.error ?? 'Upload failed'])
      }
    } finally { setUploading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-7 animate-slide-in">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-headline-md text-on-surface">Upload Roster</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-error transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <p className="text-body-sm text-on-surface-variant mb-3">
          Matches by Rep Code — existing reps update, new codes create new reps. Columns: Rep_Code, Full_Name, Nickname, Branch_Code, Team_Sup_Name, Staff_Type, Effective_Date, Sup_Code (optional).
          <strong> Effective_Date is required (YYYY-MM-DD)</strong> — it's the only thing that decides which month a row counts for, there is no month picker in the app.
          <strong> Sup_Code</strong>, if filled in, is matched before Team_Sup_Name — safer than name matching since codes don't collide across Lao text/typos/duplicate names.
          KPI point target is not part of the roster — it is configured in KPI Settings.
        </p>

        {!file ? (
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) pickFile(f) }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl h-32 flex flex-col items-center justify-center cursor-pointer transition-all ${isDragging ? 'border-secondary bg-secondary/5' : 'border-outline-variant/50 bg-surface-container/30 hover:border-secondary/40'}`}
          >
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f) }} />
            <span className="material-symbols-outlined text-3xl text-on-surface-variant/40 mb-2">upload_file</span>
            <p className="text-body-sm text-on-surface-variant">Drop XLSX file here or click to browse</p>
          </div>
        ) : (
          <div className="bg-surface-container/40 rounded-xl p-4 flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">description</span>
              <span className="text-body-sm font-bold">{file.name}</span>
            </div>
            <button onClick={() => { setFile(null); setErrors([]); setResult(null) }} className="text-on-surface-variant hover:text-error">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}

        {errors.length > 0 && (
          <div className="mt-3 p-3 bg-error-container/20 rounded-lg max-h-32 overflow-y-auto">
            {errors.map((e, i) => <p key={i} className="text-[11px] text-error">{e}</p>)}
          </div>
        )}
        {result && (
          <div className="mt-3 p-3 bg-tertiary-fixed/30 rounded-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary text-sm">cloud_done</span>
            <p className="text-body-sm">{result} Synced to Google Sheets.</p>
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-outline-variant text-on-surface-variant font-label-md hover:bg-surface-container transition-colors">
            Close
          </button>
          <button onClick={submit} disabled={!file || uploading}
            className="flex-1 py-2.5 rounded-lg bg-secondary text-white font-label-md flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50">
            <span className={`material-symbols-outlined text-sm ${uploading ? 'animate-spin-slow' : ''}`}>{uploading ? 'sync' : 'cloud_upload'}</span>
            {uploading ? 'Uploading...' : 'Upload Roster'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────
export default function Roster() {
  const { token, user, branches } = useAuthStore()
  const now = new Date()

  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const isHr = user?.role === 'hr'
  const canEdit = user?.role === 'admin' || user?.role === 'hr'
  const canUpload = canEdit || user?.role === 'hr_support'

  const [roster, setRoster]           = useState<RosterRow[]>([])
  const [published, setPublished]     = useState(true)
  const [supervisors, setSupervisors] = useState<Supervisor[]>([])
  const [loading, setLoading]         = useState(false)
  const [repModal, setRepModal]       = useState<'create' | 'edit' | null>(null)
  const [editRep, setEditRep]         = useState<RosterRow | null>(null)
  const [toast, setToast]             = useState('')
  const [dlTemplate, setDlTemplate]   = useState(false)
  const [showUpload, setShowUpload]   = useState(false)
  type RosterSort = { col: 'rep_code' | 'full_name' | 'branch_name' | 'supervisor_name' | 'staff_type'; dir: 'asc' | 'desc' }
  const [sort, setSort]               = useState<RosterSort>({ col: 'full_name', dir: 'asc' })
  const [filterBranch, setFilterBranch] = useState<number | 'all'>('all')
  const [filterSup, setFilterSup]       = useState<number | 'all'>('all')
  const [filterType, setFilterType]     = useState<'all' | 'b2c' | 'b2b'>('all')
  const [search, setSearch]             = useState('')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  async function loadRoster() {
    if (!token) return
    setLoading(true)
    try {
      const [snapshot, sups] = await Promise.all([
        window.api.getRosterAllAsOf(token, year, month) as Promise<{ published: boolean; rows: RosterRow[] }>,
        window.api.getSupervisors(token),
      ])
      setRoster(snapshot.rows)
      setPublished(snapshot.published)
      setSupervisors(sups as Supervisor[])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadRoster() }, [token, year, month])

  async function handleSaveRep(data: {
    id?: number; repCode: string; fullName: string; nickname: string
    branchId: number; supervisorId: number | null; staffType: string
  }) {
    if (!token) return
    const res = await window.api.saveRosterRep(token, data, year, month)
    if (res?.success) {
      showToast(data.id ? `"${data.fullName}" updated for ${MONTHS[month - 1]} ${year}.` : `"${data.fullName}" added to ${MONTHS[month - 1]} ${year}.`)
      setRepModal(null); setEditRep(null)
      loadRoster()
    }
  }

  async function handleDeactivate(rep: RosterRow) {
    if (!token) return
    if (!confirm(`Deactivate "${rep.full_name}" starting ${MONTHS[month - 1]} ${year}? They will be hidden from entry screens from this month on.`)) return
    await window.api.deactivateRosterRep(token, rep.id, year, month)
    showToast(`"${rep.full_name}" deactivated.`)
    loadRoster()
  }

  async function handleReactivate(rep: RosterRow) {
    if (!token) return
    await window.api.reactivateRosterRep(token, rep.id, year, month)
    showToast(`"${rep.full_name}" reactivated.`)
    loadRoster()
  }

  async function downloadTemplate() {
    if (!token) return
    setDlTemplate(true)
    try {
      const rows = await window.api.getRosterTemplate(token) as Array<{
        rep_code: string | null; full_name: string; nickname: string | null; branch_code: string
        supervisor_name: string | null; supervisor_code: string | null; staff_type: string | null
      }>
      downloadXLSX('roster_template.xlsx', generateRosterTemplateXLSX(rows))
    } finally { setDlTemplate(false) }
  }

  function toggleSort(col: RosterSort['col']) {
    setSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })
  }

  const filteredRoster = roster.filter(r => {
    if (r.active === 0) return false
    if (filterBranch !== 'all' && r.branch_id !== filterBranch) return false
    if (filterSup !== 'all' && r.supervisor_id !== filterSup) return false
    if (filterType !== 'all' && r.staff_type !== filterType) return false
    if (search) {
      const q = search.toLowerCase()
      return r.full_name.toLowerCase().includes(q) ||
             (r.rep_code ?? '').toLowerCase().includes(q) ||
             (r.nickname ?? '').toLowerCase().includes(q)
    }
    return true
  }).sort((a, b) => {
    const { col, dir } = sort
    const va = String((a as Record<string, unknown>)[col] ?? '')
    const vb = String((b as Record<string, unknown>)[col] ?? '')
    return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
  })

  function exportRoster() {
    const rows = filteredRoster.map(r => ({
      Month: `${MONTHS[month - 1]} ${year}`,
      Rep_Code: r.rep_code ?? '', Full_Name: r.full_name, Nickname: r.nickname ?? '',
      Branch: r.branch_name, Supervisor: r.supervisor_name ?? '', Type: r.staff_type.toUpperCase(),
      Status: r.active === 1 ? 'Active' : 'Inactive',
    }))
    downloadCSV(`roster_${MONTHS[month - 1]}_${year}.csv`, toCSV(rows))
  }

  function handleMonthChange(y: number, m: number) {
    setYear(y); setMonth(m)
  }

  return (
    <AppShell title="Roster" allowedRoles={['admin', 'hr', 'top_manager', 'hr_support']}>
      {toast && (
        <div className="fixed top-20 right-6 z-50 bg-inverse-surface text-inverse-on-surface px-5 py-3 rounded-xl shadow-lg animate-slide-in font-body-sm">
          {toast}
        </div>
      )}

      {repModal && (
        <RepModal
          mode={repModal}
          initial={editRep ?? {}}
          branches={branches}
          supervisors={supervisors}
          onSave={handleSaveRep}
          onClose={() => { setRepModal(null); setEditRep(null) }}
        />
      )}

      {showUpload && token && (
        <RosterUploadModal
          token={token}
          onDone={msg => { showToast(msg); loadRoster() }}
          onClose={() => setShowUpload(false)}
        />
      )}

      {/* Header */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Roster</h2>
          <p className="text-on-surface-variant text-body-md mt-1">
            {published
              ? `Roster for ${MONTHS[month - 1]} ${year} — edit, add, deactivate, or upload reps`
              : `No roster yet for ${MONTHS[month - 1]} ${year}`}
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold ml-2">{isHr ? 'HR' : 'Admin'}</span>
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <select value={month} onChange={e => handleMonthChange(year, Number(e.target.value))}
            className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm outline-none">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <input type="number" value={year} onChange={e => handleMonthChange(Number(e.target.value), month)}
            className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm w-24 outline-none" />
          <button onClick={loadRoster} className="p-2 rounded-lg bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-colors" title="Refresh">
            <span className={`material-symbols-outlined text-sm ${loading ? 'animate-spin-slow' : ''}`}>refresh</span>
          </button>
        </div>
      </div>

      {!published && (
        <div className="mb-5 flex items-start gap-3 bg-error-container/20 border border-error/30 rounded-xl px-5 py-4">
          <span className="material-symbols-outlined text-error mt-0.5">info</span>
          <div className="flex-1">
            <p className="font-label-md text-label-md text-error font-bold uppercase mb-1">No Roster Yet</p>
            <p className="text-body-sm text-on-surface-variant mb-3">
              No roster exists for {MONTHS[month - 1]} {year} or any earlier month. Add your first rep or upload a roster file to get started —
              every following month automatically carries forward from the last one edited, no monthly confirmation needed.
            </p>
            <div className="flex gap-2 flex-wrap">
              {canUpload && (
                <button onClick={() => setShowUpload(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-white font-label-md text-label-md hover:opacity-90 transition-all">
                  <span className="material-symbols-outlined text-sm">upload_file</span>
                  Upload Roster
                </button>
              )}
              {canEdit && (
                <button onClick={() => { setEditRep(null); setRepModal('create') }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-label-md text-label-md hover:opacity-90 shadow-primary transition-all">
                  <span className="material-symbols-outlined text-sm">person_add</span>
                  Add Rep
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <select value={filterBranch} onChange={e => { setFilterBranch(e.target.value === 'all' ? 'all' : Number(e.target.value)); setFilterSup('all') }}
          className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm outline-none">
          <option value="all">All Branches</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
        </select>

        <select value={filterSup} onChange={e => setFilterSup(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm outline-none">
          <option value="all">All Supervisors</option>
          {(filterBranch !== 'all' ? supervisors.filter(s => s.branch_id === filterBranch) : supervisors).map(s => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>

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
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name or rep code..."
            className="w-full bg-surface-container rounded-lg pl-8 pr-3 py-2 text-body-sm outline-none border-none" />
        </div>

        <div className="ml-auto flex gap-2">
          <button onClick={downloadTemplate} disabled={dlTemplate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container text-on-surface font-label-md text-label-md hover:bg-surface-container-high disabled:opacity-60 transition-all" title="Download CSV template">
            <span className={`material-symbols-outlined text-sm ${dlTemplate ? 'animate-spin-slow' : ''}`}>{dlTemplate ? 'sync' : 'download'}</span>
            Template
          </button>
          <button onClick={exportRoster}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container text-on-surface font-label-md text-label-md hover:bg-surface-container-high transition-all" title="Export current view to CSV">
            <span className="material-symbols-outlined text-sm">file_download</span>
            Export
          </button>
          {canUpload && (
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-white font-label-md text-label-md hover:opacity-90 transition-all">
              <span className="material-symbols-outlined text-sm">upload_file</span>
              Upload Roster
            </button>
          )}
          {canEdit && (
            <button onClick={() => { setEditRep(null); setRepModal('create') }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-label-md text-label-md hover:opacity-90 shadow-primary transition-all">
              <span className="material-symbols-outlined text-sm">person_add</span>
              Add Rep
            </button>
          )}
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
        <div className="px-5 py-3 border-b border-outline-variant/10 flex items-center justify-between">
          <h3 className="font-headline-md text-headline-md text-on-surface">Roster — {MONTHS[month - 1]} {year}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/50">
                {([
                  { label: 'Rep Code', col: 'rep_code' as const },
                  { label: 'Name',     col: 'full_name' as const },
                  { label: 'Branch',   col: 'branch_name' as const },
                  { label: 'Supervisor', col: 'supervisor_name' as const },
                  { label: 'Type',     col: 'staff_type' as const },
                ]).map(({ label, col }) => (
                  <th key={col} onClick={() => toggleSort(col)}
                    className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-primary select-none group">
                    <span className="flex items-center gap-1">
                      {label}
                      <span className="material-symbols-outlined text-xs opacity-40 group-hover:opacity-100">
                        {sort.col === col ? (sort.dir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                      </span>
                    </span>
                  </th>
                ))}
                {['Status','Actions'].map(h => (
                  <th key={h} className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {loading ? (
                <tr><td colSpan={7} className="py-10 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined animate-spin-slow text-2xl block mx-auto mb-2">sync</span>Loading roster...
                </td></tr>
              ) : filteredRoster.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-on-surface-variant text-body-sm">
                  {published ? 'No reps match the current filters.' : `No roster uploaded for ${MONTHS[month - 1]} ${year}.`}
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
                  <td className="px-5 py-3">
                    <StatusBadge label={rep.active === 1 ? 'Active' : 'Inactive'} variant={rep.active === 1 ? 'success' : 'neutral'} />
                  </td>
                  <td className="px-5 py-3">
                    {canEdit && (
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
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 bg-surface-container-low/20 border-t border-outline-variant/10 flex items-center justify-between">
          <p className="text-[11px] text-on-surface-variant">
            Showing {filteredRoster.length} of {roster.length} reps
            {roster.filter(r => r.active === 0).length > 0 && ` · ${roster.filter(r => r.active === 0).length} inactive hidden`}
          </p>
          <p className="text-[10px] text-on-surface-variant/60 italic">Changes auto-push to Google Sheets Roster tab</p>
        </div>
      </GlassCard>
    </AppShell>
  )
}
