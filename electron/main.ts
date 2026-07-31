import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { initDatabase } from './db/connection'
import { registerAllHandlers, startEmailScheduler } from './ipc/index'
import { pullAllFromCloud, getSetting } from './ipc/sheets'

let mainWindow: BrowserWindow | null = null

// Dev: build/icon.png lives at the project root, two levels up from out/main/main.js.
// Packaged: copied into resources/ via electron-builder.yml's extraResources — win.icon
// in that file only sets the installer/.exe/shortcut icon, the live window needs its own.
const iconPath = app.isPackaged
  ? join(process.resourcesPath, 'icon.png')
  : join(__dirname, '../../build/icon.png')

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
    icon: iconPath,
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

  // User-initiated update actions — never triggered automatically, only from the
  // in-app "Update available" banner the renderer shows on 'updater:available'.
  ipcMain.handle('updater:download', () => autoUpdater.downloadUpdate())
  ipcMain.handle('updater:install', () => autoUpdater.quitAndInstall())

  // Create window immediately so OS event pump stays alive while DB loads.
  // Window stays hidden (show:false) until ready-to-show fires — user sees the
  // loading spinner, not a frozen grey shell. Fixes "App not responding" caused
  // by AV scanning the new binary before WASM can load (20-30s on fresh install).
  createWindow()

  try {
    // Initialize SQLite (loads WASM + runs schema migrations — slow on first run).
    // Bounded with a timeout — an unresolved promise (WASM load deadlock, a migration
    // query stuck) throws nothing on its own, so without this the spinner hangs forever
    // with zero signal of what's wrong, same as a thrown error but worse: invisible.
    await Promise.race([
      initDatabase(),
      new Promise((_, reject) => setTimeout(() => reject(new Error(
        'Database initialization timed out after 45s. This usually means the SQLite WASM file failed to load (antivirus blocking it, or a corrupted DB file), or a schema migration query is stuck.'
      )), 45000)),
    ])

    // Register IPC handlers now that DB is ready
    registerAllHandlers(ipcMain)

    isDbReady = true

    // Signal renderer: DB is ready, hide loading spinner
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:ready')
    }
  } catch (e) {
    // Without this, a thrown error here leaves the renderer spinning on "Starting up…"
    // forever with no way to tell what broke — surface it instead of failing silently.
    const message = e instanceof Error ? (e.stack ?? e.message) : String(e)
    console.error('[startup] Database init failed:', message)
    try { writeFileSync(join(app.getPath('userData'), 'startup-error.log'), `${new Date().toISOString()}\n${message}\n`) } catch { /* best effort */ }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:init-error', message)
    }
    return
  }

  // Auto-pull config + data from Google Sheets on startup (if credentials configured).
  // A device with no admin/hr login (e.g. a remote branch running only an hr_support
  // account) has no other way to trigger a sync — this is its only chance to ever see
  // current Roster/KPI data. Forward the outcome to the renderer so a failed or
  // never-configured sync is visible on screen instead of silently logged to a console
  // nobody on that machine will ever open.
  const sheetsId = getSetting('sheets_id')
  const saPath   = getSetting('service_account_path')
  function reportSyncResult(result: { configured: boolean; success: boolean; error?: string }) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sheets:startupSyncResult', result)
    }
  }
  if (sheetsId && saPath) {
    pullAllFromCloud(sheetsId, saPath)
      .then(r => {
        if (r.success) console.log('[startup] Sheets pull:', r.counts)
        else console.warn('[startup] Sheets pull failed:', r.error)
        reportSyncResult({ configured: true, success: r.success, error: r.error })
      })
      .catch(e => {
        console.warn('[startup] Sheets pull error:', e?.message)
        reportSyncResult({ configured: true, success: false, error: e instanceof Error ? e.message : String(e) })
      })
  } else {
    reportSyncResult({ configured: false, success: false })
  }

  // Start scheduled email jobs
  startEmailScheduler()

  // Auto-update check — silently does nothing in dev (no packaged app, no GH_TOKEN) or
  // if the network/repo is unreachable. autoDownload is off so the user gets a choice
  // before a download starts; quitAndInstall only fires when they explicitly click it
  // (see ipcMain handlers below), never silently mid-session.
  autoUpdater.autoDownload = false
  autoUpdater.on('update-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:available', { version: info.version })
    }
  })
  autoUpdater.on('update-downloaded', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:downloaded')
    }
  })
  autoUpdater.on('error', (err) => {
    console.warn('[updater] check/download failed:', err?.message)
  })
  if (is.dev) {
    console.log('[updater] skipped in dev')
  } else {
    autoUpdater.checkForUpdates().catch(e => console.warn('[updater] checkForUpdates failed:', e?.message))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
