// Run: node test_data/generate.js
const XLSX = require('xlsx')
const path = require('path')

// ── Salesmen from seed.ts (IDs are auto-increment order of insertion) ──────
// Branch 1=Morning Market, 2=Vientiane Center, 3=ITecc, 4=VangThong
const SALESMEN = [
  // Morning Market (branch 1) — IDs 1-5
  { id: 1,  full_name: 'Somchai Phommachan',   branch_id: 1, branch_code: 'MM'  },
  { id: 2,  full_name: 'Khamla Sengdara',       branch_id: 1, branch_code: 'MM'  },
  { id: 3,  full_name: 'Boupha Vilayvong',      branch_id: 1, branch_code: 'MM'  },
  { id: 4,  full_name: 'Naly Souvannaphoum',    branch_id: 1, branch_code: 'MM'  },
  { id: 5,  full_name: 'Daovy Phetchanpheng',   branch_id: 1, branch_code: 'MM'  },
  // Vientiane Center (branch 2) — IDs 6-10
  { id: 6,  full_name: 'Savanh Keovongsa',      branch_id: 2, branch_code: 'VC'  },
  { id: 7,  full_name: 'Phonesavanh Siha',      branch_id: 2, branch_code: 'VC'  },
  { id: 8,  full_name: 'Manivone Keovilay',     branch_id: 2, branch_code: 'VC'  },
  { id: 9,  full_name: 'Bounmy Phonsavath',     branch_id: 2, branch_code: 'VC'  },
  { id: 10, full_name: 'Thida Vongsay',         branch_id: 2, branch_code: 'VC'  },
  // ITecc (branch 3) — IDs 11-15
  { id: 11, full_name: 'Khamphone Simoung',     branch_id: 3, branch_code: 'IT'  },
  { id: 12, full_name: 'Soukanh Vongkhamphanh', branch_id: 3, branch_code: 'IT'  },
  { id: 13, full_name: 'Lattana Phommasack',    branch_id: 3, branch_code: 'IT'  },
  { id: 14, full_name: 'Boualoy Chanthavong',   branch_id: 3, branch_code: 'IT'  },
  { id: 15, full_name: 'Vilasack Keobounma',    branch_id: 3, branch_code: 'IT'  },
  // VangThong (branch 4) — IDs 16-20
  { id: 16, full_name: 'Phouthong Chansouk',    branch_id: 4, branch_code: 'VT'  },
  { id: 17, full_name: 'Souliya Phimmasone',    branch_id: 4, branch_code: 'VT'  },
  { id: 18, full_name: 'Khamsouk Sivilay',      branch_id: 4, branch_code: 'VT'  },
  { id: 19, full_name: 'Nong Phommasith',       branch_id: 4, branch_code: 'VT'  },
  { id: 20, full_name: 'Chanthaly Sitthideth',  branch_id: 4, branch_code: 'VT'  },
]

// Per-salesman performance profile (realistic variation)
// jewelry g/day range, bar g/day range, qty pcs/day range
const PROFILES = {
  1:  { j: [40, 90],  b: [80,  200], q: [0, 2] },
  2:  { j: [30, 70],  b: [60,  160], q: [0, 1] },
  3:  { j: [50, 120], b: [100, 250], q: [0, 3] },
  4:  { j: [35, 85],  b: [70,  180], q: [0, 2] },
  5:  { j: [45, 100], b: [90,  220], q: [0, 2] },
  6:  { j: [40, 80],  b: [80,  190], q: [0, 2] },
  7:  { j: [55, 130], b: [110, 270], q: [0, 3] },
  8:  { j: [30, 65],  b: [60,  150], q: [0, 1] },
  9:  { j: [45, 100], b: [90,  210], q: [0, 2] },
  10: { j: [35, 75],  b: [70,  165], q: [0, 2] },
  11: { j: [50, 110], b: [100, 240], q: [0, 3] },
  12: { j: [40, 90],  b: [80,  200], q: [0, 2] },
  13: { j: [60, 140], b: [120, 290], q: [0, 3] },
  14: { j: [35, 80],  b: [70,  180], q: [0, 2] },
  15: { j: [30, 70],  b: [60,  160], q: [0, 1] },
  16: { j: [55, 125], b: [110, 270], q: [0, 3] },
  17: { j: [40, 95],  b: [80,  210], q: [0, 2] },
  18: { j: [45, 100], b: [90,  220], q: [0, 2] },
  19: { j: [60, 145], b: [120, 300], q: [0, 3] },
  20: { j: [50, 120], b: [100, 250], q: [0, 3] },
}

