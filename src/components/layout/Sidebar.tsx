import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'

const navItems = [
  { to: '/dashboard',      icon: 'dashboard',          label: 'Dashboard',        roles: ['admin','supervisor','branch_manager','executive'] },
  { to: '/entry',          icon: 'edit_document',      label: 'Daily Entry',      roles: ['admin','supervisor','branch_manager'] },
  { to: '/reports',        icon: 'leaderboard',        label: 'KPI Report',       roles: ['admin','supervisor','branch_manager','executive'] },
  { to: '/analytics',      icon: 'monitoring',         label: 'Analytics',        roles: ['admin','executive'] },
  { to: '/upload-history', icon: 'history',            label: 'Upload History',   roles: ['admin','supervisor','branch_manager','executive'] },
  { to: '/settings',       icon: 'settings',           label: 'Settings',         roles: ['admin','supervisor','branch_manager','executive'] },
  { to: '/users',          icon: 'manage_accounts',    label: 'User Management',  roles: ['admin'] },
  { to: '/kpi-settings',   icon: 'tune',               label: 'KPI Settings',     roles: ['admin'] },
]

export function Sidebar() {
  const { user } = useAuthStore()
  const { unsyncedCount, sidebarCollapsed, setSidebarCollapsed } = useAppStore()
  const role = user?.role ?? 'supervisor'
  const c = sidebarCollapsed

  const visibleItems = navItems.filter(item => item.roles.includes(role))

  const portalLabel =
    role === 'executive'       ? 'Executive Portal'
    : role === 'admin'         ? 'Admin Portal'
    : role === 'branch_manager' ? 'Manager Portal'
    : 'Supervisor Portal'

  return (
    <aside
      className="fixed left-0 top-0 h-screen bg-surface-container-low/60 backdrop-blur-[40px] border-r border-white/10 shadow-sm flex flex-col py-6 z-50 overflow-hidden"
      style={{
        width: c ? '72px' : '260px',
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      {/* ── Brand + toggle ── */}
      <div className={`flex items-center mb-8 px-3 ${c ? 'flex-col gap-2' : 'justify-between gap-3'}`}>
        {/* Logo icon — always visible */}
        <div className="w-10 h-10 rounded-lg bg-primary-container flex-shrink-0 flex items-center justify-center text-on-primary-container">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
            leaderboard
          </span>
        </div>

        {/* Name text — only when expanded */}
        {!c && (
          <div className="flex-1 min-w-0">
            <h1 className="font-headline-md text-[16px] font-bold text-on-surface leading-tight truncate">SalesTrack</h1>
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider truncate">
              {portalLabel}
            </p>
          </div>
        )}

        {/* Toggle button */}
        <button
          onClick={() => setSidebarCollapsed(!c)}
          title={c ? 'Expand sidebar' : 'Collapse sidebar'}
          className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-variant/40 hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">
            {c ? 'menu' : 'menu_open'}
          </span>
        </button>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 space-y-0.5 px-2 overflow-hidden">
        {visibleItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            title={c ? item.label : undefined}
            className={({ isActive }) =>
              `flex items-center py-3 rounded-lg transition-colors ${
                c ? 'justify-center px-0' : 'gap-3 px-3'
              } ${
                isActive
                  ? 'text-primary bg-primary-container/20 border-l-4 border-primary font-bold'
                  : 'text-on-surface-variant font-normal hover:bg-surface-variant/30'
              }`
            }
          >
            <span className="material-symbols-outlined flex-shrink-0">{item.icon}</span>
            {!c && (
              <span className="font-label-md text-label-md truncate">{item.label}</span>
            )}
            {!c && item.to === '/kpi-settings' && (
              <span className="ml-auto">
                <span className="material-symbols-outlined text-sm text-on-surface-variant/50">lock</span>
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Footer ── */}
      <div className="mt-auto pt-4 border-t border-white/10 space-y-2 px-2">
        {/* Sync status */}
        <div
          title={c ? (unsyncedCount > 0 ? `${unsyncedCount} unsynced` : 'Synced') : undefined}
          className={`flex items-center rounded-lg bg-surface-container-highest/20 py-2 ${c ? 'justify-center px-0' : 'justify-between px-3'}`}
        >
          <div className={`flex items-center ${c ? '' : 'gap-2'}`}>
            <span className="material-symbols-outlined text-tertiary text-sm">cloud_done</span>
            {!c && <span className="font-label-md text-label-md text-on-surface-variant">Sync Status</span>}
          </div>
          {!c && (
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
          )}
        </div>

        {/* User chip */}
        <div
          title={c ? (user?.fullName ?? '') : undefined}
          className={`flex items-center ${c ? 'justify-center' : 'gap-3 px-1'}`}
        >
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold uppercase flex-shrink-0">
            {(user?.fullName ?? 'U').slice(0, 1)}
          </div>
          {!c && (
            <div className="overflow-hidden">
              <p className="font-label-md text-label-md font-bold text-on-surface truncate">
                {user?.fullName ?? '—'}
              </p>
              <p className="text-[10px] text-on-surface-variant capitalize">{user?.role}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
