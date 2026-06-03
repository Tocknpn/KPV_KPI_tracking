import type { Database } from 'sql.js'

const SCHEMA_VERSION = 3

const BASE_TABLES = `
  CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS branches (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    full_name     TEXT    NOT NULL DEFAULT '',
    role          TEXT    NOT NULL,
    branch_id     INTEGER REFERENCES branches(id),
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT    NOT NULL
  );
  CREATE TABLE IF NOT EXISTS salesmen (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name  TEXT    NOT NULL,
    nickname   TEXT    NOT NULL DEFAULT '',
    branch_id  INTEGER NOT NULL REFERENCES branches(id),
    position   TEXT    NOT NULL DEFAULT '',
    department TEXT    NOT NULL DEFAULT '',
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS targets (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    salesman_id      INTEGER NOT NULL REFERENCES salesmen(id),
    branch_id        INTEGER NOT NULL REFERENCES branches(id),
    year             INTEGER NOT NULL,
    month            INTEGER NOT NULL,
    jewelry_weight_g REAL    NOT NULL DEFAULT 0,
    bar_weight_g     REAL    NOT NULL DEFAULT 0,
    quantity         INTEGER NOT NULL DEFAULT 0,
    UNIQUE(salesman_id, year, month)
  );
  CREATE TABLE IF NOT EXISTS daily_entries (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    salesman_id      INTEGER NOT NULL REFERENCES salesmen(id),
    branch_id        INTEGER NOT NULL REFERENCES branches(id),
    entry_date       TEXT    NOT NULL,
    jewelry_weight_g REAL    NOT NULL DEFAULT 0,
    bar_weight_g     REAL    NOT NULL DEFAULT 0,
    quantity         INTEGER NOT NULL DEFAULT 0,
    synced           INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(salesman_id, entry_date)
  );
  CREATE TABLE IF NOT EXISTS kpi_metrics (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    unit            TEXT    NOT NULL,
    color_token     TEXT    NOT NULL DEFAULT 'primary',
    active          INTEGER NOT NULL DEFAULT 1,
    display_order   INTEGER NOT NULL DEFAULT 0,
    points_per_unit REAL    NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS kpi_tier_configs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_id      INTEGER NOT NULL REFERENCES kpi_metrics(id),
    branch_id      INTEGER,
    label          TEXT    NOT NULL,
    effective_from TEXT    NOT NULL,
    effective_to   TEXT,
    is_active      INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS kpi_tiers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    config_id     INTEGER NOT NULL REFERENCES kpi_tier_configs(id),
    threshold_pct REAL    NOT NULL,
    score         REAL    NOT NULL,
    tier_order    INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sync_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    synced_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    direction     TEXT    NOT NULL DEFAULT 'push',
    records_count INTEGER NOT NULL DEFAULT 0,
    status        TEXT    NOT NULL DEFAULT 'success',
    error_message TEXT
  );
  CREATE TABLE IF NOT EXISTS email_config (
    id            INTEGER PRIMARY KEY DEFAULT 1,
    recipients    TEXT    NOT NULL DEFAULT '[]',
    frequency     TEXT    NOT NULL DEFAULT 'daily',
    dispatch_time TEXT    NOT NULL DEFAULT '08:00',
    smtp_host     TEXT    NOT NULL DEFAULT '',
    smtp_port     INTEGER NOT NULL DEFAULT 587,
    smtp_user     TEXT    NOT NULL DEFAULT '',
    smtp_pass     TEXT    NOT NULL DEFAULT '',
    from_address  TEXT    NOT NULL DEFAULT '',
    metrics       TEXT    NOT NULL DEFAULT '["jewelry","bar","quantity"]',
    enabled       INTEGER NOT NULL DEFAULT 0
  );
`

// Added in v3
const V3_MIGRATIONS = `
  ALTER TABLE kpi_metrics ADD COLUMN points_per_unit REAL NOT NULL DEFAULT 0;
`

// Added in v2
const V2_TABLES = `
  CREATE TABLE IF NOT EXISTS upload_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    uploaded_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    branch_id     INTEGER NOT NULL REFERENCES branches(id),
    user_id       INTEGER NOT NULL REFERENCES users(id),
    upload_type   TEXT    NOT NULL CHECK(upload_type IN ('target','daily')),
    filename      TEXT    NOT NULL DEFAULT '',
    records_count INTEGER NOT NULL DEFAULT 0,
    date_from     TEXT,
    date_to       TEXT,
    month         INTEGER,
    year          INTEGER,
    status        TEXT    NOT NULL DEFAULT 'success',
    notes         TEXT
  );
`

export function applySchema(db: Database): boolean {
  let currentVersion = 0
  try {
    const result = db.exec(`SELECT value FROM app_settings WHERE key = 'schema_version'`)
    const v = result[0]?.values[0]?.[0]
    if (v) currentVersion = parseInt(String(v))
  } catch {
    // Fresh DB — app_settings doesn't exist yet
  }

  if (currentVersion === 0) {
    // Fresh install — create everything
    db.run(BASE_TABLES)
    db.run(V2_TABLES)
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`).run(String(SCHEMA_VERSION))
    return true // Caller should seed
  }

  // Incremental migrations
  if (currentVersion < 2) {
    db.run(V2_TABLES)
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', '2')`).run()
  }

  if (currentVersion < 3) {
    try { db.run(V3_MIGRATIONS) } catch { /* column may already exist */ }
    db.prepare(`UPDATE kpi_metrics SET points_per_unit = 15 WHERE id = 1`).run()
    db.prepare(`UPDATE kpi_metrics SET points_per_unit = 7.5 WHERE id = 2`).run()
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', '3')`).run()
  }

  return false // Existing DB — no seeding needed
}
