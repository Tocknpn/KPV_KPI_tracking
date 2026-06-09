import { IpcMain } from 'electron'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { getDb } from '../db/connection'
import { prepare, transaction } from '../db/query'
import { pushUsersIfConfigured } from './sheets'

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

function validateToken(token: string): { id: number; role: string; branch_id: number | null; supervisor_id: number | null } | null {
  const db = getDb()
  const session = prepare(db, `
    SELECT u.id, u.role, u.branch_id, u.supervisor_id
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now') AND u.active = 1
  `).get(token) as { id: number; role: string; branch_id: number | null; supervisor_id: number | null } | undefined
  return session ?? null
}

export function requireAuth(token: string) {
  const user = validateToken(token)
  if (!user) throw new Error('Unauthorized')
  return user
}

export function requireAdmin(token: string) {
  const user = requireAuth(token)
  if (user.role !== 'admin') throw new Error('Admin access required')
  return user
}

export function registerAuthHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('auth:login', async (_e, username: string, password: string) => {
    const db = getDb()
    const user = prepare(db, `SELECT * FROM users WHERE username = ? AND active = 1`).get(username) as {
      id: number; username: string; password_hash: string; full_name: string; role: string; branch_id: number | null; supervisor_id: number | null
    } | undefined

    if (!user) return { success: false, error: 'Invalid username or password' }
    const valid = bcrypt.compareSync(password, user.password_hash)
    if (!valid) return { success: false, error: 'Invalid username or password' }

    // Clean old sessions
    prepare(db, `DELETE FROM sessions WHERE user_id = ? AND expires_at <= datetime('now')`).run(user.id)

    const token = generateToken()
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
    prepare(db, `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(token, user.id, expiresAt)

    return {
      success: true, token,
      user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role, branchId: user.branch_id, supervisorId: user.supervisor_id },
    }
  })

  ipcMain.handle('auth:logout', async (_e, token: string) => {
    prepare(getDb(), `DELETE FROM sessions WHERE token = ?`).run(token)
    return { success: true }
  })

  ipcMain.handle('auth:getUsers', async (_e, token: string) => {
    requireAdmin(token)
    return prepare(getDb(), `
      SELECT u.id, u.username, u.full_name, u.role, u.branch_id, u.active, b.name AS branch_name
      FROM users u LEFT JOIN branches b ON b.id = u.branch_id
      ORDER BY u.role, u.full_name
    `).all()
  })

  ipcMain.handle('auth:createUser', async (_e, token: string, data: {
    username: string; password: string; fullName: string; role: string; branchId: number | null
  }) => {
    requireAdmin(token)
    try {
      const db   = getDb()
      const hash = bcrypt.hashSync(data.password, 10)
      const result = prepare(db, `INSERT INTO users (username, password_hash, full_name, role, branch_id) VALUES (?,?,?,?,?)`)
        .run(data.username, hash, data.fullName, data.role, data.branchId)
      pushUsersIfConfigured(db).catch(() => {})
      return { success: true, id: result.lastInsertRowid }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
    }
  })

  ipcMain.handle('auth:updateUser', async (_e, token: string, id: number, data: {
    fullName?: string; role?: string; branchId?: number | null; active?: number; password?: string
  }) => {
    requireAdmin(token)
    const db = getDb()
    if (data.password) prepare(db, `UPDATE users SET password_hash = ? WHERE id = ?`).run(bcrypt.hashSync(data.password, 10), id)
    if (data.fullName !== undefined) prepare(db, `UPDATE users SET full_name = ? WHERE id = ?`).run(data.fullName, id)
    if (data.role !== undefined) prepare(db, `UPDATE users SET role = ? WHERE id = ?`).run(data.role, id)
    if (data.branchId !== undefined) prepare(db, `UPDATE users SET branch_id = ? WHERE id = ?`).run(data.branchId, id)
    if (data.active !== undefined) prepare(db, `UPDATE users SET active = ? WHERE id = ?`).run(data.active, id)
    pushUsersIfConfigured(db).catch(() => {})
    return { success: true }
  })

  ipcMain.handle('auth:deleteUser', async (_e, token: string, id: number) => {
    requireAdmin(token)
    const db = getDb()
    prepare(db, `UPDATE users SET active = 0 WHERE id = ?`).run(id)
    pushUsersIfConfigured(db).catch(() => {})
    return { success: true }
  })

  ipcMain.handle('auth:getBranches', async (_e, token: string) => {
    requireAuth(token)
    return prepare(getDb(), `SELECT * FROM branches ORDER BY id`).all()
  })
}
