import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './screens/Login'
import Dashboard from './screens/Dashboard'
import DailyEntry from './screens/DailyEntry'
import Reports from './screens/Reports'
import Analytics from './screens/Analytics'
import Executive from './screens/Executive'
import Settings from './screens/Settings'
import KpiSettings from './screens/KpiSettings'
import UserManagement from './screens/UserManagement'
import UploadHistory from './screens/UploadHistory'
import Roster from './screens/Roster'
import SaleReport from './screens/SaleReport'
import AuditLog from './screens/AuditLog'

export default function App() {
  // DB initialises after window opens (WASM load can take 20-30s on fresh install
  // due to AV scanning the new binary). Block routes until main process signals ready.
  const [dbReady, setDbReady] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)

  useEffect(() => {
    // Poll once: if DB already ready (fast startup), resolve immediately.
    // Otherwise register listener for the event (normal 20-30s startup).
    window.api.checkAppReady().then((ready: boolean) => {
      if (ready) setDbReady(true)
      else window.api.onAppReady(() => setDbReady(true))
    })
    window.api.onAppInitError((message: string) => setInitError(message))
  }, [])

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
    <Routes>
      <Route path="/login"          element={<Login />} />
      <Route path="/dashboard"      element={<Dashboard />} />
      <Route path="/entry"          element={<DailyEntry />} />
      <Route path="/reports"        element={<Reports />} />
      <Route path="/analytics"      element={<Analytics />} />
      <Route path="/executive"      element={<Executive />} />
      <Route path="/settings"       element={<Settings />} />
      <Route path="/kpi-settings"   element={<KpiSettings />} />
      <Route path="/users"          element={<UserManagement />} />
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
  )
}
