import { IpcMain, dialog } from 'electron'
import { google } from 'googleapis'
import { readFileSync, existsSync } from 'fs'
import { getDb } from '../db/connection'
import { prepare } from '../db/query'
import { requireAuth } from './auth'

const SHEET_HEADERS = ['Date', 'Branch', 'Rep Code', 'Salesman Name', 'Jewelry (Baht)', 'Bar (Baht)', 'Qty']

export function getServiceAuth(serviceAccountPath: string) {
  if (!existsSync(serviceAccountPath)) throw new Error(`Service account file not found: ${serviceAccountPath}`)
  const key = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))
  return new google.auth.GoogleAuth({ credentials: key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
}

export function getSetting(key: string): string {
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

  ipcMain.handle('sheets:testConnection', async (_e, token: string) => {
    requireAuth(token)
    const sheetsId = getSetting('sheets_id')
    const saPath   = getSetting('service_account_path')
    if (!sheetsId)  return { success: false, error: 'No Spreadsheet ID configured.' }
    if (!saPath)    return { success: false, error: 'No Service Account JSON path configured.' }
    if (!existsSync(saPath)) return { success: false, error: `File not found: ${saPath}` }
    try {
      const auth   = getServiceAuth(saPath)
      const sheets = google.sheets({ version: 'v4', auth })
      const res    = await sheets.spreadsheets.get({ spreadsheetId: sheetsId, fields: 'properties.title,sheets.properties.title' })
      const title      = res.data.properties?.title ?? 'Unknown'
      const sheetNames = (res.data.sheets ?? []).map(s => s.properties?.title ?? '')
      return { success: true, title, sheetNames }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('sheets:browseFile', async (_e, token: string) => {
    requireAuth(token)
    const result = await dialog.showOpenDialog({
      title: 'Select Service Account JSON',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
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
        SELECT de.*, s.rep_code, s.full_name, b.code AS branch_code
        FROM daily_entries de JOIN salesmen s ON s.id=de.salesman_id JOIN branches b ON b.id=de.branch_id
        WHERE de.synced=0 ORDER BY de.entry_date, de.branch_id
      `).all() as Array<{ id: number; rep_code: string | null; full_name: string; branch_code: string; entry_date: string; jewelry_weight_g: number; bar_weight_g: number; quantity: number }>

      if (unsynced.length === 0) return { success: true, count: 0, message: 'Nothing to sync.' }

      // Auto-create "Entries" tab with header if cell A1 is empty
      const headerCheck = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'Entries!A1' }).catch(() => null)
      const hasHeader = headerCheck?.data?.values?.[0]?.[0]
      if (!hasHeader) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetsId,
          requestBody: { requests: [{ addSheet: { properties: { title: 'Entries' } } }] },
        }).catch(() => { /* tab may already exist */ })
        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetsId, range: 'Entries!A1', valueInputOption: 'USER_ENTERED',
          requestBody: { values: [SHEET_HEADERS] },
        })
      }

      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetsId, range: 'Entries!A:G', valueInputOption: 'USER_ENTERED',
        requestBody: { values: unsynced.map(e => [e.entry_date, e.branch_code, e.rep_code ?? '', e.full_name, e.jewelry_weight_g, e.bar_weight_g, e.quantity]) },
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
      const auth   = getServiceAuth(saPath)
      const sheets = google.sheets({ version: 'v4', auth })
      const db     = getDb()

      // ── Pull entries from Entries!A:G ─────────────────────────────────
      // Columns: entry_date | branch_code | rep_code | full_name | jewelry | bar | qty
      const entryRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'Entries!A:G' })
      const allRows = entryRes.data.values ?? []
      // Skip header row if A1 is not a date
      const firstIsHeader = allRows[0] && !String(allRows[0][0]).match(/^\d{4}-\d{2}-\d{2}$/)
      const rows = firstIsHeader ? allRows.slice(1) : allRows

      let imported = 0
      const now = new Date().toISOString()

      for (const row of rows) {
        const [entryDate, , repCode, , jewelryStr, barStr, qtyStr] = row as string[]
        if (!entryDate || !repCode) continue

        // Resolve rep_code → salesman
        const sm = prepare(db, `SELECT id, branch_id FROM salesmen WHERE rep_code = ? AND active = 1`).get(repCode) as
          { id: number; branch_id: number } | undefined
        if (!sm) continue

        const jewelry = parseFloat(jewelryStr) || 0
        const bar     = parseFloat(barStr)     || 0
        const qty     = parseInt(qtyStr)       || 0

        prepare(db, `DELETE FROM daily_entries WHERE salesman_id = ? AND entry_date = ?`).run(sm.id, entryDate)
        prepare(db, `
          INSERT INTO daily_entries (salesman_id, branch_id, entry_date, jewelry_weight_g, bar_weight_g, quantity, synced, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        `).run(sm.id, sm.branch_id, entryDate, jewelry, bar, qty, now)
        imported++
      }

      // ── Pull commission configs from CommissionConfig tab ─────────────
      let configsImported = 0
      try {
        const cfgRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetsId, range: 'CommissionConfig!A:E' }).catch(() => null)
        const cfgRows = cfgRes?.data?.values ?? []
        const cfgDataRows = cfgRows.length > 0 && String(cfgRows[0][0]).toLowerCase().includes('type') ? cfgRows.slice(1) : cfgRows
        for (const row of cfgDataRows) {
          const [staffType, yearMonth, jRate, bRate, qRate] = row as string[]
          if (!staffType || !yearMonth) continue
          prepare(db, `
            INSERT INTO commission_configs (staff_type, year_month, jewelry_rate_lak, bar_rate_lak, qty_rate_lak)
            VALUES (?,?,?,?,?)
            ON CONFLICT(staff_type, year_month) DO UPDATE SET
              jewelry_rate_lak = excluded.jewelry_rate_lak,
              bar_rate_lak     = excluded.bar_rate_lak,
              qty_rate_lak     = excluded.qty_rate_lak
          `).run(staffType, yearMonth, parseFloat(jRate) || 0, parseFloat(bRate) || 0, parseFloat(qRate) || 0)
          configsImported++
        }
      } catch { /* CommissionConfig tab may not exist yet */ }

      prepare(db, `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('last_synced_at', ?)`).run(now)
      prepare(db, `INSERT INTO sync_logs (direction, records_count, status) VALUES ('pull', ?, 'success')`).run(imported)

      return { success: true, count: imported, configsImported, message: `Pulled ${imported} entries and ${configsImported} commission configs from Google Sheets.` }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      prepare(getDb(), `INSERT INTO sync_logs (direction, records_count, status, error_message) VALUES ('pull', 0, 'error', ?)`).run(msg)
      return { success: false, error: msg }
    }
  })
}
