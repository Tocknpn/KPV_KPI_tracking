import { useEffect, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useAuthStore } from '../../store/auth.store'
import { fmtDateTime } from '../../utils/dates'

interface AuditRow {
  id: number; occurred_at: string; username: string; role: string
  event_type: string; target_type: string | null; target_id: number | null
  detail: string | null; branch_id: number | null
}

const EVENT_COLORS: Record<string, 'success' | 'error' | 'info' | 'warning' | 'neutral' | 'gold'> = {
  login: 'success',
  logout: 'neutral',
  failed_login: 'error',
  user_create: 'info',
  user_update: 'info',
  user_delete: 'error',
  user_permanent_delete: 'error',
  permission_change: 'warning',
  sales_upload_submitted: 'info',
  sales_upload_deleted: 'warning',
  roster_rep_create: 'info',
  roster_rep_update: 'info',
  roster_rep_deactivate: 'warning',
  roster_rep_reactivate: 'success',
  roster_bulk_upload: 'info',
  supervisor_create: 'info',
  supervisor_update: 'info',
  supervisor_delete: 'warning',
  supervisor_assign_reps: 'info',
  kpi_config_create: 'info',
  kpi_config_update: 'info',
  kpi_config_delete: 'warning',
  kpi_metric_multiplier_update: 'info',
  kpi_branch_rates_update: 'info',
  kpi_branch_qty_tiers_update: 'info',
  kpi_branch_target_update: 'info',
  kpi_branch_target_defaults_update: 'info',
  kpi_monthly_branch_targets_update: 'info',
  kpi_formula_update: 'warning',
  kpi_sup_pct_update: 'warning',
  kpi_month_confirmed: 'success',
  kpi_default_rates_update: 'warning',
  kpi_default_qty_tiers_update: 'warning',
  commission_config_update: 'info',
  commission_defaults_update: 'warning',
}

const PAGE_SIZE = 50

