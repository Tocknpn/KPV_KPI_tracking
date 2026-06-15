import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'

export interface SessionData {
  isLoggedIn?: boolean
  username?: string
  fullName?: string
  role?: string
  branchCode?: string | null
}

export const sessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: 'kpv-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 8, // 8 hours
  },
}

export async function getSession() {
  const cookieStore = await cookies()
  return getIronSession<SessionData>(cookieStore, sessionOptions)
}

// Allowed roles for the web app (no sales_sup — data-entry only role)
export const ALLOWED_ROLES = ['admin', 'top_manager', 'branch_manager', 'accountant', 'hr']

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  top_manager: 'Top Manager',
  branch_manager: 'Branch Manager',
  accountant: 'Accountant',
  hr: 'HR',
  sales_sup: 'Supervisor',
}
