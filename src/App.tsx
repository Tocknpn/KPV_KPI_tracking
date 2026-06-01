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

export default function App() {
  return (
    <Routes>
      <Route path="/login"        element={<Login />} />
      <Route path="/dashboard"    element={<Dashboard />} />
      <Route path="/entry"        element={<DailyEntry />} />
      <Route path="/reports"      element={<Reports />} />
      <Route path="/analytics"    element={<Analytics />} />
      <Route path="/executive"    element={<Executive />} />
      <Route path="/settings"     element={<Settings />} />
      <Route path="/kpi-settings"    element={<KpiSettings />} />
      <Route path="/users"          element={<UserManagement />} />
      <Route path="/upload-history" element={<UploadHistory />} />
      <Route path="*"             element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