function fmtTs(iso: string) {
  return fmtDateTime(iso, { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' })
}

export default function AuditLog() {
  const { token } = useAuthStore()
  const [rows, setRows]           = useState<AuditRow[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [page, setPage]           = useState(0)
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const [username, setUsername]   = useState('')
  const [eventType, setEventType] = useState('')

  async function load(p = page) {
    if (!token) return
    setLoading(true)
    try {
      const result = await window.api.getAuditLogs(token, {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        username: username || undefined,
        eventType: eventType || undefined,
        limit: PAGE_SIZE,
        offset: p * PAGE_SIZE,
      }) as { rows: AuditRow[]; total: number }
      setRows(result.rows)
      setTotal(result.total)
    } finally { setLoading(false) }
  }

  useEffect(() => { setPage(0); load(0) }, [token, dateFrom, dateTo, username, eventType])
  useEffect(() => { if (page > 0) load(page) }, [page])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <AppShell title="Audit Log" allowedRoles={['admin']}>
      <div className="flex justify-between items-end mb-6">
        <div>
          <nav className="flex items-center gap-2 text-label-md text-on-surface-variant mb-2">
            <span>Admin</span>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="text-primary">Audit Log</span>
          </nav>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Audit Log</h2>
          <p className="text-on-surface-variant text-body-md mt-1">All user actions — login, permission changes, user management</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-error-container/30 rounded-xl">
          <span className="material-symbols-outlined text-error text-sm">admin_panel_settings</span>
          <span className="font-label-md text-label-md text-error">Admin Only</span>
        </div>
      </div>

      {/* Filters */}
      <GlassCard className="p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm outline-none" />
        </div>
        <div>
          <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm outline-none" />
        </div>
        <div>
          <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">Username</label>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)}
            placeholder="Filter by user…"
            className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm outline-none w-44" />
        </div>
        <div>
          <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">Event Type</label>
          <select value={eventType} onChange={e => setEventType(e.target.value)}
            className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm outline-none">
            <option value="">All Events</option>
            <option value="login">Login</option>
            <option value="logout">Logout</option>
            <option value="failed_login">Failed Login</option>
            <option value="user_create">User Create</option>
            <option value="user_update">User Update</option>
            <option value="user_delete">User Delete</option>
            <option value="user_permanent_delete">User Permanent Delete</option>
            <option value="permission_change">Permission Change</option>
            <option value="sales_upload_submitted">Sales Upload Submitted</option>
            <option value="sales_upload_deleted">Sales Upload Deleted</option>
            <option value="roster_rep_create">Roster — Rep Create</option>
            <option value="roster_rep_update">Roster — Rep Update</option>
            <option value="roster_rep_deactivate">Roster — Rep Deactivate</option>
            <option value="roster_rep_reactivate">Roster — Rep Reactivate</option>
            <option value="roster_bulk_upload">Roster — Bulk Upload</option>
            <option value="supervisor_create">Supervisor Create</option>
            <option value="supervisor_update">Supervisor Update</option>
            <option value="supervisor_delete">Supervisor Delete</option>
            <option value="supervisor_assign_reps">Supervisor Assign Reps</option>
            <option value="kpi_config_create">KPI Config Create</option>
            <option value="kpi_config_update">KPI Config Update</option>
            <option value="kpi_config_delete">KPI Config Delete</option>
            <option value="kpi_metric_multiplier_update">KPI Metric Multiplier</option>
            <option value="kpi_branch_rates_update">KPI Branch Rates</option>
            <option value="kpi_branch_qty_tiers_update">KPI Branch Qty Tiers</option>
            <option value="kpi_branch_target_update">KPI Branch Target</option>
            <option value="kpi_branch_target_defaults_update">KPI Branch Target Defaults</option>
            <option value="kpi_monthly_branch_targets_update">KPI Monthly Branch Targets</option>
            <option value="kpi_formula_update">KPI Formula</option>
            <option value="kpi_sup_pct_update">KPI Supervisor %</option>
            <option value="kpi_month_confirmed">KPI Month Confirmed</option>
            <option value="kpi_default_rates_update">KPI Default Rates</option>
            <option value="kpi_default_qty_tiers_update">KPI Default Qty Tiers</option>
            <option value="commission_config_update">Commission Config</option>
            <option value="commission_defaults_update">Commission Defaults</option>
          </select>
        </div>
        <button onClick={() => { setDateFrom(''); setDateTo(''); setUsername(''); setEventType('') }}
          className="px-3 py-2 rounded-lg text-on-surface-variant border border-outline-variant hover:bg-surface-container text-body-sm transition-colors">
          Clear
        </button>
        <span className="ml-auto text-[11px] text-on-surface-variant self-end">{total.toLocaleString()} events total</span>
      </GlassCard>

      <GlassCard elevated className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/50">
                {['Timestamp','User','Role','Event','Target','Detail'].map(h => (
                  <th key={h} className="px-5 py-3 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {loading ? (
                <tr><td colSpan={6} className="py-16 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined animate-spin-slow text-2xl block mx-auto mb-2">sync</span>
                  Loading…
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="py-16 text-center text-on-surface-variant text-body-sm">
                  No audit events match the current filters.
                </td></tr>
              ) : rows.map(row => (
                <tr key={row.id} className="hover:bg-surface-container/20 transition-colors">
                  <td className="px-5 py-3 text-body-sm font-mono text-on-surface-variant whitespace-nowrap">{fmtTs(row.occurred_at)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold uppercase">
                        {row.username.slice(0, 1)}
                      </div>
                      <span className="font-bold text-body-sm text-on-surface">{row.username}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-[10px] font-bold uppercase bg-surface-container px-2 py-0.5 rounded-full text-on-surface-variant">
                      {row.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge
                      label={row.event_type.replace(/_/g, ' ')}
                      variant={EVENT_COLORS[row.event_type] ?? 'neutral'}
                    />
                  </td>
                  <td className="px-5 py-3 text-body-sm text-on-surface-variant">
                    {row.target_type ? `${row.target_type}${row.target_id ? ` #${row.target_id}` : ''}` : '—'}
                  </td>
                  <td className="px-5 py-3 text-body-sm text-on-surface-variant max-w-[320px] truncate" title={row.detail ?? undefined}>
                    {row.detail ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-4 border-t border-outline-variant/10 flex items-center justify-between">
            <p className="text-[11px] text-on-surface-variant">
              Page {page + 1} of {totalPages} · {total.toLocaleString()} events
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-4 py-1.5 rounded-lg border border-outline-variant text-body-sm text-on-surface-variant disabled:opacity-40 hover:bg-surface-container transition-colors">
                Previous
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="px-4 py-1.5 rounded-lg border border-outline-variant text-body-sm text-on-surface-variant disabled:opacity-40 hover:bg-surface-container transition-colors">
                Next
              </button>
            </div>
          </div>
        )}
      </GlassCard>
    </AppShell>
  )
}
