import { useEffect, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import { fmtDateTime } from '../../utils/dates'
import { useLanguage } from '../../i18n/LanguageContext'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

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
  return fmtDateTime(iso, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
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

function todayISO() { return new Date().toISOString().slice(0, 10) }

export default function UploadHistory() {
  const { t } = useLanguage()
  const { token, user, branches } = useAuthStore()
  const { selectedYear, selectedMonth, setSelectedPeriod, lastSyncedAt } = useAppStore()

  const [coverage, setCoverage] = useState<CoverageRow[]>([])
  const [logs, setLogs]         = useState<LogRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [filterType, setFilterType]     = useState<'all' | 'target' | 'daily'>('all')
  const [filterBranch, setFilterBranch] = useState<number | undefined>(undefined)

  const isApprover = user?.role === 'accountant_manager' || user?.role === 'admin'

  // ── Delete by branch + exact date range — independent of which upload batch a day's
  // entries came from, so one bad day can be reopened without wiping an entire multi-day
  // upload file. Replaces the old all-or-nothing per-batch delete (the same info now just
  // lives in the Upload Log table below, no need for a separate duplicate listing).
  const [dateDelBranch, setDateDelBranch] = useState<number | ''>('')
  const [dateDelFrom, setDateDelFrom]     = useState(todayISO())
  const [dateDelTo, setDateDelTo]         = useState(todayISO())
  const [dateDelCount, setDateDelCount]   = useState<number | null>(null)
  const [dateDelChecking, setDateDelChecking] = useState(false)
  const [dateDelBusy, setDateDelBusy]     = useState(false)

  useEffect(() => {
    if (!token || !isApprover || !dateDelBranch || !dateDelFrom || !dateDelTo || dateDelFrom > dateDelTo) {
      setDateDelCount(null)
      return
    }
    setDateDelChecking(true)
    window.api.countDailyEntriesByDate(token, dateDelBranch, dateDelFrom, dateDelTo)
      .then(setDateDelCount)
      .finally(() => setDateDelChecking(false))
  }, [token, isApprover, dateDelBranch, dateDelFrom, dateDelTo])

  async function deleteByDate() {
    if (!token || !dateDelBranch || !dateDelCount) return
    const branchName = branches.find(b => b.id === dateDelBranch)?.name ?? 'this branch'
    const period = dateDelFrom === dateDelTo ? dateDelFrom : `${dateDelFrom} → ${dateDelTo}`
    if (!window.confirm(`Delete ${dateDelCount} entries for ${branchName}, ${period}? This re-opens that date for resubmission and cannot be undone.`)) return
    setDateDelBusy(true)
    try {
      const res = await window.api.deleteDailyEntriesByDate(token, dateDelBranch, dateDelFrom, dateDelTo)
      if (res.success) { setDateDelCount(null); loadHistory() }
      else window.alert(res.error ?? 'Failed to delete entries.')
    } finally { setDateDelBusy(false) }
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

  useEffect(() => { loadHistory() }, [token, selectedYear, selectedMonth, filterType, filterBranch, lastSyncedAt])

  const branchesWithEntries = coverage.filter(c => c.days_with_entries > 0).length
  const totalBranches       = coverage.length
  const alertBranches       = coverage.filter(c => c.days_with_entries === 0)

  return (
    <AppShell title="KPV Sale Tracking">
      {/* Header */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">{t('uh_title')}</h2>
          <p className="text-on-surface-variant text-body-md mt-1">
            {t('uh_coverage_logs_for')} {MONTHS[selectedMonth - 1]} {selectedYear}
          </p>
        </div>
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
      </div>

      {alertBranches.length > 0 && (
        <div className="mb-6 flex items-start gap-3 bg-error-container/20 border border-error/20 rounded-xl px-5 py-4">
          <span className="material-symbols-outlined text-error mt-0.5">warning</span>
          <div>
            <p className="font-label-md text-label-md text-error font-bold uppercase mb-1">{t('uh_action_required')}</p>
            <p className="text-body-sm text-on-surface-variant">
              {alertBranches.map(b => b.branch_name).join(', ')} — {t('uh_no_daily_entries_for')} {MONTHS[selectedMonth - 1]} {selectedYear}.
            </p>
          </div>
        </div>
      )}

      <GlassCard elevated className="overflow-hidden mb-8">
        <div className="p-5 border-b border-outline-variant/10 flex justify-between items-center">
          <h3 className="font-headline-md text-headline-md text-on-surface">{t('uh_branch_coverage')}</h3>
          <div className="flex gap-4 text-body-sm">
            <span className="text-primary font-bold">{branchesWithEntries}/{totalBranches} {t('uh_branches_have_entries')}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/50">
                {(['uh_col_branch','uh_col_days_with_entries','uh_col_last_entry','uh_col_last_upload','uh_col_status'] as const).map(h => (
                  <th key={h} className="px-6 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {loading ? (
                <tr><td colSpan={5} className="py-10 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined animate-spin-slow text-2xl block mx-auto mb-2">sync</span>{t('uh_loading')}
                </td></tr>
              ) : coverage.map(c => {
                const entryPct = c.days_in_month > 0 ? (c.days_with_entries / c.days_in_month) * 100 : 0
                const status   = c.days_with_entries === 0 ? 'warning' : entryPct >= 80 ? 'success' : 'neutral'
                const statusLabel = c.days_with_entries === 0 ? t('uh_no_entries_status') : entryPct >= 80 ? t('uh_good') : t('uh_partial')
                return (
                  <tr key={c.branch_id} className={`transition-colors hover:bg-surface-container/20 ${status === 'warning' ? 'bg-secondary-container/5' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">{c.branch_code}</div>
                        <span className="font-medium">{c.branch_name}</span>
                      </div>
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

      {isApprover && (
        <GlassCard elevated className="overflow-hidden mb-8">
          <div className="p-5 border-b border-outline-variant/10">
            <h3 className="font-headline-md text-headline-md text-on-surface">{t('uh_approval_title')}</h3>
            <p className="text-body-sm text-on-surface-variant mt-1">
              {t('uh_approval_desc')}
            </p>
          </div>

          <div className="p-5">
            <div className="flex flex-wrap gap-3 items-end">
              <select value={dateDelBranch} onChange={e => setDateDelBranch(e.target.value ? Number(e.target.value) : '')}
                className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm outline-none">
                <option value="">{t('uh_select_branch')}</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
              </select>
              <div>
                <label className="text-[10px] text-on-surface-variant uppercase block mb-1">{t('uh_from')}</label>
                <input type="date" value={dateDelFrom} onChange={e => setDateDelFrom(e.target.value)}
                  className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-on-surface-variant uppercase block mb-1">{t('uh_to')}</label>
                <input type="date" value={dateDelTo} onChange={e => setDateDelTo(e.target.value)}
                  className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm outline-none" />
              </div>
              <button onClick={deleteByDate} disabled={!dateDelBranch || !dateDelCount || dateDelBusy || dateDelChecking}
                className="px-4 py-2 rounded-lg bg-error text-white text-[12px] font-bold hover:opacity-90 disabled:opacity-40 transition-all">
                {dateDelBusy ? t('uh_deleting') : dateDelChecking ? t('uh_checking')
                  : dateDelCount === null ? t('uh_delete_allow_resubmit')
                  : dateDelCount === 0 ? t('uh_no_entries_found') : `${t('uh_delete_n_entries')} ${dateDelCount} ${t('uh_entries')}`}
              </button>
            </div>
          </div>
        </GlassCard>
      )}

      <GlassCard elevated className="overflow-hidden">
        <div className="p-5 border-b border-outline-variant/10 flex justify-between items-center flex-wrap gap-3">
          <h3 className="font-headline-md text-headline-md text-on-surface">{t('uh_upload_log')}</h3>
          <div className="flex gap-2">
            <div className="flex bg-surface-container rounded-lg p-0.5">
              {(['all', 'daily', 'target'] as const).map(ft => (
                <button key={ft} onClick={() => setFilterType(ft)}
                  className={`px-3 py-1.5 rounded-md font-label-md text-label-md capitalize transition-all ${filterType === ft ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:text-primary'}`}>
                  {ft === 'all' ? t('uh_filter_all') : ft === 'daily' ? t('uh_filter_daily') : t('uh_filter_targets')}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/50">
                {(['uh_col_date_time','uh_col_branch','uh_col_type','uh_col_filename','uh_col_records','uh_col_period','uh_col_uploaded_by','uh_col_status'] as const).map(h => (
                  <th key={h} className="px-5 py-3 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {logs.length === 0 ? (
                <tr><td colSpan={8} className="py-10 text-center text-on-surface-variant text-body-sm">{t('uh_no_history_filter')}</td></tr>
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
                    <StatusBadge label={log.upload_type === 'daily' ? t('uh_daily_badge') : t('uh_target_badge')} variant={log.upload_type === 'daily' ? 'info' : 'gold'} />
                  </td>
                  <td className="px-5 py-3 text-body-sm text-on-surface-variant max-w-[180px] truncate" title={log.filename}>{log.filename || '—'}</td>
                  <td className="px-5 py-3 font-tabular-nums text-body-sm font-bold">{log.records_count}</td>
                  <td className="px-5 py-3 text-body-sm text-on-surface-variant">
                    {log.upload_type === 'daily' && log.date_from
                      ? log.date_from === log.date_to ? log.date_from : `${log.date_from} → ${log.date_to}`
                      : log.month && log.year ? `${MONTHS[log.month - 1]} ${log.year}` : '—'}
                  </td>
                  <td className="px-5 py-3 text-body-sm">{log.uploaded_by}</td>
                  <td className="px-5 py-3"><StatusBadge label={log.status === 'success' ? t('uh_status_ok') : t('uh_status_error')} variant={log.status === 'success' ? 'success' : 'error'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 bg-surface-container-low/20 border-t border-outline-variant/10">
          <p className="text-[11px] text-on-surface-variant">{t('uh_showing_last')} {logs.length} {t('uh_uploads')}</p>
        </div>
      </GlassCard>
    </AppShell>
  )
}
