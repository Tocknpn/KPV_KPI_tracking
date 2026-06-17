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
import SaleReport from './screens/SaleReport'
import AuditLog from './screens/AuditLog'

export default function App() {
  // DB initialises after window opens (WASM load can take 20-30s on fresh install
  // due to AV scanning the new binary). Block routes until main process signals ready.
  const [dbReady, setDbReady] = useState(false)

  useEffect(() => {
    // Poll once: if DB already ready (fast startup), resolve immediately.
    // Otherwise register listener for the event (normal 20-30s startup).
    window.api.checkAppReady().then((ready: boolean) => {
      if (ready) setDbReady(true)
      else window.api.onAppReady(() => setDbReady(true))
    })
  }, [])

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
