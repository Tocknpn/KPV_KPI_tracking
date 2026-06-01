import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase } from './db/connection'
import { registerAuthHandlers } from './ipc/auth'
import { registerEntryHandlers } from './ipc/entries'
import { registerTargetHandlers } from './ipc/targets'
import { registerKpiHandlers } from './ipc/kpi'
import { registerSheetsHandlers } from './ipc/sheets'
import { registerEmailHandlers, startEmailScheduler } from './ipc/email'
import { registerReportHandlers } from './ipc/reports'
import { registerAdminHandlers } from './ipc/admin'
import { registerUploadHandlers } from './ipc/upload'

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

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.salestrackpro.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize SQLite database (async — loads WASM, creates tables + seeds)
  await initDatabase()

  // Register all IPC handlers
  registerAuthHandlers(ipcMain)
  registerEntryHandlers(ipcMain)
  registerTargetHandlers(ipcMain)
  registerKpiHandlers(ipcMain)
  registerSheetsHandlers(ipcMain)
  registerEmailHandlers(ipcMain)
  registerReportHandlers(ipcMain)
  registerAdminHandlers(ipcMain)
  registerUploadHandlers(ipcMain)

  // Start scheduled email jobs
  startEmailScheduler()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
