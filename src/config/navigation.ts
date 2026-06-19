import type { MenuKey } from '../types'

// Single source of truth for sidebar order + route mapping — Sidebar.tsx renders this
// list filtered by permission, and Login.tsx reuses the exact same list to land a user
// on whichever of these is actually first for their role, instead of a hardcoded route
// that may not even be in their menu (e.g. accountant_officer has no 'dashboard').
export interface NavItem {
  to: string
  icon: string
  label: string
  key: MenuKey
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard',      icon: 'dashboard',       label: 'Dashboard',        key: 'dashboard' },
  { to: '/entry',          icon: 'edit_document',   label: 'Daily Entry',      key: 'daily_entry' },
  { to: '/reports',        icon: 'leaderboard',     label: 'KPI Report',       key: 'kpi_report' },
  { to: '/sale-report',    icon: 'bar_chart',       label: 'Sale Report',      key: 'sale_report' },
  { to: '/upload-history', icon: 'history',         label: 'Upload History',   key: 'upload_history' },
  { to: '/roster',         icon: 'badge',           label: 'Roster',           key: 'roster' },
  { to: '/audit-log',      icon: 'history_edu',     label: 'Audit Log',        key: 'audit_log' },
  { to: '/settings',       icon: 'settings',        label: 'Settings',         key: 'settings' },
  { to: '/kpi-settings',   icon: 'tune',            label: 'KPI Settings',     key: 'kpi_settings' },
]

// First NAV_ITEMS entry this set of permissions can actually see — the "homepage" for
// that role. Falls back to /login so a user with zero menu permissions doesn't get
// bounced into a route they can't access either.
export function getHomeRoute(permissions: string[]): string {
  return NAV_ITEMS.find(item => permissions.includes(item.key))?.to ?? '/login'
}
