import { useEffect, useState, useRef } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import type { DailyEntry } from '../../types'
import { validateDailyRows } from '../../utils/csv'
import { parseXLSX, readFileAsArrayBuffer, generateDailyTemplateXLSX, downloadXLSX } from '../../utils/xlsx'

type Tab = 'manual' | 'daily-csv'

function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function DailyEntry() {
  const { token, user, branches } = useAuthStore()
  const { selectedBranchId, selectedYear, selectedMonth, setUnsyncedCount } = useAppStore()
  const [activeTab, setActiveTab] = useState<Tab>('manual')

  // Manual entry state
  const [entries, setEntries] = useState<DailyEntry[]>([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState<Record<number, boolean>>({})

  // CSV upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading]   = useState(false)
  const [preview, setPreview]       = useState<{ headers: string[]; sample: string[][] } | null>(null)
  const [uploadErrors, setUploadErrors]  = useState<string[]>([])
  const [uploadResult, setUploadResult] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const effectiveBranchId = (user?.role === 'supervisor' || user?.role === 'branch_manager')
    ? (user.branchId ?? 1)
    : (selectedBranchId ?? branches[0]?.id ?? 1)

  const showSupColumn = user?.role !== 'supervisor'

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

  async function handleCellChange(salesmanId: number, branchId: number, field: 'jewelry_weight_g' | 'bar_weight_g' | 'quantity', value: string) {
    const numVal = parseFloat(value) || 0
    setEntries(prev => prev.map(e => e.salesman_id === salesmanId ? { ...e, [field]: numVal, synced: 0 } : e))
    setSaving(prev => ({ ...prev, [salesmanId]: true }))
    const entry = entries.find(e => e.salesman_id === salesmanId)
    if (!entry) return
    const updated = { ...entry, [field]: numVal }
    await window.api.saveEntry(token!, { salesmanId, branchId, date, jewelryWeightG: updated.jewelry_weight_g, barWeightG: updated.bar_weight_g, quantity: updated.quantity })
    setSaving(prev => ({ ...prev, [salesmanId]: false }))
    const count = await window.api.getUnsyncedCount(token!)
    setUnsyncedCount(count)
  }

  // ── CSV upload helpers ─────────────────────────────────────────────────
  function resetUpload() {
    setUploadFile(null); setPreview(null); setUploadErrors([]); setUploadResult(null)
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
        setUploadResult(`✓ Imported ${res.count} records from "${uploadFile.name}". Latest entry per staff/date kept.`)
        setUploadErrors(errors)
        resetUpload()
        loadEntries()
      } else {
        setUploadErrors([res.error ?? 'Upload failed'])
      }
    } finally { setUploading(false) }
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
          { key: 'manual',     label: 'Manual Entry',     icon: 'edit_document' },
          { key: 'daily-csv',  label: 'Daily XLSX Upload',  icon: 'upload_file' },
        ] as const).map(t => (
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
                              {e.nickname && <p className="text-[10px] text-on-surface-variant">{e.nickname}</p>}
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


      {/* Sticky footer for manual entry */}
      {activeTab === 'manual' && (
        <>
          <div className="fixed bottom-0 left-sidebar-width right-0 h-20 bg-surface-container-low/90 backdrop-blur-xl border-t border-white/20 z-40 flex items-center justify-between px-8">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Auto-save On</span>
              </div>
              <p className="text-sm text-on-surface-variant">{filled} / {entries.length} filled for {date}</p>
            </div>
            <button onClick={loadEntries} className="px-5 py-2.5 rounded-lg border border-primary text-primary font-bold hover:bg-primary/5 flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">refresh</span> Refresh
            </button>
          </div>
          <div className="h-20" />
        </>
      )}
    </AppShell>
  )
}

// ── Inline editable cell ───────────────────────────────────────────────────
function EditCell({ value, onBlur, isInt = false }: { value: number; onBlur: (v: string) => void; isInt?: boolean }) {
  return (
    <td className="px-5 py-compact-row text-right border-b-2 border-transparent focus-within:border-primary focus-within:bg-primary/[0.02] transition-all">
      <input type="number" step={isInt ? '1' : '0.01'} min="0" defaultValue={value || ''}
        onBlur={e => onBlur(e.target.value)}
        className="w-full bg-transparent border-none text-right focus:ring-0 font-tabular-nums text-sm p-1 outline-none" />
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
