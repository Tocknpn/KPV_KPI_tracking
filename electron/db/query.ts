import type { Database } from 'better-sqlite3'

type Value = string | number | bigint | boolean | null | Uint8Array

// better-sqlite3 throws on bind types sql.js silently coerced (booleans, plain Uint8Array
// instead of Buffer) — coerce here so none of the ~150 existing call sites across the IPC
// layer need to know or care about that difference.
function coerce(v: Value): string | number | bigint | Buffer | null {
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Uint8Array && !Buffer.isBuffer(v)) return Buffer.from(v)
  return v
}

export function prepare(db: Database, sql: string) {
  const stmt = db.prepare(sql)
  return {
    get(...params: Value[]) {
      return stmt.get(...params.map(coerce)) as Record<string, unknown> | undefined
    },

    all(...params: Value[]) {
      return stmt.all(...params.map(coerce)) as Record<string, unknown>[]
    },

    run(...params: Value[]): { lastInsertRowid: number; changes: number } {
      const info = stmt.run(...params.map(coerce))
      return { lastInsertRowid: Number(info.lastInsertRowid), changes: info.changes }
    },
  }
}

// better-sqlite3's own transaction() wrapper handles BEGIN/COMMIT/ROLLBACK (and nested
// calls via SAVEPOINT) correctly — no need to hand-roll it like the old sql.js version did.
export function transaction<T>(db: Database, fn: () => T): T {
  return db.transaction(fn)()
}
