import { useEffect, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import { generateSampleWorkbook, downloadXLSX } from '../../utils/xlsx'
import { ROLE_DEFAULTS } from '../../types'
import type { SyncLog } from '../../types'
import UserManagementContent from '../UserManagement'

type Tab = 'connection' | 'users'

export default function Settings() {
  const { token, user, permissions } = useAuthStore()
  const { setLastSyncedAt } = useAppStore()

  const role = user?.role ?? 'sales_sup'
  const effectivePermissions = permissions.length > 0 ? permissions : ROLE_DEFAULTS[role] ?? []
  const canManageUsers = effectivePermissions.includes('user_management')

  const [tab, setTab] = useState<Tab>('connection')
  const [sheetsId, setSheetsId] = useState('')
  const [lastSync, setLastSync] = useState('')
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [isTestingConn, setIsTestingConn] = useState(false)
  const [connStatus, setConnStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [toast, setToast] = useState('')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  useEffect(() => {
    if (!token) return
    window.api.getSheetsConfig(token).then(cfg => {
      setSheetsId(cfg.sheetsId)
      setLastSync(cfg.lastSyncedAt)
    })
    window.api.getSyncLogs(token).then(setSyncLogs)
  }, [token])

  async function refreshLastSync() {
    window.api.getSheetsConfig(token!).then(cfg => {
      setLastSync(cfg.lastSyncedAt)
      if (cfg.lastSyncedAt) setLastSyncedAt(cfg.lastSyncedAt)
    })
  }

  async function forceSync() {
    if (!token) return
    setIsSyncing(true)
    const res = await window.api.syncToCloud(token)
    if (res.success) showToast(res.message ?? `Pushed ${res.count} records to Sheets.`)
    else showToast(`Sync failed: ${res.error}`)
    window.api.getSyncLogs(token).then(setSyncLogs)
    refreshLastSync()
    setIsSyncing(false)
  }

  async function testConnection() {
    if (!token) return
    setIsTestingConn(true); setConnStatus(null)
    const res = await window.api.testSheetsConnection(token)
    if (res.success) {
      setConnStatus({ ok: true, msg: `✓ Connected — "${res.title}" · Tabs: ${(res.sheetNames ?? []).join(', ')}` })
    } else {
      setConnStatus({ ok: false, msg: res.error ?? 'Connection failed' })
    }
    setIsTestingConn(false)
  }

  // Generates a static example workbook — one sheet per tab, real column headers, a couple
  // of placeholder rows. Pure local file, never reads the local DB or touches the connected
  // Sheet — replaces the old "Force Full Sync" button, which pushed whatever was in the
  // local DB (including leftover test/seed data) straight over the connected Sheet with no
  // guardrail. One misclick after "Load Test Data" could have wiped production with fakes.
  function downloadSampleSheet() {
    downloadXLSX('salestrack_sample_sheet.xlsx', generateSampleWorkbook())
  }

  async function pullFromCloud() {
    if (!token) return
    setIsSyncing(true)
    const res = await window.api.pullFromCloud(token)
    if (res.success) showToast(res.message ?? `Pulled ${res.count} entries from Sheets.`)
    else showToast(`Pull failed: ${res.error}`)
    window.api.getSyncLogs(token).then(setSyncLogs)
    refreshLastSync()
    setIsSyncing(false)
  }

  return (
    <AppShell title="SalesTrack Pro">
      {/* Toast */}
      {toast && (
        <div className="fixed top-20 right-6 z-50 bg-inverse-surface text-inverse-on-surface px-5 py-3 rounded-xl shadow-lg animate-slide-in font-body-sm">
          {toast}
        </div>
      )}

      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Settings</h2>
          <p className="text-on-surface-variant text-body-md mt-1">Manage sync status and user accounts.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-outline-variant/20">
        <button
          onClick={() => setTab('connection')}
          className={`px-4 py-2.5 font-label-md text-label-md border-b-2 transition-colors ${tab === 'connection' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
        >
          Connection Settings
        </button>
        {canManageUsers && (
          <button
            onClick={() => setTab('users')}
            className={`px-4 py-2.5 font-label-md text-label-md border-b-2 transition-colors ${tab === 'users' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          >
            Users
          </button>
        )}
      </div>

      {tab === 'users' && canManageUsers ? (
        <UserManagementContent />
      ) : (
        <div className="grid grid-cols-12 gap-card-gap">
          <div className="col-span-12 lg:col-span-6 lg:col-start-4 flex flex-col gap-card-gap">
            {/* Google Sheets Sync */}
            <GlassCard elevated className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-lg bg-tertiary-container/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-tertiary">table_chart</span>
                </div>
                <h3 className="font-headline-md text-on-surface !text-lg">Google Sheets Sync</h3>
              </div>
              <div className="space-y-4">
                <div className="bg-surface-container rounded-lg p-3 text-body-sm">
                  <p className="text-on-surface-variant text-xs mb-1">Connected Spreadsheet ID</p>
                  <p className="font-mono text-on-surface break-all">{sheetsId || '— not connected —'}</p>
                  <p className="text-[10px] text-on-surface-variant/70 mt-1.5">
                    To connect or switch to a different Google Sheet, use the connect button on the Login screen.
                  </p>
                </div>

                {/* Connection status */}
                {connStatus && (
                  <div className={`rounded-lg px-4 py-3 text-sm flex items-start gap-2 ${connStatus.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                    <span className="material-symbols-outlined text-base flex-shrink-0 mt-0.5">
                      {connStatus.ok ? 'check_circle' : 'error'}
                    </span>
                    <p className="break-all">{connStatus.msg}</p>
                  </div>
                )}

                {lastSync && (
                  <div className="bg-surface-container rounded-lg p-3 text-body-sm">
                    <p className="text-on-surface-variant text-xs mb-1">Last successful sync</p>
                    <p className="font-tabular-nums text-on-surface">{new Date(lastSync).toLocaleString()}</p>
                  </div>
                )}

                <button
                  onClick={testConnection}
                  disabled={isTestingConn}
                  className="w-full py-2 bg-surface-container-high text-on-surface border border-outline-variant/30 rounded font-label-md text-label-md flex items-center justify-center gap-1 hover:bg-surface-variant/30 disabled:opacity-60 transition-colors"
                >
                  <span className={`material-symbols-outlined text-sm ${isTestingConn ? 'animate-spin-slow' : ''}`}>
                    {isTestingConn ? 'sync' : 'wifi_tethering'}
                  </span>
                  {isTestingConn ? 'Testing...' : 'Test Connection'}
                </button>

                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={forceSync}
                    disabled={isSyncing}
                    className="flex-1 py-2 bg-tertiary text-white rounded font-label-md text-label-md flex flex-col items-center justify-center gap-0.5 hover:opacity-90 disabled:opacity-60 transition-opacity"
                  >
                    <span className="flex items-center gap-1">
                      <span className={`material-symbols-outlined text-sm ${isSyncing ? 'animate-spin-slow' : ''}`}>cloud_upload</span>
                      {isSyncing ? 'Pushing...' : 'Push to Sheets'}
                    </span>
                    {lastSync && !isSyncing && (
                      <span className="text-[9px] opacity-70">
                        {new Date(lastSync).toLocaleString()}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={pullFromCloud}
                    disabled={isSyncing}
                    className="flex-1 py-2 bg-primary text-white rounded font-label-md text-label-md flex flex-col items-center justify-center gap-0.5 hover:opacity-90 disabled:opacity-60 transition-opacity"
                  >
                    <span className="flex items-center gap-1">
                      <span className={`material-symbols-outlined text-sm ${isSyncing ? 'animate-spin-slow' : ''}`}>cloud_download</span>
                      {isSyncing ? 'Pulling...' : 'Pull from Sheets'}
                    </span>
                    {lastSync && !isSyncing && (
                      <span className="text-[9px] opacity-70">
                        {new Date(lastSync).toLocaleString()}
                      </span>
                    )}
                  </button>
                </div>
                <button
                  onClick={downloadSampleSheet}
                  className="w-full py-2 bg-surface-container-high text-on-surface border border-outline-variant/30 rounded font-label-md text-label-md flex items-center justify-center gap-2 hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  Download Sample Sheet
                </button>
                <p className="text-[10px] text-on-surface-variant/60 italic">
                  Push → sends unsynced entries · auto-syncs on every save/upload &nbsp;·&nbsp;
                  Pull → imports all tabs (roster · settings · KPI rates · entries) &nbsp;·&nbsp;
                  Download Sample Sheet → an XLSX file with every tab's correct columns + example rows,
                  to paste into a brand-new Google Sheet before connecting — never touches the connected Sheet.
                </p>
              </div>
            </GlassCard>

            {/* Sync Logs */}
            <GlassCard className="p-5">
              <h4 className="font-label-md text-label-md text-on-surface-variant uppercase mb-3">Recent Sync Log</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                {syncLogs.length === 0 ? (
                  <p className="text-body-sm text-on-surface-variant text-center py-4">No sync history yet.</p>
                ) : syncLogs.map(log => (
                  <div key={log.id} className="flex justify-between items-center py-2 border-b border-outline-variant/10 last:border-0">
                    <div>
                      <span className={`text-[10px] font-bold uppercase mr-2 ${log.status === 'success' ? 'text-tertiary' : 'text-error'}`}>
                        {log.status}
                      </span>
                      <span className="text-[10px] text-on-surface-variant">{log.direction}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-on-surface tabular-nums">{log.records_count} records</p>
                      <p className="text-[9px] text-on-surface-variant">{new Date(log.synced_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      )}
    </AppShell>
  )
}
