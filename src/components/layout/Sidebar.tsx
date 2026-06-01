import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'

const navItems = [
  { to: '/dashboard',  icon: 'dashboard',     label: 'Dashboard',      roles: ['admin','supervisor','executive'] },
  { to: '/entry',      icon: 'edit_document',  label: 'Daily Entry',    roles: ['admin','supervisor'] },
  { to: '/reports',    icon: 'insert_chart',   label: 'Reports',        roles: ['admin','supervisor'] },
  { to: '/analytics',  icon: 'monitoring',     label: 'Analytics',      roles: ['admin','executive'] },
  { to: '/executive',  icon: 'leaderboard',    label: 'Executive View', roles: ['admin','executive'] },
  { to: '/upload-history', icon: 'history',     label: 'Upload History', roles: ['admin','supervisor','executive'] },
  { to: '/settings',       icon: 'settings',    label: 'Settings',       roles: ['admin','supervisor','executive'] },
  { to: '/users',        icon: 'manage_accounts', label: 'User Management', roles: ['admin'] },
  { to: '/kpi-settings', icon: 'tune',          label: 'KPI Settings',    roles: ['admin'] },
]

export function Sidebar() {
  const { user } = useAuthStore()
  const { unsyncedCount } = useAppStore()
  const role = user?.role ?? 'supervisor'

  const visibleItems = navItems.filter(item => item.roles.includes(role))

  return (
    <aside className="fixed left-0 top-0 h-screen w-sidebar-width bg-surface-container-low/60 backdrop-blur-[40px] border-r border-white/10 shadow-sm flex flex-col py-6 px-4 z-50">
      {/* App Brand */}
      <div className="mb-8 px-2 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-container flex items-center justify-center text-on-primary-container">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
            leaderboard
          </span>
        </div>
        <div>
          <h1 className="font-headline-md text-[18px] font-bold text-on-surface leading-tight">SalesTrack</h1>
          <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
            {role === 'executive' ? 'Executive Portal' : role === 'admin' ? 'Admin Portal' : 'Supervisor Portal'}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5">
        {visibleItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              isActive
                ? 'flex items-center gap-3 px-4 py-3 rounded-lg text-primary bg-primary-container/20 border-l-4 border-primary font-bold transition-colors'
                : 'flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface-variant font-normal hover:bg-surface-variant/30 transition-colors'
            }
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span className="font-label-md text-label-md">{item.label}</span>
            {item.to === '/kpi-settings' && (
              <span className="ml-auto">
                <span className="material-symbols-outlined text-sm text-on-surface-variant/50">lock</span>
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Sync Status Footer */}
      <div className="mt-auto pt-6 border-t border-white/10 space-y-3">
        <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-surface-container-highest/20">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary text-sm">cloud_done</span>
            <span className="font-label-md text-label-md text-on-surface-variant">Sync Status</span>
          </div>
          <div className="flex items-center gap-1.5">
            {unsyncedCount > 0 ? (
              <>
                <span className="w-2 h-2 rounded-full bg-secondary animate-pulse-soft" />
                <span className="text-[10px] font-bold text-secondary">{unsyncedCount} pending</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse-soft" />
                <span className="text-[10px] font-bold text-tertiary uppercase">Live</span>
              </>
            )}
          </div>
        </div>

        {/* User chip */}
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold uppercase flex-shrink-0">
            {(user?.fullName ?? 'U').slice(0, 1)}
          </div>
          <div className="overflow-hidden">
            <p className="font-label-md text-label-md font-bold text-on-surface truncate">
              {user?.fullName ?? '—'}
            </p>
            <p className="text-[10px] text-on-surface-variant capitalize">{user?.role}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
