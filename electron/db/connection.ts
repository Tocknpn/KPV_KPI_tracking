import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { applySchema, type SchemaDb } from './schema'
import { seedDatabase } from './seed'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

// No-op now. better-sqlite3 writes straight through to the on-disk file on every commit —
// unlike sql.js's old in-memory model, which needed an explicit export()+writeFileSync()
// after every write or changes only ever lived in JS heap memory. Kept as a function (not
// deleted) so query.ts's existing persistDb() call after writes doesn't need touching.
export function persistDb(): void {}

// schema.ts predates this migration and calls a handful of sql.js-shaped methods
// (db.run(sql) with no return value, db.exec(sql) returning columnar rows, db.prepare(sql)
// .run(paramsArray)) that don't exist on better-sqlite3's real Database. Rather than rewrite
// schema.ts's ~110 call sites, this adapter gives it the exact shape it already expects,
// backed by the same underlying connection.
function getSchemaDb(raw: Database.Database): SchemaDb {
  return {
    run(sql: string) { raw.exec(sql) },
    exec(sql: string) {
      const stmt = raw.prepare(sql)
      const rows = stmt.raw().all() as unknown[][]
      if (!rows.length) return []
      const columns = stmt.columns().map(c => c.name)
      return [{ columns, values: rows }]
    },
    prepare(sql: string) {
      const stmt = raw.prepare(sql)
      return {
        run(params?: unknown[]) {
          return params && params.length ? stmt.run(...params) : stmt.run()
        },
      }
    },
  }
}

export async function initDatabase(): Promise<void> {
  const userDataPath = app.getPath('userData')
  const dbDir = join(userDataPath, 'data')
  mkdirSync(dbDir, { recursive: true })
  const dbFilePath = join(dbDir, 'salestrack.db')

  db = new Database(dbFilePath)
  db.pragma('foreign_keys = ON')

  const isNew = applySchema(getSchemaDb(db))
  if (isNew) {
    try { seedDatabase(db) }
    catch (e) { throw new Error(`[seedDatabase] ${e instanceof Error ? e.message : String(e)}`) }
  }
}
