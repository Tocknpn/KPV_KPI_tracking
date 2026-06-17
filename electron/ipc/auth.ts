import { IpcMain } from 'electron'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { getDb } from '../db/connection'
import { prepare, transaction } from '../db/query'
import { pushUsersIfConfigured } from './sheets'

// ── Role permission defaults (mirrors src/types/index.ts ROLE_DEFAULTS) ──
const ROLE_DEFAULTS: Record<string, string[]> = {
  admin:              ['dashboard','sale_report','analytics','upload_history','upload_status','audit_log','user_management','settings'],
  sales_sup:          ['dashboard','kpi_report','sale_report','upload_status'],
  accountant:         ['dashboard','daily_entry','sale_report','upload_history','upload_status'],
  accountant_officer: ['daily_entry','sale_report','upload_history','upload_status'],
  accountant_manager: ['sale_report','upload_history','upload_status','audit_log'],
  branch_manager:     ['dashboard','kpi_report','sale_report','upload_status'],
  top_manager:        ['dashboard','kpi_report','sale_report','analytics','upload_history','roster','kpi_settings','audit_log','settings'],
  hr:                 ['dashboard','kpi_report','sale_report','analytics','upload_history','upload_status','roster','kpi_settings','audit_log','settings'],
  hr_support:         ['roster','upload_status'],
}

function computePermissions(db: ReturnType<typeof getDb>, userId: number, role: string): string[] {
  const defaults = new Set<string>(ROLE_DEFAULTS[role] ?? [])
  const overrides = prepare(db, `SELECT menu_key, enabled FROM user_permissions WHERE user_id = ?`).all(userId) as Array<{ menu_key: string; enabled: number }>
  for (const o of overrides) {
    if (o.enabled) defaults.add(o.menu_key)
    else defaults.delete(o.menu_key)
  }
  return [...defaults]
}

