import initSqlJs, { Database } from 'sql.js'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { applySchema } from './schema'
import { seedDatabase } from './seed'

let db: Database | null = null
let dbFilePath: string = ''

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

/** Flush the in-memory DB to disk. Call after every write transaction. */
export function persistDb(): void {
  if (!db || !dbFilePath) return
  const data = db.export()
  writeFileSync(dbFilePath, Buffer.from(data))
}

export async function initDatabase(): Promise<void> {
  const userDataPath = app.getPath('userData')
  const dbDir = join(userDataPath, 'data')
  mkdirSync(dbDir, { recursive: true })
  dbFilePath = join(dbDir, 'salestrack.db')

  // In dev: WASM lives in node_modules.
  // In packaged exe: electron-builder copies it to process.resourcesPath via extraResources.
  const wasmPath = app.isPackaged
    ? join(process.resourcesPath, 'sql-wasm.wasm')
    : join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  const SQL = await initSqlJs({ locateFile: () => wasmPath })

  if (existsSync(dbFilePath)) {
    const fileBuffer = readFileSync(dbFilePath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON')

  const isNew = applySchema(db)
  if (isNew) {
    seedDatabase(db)
    persistDb()
  }
}
