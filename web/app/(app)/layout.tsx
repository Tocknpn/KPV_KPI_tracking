import { redirect } from 'next/navigation'
import { getSession, ALLOWED_ROLES } from '@/lib/session'
import AppShell from '@/components/AppShell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  if (!session.isLoggedIn || !ALLOWED_ROLES.includes(session.role ?? '')) {
    redirect('/login')
  }

  return (
    <AppShell fullName={session.fullName ?? ''} role={session.role ?? ''}>
      {children}
    </AppShell>
  )
}
