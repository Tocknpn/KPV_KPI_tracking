import { useRef, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import { validateDailyRows } from '../../utils/csv'
import { useLanguage } from '../../i18n/LanguageContext'
import { parseXLSX, readFileAsArrayBuffer, generateDailyTemplateXLSX, downloadXLSX } from '../../utils/xlsx'

function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

interface UploadSummary { totalRecords: number; totalJewelry: number; totalBar: number; totalQty: number; totalWeight: number; complete: number; errors: number }
interface ErrorRow { row: number; data: { date: string; repCode: string; jewelryWeightG: number; barWeightG: number; quantity: number }; reason: string }

export default function DailyEntry() {
  const { t } = useLanguage()
  const { token, user, branches } = useAuthStore()
  const { selectedBranchId } = useAppStore()
  const [date] = useState(new Date().toISOString().split('T')[0])

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

  const effectiveBranchId = (user?.role === 'sales_sup' || user?.role === 'branch_manager' || user?.role === 'accountant_officer')
    ? (user.branchId ?? 1)
    : (selectedBranchId ?? branches[0]?.id ?? 1)

  const branchName = branches.find(b => b.id === effectiveBranchId)?.name ?? ''

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
    }
  }

  // Template downloads (XLSX) — Accountant Manager isn't scoped to one branch, so their
  // template carries every active rep across every branch in one file, not just whichever
  // branch happens to be selected.
  const isAccountantManager = user?.role === 'accountant_manager'

  async function downloadDailyTemplate() {
    if (!token) return
    const salesmen = await window.api.getSalesmenForTemplate(token, isAccountantManager ? null : effectiveBranchId) as Array<{ id: number; full_name: string; branch_id: number; branch_code: string }>
    const data = generateDailyTemplateXLSX(salesmen, date)
    const label = isAccountantManager ? 'All_Branches' : branchName.replace(/\s+/g, '_')
    downloadXLSX(`daily_template_${label}_${date}.xlsx`, data)
  }

  return (
    <AppShell title="KPV Sale Tracking">
      {/* Header */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">{t('de_title')}</h2>
          <p className="text-on-surface-variant text-body-md">{branchName}</p>
        </div>
      </div>

      <CSVUploadPanel
        title={t('de_panel_title')}
        description={t('de_panel_desc')}
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
        submitLabel={t('de_import_daily_data')}
        accent="primary"
      />

      {/* Upload result summary (accountant-facing) */}
      {uploadSummary && (
        <GlassCard elevated className="p-6 mt-6">
          <h4 className="font-headline-md text-headline-md text-on-surface mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">fact_check</span>
            {t('de_results_after_upload')}
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            {[
              { l: t('de_total_record'),  v: uploadSummary.totalRecords },
              { l: t('de_total_jewelry'), v: fmt(uploadSummary.totalJewelry) + ' g' },
              { l: t('de_total_bar'),     v: fmt(uploadSummary.totalBar) + ' g' },
              { l: t('de_total_qty'),     v: uploadSummary.totalQty },
              { l: t('de_total_weight'),  v: fmt(uploadSummary.totalWeight) + ' g' },
              { l: t('de_complete'),      v: uploadSummary.complete },
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
                {uploadSummary.errors} {t('de_records_failed')}
              </p>
              <button onClick={() => setShowErrorModal(true)}
                className="px-4 py-2 rounded-lg bg-error text-white font-label-md text-label-md hover:opacity-90 transition-all">
                {t('de_view_fix_errors')}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-tertiary-fixed/30 text-on-tertiary-fixed-variant px-5 py-3 rounded-xl">
              <span className="material-symbols-outlined text-tertiary">cloud_done</span>
              <p className="text-body-sm font-medium">{t('de_all_imported')} {uploadSummary.complete} {t('de_records_imported')}</p>
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
    </AppShell>
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
  const { t } = useLanguage()
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
            {t('de_download_template')}
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
          <p className="font-label-md text-label-md text-on-surface-variant">{t('de_drop_file')}</p>
          <p className="text-[11px] text-on-surface-variant/50 mt-1">{t('de_accepts_lao')}</p>
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
                {t('de_showing_3_rows')}
              </p>
            </div>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <div className="p-4 bg-error-container/20 border-t border-error/10">
              <p className="font-label-md text-label-md text-error mb-2">⚠ {t('de_warnings')} ({errors.length})</p>
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {errors.map((e, i) => <li key={i} className="text-[11px] text-on-error-container">{e}</li>)}
              </ul>
            </div>
          )}

          <div className="p-4 flex gap-3 border-t border-outline-variant/10">
            <button onClick={onReset} className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant font-label-md text-label-md hover:bg-surface-container transition-colors">
              {t('de_change_file')}
            </button>
            <button onClick={onSubmit} disabled={uploading}
              className={`px-6 py-2 rounded-lg font-label-md text-label-md flex items-center gap-2 transition-all disabled:opacity-60 ${accentBtn}`}>
              <span className={`material-symbols-outlined text-sm ${uploading ? 'animate-spin-slow' : ''}`}>
                {uploading ? 'sync' : 'cloud_upload'}
              </span>
              {uploading ? t('de_processing') : submitLabel}
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
  const { t } = useLanguage()
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
            <h3 className="font-headline-md text-on-surface">{t('de_fix_error_records')}</h3>
            <p className="text-body-sm text-on-surface-variant mt-0.5">{t('de_fix_modal_desc')}</p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-error transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-6 space-y-3">
          {local.map((r, i) => (
            <div key={i} className="border border-error/20 bg-error-container/10 rounded-xl p-4">
              <p className="text-[11px] text-error font-bold mb-2">{t('de_row')} {r.row}: {r.reason}</p>
              <div className="grid grid-cols-5 gap-3">
                <div>
                  <label className="text-[10px] text-on-surface-variant uppercase block mb-1">{t('de_field_date')}</label>
                  <input value={r.data.date} onChange={e => updateField(i, 'date', e.target.value)}
                    className="w-full bg-white border border-outline-variant/30 rounded-lg px-2 py-1.5 text-body-sm outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="text-[10px] text-on-surface-variant uppercase block mb-1">{t('de_field_rep_code')}</label>
                  <input value={r.data.repCode} onChange={e => updateField(i, 'repCode', e.target.value)}
                    className="w-full bg-white border border-outline-variant/30 rounded-lg px-2 py-1.5 text-body-sm outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="text-[10px] text-on-surface-variant uppercase block mb-1">{t('de_field_jewelry')}</label>
                  <input type="number" value={r.data.jewelryWeightG} onChange={e => updateField(i, 'jewelryWeightG', e.target.value)}
                    className="w-full bg-white border border-outline-variant/30 rounded-lg px-2 py-1.5 text-body-sm outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="text-[10px] text-on-surface-variant uppercase block mb-1">{t('de_field_bar')}</label>
                  <input type="number" value={r.data.barWeightG} onChange={e => updateField(i, 'barWeightG', e.target.value)}
                    className="w-full bg-white border border-outline-variant/30 rounded-lg px-2 py-1.5 text-body-sm outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="text-[10px] text-on-surface-variant uppercase block mb-1">{t('de_field_qty')}</label>
                  <input type="number" value={r.data.quantity} onChange={e => updateField(i, 'quantity', e.target.value)}
                    className="w-full bg-white border border-outline-variant/30 rounded-lg px-2 py-1.5 text-body-sm outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 p-6 border-t border-outline-variant/10">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-outline-variant text-on-surface-variant font-label-md hover:bg-surface-container transition-colors">
            {t('de_close')}
          </button>
          <button onClick={handleReupload} disabled={submitting}
            className="flex-1 py-2.5 rounded-lg bg-primary text-white font-label-md flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 shadow-primary">
            <span className={`material-symbols-outlined text-sm ${submitting ? 'animate-spin-slow' : ''}`}>{submitting ? 'sync' : 'cloud_upload'}</span>
            {submitting ? t('de_reuploading') : t('de_reupload_fixed')}
          </button>
        </div>
      </div>
    </div>
  )
}
