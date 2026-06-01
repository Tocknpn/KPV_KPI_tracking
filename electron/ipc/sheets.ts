import { IpcMain } from 'electron'
import { google } from 'googleapis'
import { readFileSync, existsSync } from 'fs'
import { getDb } from '../db/connection'
import { prepare } from '../db/query'
import { requireAuth } from './auth'

function getServiceAuth(serviceAccountPath: string) {
  if (!existsSync(serviceAccountPath)) throw new Error(`Service account file not found: ${serviceAccountPath}`)
  const key = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))
  return new google.auth.GoogleAuth({ credentials: key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
}

function getSetting(key: string): string {
  const row = prepare(getDb(), `SELECT value FROM app_settings WHERE key = ?`).get(key) as { value: string } | undefined
  return row?.value ?? ''
}

export function registerSheetsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('sheets:getConfig', async (_e, token: string) => {
    requireAuth(token)
    return { sheetsId: getSetting('sheets_id'), serviceAccountPath: getSetting('service_account_path'), lastSyncedAt: getSetting('last_synced_at') }
  })

  ipcMain.handle('sheets:saveConfig', async (_e, token: string, config: { sheetsId: string; serviceAccountPath: string }) => {
    requireAuth(token)
    const db = getDb()
    prepare(db, `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('sheets_id', ?)`).run(config.sheetsId)
    prepare(db, `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('service_account_path', ?)`).run(config.serviceAccountPath)
    return { success: true }
  })

  ipcMain.handle('sheets:getSyncLogs', async (_e, token: string) => {
    requireAuth(token)
    return prepare(getDb(), `SELECT * FROM sync_logs ORDER BY synced_at DESC LIMIT 20`).all()
  })

  ipcMain.handle('sheets:syncToCloud', async (_e, token: string) => {
    requireAuth(token)
    const sheetsId = getSetting('sheets_id')
    const saPath   = getSetting('service_account_path')
    if (!sheetsId || !saPath) return { success: false, error: 'Google Sheets not configured. Go to Settings.' }

    try {
      const auth = getServiceAuth(saPath)
      const sheets = google.sheets({ version: 'v4', auth })
      const db = getDb()

      const unsynced = prepare(db, `
        SELECT de.*, s.full_name, b.code AS branch_code
        FROM daily_entries de JOIN salesmen s ON s.id=de.salesman_id JOIN branches b ON b.id=de.branch_id
        WHERE de.synced=0 ORDER BY de.entry_date, de.branch_id
      `).all() as Array<{ id: number; salesman_id: number; full_name: string; branch_code: string; entry_date: string; jewelry_weight_g: number; bar_weight_g: number; quantity: number }>

      if (unsynced.length === 0) return { success: true, count: 0, message: 'Nothing to sync.' }

      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetsId, range: 'Entries!A:G', valueInputOption: 'USER_ENTERED',
        requestBody: { values: unsynced.map(e => [e.entry_date, e.branch_code, e.salesman_id, e.full_name, e.jewelry_weight_g, e.bar_weight_g, e.quantity]) },
      })

      unsynced.forEach(e => prepare(db, `UPDATE daily_entries SET synced=1 WHERE id=?`).run(e.id))
      const now = new Date().toISOString()
      prepare(db, `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('last_synced_at', ?)`).run(now)
      prepare(db, `INSERT INTO sync_logs (direction, records_count, status) VALUES ('push', ?, 'success')`).run(unsynced.length)

      return { success: true, count: unsynced.length }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      prepare(getDb(), `INSERT INTO sync_logs (direction, records_count, status, error_message) VALUES ('push', 0, 'error', ?)`).run(msg)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('sheets:pullFromCloud', async (_e, token: string) => {
    requireAuth(token)
    const sheetsId = getSetting('sheets_id')
    const saPath   = getSetting('service_account_path')
    if (!sheetsId || !saPath) return { success: false, error: 'Google Sheets not configured.' }
    try {
      const auth = getServiceAuth(saPath)
      const sheets = google.sheets({ version: 'v4', auth })
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'Roster!A:E' })
      const count = res.data.values?.length ?? 0
      const now = new Date().toISOString()
      const db = getDb()
      prepare(db, `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('last_synced_at', ?)`).run(now)
      prepare(db, `INSERT INTO sync_logs (direction, records_count, status) VALUES ('pull', ?, 'success')`).run(count)
      return { success: true, count }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      prepare(getDb(), `INSERT INTO sync_logs (direction, records_count, status, error_message) VALUES ('pull', 0, 'error', ?)`).run(msg)
      return { success: false, error: msg }
    }
  })
}