export function logAudit(
  db: ReturnType<typeof getDb>,
  userId: number | null, username: string, role: string,
  eventType: string, detail?: string, targetType?: string, targetId?: string, branchId?: number | null,
): void {
  try {
    prepare(db, `
      INSERT INTO audit_logs (user_id, username, role, event_type, target_type, target_id, detail, branch_id)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(userId, username, role, eventType, targetType ?? null, targetId ?? null, detail ?? null, branchId ?? null)
  } catch { /* non-critical — never throw */ }
}

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

function validateToken(token: string): { id: number; role: string; username: string; branch_id: number | null; supervisor_id: number | null } | null {
  const db = getDb()
  const session = prepare(db, `
    SELECT u.id, u.role, u.username, u.branch_id, u.supervisor_id
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now') AND u.active = 1
  `).get(token) as { id: number; role: string; username: string; branch_id: number | null; supervisor_id: number | null } | undefined
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

    if (!user) {
      logAudit(db, null, username, '', 'failed_login', 'User not found')
      return { success: false, error: 'Invalid username or password' }
    }
    const valid = bcrypt.compareSync(password, user.password_hash)
    if (!valid) {
      logAudit(db, user.id, user.username, user.role, 'failed_login', 'Wrong password')
      return { success: false, error: 'Invalid username or password' }
    }

    prepare(db, `DELETE FROM sessions WHERE user_id = ? AND expires_at <= datetime('now')`).run(user.id)

    const token = generateToken()
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
    prepare(db, `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(token, user.id, expiresAt)

    const permissions = computePermissions(db, user.id, user.role)
    logAudit(db, user.id, user.username, user.role, 'login')

    return {
      success: true, token, permissions,
      user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role, branchId: user.branch_id, supervisorId: user.supervisor_id },
    }
  })

  ipcMain.handle('auth:logout', async (_e, token: string) => {
    const db = getDb()
    const session = prepare(db, `SELECT u.id, u.username, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`).get(token) as { id: number; username: string; role: string } | undefined
    if (session) logAudit(db, session.id, session.username, session.role, 'logout')
    prepare(db, `DELETE FROM sessions WHERE token = ?`).run(token)
    return { success: true }
  })

  ipcMain.handle('auth:getPermissions', async (_e, token: string) => {
    const u = requireAuth(token)
    return computePermissions(getDb(), u.id, u.role)
  })

  ipcMain.handle('auth:getUserPermissions', async (_e, token: string, userId: number) => {
    requireAdmin(token)
    const db = getDb()
    const user = prepare(db, `SELECT role FROM users WHERE id = ?`).get(userId) as { role: string } | undefined
    if (!user) throw new Error('User not found')
    return computePermissions(db, userId, user.role)
  })

  ipcMain.handle('auth:saveUserPermissions', async (_e, token: string, userId: number, allStates: Array<{ menu_key: string; enabled: boolean }>) => {
    const admin = requireAdmin(token)
    const db = getDb()
    const user = prepare(db, `SELECT role, username FROM users WHERE id = ?`).get(userId) as { role: string; username: string } | undefined
    if (!user) throw new Error('User not found')
    const defaults = new Set<string>(ROLE_DEFAULTS[user.role] ?? [])

    transaction(db, () => {
      prepare(db, `DELETE FROM user_permissions WHERE user_id = ?`).run(userId)
      for (const s of allStates) {
        const isDefault = defaults.has(s.menu_key)
        if ((s.enabled && !isDefault) || (!s.enabled && isDefault)) {
          prepare(db, `INSERT INTO user_permissions (user_id, menu_key, enabled) VALUES (?,?,?)`).run(userId, s.menu_key, s.enabled ? 1 : 0)
        }
      }
    })

    logAudit(db, admin.id, admin.username, admin.role, 'permission_change', `Updated permissions for user ${user.username}`, 'user', String(userId))
    return { success: true }
  })

  ipcMain.handle('auth:getUsers', async (_e, token: string) => {
    requireAdmin(token)
    return prepare(getDb(), `
      SELECT u.id, u.username, u.full_name, u.role, u.branch_id, u.active, b.name AS branch_name,
             u.supervisor_id, sv.full_name AS supervisor_name
      FROM users u
      LEFT JOIN branches b ON b.id = u.branch_id
      LEFT JOIN supervisors sv ON sv.id = u.supervisor_id
      ORDER BY u.role, u.full_name
    `).all()
  })

  ipcMain.handle('auth:createUser', async (_e, token: string, data: {
    username: string; password: string; fullName: string; role: string; branchId: number | null; supervisorId?: number | null
  }) => {
    const admin = requireAdmin(token)
    try {
      const db   = getDb()
      const hash = bcrypt.hashSync(data.password, 10)
      const result = prepare(db, `INSERT INTO users (username, password_hash, full_name, role, branch_id, supervisor_id) VALUES (?,?,?,?,?,?)`)
        .run(data.username, hash, data.fullName, data.role, data.branchId, data.supervisorId ?? null)
      logAudit(db, admin.id, admin.username, admin.role, 'user_create', `Created user ${data.username} (${data.role})`, 'user', String(result.lastInsertRowid))
      pushUsersIfConfigured(db).catch(() => {})
      return { success: true, id: result.lastInsertRowid }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
    }
  })

  ipcMain.handle('auth:updateUser', async (_e, token: string, id: number, data: {
    fullName?: string; role?: string; branchId?: number | null; supervisorId?: number | null; active?: number; password?: string
  }) => {
    const admin = requireAdmin(token)
    const db = getDb()
    if (data.password) prepare(db, `UPDATE users SET password_hash = ? WHERE id = ?`).run(bcrypt.hashSync(data.password, 10), id)
    if (data.fullName !== undefined) prepare(db, `UPDATE users SET full_name = ? WHERE id = ?`).run(data.fullName, id)
    if (data.role !== undefined) prepare(db, `UPDATE users SET role = ? WHERE id = ?`).run(data.role, id)
    if (data.branchId !== undefined) prepare(db, `UPDATE users SET branch_id = ? WHERE id = ?`).run(data.branchId, id)
    if (data.supervisorId !== undefined) prepare(db, `UPDATE users SET supervisor_id = ? WHERE id = ?`).run(data.supervisorId, id)
    if (data.active !== undefined) prepare(db, `UPDATE users SET active = ? WHERE id = ?`).run(data.active, id)
    logAudit(db, admin.id, admin.username, admin.role, 'user_update', JSON.stringify(data), 'user', String(id))
    pushUsersIfConfigured(db).catch(() => {})
    return { success: true }
  })

  ipcMain.handle('auth:deleteUser', async (_e, token: string, id: number) => {
    const admin = requireAdmin(token)
    const db = getDb()
    prepare(db, `UPDATE users SET active = 0 WHERE id = ?`).run(id)
    logAudit(db, admin.id, admin.username, admin.role, 'user_delete', `Deactivated user id=${id}`, 'user', String(id))
    pushUsersIfConfigured(db).catch(() => {})
    return { success: true }
  })

  ipcMain.handle('auth:getBranches', async (_e, token: string) => {
    requireAuth(token)
    return prepare(getDb(), `SELECT * FROM branches ORDER BY id`).all()
  })

  // ── Audit log queries ─────────────────────────────────────────────────────
  ipcMain.handle('audit:getLogs', async (_e, token: string, filters: {
    dateFrom?: string; dateTo?: string; username?: string; eventType?: string; limit?: number; offset?: number
  }) => {
    requireAdmin(token)
    const db = getDb()
    const conditions: string[] = []
    const params: (string | number)[] = []
    if (filters.dateFrom) { conditions.push(`occurred_at >= ?`); params.push(filters.dateFrom) }
    if (filters.dateTo)   { conditions.push(`occurred_at <= ?`); params.push(filters.dateTo + 'T23:59:59') }
    if (filters.username) { conditions.push(`username LIKE ?`);  params.push(`%${filters.username}%`) }
    if (filters.eventType && filters.eventType !== 'all') { conditions.push(`event_type = ?`); params.push(filters.eventType) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit  = filters.limit  ?? 100
    const offset = filters.offset ?? 0
    const rows = prepare(db, `SELECT * FROM audit_logs ${where} ORDER BY occurred_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset)
    const count = prepare(db, `SELECT COUNT(*) AS n FROM audit_logs ${where}`).get(...params) as { n: number }
    return { rows, total: count?.n ?? 0 }
  })
}
