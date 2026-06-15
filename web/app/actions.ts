'use server'

import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import { getSession, ALLOWED_ROLES } from '@/lib/session'
import { getUsers } from '@/lib/sheets'

export async function loginAction(formData: FormData) {
  const username = (formData.get('username') as string | null)?.trim() ?? ''
  const password = (formData.get('password') as string | null) ?? ''

  if (!username || !password) redirect('/login?error=Missing+credentials')

  let users
  try {
    users = await getUsers()
  } catch {
    redirect('/login?error=Unable+to+connect+to+data+source')
  }

  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase())

  if (!user || user.active !== '1') redirect('/login?error=Invalid+username+or+password')

  const match = await bcrypt.compare(password, user.password_hash)
  if (!match) redirect('/login?error=Invalid+username+or+password')

  if (!ALLOWED_ROLES.includes(user.role)) redirect('/login?error=Your+role+does+not+have+web+access')

  const session = await getSession()
  session.isLoggedIn = true
  session.username = user.username
  session.fullName = user.full_name
  session.role = user.role
  session.branchCode = user.branch_code || null
  await session.save()

  redirect('/dashboard')
}

export async function logoutAction() {
  const session = await getSession()
  session.destroy()
  redirect('/login')
}
