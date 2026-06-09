import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase } from './db/connection'
import { registerAllHandlers, startEmailScheduler } from './ipc/index'
import { pullAllFromCloud, getSetting } from './ipc/sheets'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 768,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    backgroundColor: '#f8f9ff',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

let isDbReady = false

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.salestrackpro.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Allow renderer to poll readiness synchronously (handles fast-startup race)
  ipcMain.handle('app:isReady', () => isDbReady)

  // Create window immediately so OS event pump stays alive while DB loads.
  // Window stays hidden (show:false) until ready-to-show fires — user sees the
  // loading spinner, not a frozen grey shell. Fixes "App not responding" caused
  // by AV scanning the new binary before WASM can load (20-30s on fresh install).
  createWindow()

  // Initialize SQLite (loads WASM + runs schema migrations — slow on first run)
  await initDatabase()

  // Register IPC handlers now that DB is ready
  registerAllHandlers(ipcMain)

  isDbReady = true

  // Signal renderer: DB is ready, hide loading spinner
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:ready')
  }

  // Auto-pull config + data from Google Sheets on startup (if credentials configured)
  const sheetsId = getSetting('sheets_id')
  const saPath   = getSetting('service_account_path')
  if (sheetsId && saPath) {
    pullAllFromCloud(sheetsId, saPath)
      .then(r => { if (r.success) console.log('[startup] Sheets pull:', r.counts); else console.warn('[startup] Sheets pull failed:', r.error) })
      .catch(e => console.warn('[startup] Sheets pull error:', e?.message))
  }

  // Start scheduled email jobs
  startEmailScheduler()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
