import type { Database } from 'sql.js'
import bcrypt from 'bcryptjs'
import { prepare, transaction } from './query'

export function seedDatabase(db: Database): void {
  transaction(db, () => {
    // ── Branches (4 real branches) ────────────────────────────────────────
    prepare(db, `INSERT INTO branches (name, code) VALUES (?, ?)`).run('Morning Market',    'MM')
    prepare(db, `INSERT INTO branches (name, code) VALUES (?, ?)`).run('Vientiane Center',  'VC')
    prepare(db, `INSERT INTO branches (name, code) VALUES (?, ?)`).run('ITecc',             'IT')
    prepare(db, `INSERT INTO branches (name, code) VALUES (?, ?)`).run('VangThong',         'VT')

    // ── Users ─────────────────────────────────────────────────────────────
    const adminHash = bcrypt.hashSync('admin1234', 10)
    const supHash   = bcrypt.hashSync('sup1234',   10)
    const ceoHash   = bcrypt.hashSync('ceo1234',   10)

    prepare(db, `INSERT INTO users (username, password_hash, full_name, role, branch_id) VALUES (?,?,?,?,?)`)
      .run('admin', adminHash, 'System Administrator', 'admin', null)

    // One supervisor per branch
    const supers = [
      ['sup_mm', 'Supervisor Morning Market',   1],
      ['sup_vc', 'Supervisor Vientiane Center', 2],
      ['sup_it', 'Supervisor ITecc',            3],
      ['sup_vt', 'Supervisor VangThong',        4],
    ] as [string, string, number][]
    for (const [u, n, b] of supers) {
      prepare(db, `INSERT INTO users (username, password_hash, full_name, role, branch_id) VALUES (?,?,?,?,?)`)
        .run(u, supHash, n, 'supervisor', b)
    }

    // CEO/executive
    prepare(db, `INSERT INTO users (username, password_hash, full_name, role, branch_id) VALUES (?,?,?,?,?)`)
      .run('ceo', ceoHash, 'Chief Executive Officer', 'executive', null)

    // ── KPI Metrics (3 core) ──────────────────────────────────────────────
    prepare(db, `INSERT INTO kpi_metrics (name, unit, color_token, active, display_order) VALUES (?,?,?,1,?)`).run('Jewelry Weight', 'g', 'primary',   1)
    prepare(db, `INSERT INTO kpi_metrics (name, unit, color_token, active, display_order) VALUES (?,?,?,1,?)`).run('Bar Weight',     'g', 'secondary', 2)
    prepare(db, `INSERT INTO kpi_metrics (name, unit, color_token, active, display_order) VALUES (?,?,?,1,?)`).run('Quantity',      'pcs', 'tertiary',  3)

    // ── Default KPI Tier Configs (Global, all branches) ───────────────────
    const today = new Date().toISOString().split('T')[0]
    const defaultTiers = [
      { pct: 100, score: 100 }, { pct: 80, score: 80 },
      { pct: 60,  score: 60  }, { pct: 40, score: 40 },
      { pct: 20,  score: 20  }, { pct: 0,  score: 0  },
    ]
    for (let metricId = 1; metricId <= 3; metricId++) {
      const { lastInsertRowid } = prepare(db,
        `INSERT INTO kpi_tier_configs (metric_id, branch_id, label, effective_from, effective_to, is_active) VALUES (?,NULL,?,?,NULL,1)`
      ).run(metricId, 'Default Config', today)
      defaultTiers.forEach((t, i) => {
        prepare(db, `INSERT INTO kpi_tiers (config_id, threshold_pct, score, tier_order) VALUES (?,?,?,?)`)
          .run(lastInsertRowid, t.pct, t.score, i + 1)
      })
    }

    // ── App defaults ──────────────────────────────────────────────────────
    prepare(db, `INSERT INTO email_config (id) VALUES (1)`).run()
    prepare(db, `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?,?)`).run('sheets_id', '')
    prepare(db, `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?,?)`).run('service_account_path', '')
    prepare(db, `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?,?)`).run('last_synced_at', '')
  })
}

/** Seed realistic test salesmen, targets, and 10 days of entries for all branches. */
export function seedTestData(db: Database): void {
  const year  = new Date().getFullYear()
  const month = new Date().getMonth() + 1

  const salesmenByBranch: Record<number, string[][]> = {
    1: [ // Morning Market
      ['Somchai Phommachan', 'Som'],
      ['Khamla Sengdara',    'Kham'],
      ['Boupha Vilayvong',   'Bou'],
      ['Naly Souvannaphoum', 'Naly'],
      ['Daovy Phetchanpheng','Dao'],
    ],
    2: [ // Vientiane Center
      ['Savanh Keovongsa',   'Van'],
      ['Phonesavanh Siha',   'Phone'],
      ['Manivone Keovilay',  'Mani'],
      ['Bounmy Phonsavath',  'Boun'],
      ['Thida Vongsay',      'Thi'],
    ],
    3: [ // ITecc
      ['Khamphone Simoung',  'Khamp'],
      ['Soukanh Vongkhamphanh','Souk'],
      ['Lattana Phommasack', 'Lat'],
      ['Boualoy Chanthavong','Boua'],
      ['Vilasack Keobounma', 'Vila'],
    ],
    4: [ // VangThong
      ['Phouthong Chansouk', 'Phong'],
      ['Souliya Phimmasone', 'Soul'],
      ['Khamsouk Sivilay',   'Ksouk'],
      ['Nong Phommasith',    'Nong'],
      ['Chanthaly Sitthideth','Chan'],
    ],
  }

  transaction(db, () => {
    for (const [branchIdStr, salesmen] of Object.entries(salesmenByBranch)) {
      const branchId = Number(branchIdStr)
      for (const [name, nick] of salesmen) {
        // Insert salesman
        const { lastInsertRowid: salesmanId } = prepare(db,
          `INSERT OR IGNORE INTO salesmen (full_name, nickname, branch_id, position, department) VALUES (?,?,?,'Sales Representative','Sales')`
        ).run(name, nick, branchId)

        if (!salesmanId) continue

        // Monthly target (varies per branch performance level)
        const targetJewelry = 800  + Math.floor(Math.random() * 400)   // 800–1200g
        const targetBar     = 1200 + Math.floor(Math.random() * 800)   // 1200–2000g
        const targetQty     = 15   + Math.floor(Math.random() * 20)    // 15–35 pcs
        prepare(db,
          `INSERT OR IGNORE INTO targets (salesman_id, branch_id, year, month, jewelry_weight_g, bar_weight_g, quantity) VALUES (?,?,?,?,?,?,?)`
        ).run(salesmanId, branchId, year, month, targetJewelry, targetBar, targetQty)

        // 10 days of daily entries (days 1–10 of current month)
        for (let day = 1; day <= 10; day++) {
          const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
          // Performance at ~70–110% of daily target
          const factor    = (70 + Math.floor(Math.random() * 40)) / 100
          const dailyJewelry = Math.round((targetJewelry / 30) * factor * 10) / 10
          const dailyBar     = Math.round((targetBar     / 30) * factor * 10) / 10
          const dailyQty     = Math.max(0, Math.round((targetQty / 30) * factor))
          prepare(db,
            `INSERT OR IGNORE INTO daily_entries (salesman_id, branch_id, entry_date, jewelry_weight_g, bar_weight_g, quantity, synced) VALUES (?,?,?,?,?,?,0)`
          ).run(salesmanId, branchId, dateStr, dailyJewelry, dailyBar, dailyQty)
        }
      }
    }
  })
}
