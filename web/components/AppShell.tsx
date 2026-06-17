'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logoutAction } from '@/app/actions'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  top_manager: 'Top Manager',
  branch_manager: 'Branch Manager',
  accountant_officer: 'Accountant Officer',
  accountant_manager: 'Accountant Manager',
  hr: 'HR',
  hr_support: 'HR Support',
  sales_sup: 'Supervisor',
}

interface Props {
  fullName: string
  role: string
  children: React.ReactNode
}

// Same icon names as the desktop app's Sidebar.tsx NAV_ITEMS, for a consistent look
const NAV = [
  { href: '/dashboard',   label: 'Dashboard',   icon: 'dashboard' },
  { href: '/kpi-report',  label: 'KPI Report',  icon: 'leaderboard' },
  { href: '/sale-report', label: 'Sale Report',  icon: 'bar_chart' },
]

export default function AppShell({ fullName, role, children }: Props) {
  const pathname = usePathname()

  return (
    <div className="flex h-screen overflow-hidden bg-mica bg-surface">
      {/* Sidebar — frosted glass, matches the desktop app's Sidebar.tsx */}
      <aside className="w-sidebar-width shrink-0 flex flex-col bg-surface-container-low/60 backdrop-blur-[40px] border-r border-white/10 shadow-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-primary">
            <span className="material-symbols-outlined text-white text-lg">monitoring</span>
          </div>
          <div>
            <div className="text-sm font-bold leading-tight text-on-surface">KPV Tracker</div>
            <div className="text-[10px] text-on-surface-variant leading-tight">Reports Portal</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-0.5">
          {NAV.map(({ href, label, icon }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-body-sm font-medium transition-colors ${
                  active ? 'bg-primary text-white shadow-primary font-bold' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-base shrink-0">{icon}</span>
                {label}
              </Link>
            )
          })}
        </nav>

        {/* User info + Logout */}
        <div className="border-t border-outline-variant/10 px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
              {fullName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate text-on-surface">{fullName}</div>
              <div className="text-[10px] text-on-surface-variant">{ROLE_LABELS[role] ?? role}</div>
            </div>
          </div>
          <form action={logoutAction}>
            <button type="submit"
              className="w-full text-left text-xs text-on-surface-variant hover:text-error transition-colors flex items-center gap-2 px-1 py-1"
            >
              <span className="material-symbols-outlined text-sm">logout</span>
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

