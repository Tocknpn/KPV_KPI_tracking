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
    // Jewelry: score = actual_weight × 15;  Bar: score = actual_weight × 7.5
    // Quantity: score = actual_qty × multiplier (tier per branch)
    prepare(db, `INSERT INTO kpi_metrics (name, unit, color_token, active, display_order, points_per_unit) VALUES (?,?,?,1,?,?)`).run('Jewelry Weight', 'g',   'primary',   1, 15)
    prepare(db, `INSERT INTO kpi_metrics (name, unit, color_token, active, display_order, points_per_unit) VALUES (?,?,?,1,?,?)`).run('Bar Weight',     'g',   'secondary', 2, 7.5)
    prepare(db, `INSERT INTO kpi_metrics (name, unit, color_token, active, display_order, points_per_unit) VALUES (?,?,?,1,?,?)`).run('Quantity',       'pcs', 'tertiary',  3, 0)

    // ── Qty tier configs per branch ───────────────────────────────────────
    // threshold_pct stores absolute qty threshold; score stores the multiplier
    const today = new Date().toISOString().split('T')[0]

    // ITecc (3) & VangThong (4) & Vientiane Center (2): same tier table
    const tierA = [
      { pct: 900, score: 5   },
      { pct: 700, score: 4.5 },
      { pct: 500, score: 4   },
      { pct: 350, score: 3.5 },
      { pct: 200, score: 3   },
      { pct: 100, score: 2.5 },
      { pct: 50,  score: 2   },
      { pct: 1,   score: 1.5 },
    ]
    // Morning Market (1): higher multipliers
    const tierMM = [
      { pct: 900, score: 6.5 },
      { pct: 700, score: 6   },
      { pct: 500, score: 5   },
      { pct: 350, score: 4   },
      { pct: 200, score: 3   },
      { pct: 100, score: 2.5 },
      { pct: 50,  score: 2   },
      { pct: 1,   score: 1.5 },
    ]

    const qtyMetricId = 3
    const branchTiers: Array<{ branchId: number; label: string; tiers: typeof tierA }> = [
      { branchId: 1, label: 'Morning Market Qty Tiers',     tiers: tierMM },
      { branchId: 2, label: 'Vientiane Center Qty Tiers',   tiers: tierA  },
      { branchId: 3, label: 'ITecc Qty Tiers',              tiers: tierA  },
      { branchId: 4, label: 'VangThong Qty Tiers',          tiers: tierA  },
    ]
    for (const { branchId, label, tiers } of branchTiers) {
      const { lastInsertRowid } = prepare(db,
        `INSERT INTO kpi_tier_configs (metric_id, branch_id, label, effective_from, effective_to, is_active) VALUES (?,?,?,?,NULL,1)`
      ).run(qtyMetricId, branchId, label, today)
      tiers.forEach((t, i) => {
        prepare(db, `INSERT INTO kpi_tiers (config_id, threshold_pct, score, tier_order) VALUES (?,?,?,?)`)
          .run(lastInsertRowid, t.pct, t.score, i + 1)
      })
    }

    // Global fallback qty config (branch_id NULL) using tier A multipliers
    const { lastInsertRowid: globalQtyConfigId } = prepare(db,
      `INSERT INTO kpi_tier_configs (metric_id, branch_id, label, effective_from, effective_to, is_active) VALUES (?,NULL,?,?,NULL,1)`
    ).run(qtyMetricId, 'Global Qty Tiers (Fallback)', today)
    tierA.forEach((t, i) => {
      prepare(db, `INSERT INTO kpi_tiers (config_id, threshold_pct, score, tier_order) VALUES (?,?,?,?)`)
        .run(globalQtyConfigId, t.pct, t.score, i + 1)
    })

    // ── App defaults ──────────────────────────────────────────────────────
    prepare(db, `INSERT INTO email_config (id) VALUES (1)`).run()
    prepare(db, `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?,?)`).run('sheets_id', '')
    prepare(db, `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?,?)`).run('service_account_path', '')
    prepare(db, `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?,?)`).run('last_synced_at', '')
    prepare(db, `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?,?)`).run('kpi_total_base',   '8000')
    prepare(db, `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?,?)`).run('kpi_total_weight', '50')
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
