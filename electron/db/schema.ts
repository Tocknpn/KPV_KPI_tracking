import type { Database } from 'sql.js'

const SCHEMA_VERSION = 12

const BASE_TABLES = `
  CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS branches (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT    NOT NULL,
    code             TEXT    UNIQUE NOT NULL,
    kpi_point_target REAL    NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    full_name     TEXT    NOT NULL DEFAULT '',
    role          TEXT    NOT NULL,
    branch_id     INTEGER REFERENCES branches(id),
    supervisor_id INTEGER REFERENCES supervisors(id),
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
    rep_code   TEXT    UNIQUE,
    full_name  TEXT    NOT NULL,
    nickname   TEXT    NOT NULL DEFAULT '',
    branch_id  INTEGER NOT NULL REFERENCES branches(id),
    staff_type TEXT    NOT NULL DEFAULT 'b2c',
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
    staff_type       TEXT,
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
    staff_type     TEXT,
    label          TEXT    NOT NULL,
    effective_from TEXT    NOT NULL,
    effective_to   TEXT,
    is_active      INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS kpi_metric_type_rates (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_id       INTEGER NOT NULL REFERENCES kpi_metrics(id),
    staff_type      TEXT    NOT NULL,
    points_per_unit REAL    NOT NULL DEFAULT 0,
    UNIQUE(metric_id, staff_type)
  );
  CREATE TABLE IF NOT EXISTS staff_monthly_targets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    salesman_id INTEGER NOT NULL REFERENCES salesmen(id),
    year_month  TEXT    NOT NULL,
    point_target REAL   NOT NULL DEFAULT 0,
    UNIQUE(salesman_id, year_month)
  );
  CREATE TABLE IF NOT EXISTS commission_configs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_type       TEXT    NOT NULL,
    year_month       TEXT    NOT NULL,
    jewelry_rate_lak REAL    NOT NULL DEFAULT 0,
    bar_rate_lak     REAL    NOT NULL DEFAULT 0,
    qty_rate_lak     REAL    NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(staff_type, year_month)
  );
  CREATE TABLE IF NOT EXISTS kpi_tiers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    config_id     INTEGER NOT NULL REFERENCES kpi_tier_configs(id),
    threshold_pct REAL    NOT NULL,
    score         REAL    NOT NULL,
    tier_order    INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS branch_kpi_monthly_targets (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id        INTEGER NOT NULL REFERENCES branches(id),
    year             INTEGER NOT NULL,
    month            INTEGER NOT NULL,
    kpi_point_target REAL    NOT NULL DEFAULT 0,
    UNIQUE(branch_id, year, month)
  );
  CREATE TABLE IF NOT EXISTS supervisors (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name  TEXT    NOT NULL,
    nickname   TEXT    NOT NULL DEFAULT '',
    branch_id  INTEGER NOT NULL REFERENCES branches(id),
    staff_type TEXT    NOT NULL DEFAULT 'b2c',
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
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

  if (currentVersion < 4) {
    db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('kpi_total_base', '8000')`).run()
    db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('kpi_total_weight', '50')`).run()
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', '4')`).run()
  }

  if (currentVersion < 5) {
    try { db.run(`ALTER TABLE branches ADD COLUMN kpi_point_target REAL NOT NULL DEFAULT 0`) } catch { /* already exists */ }
    // Set per-branch KPI point targets
    db.prepare(`UPDATE branches SET kpi_point_target = 8000 WHERE code = 'MM'`).run()
    db.prepare(`UPDATE branches SET kpi_point_target = 5500 WHERE code = 'VC'`).run()
    db.prepare(`UPDATE branches SET kpi_point_target = 6000 WHERE code = 'IT'`).run()
    db.prepare(`UPDATE branches SET kpi_point_target = 7000 WHERE code = 'VT'`).run()
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', '5')`).run()
  }

  if (currentVersion < 6) {
    db.run(`
      CREATE TABLE IF NOT EXISTS branch_kpi_monthly_targets (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        branch_id        INTEGER NOT NULL REFERENCES branches(id),
        year             INTEGER NOT NULL,
        month            INTEGER NOT NULL,
        kpi_point_target REAL    NOT NULL DEFAULT 0,
        UNIQUE(branch_id, year, month)
      )
    `)
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', '6')`).run()
  }

  if (currentVersion < 7) {
    db.run(`
      CREATE TABLE IF NOT EXISTS supervisors (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name  TEXT    NOT NULL,
        nickname   TEXT    NOT NULL DEFAULT '',
        branch_id  INTEGER NOT NULL REFERENCES branches(id),
        active     INTEGER NOT NULL DEFAULT 1,
        created_at TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `)
    try { db.run(`ALTER TABLE salesmen ADD COLUMN supervisor_id INTEGER REFERENCES supervisors(id)`) } catch { /* already exists */ }
    db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('sup_kpi_pct', '30')`).run()
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', '7')`).run()
  }

  if (currentVersion < 8) {
    try { db.run(`ALTER TABLE users ADD COLUMN supervisor_id INTEGER REFERENCES supervisors(id)`) } catch { /* already exists */ }
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', '8')`).run()
  }

  if (currentVersion < 9) {
    try { db.run(`ALTER TABLE salesmen ADD COLUMN rep_code TEXT`) } catch { /* already exists */ }
    try { db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_salesmen_rep_code ON salesmen(rep_code) WHERE rep_code IS NOT NULL`) } catch { /* already exists */ }
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', '9')`).run()
  }

  if (currentVersion < 10) {
    try { db.run(`ALTER TABLE salesmen ADD COLUMN staff_type TEXT NOT NULL DEFAULT 'b2c'`) } catch { /* already exists */ }
    try { db.run(`ALTER TABLE supervisors ADD COLUMN staff_type TEXT NOT NULL DEFAULT 'b2c'`) } catch { /* already exists */ }
    try { db.run(`ALTER TABLE kpi_tier_configs ADD COLUMN staff_type TEXT`) } catch { /* already exists */ }
    db.run(`
      CREATE TABLE IF NOT EXISTS kpi_metric_type_rates (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_id       INTEGER NOT NULL REFERENCES kpi_metrics(id),
        staff_type      TEXT    NOT NULL,
        points_per_unit REAL    NOT NULL DEFAULT 0,
        UNIQUE(metric_id, staff_type)
      )
    `)
    db.run(`
      CREATE TABLE IF NOT EXISTS staff_monthly_targets (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        salesman_id  INTEGER NOT NULL REFERENCES salesmen(id),
        year_month   TEXT    NOT NULL,
        point_target REAL    NOT NULL DEFAULT 0,
        UNIQUE(salesman_id, year_month)
      )
    `)
    db.run(`
      CREATE TABLE IF NOT EXISTS commission_configs (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_type       TEXT    NOT NULL,
        year_month       TEXT    NOT NULL,
        jewelry_rate_lak REAL    NOT NULL DEFAULT 0,
        bar_rate_lak     REAL    NOT NULL DEFAULT 0,
        qty_rate_lak     REAL    NOT NULL DEFAULT 0,
        created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
        UNIQUE(staff_type, year_month)
      )
    `)
    // Seed default B2C and B2B metric rates
    db.prepare(`INSERT OR IGNORE INTO kpi_metric_type_rates (metric_id, staff_type, points_per_unit) VALUES (1, 'b2c', 15)`).run()
    db.prepare(`INSERT OR IGNORE INTO kpi_metric_type_rates (metric_id, staff_type, points_per_unit) VALUES (2, 'b2c', 7.5)`).run()
    db.prepare(`INSERT OR IGNORE INTO kpi_metric_type_rates (metric_id, staff_type, points_per_unit) VALUES (1, 'b2b', 20)`).run()
    db.prepare(`INSERT OR IGNORE INTO kpi_metric_type_rates (metric_id, staff_type, points_per_unit) VALUES (2, 'b2b', 10)`).run()
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', '10')`).run()
  }

  if (currentVersion < 11) {
    // Per-user menu access overrides (admin can toggle any menu on/off per user)
    db.run(`
      CREATE TABLE IF NOT EXISTS user_permissions (
        user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        menu_key TEXT    NOT NULL,
        enabled  INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (user_id, menu_key)
      )
    `)
    // Event audit trail
    db.run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        occurred_at TEXT    NOT NULL DEFAULT (datetime('now')),
        user_id     INTEGER REFERENCES users(id),
        username    TEXT    NOT NULL DEFAULT '',
        role        TEXT    NOT NULL DEFAULT '',
        event_type  TEXT    NOT NULL,
        target_type TEXT,
        target_id   TEXT,
        detail      TEXT,
        branch_id   INTEGER
      )
    `)
    // Supervisor code for roster matching
    try { db.run(`ALTER TABLE supervisors ADD COLUMN sup_code TEXT`) } catch { /* already exists */ }
    try { db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_supervisors_sup_code ON supervisors(sup_code) WHERE sup_code IS NOT NULL`) } catch { /* already exists */ }
    // B2B/B2C split on branch KPI monthly targets
    try { db.run(`ALTER TABLE branch_kpi_monthly_targets ADD COLUMN target_b2c REAL NOT NULL DEFAULT 0`) } catch { /* already exists */ }
    try { db.run(`ALTER TABLE branch_kpi_monthly_targets ADD COLUMN target_b2b REAL NOT NULL DEFAULT 0`) } catch { /* already exists */ }
    // Copy old single target to target_b2c as default
    try { db.run(`UPDATE branch_kpi_monthly_targets SET target_b2c = kpi_point_target WHERE target_b2c = 0 AND kpi_point_target > 0`) } catch { /* ignore */ }
    // Role migrations: rename old roles to new names
    db.prepare(`UPDATE users SET role = 'sales_sup'  WHERE role = 'supervisor'`).run()
    db.prepare(`UPDATE users SET role = 'top_manager' WHERE role = 'executive'`).run()
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', '11')`).run()
  }

  if (currentVersion < 12) {
    // Stamp staff_type onto each entry at write time — a rep's type/branch can change
    // month to month (transfer), and historical KPI scoring/target lookup must use
    // what was true THEN, not the rep's current roster assignment.
    try { db.run(`ALTER TABLE daily_entries ADD COLUMN staff_type TEXT`) } catch { /* already exists */ }
    // Backfill: best-effort from current roster (can't recover true history for past transfers,
    // but this is correct for anyone who hasn't moved branch/type since)
    try {
      db.run(`
        UPDATE daily_entries
        SET staff_type = (SELECT s.staff_type FROM salesmen s WHERE s.id = daily_entries.salesman_id)
        WHERE staff_type IS NULL
      `)
    } catch { /* ignore */ }
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', '12')`).run()
  }

  return false // Existing DB — no seeding needed
}
