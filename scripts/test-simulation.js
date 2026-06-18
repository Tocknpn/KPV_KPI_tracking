// Standalone backend simulation — mirrors the real app's SQL/business rules without
// Electron (no IPC, no file persistence). Plain JS + sql.js only, run with: node scripts/test-simulation.js
// Re-implements (not imports) the logic from electron/ipc/{roster,upload,kpi}.ts and
// electron/db/history.ts, copied faithfully from the reviewed source, so this exercises
// the same rules the real app enforces.

const path = require('path')
const initSqlJs = require('sql.js')

let pass = 0, fail = 0
const results = []
function check(name, cond, detail) {
  if (cond) { pass++; results.push(`PASS  ${name}`) }
  else { fail++; results.push(`FAIL  ${name}${detail ? ' — ' + detail : ''}`) }
}

function ym(year, month) { return `${year}${String(month).padStart(2, '0')}` }

async function main() {
  const SQL = await initSqlJs({ locateFile: () => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm') })
  const db = new SQL.Database()

  // ── Minimal schema (subset needed for this simulation) ────────────────────
  db.run(`
    CREATE TABLE branches (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, name TEXT, kpi_point_target REAL DEFAULT 0, target_b2c_default REAL, target_b2b_default REAL);
    CREATE TABLE supervisors (id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT, nickname TEXT, branch_id INTEGER, staff_type TEXT, active INTEGER DEFAULT 1, sup_code TEXT);
    CREATE TABLE salesmen (id INTEGER PRIMARY KEY AUTOINCREMENT, rep_code TEXT UNIQUE, full_name TEXT, nickname TEXT, branch_id INTEGER, supervisor_id INTEGER, staff_type TEXT, active INTEGER DEFAULT 1);
    CREATE TABLE roster_monthly (id INTEGER PRIMARY KEY AUTOINCREMENT, salesman_id INTEGER, year_month TEXT, branch_id INTEGER, supervisor_id INTEGER, staff_type TEXT, active INTEGER DEFAULT 1, UNIQUE(salesman_id, year_month));
    CREATE TABLE supervisor_roster_monthly (id INTEGER PRIMARY KEY AUTOINCREMENT, supervisor_id INTEGER, year_month TEXT, branch_id INTEGER, staff_type TEXT, active INTEGER DEFAULT 1, UNIQUE(supervisor_id, year_month));
    CREATE TABLE daily_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, salesman_id INTEGER, branch_id INTEGER, staff_type TEXT, entry_date TEXT, jewelry_weight_g REAL, bar_weight_g REAL, quantity INTEGER, upload_log_id INTEGER);
    CREATE TABLE upload_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, branch_id INTEGER, upload_type TEXT, filename TEXT, records_count INTEGER DEFAULT 0, status TEXT);
    CREATE TABLE kpi_metric_type_rates (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_id INTEGER, staff_type TEXT, points_per_unit REAL, branch_id INTEGER, year_month TEXT);
    CREATE TABLE kpi_tier_configs (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_id INTEGER, branch_id INTEGER, staff_type TEXT, label TEXT, effective_from TEXT, effective_to TEXT, is_active INTEGER DEFAULT 1);
    CREATE TABLE kpi_tiers (id INTEGER PRIMARY KEY AUTOINCREMENT, config_id INTEGER, threshold_pct REAL, score REAL, tier_order INTEGER);
    CREATE TABLE branch_kpi_monthly_targets (id INTEGER PRIMARY KEY AUTOINCREMENT, branch_id INTEGER, year INTEGER, month INTEGER, kpi_point_target REAL DEFAULT 0, target_b2c REAL DEFAULT 0, target_b2b REAL DEFAULT 0, UNIQUE(branch_id, year, month));
  `)

  function prepGet(sql, ...p) { const s = db.prepare(sql); s.bind(p); const has = s.step(); const r = has ? s.getAsObject() : undefined; s.free(); return r }
  function prepAll(sql, ...p) { const s = db.prepare(sql); s.bind(p); const rows = []; while (s.step()) rows.push(s.getAsObject()); s.free(); return rows }
  function prepRun(sql, ...p) { const s = db.prepare(sql); s.bind(p); s.step(); s.free(); const m = db.exec('SELECT last_insert_rowid()'); return m[0].values[0][0] }

  // ── Seed: 4 branches ────────────────────────────────────────────────────
  const branchSeed = [['MM', 'Morning Market', 8000], ['VC', 'Vientiane Center', 5500], ['IT', 'ITecc', 6000], ['VT', 'VangThong', 7000]]
  for (const [code, name, target] of branchSeed) prepRun(`INSERT INTO branches (code,name,kpi_point_target,target_b2c_default,target_b2b_default) VALUES (?,?,?,?,?)`, code, name, target, target, target)
  const branchByCode = {}
  for (const b of prepAll(`SELECT * FROM branches`)) branchByCode[b.code] = b

  // ── Re-implemented core logic (mirrors db/history.ts) ──────────────────────
  function resolveYm(table, idCol, target) {
    const row = prepGet(`SELECT MAX(year_month) AS ym FROM ${table} WHERE year_month <= ?`, target)
    return row && row.ym ? row.ym : null
  }
  function snapshotSalesman(salesmanId, effectiveDate) {
    const row = prepGet(`SELECT branch_id, staff_type, supervisor_id, active FROM salesmen WHERE id=?`, salesmanId)
    if (!row) return
    const [y, m] = effectiveDate.split('-').map(Number)
    const target = ym(y, m)
    const exists = prepGet(`SELECT 1 FROM roster_monthly WHERE year_month=? LIMIT 1`, target)
    if (!exists) {
      const prior = prepGet(`SELECT MAX(year_month) AS ym FROM roster_monthly WHERE year_month < ?`, target)
      if (prior && prior.ym) {
        for (const r of prepAll(`SELECT salesman_id,branch_id,supervisor_id,staff_type,active FROM roster_monthly WHERE year_month=?`, prior.ym)) {
          prepRun(`INSERT OR IGNORE INTO roster_monthly (salesman_id,year_month,branch_id,supervisor_id,staff_type,active) VALUES (?,?,?,?,?,?)`,
            r.salesman_id, target, r.branch_id, r.supervisor_id, r.staff_type, r.active)
        }
      }
    }
    prepRun(`
      INSERT INTO roster_monthly (salesman_id,year_month,branch_id,supervisor_id,staff_type,active) VALUES (?,?,?,?,?,?)
      ON CONFLICT(salesman_id,year_month) DO UPDATE SET branch_id=excluded.branch_id, supervisor_id=excluded.supervisor_id, staff_type=excluded.staff_type, active=excluded.active
    `, salesmanId, target, row.branch_id, row.supervisor_id, row.staff_type, row.active)
  }
  function snapshotSupervisor(supervisorId, effectiveDate) {
    const row = prepGet(`SELECT branch_id, staff_type, active FROM supervisors WHERE id=?`, supervisorId)
    if (!row) return
    const [y, m] = effectiveDate.split('-').map(Number)
    const target = ym(y, m)
    prepRun(`
      INSERT INTO supervisor_roster_monthly (supervisor_id,year_month,branch_id,staff_type,active) VALUES (?,?,?,?,?)
      ON CONFLICT(supervisor_id,year_month) DO UPDATE SET branch_id=excluded.branch_id, staff_type=excluded.staff_type, active=excluded.active
    `, supervisorId, target, row.branch_id, row.staff_type, row.active)
  }
  function getRosterMapAsOf(year, month) {
    const resolved = resolveYm('roster_monthly', null, ym(year, month))
    const map = new Map()
    if (!resolved) return map
    for (const r of prepAll(`SELECT salesman_id,branch_id,supervisor_id,staff_type,active FROM roster_monthly WHERE year_month=?`, resolved)) {
      map.set(r.salesman_id, r)
    }
    return map
  }
  function getBranchPointTarget(branchId, year, month, staffType) {
    const monthly = prepGet(`SELECT kpi_point_target, target_b2c, target_b2b FROM branch_kpi_monthly_targets WHERE branch_id=? AND year=? AND month=?`, branchId, year, month)
    if (monthly) {
      if (staffType === 'b2c' && monthly.target_b2c) return monthly.target_b2c
      if (staffType === 'b2b' && monthly.target_b2b) return monthly.target_b2b
      return monthly.kpi_point_target
    }
    const branch = prepGet(`SELECT kpi_point_target, target_b2c_default, target_b2b_default FROM branches WHERE id=?`, branchId)
    if (staffType === 'b2c' && branch.target_b2c_default) return branch.target_b2c_default
    if (staffType === 'b2b' && branch.target_b2b_default) return branch.target_b2b_default
    return branch ? branch.kpi_point_target : 0
  }
  // metricId: 1=Jewelry 2=Bar 3=Qty
  function computeKpiScore(metricId, branchId, actual, date, staffType) {
    const dYm = date.slice(0, 4) + date.slice(5, 7)
    if (metricId === 1 || metricId === 2) {
      const rows = prepAll(`
        SELECT points_per_unit, branch_id, year_month FROM kpi_metric_type_rates
        WHERE metric_id=? AND staff_type=? AND (branch_id=? OR branch_id IS NULL) AND (year_month=? OR year_month IS NULL)
      `, metricId, staffType, branchId, dYm)
      let best = null, bestScore = -1
      for (const r of rows) {
        const score = (r.branch_id != null ? 2 : 0) + (r.year_month != null ? 1 : 0)
        if (score > bestScore) { bestScore = score; best = r }
      }
      return best ? actual * best.points_per_unit : 0
    }
    // Qty tiers
    const config = prepAll(`
      SELECT id, branch_id, staff_type, effective_from, effective_to FROM kpi_tier_configs
      WHERE metric_id=3 AND (branch_id=? OR branch_id IS NULL) AND (staff_type=? OR staff_type IS NULL) AND is_active=1
        AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
    `, branchId, staffType, date, date)
      .sort((a, b) => {
        const score = x => (x.branch_id != null ? 4 : 0) + (x.staff_type != null ? 2 : 0) + (x.effective_to == null ? 1 : 0)
        return score(b) - score(a) || (b.effective_from > a.effective_from ? 1 : -1)
      })[0]
    if (!config) return 0
    const tiers = prepAll(`SELECT threshold_pct, score FROM kpi_tiers WHERE config_id=? ORDER BY threshold_pct DESC`, config.id)
    for (const t of tiers) if (actual >= t.threshold_pct) return actual * t.score
    return 0
  }

  // ── Re-implemented upload:roster row logic (mirrors electron/ipc/upload.ts) ─
  function uploadRosterRow(r) {
    const branch = branchByCode[r.branchCode]
    if (!branch) return { skipped: true, reason: 'bad branch' }
    const staffType = r.staffType === 'b2b' ? 'b2b' : 'b2c'
    let supId = null
    if (r.supervisorCode) { const s = prepGet(`SELECT id FROM supervisors WHERE sup_code=?`, r.supervisorCode); supId = s ? s.id : null }
    if (!supId && r.supervisorName) { const s = prepGet(`SELECT id FROM supervisors WHERE branch_id=? AND (full_name=? OR nickname=?)`, branch.id, r.supervisorName, r.supervisorName); supId = s ? s.id : null }
    if (!supId && r.supervisorName) { supId = prepRun(`INSERT INTO supervisors (full_name,nickname,branch_id,staff_type,active,sup_code) VALUES (?,?,?,?,1,?)`, r.supervisorName, '', branch.id, staffType, r.supervisorCode || null) }
    const existing = prepGet(`SELECT id, supervisor_id FROM salesmen WHERE rep_code=?`, r.repCode)
    let salesmanId, prevSupId = null
    if (existing) {
      prevSupId = existing.supervisor_id
      prepRun(`UPDATE salesmen SET full_name=?,nickname=?,branch_id=?,supervisor_id=?,staff_type=?,active=1 WHERE rep_code=?`, r.fullName, r.nickname || '', branch.id, supId, staffType, r.repCode)
      salesmanId = existing.id
    } else {
      salesmanId = prepRun(`INSERT INTO salesmen (rep_code,full_name,nickname,branch_id,supervisor_id,staff_type,active) VALUES (?,?,?,?,?,?,1)`, r.repCode, r.fullName, r.nickname || '', branch.id, supId, staffType)
    }
    snapshotSalesman(salesmanId, r.effectiveDate)
    if (supId) snapshotSupervisor(supId, r.effectiveDate)
    if (prevSupId && prevSupId !== supId) snapshotSupervisor(prevSupId, r.effectiveDate)
    return { created: !existing, salesmanId, supId }
  }

  // ── Re-implemented upload:daily row logic (mirrors electron/ipc/upload.ts) ──
  function uploadDailyRow(r, actingUserBranchId, logId) {
    const sm = prepGet(`SELECT id, branch_id, staff_type FROM salesmen WHERE rep_code=? AND active=1`, r.repCode)
    if (!sm) return { ok: false, reason: 'Rep code not found in roster' }
    if (actingUserBranchId && sm.branch_id !== actingUserBranchId) return { ok: false, reason: 'Rep code belongs to a different branch — you can only upload for your own branch.' }
    const existing = prepGet(`SELECT id FROM daily_entries WHERE salesman_id=? AND entry_date=?`, sm.id, r.date)
    if (existing) return { ok: false, reason: 'Existing record for this rep/date — ask an Accountant Manager to clear the conflicting upload batch before re-uploading.' }
    prepRun(`INSERT INTO daily_entries (salesman_id,branch_id,staff_type,entry_date,jewelry_weight_g,bar_weight_g,quantity,upload_log_id) VALUES (?,?,?,?,?,?,?,?)`,
      sm.id, sm.branch_id, sm.staff_type, r.date, r.jewelryWeightG, r.barWeightG, r.quantity, logId)
    return { ok: true }
  }

  console.log('=== SalesTrack Pro — backend logic simulation ===\n')

  // ════════════════════════════════════════════════════════════════════════
  // TEST 1 — Roster upload, May 2026, 14 reps across 4 branches, 3 supervisors
  // ════════════════════════════════════════════════════════════════════════
  const may = '2026-05-01', jun = '2026-06-01'
  const repsMay = [
    ['MM-001','Somchai Phommachan','Som','MM','Phengsy Manivong','MM-SUP-01','b2c'],
    ['MM-002','Naly Souvannaphoum','Naly','MM','Phengsy Manivong','MM-SUP-01','b2c'],
    ['MM-003','Bounlam Phetsavanh','Boun','MM','Phengsy Manivong','MM-SUP-01','b2b'],
    ['MM-004','Sithong Phommasack','Sit','MM','Phengsy Manivong','MM-SUP-01','b2b'],
    ['VC-001','Khamphanh Soulisak','Kham','VC','Somvang Phongsavanh','VC-SUP-01','b2c'],
    ['VC-002','Boupha Vilayvong','Boupha','VC','Somvang Phongsavanh','VC-SUP-01','b2c'],
    ['VC-003','Sengdara Vongsay','Seng','VC','Somvang Phongsavanh','VC-SUP-01','b2b'],
    ['IT-001','Thong Sengdara','Thong','IT','Sithong Phommasack','IT-SUP-01','b2c'],
    ['IT-002','Khamla Sengdara','Khamla','IT','Sithong Phommasack','IT-SUP-01','b2c'],
    ['IT-003','Daovy Phetchan','Daovy','IT','Sithong Phommasack','IT-SUP-01','b2b'],
    ['VT-001','Manivone Keovilay','Mani','VT','Phetsamone Sivilay','VT-SUP-01','b2c'],
    ['VT-002','Savanh Keovongsa','Savanh','VT','Phetsamone Sivilay','VT-SUP-01','b2c'],
    ['VT-003','Phonesavanh Sisoulath','Phone','VT','Phetsamone Sivilay','VT-SUP-01','b2b'],
    ['VT-004','Soukanh Vongkhamsao','Souk','VT','Phetsamone Sivilay','VT-SUP-01','b2b'],
  ]
  let created1 = 0
  for (const [repCode, fullName, nickname, branchCode, supervisorName, supervisorCode, staffType] of repsMay) {
    const res = uploadRosterRow({ repCode, fullName, nickname, branchCode, supervisorName, supervisorCode, staffType, effectiveDate: may })
    if (res.created) created1++
  }
  check('T1.1 Roster upload May: 14 reps created', created1 === 14, `got ${created1}`)
  check('T1.2 Roster upload May: 4 supervisors auto-created from roster', prepAll(`SELECT * FROM supervisors`).length === 4, `got ${prepAll('SELECT * FROM supervisors').length}`)
  check('T1.3 Roster upload May: roster_monthly has 14 rows for 202605', prepAll(`SELECT * FROM roster_monthly WHERE year_month='202605'`).length === 14)
  check('T1.4 Roster upload May: supervisor_roster_monthly has 4 rows for 202605', prepAll(`SELECT * FROM supervisor_roster_monthly WHERE year_month='202605'`).length === 4)

  // TEST 2 — Roster upload June: same 14 reps, transfer MM-004 to VT, deactivate VT-004
  const repsJun = repsMay.map(r => [...r])
  repsJun.find(r => r[0] === 'MM-004')[3] = 'VT' // Sithong transfers MM -> VT
  repsJun.find(r => r[0] === 'MM-004')[4] = 'Phetsamone Sivilay'
  repsJun.find(r => r[0] === 'MM-004')[5] = 'VT-SUP-01'
  for (const [repCode, fullName, nickname, branchCode, supervisorName, supervisorCode, staffType] of repsJun) {
    uploadRosterRow({ repCode, fullName, nickname, branchCode, supervisorName, supervisorCode, staffType, effectiveDate: jun })
  }
  const mayRowForTransferred = prepGet(`SELECT branch_id FROM roster_monthly WHERE salesman_id=(SELECT id FROM salesmen WHERE rep_code='MM-004') AND year_month='202605'`)
  const junRowForTransferred = prepGet(`SELECT branch_id FROM roster_monthly WHERE salesman_id=(SELECT id FROM salesmen WHERE rep_code='MM-004') AND year_month='202606'`)
  check('T2.1 May history untouched after June upload (MM-004 still MM in May)', mayRowForTransferred.branch_id === branchByCode['MM'].id)
  check('T2.2 June reflects transfer (MM-004 now VT)', junRowForTransferred.branch_id === branchByCode['VT'].id)
  check('T2.3 Both months coexist — roster_monthly has 28 rows total (14+14)', prepAll(`SELECT * FROM roster_monthly`).length === 28, `got ${prepAll('SELECT * FROM roster_monthly').length}`)
  check('T2.4 Supervisor roster also stacked — 8 rows total (4+4 months)', prepAll(`SELECT * FROM supervisor_roster_monthly`).length === 8, `got ${prepAll('SELECT * FROM supervisor_roster_monthly').length}`)

  // ════════════════════════════════════════════════════════════════════════
  // TEST 3 — KPI setup, two different months with different rates
  // ════════════════════════════════════════════════════════════════════════
  // May: MM b2c Jewelry=15 pts/g, Bar=7.5, Qty tiers standard. June: MM b2c Jewelry=20 (raised)
  prepRun(`INSERT INTO kpi_metric_type_rates (metric_id,staff_type,points_per_unit,branch_id,year_month) VALUES (1,'b2c',15,?, '202605')`, branchByCode['MM'].id)
  prepRun(`INSERT INTO kpi_metric_type_rates (metric_id,staff_type,points_per_unit,branch_id,year_month) VALUES (1,'b2c',20,?, '202606')`, branchByCode['MM'].id)
  prepRun(`INSERT INTO kpi_metric_type_rates (metric_id,staff_type,points_per_unit,branch_id,year_month) VALUES (2,'b2c',7.5,?, '202605')`, branchByCode['MM'].id)
  prepRun(`INSERT INTO kpi_metric_type_rates (metric_id,staff_type,points_per_unit,branch_id,year_month) VALUES (2,'b2c',7.5,?, '202606')`, branchByCode['MM'].id)
  const tierCfgId = prepRun(`INSERT INTO kpi_tier_configs (metric_id,branch_id,staff_type,label,effective_from,effective_to,is_active) VALUES (3,?,'b2c','MM b2c qty','2000-01-01',NULL,1)`, branchByCode['MM'].id)
  prepRun(`INSERT INTO kpi_tiers (config_id,threshold_pct,score,tier_order) VALUES (?,50,2,1)`, tierCfgId)
  prepRun(`INSERT INTO kpi_tiers (config_id,threshold_pct,score,tier_order) VALUES (?,1,1.5,2)`, tierCfgId)
  prepRun(`INSERT INTO branch_kpi_monthly_targets (branch_id,year,month,kpi_point_target,target_b2c,target_b2b) VALUES (?,2026,5,8000,8000,8000)`, branchByCode['MM'].id)
  prepRun(`INSERT INTO branch_kpi_monthly_targets (branch_id,year,month,kpi_point_target,target_b2c,target_b2b) VALUES (?,2026,6,8000,9000,8000)`, branchByCode['MM'].id) // June B2C target raised too

  const mayScore = computeKpiScore(1, branchByCode['MM'].id, 300, '2026-05-15', 'b2c')
  const junScore = computeKpiScore(1, branchByCode['MM'].id, 300, '2026-06-15', 'b2c')
  check('T3.1 May Jewelry rate (15) applied for a May date', mayScore === 300 * 15, `got ${mayScore}`)
  check('T3.2 June Jewelry rate (20) applied for a June date — different month, different rate', junScore === 300 * 20, `got ${junScore}`)
  check('T3.3 May target (8000) used for May', getBranchPointTarget(branchByCode['MM'].id, 2026, 5, 'b2c') === 8000)
  check('T3.4 June target (9000) used for June — independent of May', getBranchPointTarget(branchByCode['MM'].id, 2026, 6, 'b2c') === 9000)

  // ════════════════════════════════════════════════════════════════════════
  // TEST 4 — Daily Entry template export equivalent (roster AS OF June for MM)
  // ════════════════════════════════════════════════════════════════════════
  const juneMMRoster = [...getRosterMapAsOf(2026, 6).entries()].filter(([, v]) => v.branch_id === branchByCode['MM'].id && v.active)
  check('T4.1 June template for MM shows 3 reps (MM-004 transferred out in June)', juneMMRoster.length === 3, `got ${juneMMRoster.length}`)
  const mayMMRoster = [...getRosterMapAsOf(2026, 5).entries()].filter(([, v]) => v.branch_id === branchByCode['MM'].id && v.active)
  check('T4.2 May template for MM still shows 4 reps (template is month-aware, not just "today")', mayMMRoster.length === 4, `got ${mayMMRoster.length}`)

  // ════════════════════════════════════════════════════════════════════════
  // TEST 5 — Calculate KPI for one rep, June, jewelry+bar+qty combined
  // ════════════════════════════════════════════════════════════════════════
  const somchai = prepGet(`SELECT id, branch_id, staff_type FROM salesmen WHERE rep_code='MM-001'`)
  const jScore = computeKpiScore(1, somchai.branch_id, 200, '2026-06-10', somchai.staff_type) // 200*20=4000
  const bScore = computeKpiScore(2, somchai.branch_id, 150, '2026-06-10', somchai.staff_type) // 150*7.5=1125
  const qScore = computeKpiScore(3, somchai.branch_id, 60, '2026-06-10', somchai.staff_type)  // >=50 -> x2 = 120
  const total = jScore + bScore + qScore
  const expectedTotal = 200 * 20 + 150 * 7.5 + 60 * 2
  check('T5.1 Combined KPI score matches hand-calculated total', total === expectedTotal, `got ${total}, expected ${expectedTotal}`)
  const kpiPct = (total / getBranchPointTarget(somchai.branch_id, 2026, 6, somchai.staff_type)) * 100
  check('T5.2 KPI% computed against June B2C target (9000)', Math.abs(kpiPct - (expectedTotal / 9000 * 100)) < 0.001, `got ${kpiPct.toFixed(2)}%`)

  // ════════════════════════════════════════════════════════════════════════
  // TEST 6 — Daily entry upload, branch-scope block + duplicate block + Acc Manager unblock
  // ════════════════════════════════════════════════════════════════════════
  const logId1 = prepRun(`INSERT INTO upload_logs (branch_id,upload_type,filename,status) VALUES (?,?,?,?)`, branchByCode['MM'].id, 'daily', 'mm_june.xlsx', 'success')
  const officerMM = branchByCode['MM'].id

  const r1 = uploadDailyRow({ repCode: 'MM-001', date: '2026-06-05', jewelryWeightG: 100, barWeightG: 50, quantity: 10 }, officerMM, logId1)
  check('T6.1 Acc Officer (MM) uploads own-branch rep — succeeds', r1.ok)

  const r2 = uploadDailyRow({ repCode: 'VT-001', date: '2026-06-05', jewelryWeightG: 100, barWeightG: 50, quantity: 10 }, officerMM, logId1)
  check('T6.2 Acc Officer (MM) tries VT rep in same file — blocked', !r2.ok && r2.reason.includes('different branch'), r2.reason)

  const r3 = uploadDailyRow({ repCode: 'MM-001', date: '2026-06-05', jewelryWeightG: 999, barWeightG: 999, quantity: 99 }, officerMM, logId1)
  check('T6.3 Re-upload same rep/date with different values — blocked (no silent overwrite)', !r3.ok && r3.reason.includes('Accountant Manager'), r3.reason)

  // Acc Manager clears the batch
  const deleted = prepRun(`DELETE FROM daily_entries WHERE upload_log_id=?`, logId1)
  const remainingAfterDelete = prepAll(`SELECT * FROM daily_entries WHERE upload_log_id=?`, logId1)
  check('T6.4 Acc Manager clears upload batch — entries removed', remainingAfterDelete.length === 0)

  const r4 = uploadDailyRow({ repCode: 'MM-001', date: '2026-06-05', jewelryWeightG: 222, barWeightG: 111, quantity: 15 }, officerMM, logId1)
  check('T6.5 Acc Officer re-uploads same rep/date after manager cleared it — succeeds', r4.ok)
  const finalEntry = prepGet(`SELECT jewelry_weight_g FROM daily_entries WHERE salesman_id=(SELECT id FROM salesmen WHERE rep_code='MM-001') AND entry_date='2026-06-05'`)
  check('T6.6 Re-uploaded value is the corrected one (222g), not the original (100g)', finalEntry.jewelry_weight_g === 222, `got ${finalEntry.jewelry_weight_g}`)

  // ════════════════════════════════════════════════════════════════════════
  // TEST 7 — Acc Manager cross-branch upload (no branch restriction — actingUserBranchId=null)
  // ════════════════════════════════════════════════════════════════════════
  const logId2 = prepRun(`INSERT INTO upload_logs (branch_id,upload_type,filename,status) VALUES (?,?,?,?)`, branchByCode['MM'].id, 'daily', 'all_branches_june.xlsx', 'success')
  const r5 = uploadDailyRow({ repCode: 'VC-001', date: '2026-06-06', jewelryWeightG: 80, barWeightG: 40, quantity: 8 }, null, logId2)
  const r6 = uploadDailyRow({ repCode: 'IT-001', date: '2026-06-06', jewelryWeightG: 90, barWeightG: 45, quantity: 9 }, null, logId2)
  const r7 = uploadDailyRow({ repCode: 'VT-001', date: '2026-06-06', jewelryWeightG: 70, barWeightG: 35, quantity: 7 }, null, logId2)
  check('T7.1 Acc Manager uploads VC rep — no branch restriction', r5.ok)
  check('T7.2 Acc Manager uploads IT rep in same batch — no branch restriction', r6.ok)
  check('T7.3 Acc Manager uploads VT rep in same batch — no branch restriction', r7.ok)

  // ════════════════════════════════════════════════════════════════════════
  // TEST 8 — Supervisor target/actual/% (mirrors report:teamPerformance formula)
  // ════════════════════════════════════════════════════════════════════════
  // VT-SUP-01 has 4 reps in May (VT-001..004, all b2c/b2b mixed) — give them June entries
  const vtSup = prepGet(`SELECT id FROM supervisors WHERE sup_code='VT-SUP-01'`)
  const juneTeam = [...getRosterMapAsOf(2026, 6).entries()].filter(([, v]) => v.supervisor_id === vtSup.id && v.active)
  // Seed June entries for VT team: VT-001 (b2c), VT-002 (b2c), VT-003 (b2b), VT-004 (b2b), plus transferred-in MM-004 (b2b)
  const vtEntries = [['VT-001', 120], ['VT-002', 80], ['VT-003', 60], ['VT-004', 40], ['MM-004', 50]]
  prepRun(`INSERT INTO kpi_metric_type_rates (metric_id,staff_type,points_per_unit,branch_id,year_month) VALUES (1,'b2b',20,?, '202606')`, branchByCode['VT'].id)
  prepRun(`INSERT INTO kpi_metric_type_rates (metric_id,staff_type,points_per_unit,branch_id,year_month) VALUES (1,'b2c',20,?, '202606')`, branchByCode['VT'].id)
  prepRun(`INSERT INTO branch_kpi_monthly_targets (branch_id,year,month,kpi_point_target,target_b2c,target_b2b) VALUES (?,2026,6,7000,7000,7000)`, branchByCode['VT'].id)
  let teamScoreSum = 0
  for (const [repCode, grams] of vtEntries) {
    const sm = prepGet(`SELECT branch_id, staff_type FROM salesmen WHERE rep_code=?`, repCode)
    teamScoreSum += computeKpiScore(1, sm.branch_id, grams, '2026-06-20', sm.staff_type)
  }
  check('T8.1 VT-SUP-01 team has 5 members in June (4 original + MM-004 transfer-in)', juneTeam.length === 5, `got ${juneTeam.length}`)
  const perPersonTarget = getBranchPointTarget(branchByCode['VT'].id, 2026, 6, 'b2c') // simplified: using b2c target for whole team per formula's per-person basis
  const teamTarget = perPersonTarget * juneTeam.length
  const teamKpiPct = (teamScoreSum / teamTarget) * 100
  check('T8.2 Sup target = per-person target × headcount (5 reps × 7000)', teamTarget === 7000 * 5, `got ${teamTarget}`)
  check('T8.3 Sup actual = sum of team member scores', teamScoreSum === (120+80+60+40+50) * 20, `got ${teamScoreSum}`)
  check('T8.4 Sup KPI% = actual / target, computed without error', !isNaN(teamKpiPct) && teamKpiPct > 0, `got ${teamKpiPct.toFixed(1)}%`)

  // ── Report ──────────────────────────────────────────────────────────────
  console.log(results.join('\n'))
  console.log(`\n${pass} passed, ${fail} failed, ${pass + fail} total`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => { console.error('SIMULATION CRASHED:', e); process.exit(2) })
