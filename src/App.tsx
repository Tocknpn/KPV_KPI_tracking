import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAppStore } from './store/app.store'
import Login from './screens/Login'
import Dashboard from './screens/Dashboard'
import DailyEntry from './screens/DailyEntry'
import Reports from './screens/Reports'
import Executive from './screens/Executive'
import Settings from './screens/Settings'
import KpiSettings from './screens/KpiSettings'
import UploadHistory from './screens/UploadHistory'
import Roster from './screens/Roster'
import SaleReport from './screens/SaleReport'
import AuditLog from './screens/AuditLog'

export default function App() {
  // DB initialises after window opens (WASM load can take 20-30s on fresh install
  // due to AV scanning the new binary). Block routes until main process signals ready.
  const [dbReady, setDbReady] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const setSyncBanner = useAppStore(s => s.setSyncBanner)
  const setLastSyncedAt = useAppStore(s => s.setLastSyncedAt)
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [updateDownloading, setUpdateDownloading] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    // Poll once: if DB already ready (fast startup), resolve immediately.
    // Otherwise register listener for the event (normal 20-30s startup).
    window.api.checkAppReady().then((ready: boolean) => {
      if (ready) setDbReady(true)
      else window.api.onAppReady(() => setDbReady(true))
    })
    window.api.onAppInitError((message: string) => setInitError(message))
    // Surfaces the startup auto-pull's outcome (configured/success/error) so a device with
    // no admin/hr login still sees why its data looks stale or empty — see TopBar banner.
    window.api.onStartupSyncResult(r => {
      setSyncBanner(r)
      // main.ts already ran a full pull before this window was even interactive — record
      // when, so Login's own post-submit pull can skip re-doing the exact same full
      // table-by-table merge a few seconds later if nothing's changed since (see Login.tsx).
      if (r.success) setLastSyncedAt(new Date().toISOString())
    })
    // electron-updater found a newer GitHub release — user decides whether to download,
    // nothing happens automatically (see main.ts: autoDownload = false).
    window.api.onUpdateAvailable(info => setUpdateVersion(info.version))
    window.api.onUpdateDownloaded(() => { setUpdateDownloading(false); setUpdateReady(true) })
  }, [])

  function handleDownloadUpdate() {
    setUpdateDownloading(true)
    window.api.downloadUpdate()
  }

  if (initError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-error/10 to-error/5 gap-4 p-8">
        <span className="material-symbols-outlined text-5xl text-error">error</span>
        <p className="text-on-surface font-bold text-lg">SalesTrack Pro failed to start</p>
        <p className="text-on-surface-variant text-sm text-center max-w-xl">
          Something broke while loading the local database. The exact error is below — and saved to
          <code className="mx-1 px-1.5 py-0.5 bg-surface-container rounded">startup-error.log</code> in the app's data folder.
        </p>
        <pre className="max-w-2xl max-h-64 overflow-auto bg-surface-container text-on-surface text-xs p-4 rounded-lg whitespace-pre-wrap">{initError}</pre>
      </div>
    )
  }

  if (!dbReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 to-secondary/5 gap-6">
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
          <span className="text-white font-bold text-2xl">S</span>
        </div>
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-outlined animate-spin text-4xl text-primary" style={{ animationDuration: '1s' }}>sync</span>
          <p className="text-on-surface font-bold text-lg">SalesTrack Pro</p>
          <p className="text-on-surface-variant text-sm">Starting up…</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {(updateVersion || updateReady) && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-primary text-white text-sm flex items-center justify-center gap-3 py-2 px-4">
          {updateReady ? (
            <>
              <span>Update downloaded — restart to install v{updateVersion}.</span>
              <button onClick={() => window.api.installUpdate()} className="px-3 py-1 rounded-md bg-white text-primary font-bold hover:opacity-90">
                Restart & Update
              </button>
            </>
          ) : (
            <>
              <span>Update available — v{updateVersion}.</span>
              <button onClick={handleDownloadUpdate} disabled={updateDownloading} className="px-3 py-1 rounded-md bg-white text-primary font-bold hover:opacity-90 disabled:opacity-60">
                {updateDownloading ? 'Downloading…' : 'Update'}
              </button>
            </>
          )}
        </div>
      )}
      <Routes>
      <Route path="/login"          element={<Login />} />
      <Route path="/dashboard"      element={<Dashboard />} />
      <Route path="/entry"          element={<DailyEntry />} />
      <Route path="/reports"        element={<Reports />} />
      <Route path="/analytics"      element={<Navigate to="/reports" replace />} />
      <Route path="/executive"      element={<Executive />} />
      <Route path="/settings"       element={<Settings />} />
      <Route path="/kpi-settings"   element={<KpiSettings />} />
      <Route path="/users"          element={<Navigate to="/settings" replace />} />
      <Route path="/upload-history" element={<UploadHistory />} />
      <Route path="/upload-status"  element={<Navigate to="/upload-history" replace />} />
      <Route path="/roster"         element={<Roster />} />
      <Route path="/sale-report"    element={<SaleReport />} />
      <Route path="/audit-log"      element={<AuditLog />} />
      {/* Legacy redirects */}
      <Route path="/executive"      element={<Navigate to="/reports" replace />} />
      <Route path="/commission"     element={<Navigate to="/reports" replace />} />
      <Route path="/team"           element={<Navigate to="/reports" replace />} />
      <Route path="*"               element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  )
}
