import { useEffect, useState, useRef, useCallback } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import type { DailyEntry } from '../../types'
import { validateDailyRows, validateRosterRows } from '../../utils/csv'
import { parseXLSX, readFileAsArrayBuffer, generateDailyTemplateXLSX, generateRosterTemplateXLSX, downloadXLSX } from '../../utils/xlsx'

type Tab = 'manual' | 'daily-csv' | 'roster'

function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

interface UploadSummary { totalRecords: number; totalJewelry: number; totalBar: number; totalQty: number; totalWeight: number; complete: number; errors: number }
interface ErrorRow { row: number; data: { date: string; repCode: string; jewelryWeightG: number; barWeightG: number; quantity: number }; reason: string }

export default function DailyEntry() {
  const { token, user, branches } = useAuthStore()
  const { selectedBranchId, selectedYear, selectedMonth, setUnsyncedCount } = useAppStore()
  const [activeTab, setActiveTab] = useState<Tab>('manual')

  // Manual entry state
  const [entries, setEntries] = useState<DailyEntry[]>([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState<Record<number, boolean>>({})
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)

  // CSV upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading]   = useState(false)
  const [preview, setPreview]       = useState<{ headers: string[]; sample: string[][] } | null>(null)
  const [uploadErrors, setUploadErrors]  = useState<string[]>([])
  const [uploadResult, setUploadResult] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Upload result summary (accountant-facing) + error-fix flow
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null)
  const [errorRows, setErrorRows] = useState<ErrorRow[]>([])
  const [showErrorModal, setShowErrorModal] = useState(false)

  const effectiveBranchId = (user?.role === 'supervisor' || user?.role === 'branch_manager')
    ? (user.branchId ?? 1)
    : (selectedBranchId ?? branches[0]?.id ?? 1)

  const showSupColumn = user?.role !== 'supervisor'
  const isAdmin = user?.role === 'admin'

  // Roster upload state
  const [rosterFile, setRosterFile]         = useState<File | null>(null)
  const [rosterPreview, setRosterPreview]   = useState<{ headers: string[]; sample: string[][] } | null>(null)
  const [rosterErrors, setRosterErrors]     = useState<string[]>([])
  const [rosterResult, setRosterResult]     = useState<string | null>(null)
  const [rosterUploading, setRosterUploading] = useState(false)
  const [rosterDragging, setRosterDragging] = useState(false)
  const rosterFileRef = useRef<HTMLInputElement>(null)

  function resetRoster() { setRosterFile(null); setRosterPreview(null); setRosterErrors([]); setRosterResult(null) }

  async function handleRosterFilePick(file: File) {
    resetRoster(); setRosterFile(file)
    try {
      const buf = await readFileAsArrayBuffer(file)
      const parsed = parseXLSX(buf)
      setRosterPreview({ headers: parsed.headers, sample: parsed.rows.slice(0,3).map(r => parsed.headers.map(h => r[h] ?? '')) })
      if (parsed.errors.length) setRosterErrors(parsed.errors)
    } catch (e) { setRosterErrors([e instanceof Error ? e.message : 'Failed to read file']) }
  }

  async function submitRoster() {
    if (!rosterFile || !token) return
    setRosterUploading(true); setRosterResult(null)
    try {
      const buf = await readFileAsArrayBuffer(rosterFile)
      const parsed = parseXLSX(buf)
      const { rows, errors } = validateRosterRows(parsed)
      if (errors.length) setRosterErrors(errors)
      if (!rows.length) { setRosterUploading(false); return }
      const res = await window.api.uploadRoster(token, rows)
      if (res.success) {
        setRosterResult(`✓ Created: ${res.created} · Updated: ${res.updated}${res.skipped ? ` · Skipped: ${res.skipped}` : ''}`)
        resetRoster()
      } else { setRosterErrors([res.error ?? 'Upload failed']) }
    } finally { setRosterUploading(false) }
  }

  async function downloadRosterTemplate() {
    if (!token) return
    const salesmen = await window.api.getRosterTemplate(token) as Array<{ rep_code?: string; full_name: string; nickname?: string; branch_code: string; supervisor_name?: string }>
    const data = generateRosterTemplateXLSX(salesmen)
    downloadXLSX('roster_template.xlsx', data)
  }

  const branchName = branches.find(b => b.id === effectiveBranchId)?.name ?? ''

  // ── Manual entry ─────────────────────────────────────────────────────
  async function loadEntries() {
    if (!token) return
    setLoadingEntries(true)
    try {
      const data = await window.api.getEntries(token, effectiveBranchId, date)
      setEntries(data)
    } finally { setLoadingEntries(false) }
  }

  useEffect(() => { if (activeTab === 'manual') loadEntries() }, [token, effectiveBranchId, date, activeTab])

  const handleCellChange = useCallback(async (salesmanId: number, branchId: number, field: 'jewelry_weight_g' | 'bar_weight_g' | 'quantity', value: string) => {
    const numVal = field === 'quantity' ? (parseInt(value) || 0) : (parseFloat(value) || 0)
    // Capture updated entry inside functional update to avoid stale closure
    let updated: DailyEntry | null = null
    setEntries(prev => prev.map(e => {
      if (e.salesman_id === salesmanId) {
        updated = { ...e, [field]: numVal, synced: 0 }
        return updated
      }
      return e
    }))
    if (!updated) return
    setSaving(prev => ({ ...prev, [salesmanId]: true }))
    await window.api.saveEntry(token!, {
      salesmanId, branchId, date,
      jewelryWeightG: (updated as DailyEntry).jewelry_weight_g,
      barWeightG:     (updated as DailyEntry).bar_weight_g,
      quantity:       (updated as DailyEntry).quantity,
    })
    setSaving(prev => ({ ...prev, [salesmanId]: false }))
    setSavedAt(new Date().toLocaleTimeString())
    const count = await window.api.getUnsyncedCount(token!)
    setUnsyncedCount(count)
  }, [token, date])

  async function saveAll() {
    if (!token || !entries.length) return
    setSavingAll(true)
    const toSave = entries.filter(e => e.jewelry_weight_g > 0 || e.bar_weight_g > 0 || e.quantity > 0)
    await window.api.saveBatchEntries(token, toSave.map(e => ({
      salesmanId: e.salesman_id, branchId: effectiveBranchId, date,
      jewelryWeightG: e.jewelry_weight_g, barWeightG: e.bar_weight_g, quantity: e.quantity,
    })))
    setSavedAt(new Date().toLocaleTimeString())
    setSavingAll(false)
    const count = await window.api.getUnsyncedCount(token)
    setUnsyncedCount(count)
    loadEntries()
  }

  // ── CSV upload helpers ─────────────────────────────────────────────────
  function resetUpload() {
    setUploadFile(null); setPreview(null); setUploadErrors([]); setUploadResult(null)
    setUploadSummary(null); setErrorRows([])
  }

  async function handleFilePick(file: File) {
    resetUpload()
    setUploadFile(file)
    try {
      const buffer = await readFileAsArrayBuffer(file)
      const parsed = parseXLSX(buffer)
      setPreview({
        headers: parsed.headers,
        sample:  parsed.rows.slice(0, 3).map(r => parsed.headers.map(h => r[h] ?? '')),
      })
      if (parsed.errors.length) setUploadErrors(parsed.errors)
    } catch (e) {
      setUploadErrors([e instanceof Error ? e.message : 'Failed to read file'])
    }
  }

  // Daily XLSX submit
  async function submitDailyCSV() {
    if (!uploadFile || !token) return
    setUploading(true); setUploadResult(null)
    try {
      const buffer = await readFileAsArrayBuffer(uploadFile)
      const parsed = parseXLSX(buffer)
      const { rows, errors } = validateDailyRows(parsed)
      if (errors.length) { setUploadErrors(errors) }
      if (!rows.length) { setUploading(false); return }

      const dates = rows.map(r => r.date).sort()
      const res = await window.api.uploadDaily(token, rows, {
        branchId: effectiveBranchId,
        uploadType: 'daily',
        filename: uploadFile.name,
        recordsCount: rows.length,
        dateFrom: dates[0],
        dateTo: dates[dates.length - 1],
      })
      if (res.success) {
        setUploadSummary(res.summary ?? null)
        setErrorRows(res.errorRows ?? [])
        setUploadResult(null)
        setUploadErrors(errors)
        setUploadFile(null); setPreview(null)
        loadEntries()
      } else {
        setUploadErrors([res.error ?? 'Upload failed'])
      }
    } finally { setUploading(false) }
  }

  // Reupload corrected error rows (accountant fixed them in the error modal)
  async function reuploadFixedRows(fixed: ErrorRow[]) {
    if (!token) return
    const rows = fixed.map(f => f.data)
    const dates = rows.map(r => r.date).sort()
    const res = await window.api.uploadDaily(token, rows, {
      branchId: effectiveBranchId,
      uploadType: 'daily',
      filename: 'error-fix-reupload',
      recordsCount: rows.length,
      dateFrom: dates[0],
      dateTo: dates[dates.length - 1],
    })
    if (res.success) {
      const stillErrored = res.errorRows ?? []
      setErrorRows(stillErrored)
      setUploadSummary(prev => prev ? {
        ...prev,
        complete: prev.complete + (res.summary?.complete ?? 0),
        errors: stillErrored.length,
      } : res.summary ?? null)
      if (stillErrored.length === 0) setShowErrorModal(false)
      loadEntries()
    }
  }


  // Template downloads (XLSX)
  async function downloadDailyTemplate() {
    if (!token) return
    const salesmen = await window.api.getSalesmenForTemplate(token, effectiveBranchId) as Array<{ id: number; full_name: string; branch_id: number; branch_code: string }>
    const data = generateDailyTemplateXLSX(salesmen, date)
    downloadXLSX(`daily_template_${branchName.replace(/\s+/g,'_')}_${date}.xlsx`, data)
  }


  const totals = entries.reduce((a, e) => ({ j: a.j + (e.jewelry_weight_g ?? 0), b: a.b + (e.bar_weight_g ?? 0), q: a.q + (e.quantity ?? 0) }), { j: 0, b: 0, q: 0 })
  const filled = entries.filter(e => e.jewelry_weight_g > 0 || e.bar_weight_g > 0 || e.quantity > 0).length

  return (
    <AppShell title="SalesTrack Pro">
      {/* Header */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Performance Entry</h2>
          <p className="text-on-surface-variant text-body-md">{branchName}</p>
        </div>
        <GlassCard className="px-4 py-2 flex items-center gap-4">
          <div>
            <span className="font-label-md text-[10px] text-on-surface-variant uppercase block">Date</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="font-tabular-nums text-sm font-bold text-primary bg-transparent border-none outline-none" />
          </div>
          <div className="w-px h-8 bg-black/5" />
          <div>
            <span className="font-label-md text-[10px] text-on-surface-variant uppercase block">Entries</span>
            <span className="font-tabular-nums text-sm font-bold text-secondary">{filled} / {entries.length}</span>
          </div>
        </GlassCard>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-surface-container rounded-xl p-1 w-fit">
        {([
          { key: 'manual',    label: 'Manual Entry',      icon: 'edit_document', adminOnly: false },
          { key: 'daily-csv', label: 'Daily XLSX Upload', icon: 'upload_file',   adminOnly: false },
          { key: 'roster',    label: 'Rep Roster',        icon: 'group_add',     adminOnly: true  },
        ] as const).filter(t => !t.adminOnly || isAdmin).map(t => (
          <button key={t.key} onClick={() => { setActiveTab(t.key); resetUpload() }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-label-md text-label-md transition-all ${activeTab === t.key ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:text-primary'}`}>
            <span className="material-symbols-outlined text-sm">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Manual Entry ── */}
      {activeTab === 'manual' && (
        <>
          <GlassCard className="overflow-hidden mb-6" elevated>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-surface-container-highest/50 border-b border-black/5">
                    {(['Salesman', ...(showSupColumn ? ['Team Sup'] : []), 'Position','Jewelry (Baht)','Bar (Baht)','Qty','Status'] as string[]).map(h => (
                      <th key={h} className="px-5 py-4 text-left font-label-md text-label-md text-on-surface-variant uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {loadingEntries ? (
                    <tr><td colSpan={6 + (showSupColumn ? 1 : 0)} className="py-10 text-center text-on-surface-variant">
                      <span className="material-symbols-outlined animate-spin-slow text-2xl block mx-auto mb-2">sync</span>Loading...
                    </td></tr>
                  ) : entries.map(e => {
                    const isSaving = saving[e.salesman_id]
                    const hasData  = e.jewelry_weight_g > 0 || e.bar_weight_g > 0 || e.quantity > 0
                    return (
                      <tr key={e.salesman_id} className="hover:bg-primary/[0.02] transition-colors">
                        <td className="px-5 py-compact-row">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold uppercase">
                              {e.salesman_name?.slice(0,1)}
                            </div>
                            <div>
                              <p className="font-medium text-body-sm">{e.salesman_name}</p>
                              <p className="text-[10px] text-on-surface-variant font-mono">
                                {(e as { rep_code?: string }).rep_code ?? e.nickname ?? ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        {showSupColumn && (
                          <td className="px-5 py-compact-row text-body-sm text-on-surface-variant whitespace-nowrap">{e.supervisor_name ?? '—'}</td>
                        )}
                        <td className="px-5 py-compact-row text-body-sm text-on-surface-variant">{e.position}</td>
                        <EditCell value={e.jewelry_weight_g} onBlur={v => handleCellChange(e.salesman_id, effectiveBranchId, 'jewelry_weight_g', v)} />
                        <EditCell value={e.bar_weight_g} onBlur={v => handleCellChange(e.salesman_id, effectiveBranchId, 'bar_weight_g', v)} />
                        <EditCell value={e.quantity} onBlur={v => handleCellChange(e.salesman_id, effectiveBranchId, 'quantity', v)} isInt />
                        <td className="px-5 py-compact-row text-center">
                          {isSaving ? <span className="material-symbols-outlined text-secondary text-lg animate-spin-slow">sync</span>
                            : hasData ? (e.synced ? <span className="material-symbols-outlined text-green-500 text-lg">cloud_done</span> : <span className="material-symbols-outlined text-secondary text-lg">save</span>)
                            : <span className="material-symbols-outlined text-on-surface-variant/30 text-lg">pending</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </GlassCard>

          {/* Totals */}
          <div className="grid grid-cols-3 gap-card-gap">
            {[
              { label: 'Total Jewelry', value: `${fmt(totals.j)} g`, color: 'text-primary' },
              { label: 'Total Bar',     value: `${fmt(totals.b)} g`, color: 'text-secondary' },
              { label: 'Total Qty',     value: `${totals.q} pcs`,    color: 'text-tertiary' },
            ].map(k => (
              <GlassCard key={k.label} className="p-5">
                <p className="font-label-md text-label-md text-on-surface-variant uppercase mb-1">{k.label}</p>
                <h4 className={`font-headline-md text-headline-md font-bold tabular-nums ${k.color}`}>{k.value}</h4>
              </GlassCard>
            ))}
          </div>
        </>
      )}

      {/* ── Tab: Daily CSV Upload ── */}
      {activeTab === 'daily-csv' && (
        <CSVUploadPanel
          title="Daily Performance Upload"
          description="Upload daily KPI data for one or more dates. If same staff + date already exists, latest upload replaces it."
          templateNote="Format: Date (YYYY-MM-DD), Staff_ID, Full_Name, Branch_ID, KPI_1 (Jewelry g), KPI_2 (Bar g), KPI_3 (Quantity)"
          onDownloadTemplate={downloadDailyTemplate}
          templateFilename={`daily_template_${date}.xlsx`}
          onFilePick={handleFilePick}
          uploadFile={uploadFile}
          uploading={uploading}
          preview={preview}
          errors={uploadErrors}
          result={uploadResult}
          onSubmit={submitDailyCSV}
          onReset={resetUpload}
          isDragging={isDragging}
          setIsDragging={setIsDragging}
          fileRef={fileRef}
          submitLabel="Import Daily Data"
          accent="primary"
        />
      )}

      {/* ── Upload result summary (accountant-facing) ── */}
      {activeTab === 'daily-csv' && uploadSummary && (
        <GlassCard elevated className="p-6 mt-6">
          <h4 className="font-headline-md text-headline-md text-on-surface mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">fact_check</span>
            Results after upload
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            {[
              { l: 'Total Record',  v: uploadSummary.totalRecords },
              { l: 'Total Jewelry', v: fmt(uploadSummary.totalJewelry) + ' g' },
              { l: 'Total Bar',     v: fmt(uploadSummary.totalBar) + ' g' },
              { l: 'Total Qty',     v: uploadSummary.totalQty },
              { l: 'Total Weight',  v: fmt(uploadSummary.totalWeight) + ' g' },
              { l: 'Complete',      v: uploadSummary.complete },
            ].map(item => (
              <div key={item.l} className="bg-surface-container/40 rounded-xl p-3">
                <p className="text-[9px] text-on-surface-variant uppercase font-bold mb-1">{item.l}</p>
                <p className="font-bold text-[16px] tabular-nums text-on-surface">{item.v}</p>
              </div>
            ))}
          </div>
          {uploadSummary.errors > 0 ? (
            <div className="flex items-center justify-between bg-error-container/20 border border-error/20 rounded-xl px-5 py-3">
              <p className="text-body-sm text-error font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">error</span>
                {uploadSummary.errors} record{uploadSummary.errors > 1 ? 's' : ''} failed to import
              </p>
              <button onClick={() => setShowErrorModal(true)}
                className="px-4 py-2 rounded-lg bg-error text-white font-label-md text-label-md hover:opacity-90 transition-all">
                View &amp; Fix Errors
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-tertiary-fixed/30 text-on-tertiary-fixed-variant px-5 py-3 rounded-xl">
              <span className="material-symbols-outlined text-tertiary">cloud_done</span>
              <p className="text-body-sm font-medium">All {uploadSummary.complete} records imported and published to the cloud.</p>
            </div>
          )}
        </GlassCard>
      )}

      {showErrorModal && (
        <ErrorFixModal
          rows={errorRows}
          onReupload={reuploadFixedRows}
          onClose={() => setShowErrorModal(false)}
        />
      )}


      {/* ── Tab: Rep Roster Upload (admin only) ── */}
      {activeTab === 'roster' && isAdmin && (
        <CSVUploadPanel
          title="Monthly Rep Roster Upload"
          description="Upload or update your rep list monthly. Matches by Rep Code — existing reps update, new codes create new reps. Branch Code must match: MM, VC, IT, VT."
          templateNote="Columns: Rep_Code | Full_Name | Nickname | Branch_Code | Team_Sup_Name | Staff_Type | Effective_Date (optional, YYYY-MM-DD)"
          onDownloadTemplate={downloadRosterTemplate}
          templateFilename="roster_template.xlsx"
          onFilePick={handleRosterFilePick}
          uploadFile={rosterFile}
          uploading={rosterUploading}
          preview={rosterPreview}
          errors={rosterErrors}
          result={rosterResult}
          onSubmit={submitRoster}
          onReset={resetRoster}
          isDragging={rosterDragging}
          setIsDragging={setRosterDragging}
          fileRef={rosterFileRef}
          submitLabel="Upload Roster"
          accent="secondary"
        />
      )}

      {/* Sticky footer for manual entry */}
      {activeTab === 'manual' && (
        <>
          <div className="fixed bottom-0 left-sidebar-width right-0 h-20 bg-surface-container-low/90 backdrop-blur-xl border-t border-white/20 z-40 flex items-center justify-between px-8">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Auto-save</span>
              </div>
              <p className="text-sm text-on-surface-variant">{filled} / {entries.length} filled for {date}</p>
              {savedAt && (
                <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  Saved {savedAt}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={loadEntries} className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container flex items-center gap-2 text-sm">
                <span className="material-symbols-outlined text-base">refresh</span> Refresh
              </button>
              <button onClick={saveAll} disabled={savingAll || filled === 0}
                className="px-5 py-2.5 rounded-lg bg-primary text-white font-bold hover:opacity-90 disabled:opacity-40 flex items-center gap-2 text-sm">
                <span className={`material-symbols-outlined text-base ${savingAll ? 'animate-spin-slow' : ''}`}>
                  {savingAll ? 'sync' : 'save'}
                </span>
                {savingAll ? 'Saving...' : 'Save All'}
              </button>
            </div>
          </div>
          <div className="h-20" />
        </>
      )}
    </AppShell>
  )
}

// ── Inline editable cell ───────────────────────────────────────────────────
function EditCell({ value, onBlur, isInt = false }: { value: number; onBlur: (v: string) => void; isInt?: boolean }) {
  const [local, setLocal] = useState(value > 0 ? String(value) : '')
  const focused = useRef(false)

  // Sync value from parent (e.g. after Refresh) only when not actively typing
  useEffect(() => {
    if (!focused.current) {
      setLocal(value > 0 ? String(value) : '')
    }
  }, [value])

  return (
    <td className="px-5 py-compact-row text-right border-b-2 border-transparent focus-within:border-primary focus-within:bg-primary/[0.02] transition-all">
      <input
        type="number" step={isInt ? '1' : '0.01'} min="0"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onFocus={() => { focused.current = true }}
        onBlur={e => { focused.current = false; onBlur(e.target.value) }}
        className="w-full bg-transparent border-none text-right focus:ring-0 font-tabular-nums text-sm p-1 outline-none"
      />
    </td>
  )
}

// ── Shared CSV upload panel ────────────────────────────────────────────────
interface PanelProps {
  title: string; description: string; templateNote: string
  onDownloadTemplate: () => void; templateFilename: string
  onFilePick: (f: File) => void; uploadFile: File | null
  uploading: boolean; preview: { headers: string[]; sample: string[][] } | null
  errors: string[]; result: string | null
  onSubmit: () => void; onReset: () => void
  isDragging: boolean; setIsDragging: (v: boolean) => void
  fileRef: React.RefObject<HTMLInputElement>
  submitLabel: string; accent: 'primary' | 'secondary'
}

function CSVUploadPanel({ title, description, templateNote, onDownloadTemplate, onFilePick, uploadFile, uploading, preview, errors, result, onSubmit, onReset, isDragging, setIsDragging, fileRef, submitLabel, accent }: PanelProps) {
  const accentBtn = accent === 'secondary'
    ? 'bg-secondary text-white hover:opacity-90'
    : 'bg-primary text-white hover:opacity-90'
  const accentBorder = accent === 'secondary' ? 'border-secondary' : 'border-primary'

  return (
    <div className="space-y-6">
      {/* Info + template download */}
      <GlassCard elevated className="p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h3 className="font-headline-md text-headline-md text-on-surface mb-1">{title}</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">{description}</p>
            <div className="bg-surface-container rounded-lg px-4 py-3 text-body-sm text-on-surface-variant font-mono">
              {templateNote}
            </div>
          </div>
          <button onClick={onDownloadTemplate}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 border border-outline-variant rounded-lg text-on-surface-variant font-label-md text-label-md hover:bg-surface-container transition-colors">
            <span className="material-symbols-outlined text-sm">download</span>
            Download Template
          </button>
        </div>
      </GlassCard>

      {/* Dropzone */}
      {!uploadFile && (
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) onFilePick(f) }}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl h-44 flex flex-col items-center justify-center cursor-pointer transition-all ${isDragging ? `${accentBorder} bg-primary/5` : 'border-outline-variant/50 bg-white/40 hover:border-primary/40'}`}
        >
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onFilePick(f) }} />
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-3">upload_file</span>
          <p className="font-label-md text-label-md text-on-surface-variant">Drop XLSX file here or click to browse</p>
          <p className="text-[11px] text-on-surface-variant/50 mt-1">Accepts .xlsx — supports Lao text</p>
        </div>
      )}

      {/* Preview + errors */}
      {uploadFile && (
        <GlassCard elevated className="overflow-hidden">
          <div className="p-5 border-b border-outline-variant/10 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">description</span>
              <div>
                <p className="font-label-md text-label-md font-bold text-on-surface">{uploadFile.name}</p>
                <p className="text-[11px] text-on-surface-variant">{(uploadFile.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <button onClick={onReset} className="text-on-surface-variant hover:text-error transition-colors">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>

          {/* Column preview */}
          {preview && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-sm border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/50">
                    {preview.headers.map(h => (
                      <th key={h} className="px-4 py-2 font-label-md text-label-md text-on-surface-variant uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {preview.sample.map((row, i) => (
                    <tr key={i} className="hover:bg-surface-container/20">
                      {row.map((cell, j) => <td key={j} className="px-4 py-2 font-tabular-nums">{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-2 text-[11px] text-on-surface-variant/60 border-t border-outline-variant/10">
                Showing first 3 rows preview
              </p>
            </div>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <div className="p-4 bg-error-container/20 border-t border-error/10">
              <p className="font-label-md text-label-md text-error mb-2">⚠ Warnings ({errors.length})</p>
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {errors.map((e, i) => <li key={i} className="text-[11px] text-on-error-container">{e}</li>)}
              </ul>
            </div>
          )}

          <div className="p-4 flex gap-3 border-t border-outline-variant/10">
            <button onClick={onReset} className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant font-label-md text-label-md hover:bg-surface-container transition-colors">
              Change File
            </button>
            <button onClick={onSubmit} disabled={uploading}
              className={`px-6 py-2 rounded-lg font-label-md text-label-md flex items-center gap-2 transition-all disabled:opacity-60 ${accentBtn}`}>
              <span className={`material-symbols-outlined text-sm ${uploading ? 'animate-spin-slow' : ''}`}>
                {uploading ? 'sync' : 'cloud_upload'}
              </span>
              {uploading ? 'Processing...' : submitLabel}
            </button>
          </div>
        </GlassCard>
      )}

      {/* Success result */}
      {result && (
        <div className="flex items-center gap-3 bg-tertiary-fixed/30 text-on-tertiary-fixed-variant px-5 py-4 rounded-xl">
          <span className="material-symbols-outlined text-tertiary">check_circle</span>
          <p className="text-body-sm font-medium">{result}</p>
        </div>
      )}
    </div>
  )
}

// ── Error-fix modal: accountant edits failed rows here, then reuploads ─────
function ErrorFixModal({ rows, onReupload, onClose }: {
  rows: ErrorRow[]
  onReupload: (fixed: ErrorRow[]) => Promise<void>
  onClose: () => void
}) {
  const [local, setLocal] = useState<ErrorRow[]>(rows)
  const [submitting, setSubmitting] = useState(false)

  function updateField(idx: number, field: keyof ErrorRow['data'], value: string) {
    setLocal(prev => prev.map((r, i) => i === idx ? {
      ...r,
      data: {
        ...r.data,
        [field]: field === 'jewelryWeightG' || field === 'barWeightG' ? (parseFloat(value) || 0)
          : field === 'quantity' ? (parseInt(value) || 0)
          : value,
      },
    } : r))
  }

  async function handleReupload() {
    setSubmitting(true)
    try { await onReupload(local) } finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col animate-slide-in">
        <div className="flex justify-between items-center p-6 border-b border-outline-variant/10">
          <div>
            <h3 className="font-headline-md text-on-surface">Fix Error Records</h3>
            <p className="text-body-sm text-on-surface-variant mt-0.5">Edit the fields below, then reupload. Completed records were already published to the cloud.</p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-error transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-6 space-y-3">
          {local.map((r, i) => (
            <div key={i} className="border border-error/20 bg-error-container/10 rounded-xl p-4">
              <p className="text-[11px] text-error font-bold mb-2">Row {r.row}: {r.reason}</p>
              <div className="grid grid-cols-5 gap-3">
                <div>
                  <label className="text-[10px] text-on-surface-variant uppercase block mb-1">Date</label>
                  <input value={r.data.date} onChange={e => updateField(i, 'date', e.target.value)}
                    className="w-full bg-white border border-outline-variant/30 rounded-lg px-2 py-1.5 text-body-sm outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="text-[10px] text-on-surface-variant uppercase block mb-1">Rep Code</label>
                  <input value={r.data.repCode} onChange={e => updateField(i, 'repCode', e.target.value)}
                    className="w-full bg-white border border-outline-variant/30 rounded-lg px-2 py-1.5 text-body-sm outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="text-[10px] text-on-surface-variant uppercase block mb-1">Jewelry</label>
                  <input type="number" value={r.data.jewelryWeightG} onChange={e => updateField(i, 'jewelryWeightG', e.target.value)}
                    className="w-full bg-white border border-outline-variant/30 rounded-lg px-2 py-1.5 text-body-sm outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="text-[10px] text-on-surface-variant uppercase block mb-1">Bar</label>
                  <input type="number" value={r.data.barWeightG} onChange={e => updateField(i, 'barWeightG', e.target.value)}
                    className="w-full bg-white border border-outline-variant/30 rounded-lg px-2 py-1.5 text-body-sm outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="text-[10px] text-on-surface-variant uppercase block mb-1">Qty</label>
                  <input type="number" value={r.data.quantity} onChange={e => updateField(i, 'quantity', e.target.value)}
                    className="w-full bg-white border border-outline-variant/30 rounded-lg px-2 py-1.5 text-body-sm outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 p-6 border-t border-outline-variant/10">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-outline-variant text-on-surface-variant font-label-md hover:bg-surface-container transition-colors">
            Close
          </button>
          <button onClick={handleReupload} disabled={submitting}
            className="flex-1 py-2.5 rounded-lg bg-primary text-white font-label-md flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 shadow-primary">
            <span className={`material-symbols-outlined text-sm ${submitting ? 'animate-spin-slow' : ''}`}>{submitting ? 'sync' : 'cloud_upload'}</span>
            {submitting ? 'Reuploading...' : 'Reupload Fixed Records'}
          </button>
        </div>
      </div>
    </div>
  )
}