function rand(min, max) {
  return min + Math.random() * (max - min)
}
function r1(n) { return Math.round(n * 10) / 10 }

// May 2026 has 31 days — simulate all working days (skip Sundays)
const YEAR = 2026, MONTH = 5
const DAYS_IN_MAY = 31
const workingDays = []
for (let d = 1; d <= DAYS_IN_MAY; d++) {
  const date = new Date(YEAR, MONTH - 1, d)
  if (date.getDay() !== 0) workingDays.push(d) // skip Sunday
}

// ── 1. DAILY PERFORMANCE FILE ─────────────────────────────────────────────
const dailyHeaders = [
  'Date', 'Staff_ID', 'Full_Name', 'Branch_ID',
  'KPI_1 (Jewelry Weight g)', 'KPI_2 (Bar Weight g)', 'KPI_3 (Quantity)'
]
const dailyRows = [dailyHeaders]

for (const day of workingDays) {
  const dateStr = `${YEAR}-05-${String(day).padStart(2,'0')}`
  for (const s of SALESMEN) {
    const p = PROFILES[s.id]
    // Some days no sale (20% chance)
    if (Math.random() < 0.15) {
      dailyRows.push([dateStr, s.id, s.full_name, s.branch_id, 0, 0, 0])
      continue
    }
    const j = r1(rand(p.j[0], p.j[1]))
    const b = r1(rand(p.b[0], p.b[1]))
    const q = Math.floor(rand(p.q[0], p.q[1] + 1))
    dailyRows.push([dateStr, s.id, s.full_name, s.branch_id, j, b, q])
  }
}

const dailyWs = XLSX.utils.aoa_to_sheet(dailyRows)
dailyWs['!cols'] = dailyHeaders.map((h, i) => ({ wch: i === 2 ? 26 : 22 }))
const dailyWb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(dailyWb, dailyWs, 'Daily Entry')

const dailyFile = path.join(__dirname, 'daily_all_branches_may2026.xlsx')
XLSX.writeFile(dailyWb, dailyFile)
console.log(`✓ Created: ${dailyFile}  (${dailyRows.length - 1} rows, ${workingDays.length} working days × 20 staff)`)

// ── 2. MONTHLY TARGETS FILE ───────────────────────────────────────────────
const targetHeaders = [
  'Staff_ID', 'Full_Name', 'Branch_ID', 'Year', 'Month',
  'Jewelry_Target_g', 'Bar_Target_g', 'Quantity_Target'
]
const targetRows = [targetHeaders]

// Targets for May 2026
const BRANCH_TARGETS = {
  1: { j: [1000, 1400], b: [1500, 2200], q: [28, 45] }, // MM — higher
  2: { j: [900,  1200], b: [1300, 1900], q: [24, 38] }, // VC
  3: { j: [950,  1300], b: [1400, 2000], q: [26, 42] }, // IT
  4: { j: [950,  1350], b: [1400, 2100], q: [26, 40] }, // VT
}

for (const s of SALESMEN) {
  const t = BRANCH_TARGETS[s.branch_id]
  targetRows.push([
    s.id, s.full_name, s.branch_id, YEAR, MONTH,
    Math.round(rand(t.j[0], t.j[1])),
    Math.round(rand(t.b[0], t.b[1])),
    Math.round(rand(t.q[0], t.q[1])),
  ])
}

const targetWs = XLSX.utils.aoa_to_sheet(targetRows)
targetWs['!cols'] = targetHeaders.map((h, i) => ({ wch: i === 1 ? 26 : 18 }))
const targetWb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(targetWb, targetWs, 'Targets')

const targetFile = path.join(__dirname, 'targets_all_branches_may2026.xlsx')
XLSX.writeFile(targetWb, targetFile)
console.log(`✓ Created: ${targetFile}  (${targetRows.length - 1} staff members)`)

console.log('\nNOTE: Staff_IDs 1-20 match the default seeded data.')
console.log('      If your DB has different IDs, check Daily Entry → Manual Entry to see actual IDs,')
console.log('      then adjust the Staff_ID column in the XLSX files before uploading.')
