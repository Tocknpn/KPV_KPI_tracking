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
    // Role strings here must match UserRole in src/types/index.ts + ROLE_DEFAULTS
    // in electron/ipc/auth.ts exactly — a stale value (e.g. old 'supervisor' /
    // 'executive') silently gets zero menu access since it matches no ROLE_DEFAULTS key.
    // password_plain stored alongside the hash per explicit user decision — admin can read
    // it straight off the Users sheet tab instead of resetting it. See schema.ts v20.
    function insertUser(username: string, plain: string, fullName: string, role: string, branchId: number | null) {
      prepare(db, `INSERT INTO users (username, password_hash, password_plain, full_name, role, branch_id) VALUES (?,?,?,?,?,?)`)
        .run(username, bcrypt.hashSync(plain, 10), plain, fullName, role, branchId)
    }

    insertUser('admin', 'admin1234', 'System Administrator', 'admin', null)

    // One sales supervisor user per branch (supervisor_id linked in seedTestData)
    const supers = [
      ['sup_mm', 'Supervisor Morning Market',   1],
      ['sup_vc', 'Supervisor Vientiane Center', 2],
      ['sup_it', 'Supervisor ITecc',            3],
      ['sup_vt', 'Supervisor VangThong',        4],
    ] as [string, string, number][]
    for (const [u, n, b] of supers) insertUser(u, 'sup1234', n, 'sales_sup', b)

    // One branch manager per branch
    const managers = [
      ['bm_mm', 'Branch Manager Morning Market',   1],
      ['bm_vc', 'Branch Manager Vientiane Center', 2],
      ['bm_it', 'Branch Manager ITecc',            3],
      ['bm_vt', 'Branch Manager VangThong',        4],
    ] as [string, string, number][]
    for (const [u, n, b] of managers) insertUser(u, 'bm1234', n, 'branch_manager', b)

    // One Accountant Officer per branch (uploads daily XLSX, own branch only)
    const acctOfficers = [
      ['acct_off_mm', 'Accountant Officer Morning Market',   1],
      ['acct_off_vc', 'Accountant Officer Vientiane Center', 2],
      ['acct_off_it', 'Accountant Officer ITecc',            3],
      ['acct_off_vt', 'Accountant Officer VangThong',        4],
    ] as [string, string, number][]
    for (const [u, n, b] of acctOfficers) insertUser(u, 'acctoff1234', n, 'accountant_officer', b)

    // Accountant Manager — approves/clears upload batches, all branches
    insertUser('acct_mgr', 'acctmgr1234', 'Accountant Manager', 'accountant_manager', null)

    // HR — full function except User Management and Sales Upload
    insertUser('hr', 'hr1234', 'HR', 'hr', null)

    // HR Support — Roster Upload + Commission Payment only
    insertUser('hr_support', 'hrsup1234', 'HR Support', 'hr_support', null)

    // Top Manager — view-only oversight, all branches, all menus except User Management
    insertUser('top_manager', 'top1234', 'Top Manager', 'top_manager', null)

    // ── KPI Metrics (3 core) ──────────────────────────────────────────────
    // Jewelry: score = actual_weight × 15;  Bar: score = actual_weight × 7.5
    // Quantity: score = actual_qty × multiplier (tier per branch)
    prepare(db, `INSERT INTO kpi_metrics (name, unit, color_token, active, display_order, points_per_unit) VALUES (?,?,?,1,?,?)`).run('Jewelry Weight', 'g',   'primary',   1, 15)
    prepare(db, `INSERT INTO kpi_metrics (name, unit, color_token, active, display_order, points_per_unit) VALUES (?,?,?,1,?,?)`).run('Bar Weight',     'g',   'secondary', 2, 7.5)
    prepare(db, `INSERT INTO kpi_metrics (name, unit, color_token, active, display_order, points_per_unit) VALUES (?,?,?,1,?,?)`).run('Quantity',       'pcs', 'tertiary',  3, 0)

    // ── KPI metric rates by staff type ───────────────────────────────────
    // B2C uses the base kpi_metrics.points_per_unit; B2B has higher multipliers
    prepare(db, `INSERT OR IGNORE INTO kpi_metric_type_rates (metric_id, staff_type, points_per_unit) VALUES (1,'b2c',15)`).run()
    prepare(db, `INSERT OR IGNORE INTO kpi_metric_type_rates (metric_id, staff_type, points_per_unit) VALUES (2,'b2c',7.5)`).run()
    prepare(db, `INSERT OR IGNORE INTO kpi_metric_type_rates (metric_id, staff_type, points_per_unit) VALUES (1,'b2b',20)`).run()
    prepare(db, `INSERT OR IGNORE INTO kpi_metric_type_rates (metric_id, staff_type, points_per_unit) VALUES (2,'b2b',10)`).run()

    // ── Default commission configs (current month, placeholder rates) ─────
    const cm = (() => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}` })()
    prepare(db, `INSERT OR IGNORE INTO commission_configs (staff_type, year_month, jewelry_rate_lak, bar_rate_lak, qty_rate_lak) VALUES (?,?,?,?,?)`).run('b2c', cm, 5000, 3000, 500)
    prepare(db, `INSERT OR IGNORE INTO commission_configs (staff_type, year_month, jewelry_rate_lak, bar_rate_lak, qty_rate_lak) VALUES (?,?,?,?,?)`).run('b2b', cm, 8000, 5000, 800)

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
 *   May 2026 full month (31 days) + June 2026 MTD (days 1–today)
 *   Daily variation: rep mult [0.7–1.2] × day factor (Sat=60%, Sun=0%/closed)
 *
 * ── DAILY PERFORMANCE VALUES (per working day) ────────────────────────────
 *   ALPHA B2C: J=8  B=10  Qty=35  → ~5946 pts/month (118.9% of 5000 target)
 *   BETA  B2C: J=5  B=7   Qty=25  → ~3963 pts/month (79.3%  of 5000 target)
 *   GAMMA B2B: J=5  B=5   Qty=15  → ~4145 pts/month (59.2%  of 7000 target)
 *   Rep mult range: lowest 0.7×  |  highest 1.2×  (deterministic per rep index)
 *
 * ── TOTAL ROWS SEEDED ─────────────────────────────────────────────────────
 *   May: 26 working days × 108 reps = 2808 entries
 *   June MTD (8 days): 7 working days × 108 reps = 756 entries
 */
export function seedTestData(db: Database): void {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1
  const pad   = (n: number) => String(n).padStart(2, '0')

  const yearMonth    = `${year}${pad(month)}`
  const mayYearMonth = '202605'

  // All dates to seed: May 2026 (full month) + current month MTD
  const allDates: string[] = []
  for (let d = 1; d <= 31; d++) allDates.push(`2026-05-${pad(d)}`)
  const todayDay = now.getDate()
  for (let d = 1; d <= todayDay; d++) allDates.push(`${year}-${pad(month)}-${pad(d)}`)

  // Deterministic per-rep variation (no random) — rep index 0–8 maps to these multipliers
  const REP_MULTS = [0.7, 0.85, 1.0, 0.9, 1.1, 0.75, 1.05, 0.95, 1.2]
  function scaleVal(base: number, repIdx: number, dateStr: string, isInt = false): number {
    const dt  = new Date(dateStr + 'T00:00:00')
    const dow = dt.getDay()
    if (dow === 0) return 0                          // Sunday: store closed
    const wm  = dow === 6 ? 0.6 : 1.0               // Saturday at 60%
    const dm  = dt.getDate() % 2 === 0 ? 0.95 : 1.05 // slight weekday wave
    const rm  = REP_MULTS[repIdx % REP_MULTS.length]
    const v   = base * rm * wm * dm
    return isInt ? Math.max(0, Math.round(v)) : Math.max(0, Math.round(v * 10) / 10)
  }

  // ── Supervisors (3 per branch) ────────────────────────────────────────────
  // alpha/beta teams = B2C, gamma team = B2B
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

  // ── Performance values per tier (daily per-working-day values) ───────────
  // tJ/tB/tQ = legacy monthly targets stored in `targets` table
  const TIER_VALS = {
    alpha: { jewelry: 8,  bar: 10, qty: 35, tJ: 160, tB: 200, tQ: 700 },
    beta:  { jewelry: 5,  bar: 7,  qty: 25, tJ: 100, tB: 140, tQ: 500 },
    gamma: { jewelry: 5,  bar: 5,  qty: 15, tJ: 100, tB: 100, tQ: 300 },
  }

  // Build supervisor → { branchId, tier } map after insertion
  const supIdsByBranchAndTier: Record<string, number> = {}

  transaction(db, () => {
    for (const sup of SUPERVISORS) {
      const supStaffType = sup.tier === 'gamma' ? 'b2b' : 'b2c'
      const { lastInsertRowid } = prepare(db,
        `INSERT OR IGNORE INTO supervisors (full_name, nickname, branch_id, staff_type) VALUES (?,?,?,?)`
      ).run(sup.fullName, sup.nick, sup.branchId, supStaffType)
      if (lastInsertRowid) supIdsByBranchAndTier[`${sup.branchId}-${sup.tier}`] = lastInsertRowid as number
    }

    // Link existing supervisor user accounts (one per branch) to alpha-tier supervisor record
    const branchSupUserMap: Record<number, string> = { 1: 'sup_mm', 2: 'sup_vc', 3: 'sup_it', 4: 'sup_vt' }
    for (const branchId of [1, 2, 3, 4]) {
      const alphaSupId = supIdsByBranchAndTier[`${branchId}-alpha`]
      if (alphaSupId) {
        prepare(db, `UPDATE users SET supervisor_id = ? WHERE username = ? AND role = 'sales_sup'`)
          .run(alphaSupId, branchSupUserMap[branchId])
      }
    }

    // Commission configs for May 2026 (historical test data)
    prepare(db, `INSERT OR IGNORE INTO commission_configs (staff_type, year_month, jewelry_rate_lak, bar_rate_lak, qty_rate_lak) VALUES (?,?,?,?,?)`).run('b2c', mayYearMonth, 5000, 3000, 500)
    prepare(db, `INSERT OR IGNORE INTO commission_configs (staff_type, year_month, jewelry_rate_lak, bar_rate_lak, qty_rate_lak) VALUES (?,?,?,?,?)`).run('b2b', mayYearMonth, 8000, 5000, 800)
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
        const bCode      = ['MM','VC','IT','VT'][branchId - 1]
        const tLetter    = tier === 'alpha' ? 'A' : tier === 'beta' ? 'B' : 'G'
        const staffType  = tier === 'gamma' ? 'b2b' : 'b2c'

        for (let ni = 0; ni < names.length; ni++) {
          const [fullName, nick] = names[ni]
          const repCode = `${bCode}-${tLetter}-${String(ni + 1).padStart(3, '0')}`
          const { lastInsertRowid: newSid } = prepare(db,
            `INSERT OR IGNORE INTO salesmen (rep_code, full_name, nickname, branch_id, staff_type, position, department, active, supervisor_id)
             VALUES (?,?,?,?,?,'Sales Representative','Sales',1,?)`
          ).run(repCode, `${fullName} (${bCode})`, nick, branchId, staffType, supId ?? null)

          // Fallback: look up existing rep if INSERT was ignored
          let sid = newSid as number
          if (!sid) {
            const ex = prepare(db, `SELECT id FROM salesmen WHERE rep_code = ?`).get(repCode) as { id: number } | undefined
            sid = ex?.id ?? 0
          }
          if (!sid) continue

          // roster_monthly is the source of truth for "who was active where, which month" —
          // without a row here the rep shows up nowhere on the Roster screen and
          // getHeadcountAsOf() resolves to 0, zeroing out branch point targets.
          prepare(db, `INSERT OR IGNORE INTO roster_monthly (salesman_id, year_month, branch_id, supervisor_id, staff_type, active) VALUES (?,?,?,?,?,1)`).run(sid, mayYearMonth, branchId, supId ?? null, staffType)
          prepare(db, `INSERT OR IGNORE INTO roster_monthly (salesman_id, year_month, branch_id, supervisor_id, staff_type, active) VALUES (?,?,?,?,?,1)`).run(sid, yearMonth, branchId, supId ?? null, staffType)

          const ptTarget = staffType === 'b2b' ? 7000 : 5000

          // Legacy targets for May + current month
          prepare(db, `INSERT OR IGNORE INTO targets (salesman_id, branch_id, year, month, jewelry_weight_g, bar_weight_g, quantity) VALUES (?,?,?,?,?,?,?)`).run(sid, branchId, 2026, 5, vals.tJ, vals.tB, vals.tQ)
          prepare(db, `INSERT OR IGNORE INTO targets (salesman_id, branch_id, year, month, jewelry_weight_g, bar_weight_g, quantity) VALUES (?,?,?,?,?,?,?)`).run(sid, branchId, year, month, vals.tJ, vals.tB, vals.tQ)

          // Individual point targets for May + current month
          prepare(db, `INSERT OR IGNORE INTO staff_monthly_targets (salesman_id, year_month, point_target) VALUES (?,?,?)`).run(sid, mayYearMonth, ptTarget)
          prepare(db, `INSERT OR IGNORE INTO staff_monthly_targets (salesman_id, year_month, point_target) VALUES (?,?,?)`).run(sid, yearMonth, ptTarget)

          // Daily entries for all dates (May full month + current month MTD)
          for (const dateStr of allDates) {
            const j = scaleVal(vals.jewelry, ni, dateStr, false)
            const b = scaleVal(vals.bar,     ni, dateStr, false)
            const q = scaleVal(vals.qty,     ni, dateStr, true)
            if (j === 0 && b === 0 && q === 0) continue  // Sunday: closed, skip
            prepare(db,
              `INSERT OR IGNORE INTO daily_entries (salesman_id, branch_id, staff_type, entry_date, jewelry_weight_g, bar_weight_g, quantity, synced)
               VALUES (?,?,?,?,?,?,?,0)`
            ).run(sid, branchId, staffType, dateStr, j, b, q)
          }
        }
      }
    }
  })
}
