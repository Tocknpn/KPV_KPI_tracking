import { ReactNode, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import type { UserRole } from '../../types'

interface Props {
  children: ReactNode
  title: string
  allowedRoles?: UserRole[]
}

export function AppShell({ children, title, allowedRoles }: Props) {
  const { token, user, permissions, setPermissions, clearSession, setBranches } = useAuthStore()
  const { setUnsyncedCount, sidebarCollapsed } = useAppStore()

  if (!token || !user) return <Navigate to="/login" replace />
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  useEffect(() => {
    if (!token) return
    window.api.getBranches(token).then(setBranches).catch(console.error)
    window.api.getUnsyncedCount(token).then(setUnsyncedCount).catch(console.error)
    // Re-fetch permissions for stale sessions (e.g. page reload after version update)
    if (permissions.length === 0) {
      window.api.getMyPermissions(token)
        .then((p: string[]) => setPermissions(p))
        .catch(() => clearSession())
    }
  }, [token])

  return (
    <div className="min-h-screen bg-mica font-sans text-on-surface">
      <Sidebar />
      <TopBar title={title} />
      <main
        className="mt-16 p-container-padding max-w-[1600px] min-h-[calc(100vh-64px)]"
        style={{
          marginLeft: sidebarCollapsed ? '72px' : '260px',
          transition: 'margin-left 0.22s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {children}
      </main>
    </div>
  )
}
