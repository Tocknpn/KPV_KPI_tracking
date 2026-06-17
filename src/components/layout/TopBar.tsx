import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'

const ZOOM_LEVELS = [
  { label: '100%', value: 1.0 },
  { label: '80%',  value: 0.8 },
  { label: '75%',  value: 0.75 },
]
const ZOOM_KEY = 'app_ui_zoom'

// Short relative form ("3m ago") for the topbar; the full timestamp is still in the title
// attribute on hover. Keeps the freshness indicator readable without forcing a tooltip.
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  if (diffMs < 0 || isNaN(diffMs)) return 'just now'
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface Props {
  title: string
}

export function TopBar({ title }: Props) {
  const navigate = useNavigate()
  const { token, user, clearSession, branches } = useAuthStore()
  const { unsyncedCount, isSyncing, setIsSyncing, setUnsyncedCount, sidebarCollapsed } = useAppStore()
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [, setNowTick] = useState(0) // forces relativeTime() to re-render as time passes
  const [zoom, setZoomState] = useState<number>(() => {
    const saved = localStorage.getItem(ZOOM_KEY)
    return saved ? parseFloat(saved) : 1.0
  })

  useEffect(() => {
    document.documentElement.style.zoom = String(zoom)
  }, [zoom])

  useEffect(() => {
    if (!token) return
    window.api.getSheetsConfig(token).then(cfg => setLastSyncedAt(cfg.lastSyncedAt || null))
    const tick = setInterval(() => setNowTick(t => t + 1), 30000) // refresh "Xm ago" text every 30s
    return () => clearInterval(tick)
  }, [token])

  function handleZoom(value: number) {
    setZoomState(value)
    localStorage.setItem(ZOOM_KEY, String(value))
    document.documentElement.style.zoom = String(value)
  }

  async function handleSync() {
    if (!token || isSyncing) return
    setIsSyncing(true)
    setSyncResult(null)
    try {
      const result = await window.api.syncToCloud(token)
      if (result.success) {
        setSyncResult(`Synced ${result.count} records`)
        const count = await window.api.getUnsyncedCount(token)
        setUnsyncedCount(count)
        const cfg = await window.api.getSheetsConfig(token)
        setLastSyncedAt(cfg.lastSyncedAt || null)
      } else {
        setSyncResult(result.error ?? 'Sync failed')
      }
    } finally {
      setIsSyncing(false)
      setTimeout(() => setSyncResult(null), 4000)
    }
  }

  async function handleLogout() {
    if (token) await window.api.logout(token)
    clearSession()
    navigate('/login')
  }

  return (
    <header
      className="fixed top-0 right-0 h-16 bg-surface/80 backdrop-blur-2xl border-b border-white/20 z-40 flex justify-between items-center px-gutter"
      style={{
        width: sidebarCollapsed ? 'calc(100% - 72px)' : 'calc(100% - 260px)',
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      {/* Left */}
      <div className="flex items-center gap-8">
        <span className="font-headline-md text-headline-md font-extrabold text-primary">
          {title}
        </span>
        </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Sync result toast */}
        {syncResult && (
          <span className="text-body-sm text-on-surface-variant bg-surface-container px-3 py-1 rounded-full animate-slide-in">
            {syncResult}
          </span>
        )}

        {/* Data freshness — when this device last synced with Google Sheets */}
        {lastSyncedAt && (
          <span
            className="text-[11px] text-on-surface-variant flex items-center gap-1"
            title={`Last synced: ${new Date(lastSyncedAt).toLocaleString()}`}
          >
            <span className="material-symbols-outlined text-[14px]">cloud_done</span>
            Updated {relativeTime(lastSyncedAt)}
          </span>
        )}

        {/* Unsynced badge */}
        {unsyncedCount > 0 && (
          <span className="text-[10px] font-bold text-secondary bg-secondary-container/30 px-2 py-0.5 rounded-full">
            {unsyncedCount} unsynced
          </span>
        )}

        {/* Zoom control */}
        <div className="flex items-center rounded-lg overflow-hidden border border-white/20 bg-surface-container text-[11px] font-medium">
          {ZOOM_LEVELS.map(z => (
            <button
              key={z.value}
              onClick={() => handleZoom(z.value)}
              title={`UI zoom ${z.label}`}
              className={`px-2.5 py-1.5 transition-colors whitespace-nowrap ${
                zoom === z.value
                  ? 'bg-primary text-white'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>

        {/* Sync to Cloud CTA */}
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="bg-primary text-white px-4 py-2 rounded-lg font-label-md text-label-md flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all shadow-primary disabled:opacity-60"
        >
          <span className={`material-symbols-outlined text-sm ${isSyncing ? 'animate-spin-slow' : ''}`}>
            {isSyncing ? 'sync' : 'cloud_upload'}
          </span>
          {isSyncing ? 'Syncing...' : 'Sync to Cloud'}
        </button>

        {/* Notifications placeholder */}
        <button className="p-2 text-on-surface-variant hover:bg-surface-variant/30 rounded-full transition-colors relative">
          <span className="material-symbols-outlined">notifications</span>
          {unsyncedCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error rounded-full border-2 border-surface" />
          )}
        </button>

        {/* Account */}
        <button
          onClick={handleLogout}
          className="p-2 text-on-surface-variant hover:bg-surface-variant/30 rounded-full transition-colors"
          title="Logout"
        >
          <span className="material-symbols-outlined">logout</span>
        </button>
      </div>
    </header>
  )
}
