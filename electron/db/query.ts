import type { Database } from 'sql.js'
import { persistDb } from './connection'

type Value = string | number | bigint | boolean | null | Uint8Array

// Track whether we're inside a BEGIN…COMMIT block so run() skips mid-transaction saves
let _inTransaction = false

export function prepare(db: Database, sql: string) {
  return {
    get(...params: Value[]) {
      const stmt = db.prepare(sql)
      stmt.bind(params)
      const hasRow = stmt.step()
      if (!hasRow) { stmt.free(); return undefined }
      const row = stmt.getAsObject()
      stmt.free()
      return row as Record<string, unknown>
    },

    all(...params: Value[]) {
      const stmt = db.prepare(sql)
      stmt.bind(params)
      const rows: Record<string, unknown>[] = []
      while (stmt.step()) rows.push(stmt.getAsObject() as Record<string, unknown>)
      stmt.free()
      return rows
    },

    run(...params: Value[]): { lastInsertRowid: number; changes: number } {
      const stmt = db.prepare(sql)
      stmt.bind(params)
      stmt.step()
      stmt.free()
      const meta = db.exec('SELECT last_insert_rowid(), changes()')
      const vals = meta[0]?.values[0] ?? [0, 0]
      // Only persist immediately for standalone writes — transactions call persistDb() after COMMIT
      if (!_inTransaction) persistDb()
      return { lastInsertRowid: Number(vals[0]), changes: Number(vals[1]) }
    },
  }
}

export function transaction<T>(db: Database, fn: () => T): T {
  _inTransaction = true
  db.run('BEGIN')
  try {
    const result = fn()
    db.run('COMMIT')
    _inTransaction = false
    persistDb()   // single save after successful commit
    return result
  } catch (e) {
    db.run('ROLLBACK')
    _inTransaction = false
    throw e
  }
}
