import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'


interface Props {
  title: string
}

export function TopBar({ title }: Props) {
  const navigate = useNavigate()
  const { token, user, clearSession, branches } = useAuthStore()
  const { unsyncedCount, isSyncing, setIsSyncing, setUnsyncedCount, sidebarCollapsed } = useAppStore()
  const [syncResult, setSyncResult] = useState<string | null>(null)

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

        {/* Unsynced badge */}
        {unsyncedCount > 0 && (
          <span className="text-[10px] font-bold text-secondary bg-secondary-container/30 px-2 py-0.5 rounded-full">
            {unsyncedCount} unsynced
          </span>
        )}

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
