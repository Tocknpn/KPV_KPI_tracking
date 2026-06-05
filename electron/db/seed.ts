import type { Database } from 'sql.js'
import bcrypt from 'bcryptjs'
import { prepare, transaction } from './query'

export function seedDatabase(db: Database): void {
  transaction(db, () => {
    // ── Branches (4 real branches) ────────────────────────────────────────
    prepare(db, `INSERT INTO branches (name, code, kpi_point_target) VALUES (?, ?, ?)`).run('Morning Market',   'MM', 8000)
    prepare(db, `INSERT INTO branches (name, code, kpi_point_target) VALUES (?, ?, ?)`).run('Vientiane Center', 'VC', 5500)
    prepare(db, `INSERT INTO branches (name, code, kpi_point_target) VALUES (?, ?, ?)`).run('ITecc',            'IT', 6000)
    prepare(db, `INSERT INTO branches (name, code, kpi_point_target) VALUES (?, ?, ?)`).run('VangThong',        'VT', 7000)

    // ── Users ─────────────────────────────────────────────────────────────
    const adminHash = bcrypt.hashSync('admin1234', 10)
    const supHash   = bcrypt.hashSync('sup1234',   10)
    const bmHash    = bcrypt.hashSync('bm1234',    10)
    const ceoHash   = bcrypt.hashSync('ceo1234',   10)

    prepare(db, `INSERT INTO users (username, password_hash, full_name, role, branch_id) VALUES (?,?,?,?,?)`)
      .run('admin', adminHash, 'System Administrator', 'admin', null)

    // One supervisor user per branch (supervisor_id linked in seedTestData)
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

    // One branch manager per branch
    const managers = [
      ['bm_mm', 'Branch Manager Morning Market',   1],
      ['bm_vc', 'Branch Manager Vientiane Center', 2],
      ['bm_it', 'Branch Manager ITecc',            3],
      ['bm_vt', 'Branch Manager VangThong',        4],
    ] as [string, string, number][]
    for (const [u, n, b] of managers) {
      prepare(db, `INSERT INTO users (username, password_hash, full_name, role, branch_id) VALUES (?,?,?,?,?)`)
        .run(u, bmHash, n, 'branch_manager', b)
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

/**
 * Seed realistic-scale test data: 3 supervisors × 9 reps = 27 reps per branch.
 *
 * ── STRUCTURE ──────────────────────────────────────────────────────────────
 *   4 branches × 3 supervisors × 9 reps = 108 reps total
 *   All entries on day 1 of current month → MTD = entry value exactly
 *
 * ── PERFORMANCE TIERS (per supervisor team) ───────────────────────────────
 *   ALPHA (high): J=250g  B=350g  Qty=130  → J-pts=3750 B-pts=2625 Q-pts=325 Total=6700
 *     VC: 6700÷5500=121.8%  IT: 6700÷6000=111.7%  VT: 6700÷7000=95.7%  MM: 6700÷8000=83.8%
 *
 *   BETA (mid):  J=140g  B=200g  Qty=80   → J-pts=2100 B-pts=1500 Q-pts=200 Total=3800
 *     VC: 3800÷5500=69.1%  IT: 3800÷6000=63.3%  VT: 3800÷7000=54.3%  MM: 3800÷8000=47.5%
 *
 *   GAMMA (low): J=70g   B=100g  Qty=35   → J-pts=1050 B-pts=750  Q-pts=70  Total=1870
 *     VC: 1870÷5500=34.0%  IT: 1870÷6000=31.2%  VT: 1870÷7000=26.7%  MM: 1870÷8000=23.4%
 *
 *   Qty tier ×2.5 (≥100) used for Alpha, ×2.5 for Beta (≥50→×2), ×2 for Gamma (≥1→×1.5×35)
 *   Qty multipliers: Alpha 130×2.5=325, Beta 80×2.5=200, Gamma 35×2=70
 *
 * ── SUPERVISOR KPI (30% rate) ──────────────────────────────────────────────
 *   Alpha sup team score = 9×6700=60300 → sup score=60300×30%=18090
 *   Beta  sup team score = 9×3800=34200 → sup score=34200×30%=10260
 *   Gamma sup team score = 9×1870=16830 → sup score=16830×30%=5049
 */
export function seedTestData(db: Database): void {
  const year  = new Date().getFullYear()
  const month = new Date().getMonth() + 1
  const pad   = (n: number) => String(n).padStart(2, '0')
  const day1  = `${year}-${pad(month)}-01`

  // ── Supervisors (3 per branch) ────────────────────────────────────────────
  const SUPERVISORS: Array<{ branchId: number; fullName: string; nick: string; tier: 'alpha' | 'beta' | 'gamma' }> = [
    // Morning Market (1)
    { branchId: 1, fullName: 'Somvang Phongsavanh',     nick: 'Somvang',  tier: 'alpha' },
    { branchId: 1, fullName: 'Khamphanh Soulisak',      nick: 'Khamphanh',tier: 'beta'  },
    { branchId: 1, fullName: 'Phengsy Manivong',        nick: 'Phengsy',  tier: 'gamma' },
    // Vientiane Center (2)
    { branchId: 2, fullName: 'Bounlam Phetsavanh',      nick: 'Bounlam',  tier: 'alpha' },
    { branchId: 2, fullName: 'Khamtane Douangdao',      nick: 'Khamtane', tier: 'beta'  },
    { branchId: 2, fullName: 'Viengphet Keovongsa',     nick: 'Viengphet',tier: 'gamma' },
    // ITecc (3)
    { branchId: 3, fullName: 'Sithong Phommasack',      nick: 'Sithong',  tier: 'alpha' },
    { branchId: 3, fullName: 'Bounthavy Keovilay',      nick: 'Bounthavy',tier: 'beta'  },
    { branchId: 3, fullName: 'Chansamone Sengdara',     nick: 'Chansamone',tier:'gamma' },
    // VangThong (4)
    { branchId: 4, fullName: 'Phetsamone Sivilay',      nick: 'Phetsamone',tier:'alpha' },
    { branchId: 4, fullName: 'Khamsen Vongsavanh',      nick: 'Khamsen',  tier: 'beta'  },
    { branchId: 4, fullName: 'Daokham Vongkhamphanh',   nick: 'Daokham',  tier: 'gamma' },
  ]

  // ── Sales reps: 9 per supervisor team (same names reused per branch) ──────
  const TEAM_ALPHA: Array<[string, string]> = [
    ['Somchai Phommachan',   'Som'],  ['Khamla Sengdara',       'Kham'],
    ['Boupha Vilayvong',     'Bou'],  ['Naly Souvannaphoum',    'Naly'],
    ['Daovy Phetchanpheng',  'Dao'],  ['Sengdara Vongsay',      'Seng'],
    ['Phommasack Chanthavong','Phom'],['Simoung Vongkhamphanh', 'Si'],
    ['Lattana Phommasith',   'Lat'],
  ]
  const TEAM_BETA: Array<[string, string]> = [
    ['Savanh Keovongsa',     'Van'],  ['Phonesavanh Siha',      'Phone'],
    ['Manivone Keovilay',    'Mani'], ['Bounmy Phonsavath',     'Boun'],
    ['Thida Vongsay',        'Thi'],  ['Khamphone Simoung',     'Khamp'],
    ['Soukanh Vongkhamphanh','Souk'], ['Boualoy Chanthavong',   'Boua'],
    ['Vilasack Keobounma',   'Vila'],
  ]
  const TEAM_GAMMA: Array<[string, string]> = [
    ['Phouthong Chansouk',   'Phong'],['Souliya Phimmasone',    'Soul'],
    ['Khamsouk Sivilay',     'Ksouk'],['Nong Phommasith',       'Nong'],
    ['Chanthaly Sitthideth', 'Chan'], ['Vilay Souvannaphoum',   'Vil'],
    ['Douangdao Phommachan', 'Ddao'], ['Sombath Keovilay',      'Bat'],
    ['Thong Sengdara',       'Thong'],
  ]

  // ── Performance values per tier ───────────────────────────────────────────
  const TIER_VALS = {
    alpha: { jewelry: 250, bar: 350, qty: 130, tJ: 200, tB: 300, tQ: 100 },
    beta:  { jewelry: 140, bar: 200, qty:  80, tJ: 140, tB: 200, tQ:  80 },
    gamma: { jewelry:  70, bar: 100, qty:  35, tJ: 100, tB: 150, tQ:  50 },
  }

  // Build supervisor → { branchId, tier } map after insertion
  const supIdsByBranchAndTier: Record<string, number> = {}

  transaction(db, () => {
    for (const sup of SUPERVISORS) {
      const { lastInsertRowid } = prepare(db,
        `INSERT OR IGNORE INTO supervisors (full_name, nickname, branch_id) VALUES (?,?,?)`
      ).run(sup.fullName, sup.nick, sup.branchId)
      if (lastInsertRowid) supIdsByBranchAndTier[`${sup.branchId}-${sup.tier}`] = lastInsertRowid as number
    }

    // Link existing supervisor user accounts (one per branch) to alpha-tier supervisor record
    const branchSupUserMap: Record<number, string> = { 1: 'sup_mm', 2: 'sup_vc', 3: 'sup_it', 4: 'sup_vt' }
    for (const branchId of [1, 2, 3, 4]) {
      const alphaSupId = supIdsByBranchAndTier[`${branchId}-alpha`]
      if (alphaSupId) {
        prepare(db, `UPDATE users SET supervisor_id = ? WHERE username = ? AND role = 'supervisor'`)
          .run(alphaSupId, branchSupUserMap[branchId])
      }
    }
  })

  transaction(db, () => {
    for (const branchId of [1, 2, 3, 4]) {
      const tiers: Array<{ tier: 'alpha'|'beta'|'gamma'; names: Array<[string,string]> }> = [
        { tier: 'alpha', names: TEAM_ALPHA },
        { tier: 'beta',  names: TEAM_BETA  },
        { tier: 'gamma', names: TEAM_GAMMA },
      ]

      for (const { tier, names } of tiers) {
        const supId   = supIdsByBranchAndTier[`${branchId}-${tier}`]
        const vals    = TIER_VALS[tier]
        const bCode   = ['MM','VC','IT','VT'][branchId - 1]
        const tLetter = tier === 'alpha' ? 'A' : tier === 'beta' ? 'B' : 'G'

        for (let ni = 0; ni < names.length; ni++) {
          const [fullName, nick] = names[ni]
          // Rep code: e.g. MM-A-001
          const repCode = `${bCode}-${tLetter}-${String(ni + 1).padStart(3, '0')}`
          const { lastInsertRowid: sid } = prepare(db,
            `INSERT OR IGNORE INTO salesmen (rep_code, full_name, nickname, branch_id, position, department, active, supervisor_id)
             VALUES (?,?,?,?,'Sales Representative','Sales',1,?)`
          ).run(repCode, `${fullName} (${bCode})`, nick, branchId, supId ?? null)

          if (!sid) continue

          // Monthly target
          prepare(db,
            `INSERT OR IGNORE INTO targets (salesman_id, branch_id, year, month, jewelry_weight_g, bar_weight_g, quantity)
             VALUES (?,?,?,?,?,?,?)`
          ).run(sid, branchId, year, month, vals.tJ, vals.tB, vals.tQ)

          // MTD entry on day 1
          prepare(db,
            `INSERT OR IGNORE INTO daily_entries (salesman_id, branch_id, entry_date, jewelry_weight_g, bar_weight_g, quantity, synced)
             VALUES (?,?,?,?,?,?,0)`
          ).run(sid, branchId, day1, vals.jewelry, vals.bar, vals.qty)
        }
      }
    }
  })
}
