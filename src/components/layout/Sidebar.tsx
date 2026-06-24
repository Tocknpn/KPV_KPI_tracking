import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import { ROLE_DEFAULTS } from '../../types'
import type { UserRole } from '../../types'
import { NAV_ITEMS } from '../../config/navigation'
import { useLanguage } from '../../i18n/LanguageContext'
import type { TranslationKey } from '../../i18n/translations'
import kpvIcon from '../../assets/kpv-icon.png'

// NAV_ITEMS.key ('dashboard', 'daily_entry', ...) maps 1:1 to a nav_* translation key —
// keeps navigation.tsx (route/permission source of truth) free of i18n concerns.
const NAV_LABEL_KEY: Record<string, TranslationKey> = {
  dashboard: 'nav_dashboard', daily_entry: 'nav_daily_entry', kpi_report: 'nav_kpi_report',
  sale_report: 'nav_sale_report', upload_history: 'nav_upload_history', roster: 'nav_roster',
  audit_log: 'nav_audit_log', settings: 'nav_settings', kpi_settings: 'nav_kpi_settings',
}

const ROLE_COLOR: Record<UserRole, string> = {
  admin:              'bg-error',
  sales_sup:          'bg-secondary',
  accountant_officer: 'bg-tertiary',
  accountant_manager: 'bg-tertiary',
  branch_manager:     'bg-primary',
  top_manager:        'bg-primary',
  hr:                 'bg-secondary',
  hr_support:         'bg-secondary',
}

export function Sidebar() {
  const { user, permissions } = useAuthStore()
  const { unsyncedCount, sidebarCollapsed, setSidebarCollapsed } = useAppStore()
  const { t } = useLanguage()
  const role = (user?.role ?? 'sales_sup') as UserRole
  const c = sidebarCollapsed

  // Permission-based filtering with role-defaults fallback for stale sessions
  const effectivePermissions = permissions.length > 0
    ? permissions
    : ROLE_DEFAULTS[role] ?? []

  const visibleItems = NAV_ITEMS.filter(item => effectivePermissions.includes(item.key))

  const portalLabel =
    role === 'admin'          ? t('portal_admin')
    : role === 'top_manager'  ? t('portal_executive')
    : role === 'branch_manager' ? t('portal_manager')
    : role === 'accountant_officer' ? t('portal_accountant_officer')
    : role === 'accountant_manager' ? t('portal_accountant_manager')
    : role === 'hr'           ? t('portal_hr')
    : t('portal_supervisor')

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
        <div className="w-10 h-10 rounded-lg flex-shrink-0 p-1 border-2"
          style={{ backgroundColor: '#990000', borderColor: '#990000' }}>
          <img src={kpvIcon} alt="KPV" className="w-full h-full object-contain" style={{ imageRendering: '-webkit-optimize-contrast' }} />
        </div>
        {!c && (
          <div className="flex-1 min-w-0">
            <h1 className="font-headline-md text-[16px] font-bold text-on-surface leading-tight truncate">KPV Sale Tracking</h1>
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider truncate">
              {portalLabel}
            </p>
          </div>
        )}
        <button
          onClick={() => setSidebarCollapsed(!c)}
          title={c ? 'Expand sidebar' : 'Collapse sidebar'}
          className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-variant/40 hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">{c ? 'menu' : 'menu_open'}</span>
        </button>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 space-y-0.5 px-2 overflow-hidden">
        {visibleItems.map(item => {
          const label = t(NAV_LABEL_KEY[item.key] ?? 'nav_dashboard')
          return (
          <NavLink
            key={item.to}
            to={item.to}
            title={c ? label : undefined}
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
            {!c && <span className="font-label-md text-label-md truncate">{label}</span>}
            {!c && item.key === 'kpi_settings' && (
              <span className="ml-auto">
                <span className="material-symbols-outlined text-sm text-on-surface-variant/50">lock</span>
              </span>
            )}
          </NavLink>
          )
        })}
      </nav>

      {/* ── Footer ── */}
      <div className="mt-auto pt-4 border-t border-white/10 space-y-2 px-2">
        <div
          title={c ? (unsyncedCount > 0 ? `${unsyncedCount} ${t('sync_unsynced')}` : t('sync_live')) : undefined}
          className={`flex items-center rounded-lg bg-surface-container-highest/20 py-2 ${c ? 'justify-center px-0' : 'justify-between px-3'}`}
        >
          <div className={`flex items-center ${c ? '' : 'gap-2'}`}>
            <span className="material-symbols-outlined text-tertiary text-sm">cloud_done</span>
            {!c && <span className="font-label-md text-label-md text-on-surface-variant">{t('sync_status')}</span>}
          </div>
          {!c && (
            <div className="flex items-center gap-1.5">
              {unsyncedCount > 0 ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-secondary animate-pulse-soft" />
                  <span className="text-[10px] font-bold text-secondary">{unsyncedCount} {t('sync_pending')}</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse-soft" />
                  <span className="text-[10px] font-bold text-tertiary uppercase">{t('sync_live')}</span>
                </>
              )}
            </div>
          )}
        </div>

        <div
          title={c ? (user?.fullName ?? '') : undefined}
          className={`flex items-center ${c ? 'justify-center' : 'gap-3 px-1'}`}
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold uppercase flex-shrink-0 ${ROLE_COLOR[role] ?? 'bg-primary'}`}>
            {(user?.fullName ?? 'U').slice(0, 1)}
          </div>
          {!c && (
            <div className="overflow-hidden">
              <p className="font-label-md text-label-md font-bold text-on-surface truncate">{user?.fullName ?? '—'}</p>
              <p className="text-[10px] text-on-surface-variant capitalize">{role.replace('_', ' ')}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
